/** Owns phone observation streams and explicit user inputs outside the renderer. */
import type { Context } from '@deepseek-ai/cordis'
import { RemoteStreamCarrierError, type RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-experimental-dsh-virtuallive/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PhoneAction, PhoneSnapshot } from '../phone-types.ts'

/** Retained phone display and whether the next input is safe to admit. */
export interface PhoneState {
  snapshot: PhoneSnapshot | null
  busy: boolean
  connection: 'loading' | 'ready' | 'failed'
  /** Only a successful explicit inspection clears a lost input response. */
  unconfirmed: boolean
}

/** Phone observations and gesture actions injected into the resident home. */
export interface PhoneFace {
  hooks: { phone: HostObservable<PhoneState> }
  refreshPhone: () => Promise<void>
  controlPhone: (action: PhoneAction) => Promise<boolean>
  /**
   * Capture while this authorized view is visible; failures require successful manual inspection.
   * @param signal - Mounted view lifetime; abort removes future reads without cancelling an admitted capture.
   * @returns After the view's timer and listener are released and its admitted capture settles.
   */
  watchPhone: (signal: AbortSignal) => Promise<void>
}

/** A single controller tracks the stream and all in-flight device calls through disposal. */
export class PhoneController {
  private readonly lifetime = new AbortController()
  private readonly state = createSnapshotStore<PhoneState>({ snapshot: null, busy: false, connection: 'loading', unconfirmed: false })
  private stream: RemoteStream<PhoneSnapshot> | undefined
  private reading: Promise<void> | undefined
  private connectionWork: Promise<void> = Promise.resolve()
  private requestLifetime = new AbortController()
  private pending: Promise<boolean> | undefined
  private readonly watching = new Set<Promise<void>>()
  /** Passive stream recovery cannot resume automatic reads after a failed operation. */
  private inspectionRequired = false

  /**
   * @param ctx - Browser plugin owner and authorized phone transport.
   * @param refreshIntervalMs - Validated delay from a completed operation to the next automatic capture.
   */
  constructor(private readonly ctx: Context, private readonly refreshIntervalMs: number) {}

  /**
   * Bind phone state to a renderer without passing Context.
   * @returns Bare observable and phone actions.
   */
  face(): PhoneFace {
    return {
      hooks: { phone: this.state }, refreshPhone: () => this.refresh(),
      controlPhone: action => this.control(action), watchPhone: this.watch,
    }
  }

  private readonly watch = (signal: AbortSignal): Promise<void> => {
    const lifetime = AbortSignal.any([signal, this.lifetime.signal])
    if (lifetime.aborted) return Promise.resolve()
    const finished = Promise.withResolvers<void>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let reading: Promise<boolean> | undefined
    let immediate = true
    const clear = (): void => { clearTimeout(timer); timer = undefined }
    const eligible = (): boolean => {
      const state = this.state.getSnapshot()
      const snapshot = state.snapshot
      // Enabled phones publish unavailable until their first capture.
      return !lifetime.aborted && document.visibilityState === 'visible' && !this.requestLifetime.signal.aborted
        && !this.inspectionRequired && !state.unconfirmed && !state.busy && reading === undefined
        && this.pending === undefined && state.connection === 'ready' && snapshot !== null
        && (snapshot.status === 'ready' || (snapshot.status === 'failed' && snapshot.observedAt === null && snapshot.error === 'unavailable'))
    }
    const schedule = (): void => {
      clear()
      if (this.state.getSnapshot().busy) immediate = false
      if (eligible()) timer = setTimeout(capture, immediate ? 0 : this.refreshIntervalMs)
    }
    const capture = (): void => {
      timer = undefined
      if (!eligible()) return
      immediate = false
      reading = this.observe('automatic')
      void reading.then(() => {
        reading = undefined
        if (lifetime.aborted) finished.resolve()
        else schedule()
      })
    }
    const visibility = (): void => { immediate = true; schedule() }
    const unsubscribe = this.state.subscribe(schedule)
    const stop = (): void => {
      clear()
      unsubscribe()
      document.removeEventListener('visibilitychange', visibility)
      lifetime.removeEventListener('abort', stop)
      if (reading === undefined) finished.resolve()
    }
    document.addEventListener('visibilitychange', visibility)
    lifetime.addEventListener('abort', stop, { once: true })
    this.watching.add(finished.promise)
    void finished.promise.then(() => { this.watching.delete(finished.promise) })
    schedule()
    return finished.promise
  }

  /**
   * Replace the phone stream without issuing a device capture.
   * @returns After the stream reader starts; visible views and explicit refresh own device capture.
   */
  connect(): Promise<void> {
    const work = this.connectionWork.then(() => this.replaceConnection()).catch((error: unknown) => {
      void error
      if (this.lifetime.signal.aborted) return
      this.ctx.logger.warn('Phone connection failed; reconnect the phone')
      this.inspectionRequired = true
      this.state.update((state) => { state.connection = 'failed' })
    })
    this.connectionWork = work
    return work
  }

  private async replaceConnection(): Promise<void> {
    await this.stream?.dispose()
    await this.reading
    if (this.lifetime.signal.aborted) return
    this.requestLifetime = new AbortController()
    this.state.update((state) => { state.connection = 'loading' })
    this.stream = this.ctx.remote.$stream<PhoneSnapshot>({
      name: 'Virtual Live phone', open: signal => this.ctx.remote.virtualLivePhone.follow(signal),
      ended: () => new RemoteStreamCarrierError('Phone observation ended'),
      carrierFailed: () => {
        this.inspectionRequired = true
        this.state.update((state) => { state.connection = 'failed' })
      },
    })
    this.reading = this.read(this.stream)
  }

  private async read(stream: RemoteStream<PhoneSnapshot>): Promise<void> {
    try {
      for await (const item of stream) {
        if (item.value.status === 'uncertain' || (item.value.status === 'failed' && item.value.observedAt !== null)) {
          this.inspectionRequired = true
        }
        this.state.update((state) => {
          state.snapshot = item.value
          state.connection = this.inspectionRequired ? 'failed' : 'ready'
        })
        item.accept()
      }
    } catch (error) {
      if (this.lifetime.signal.aborted || stream !== this.stream) return
      // Transport errors can contain response fragments; screen data stays out of diagnostics.
      void error
      this.ctx.logger.warn('Phone observation failed; reconnect the phone')
      this.inspectionRequired = true
      this.state.update((state) => { state.connection = 'failed' })
    }
  }

  private async refresh(): Promise<void> {
    if (this.pending !== undefined) return
    await this.connectionWork
    if (this.lifetime.signal.aborted || this.requestLifetime.signal.aborted) return
    if (this.state.getSnapshot().connection === 'failed') await this.connect()
    await this.observe('manual')
  }

  private observe(kind: 'manual' | 'automatic'): Promise<boolean> {
    return this.execute(() => this.ctx.remote.virtualLivePhone.observe(
      AbortSignal.any([this.lifetime.signal, this.requestLifetime.signal]),
    ), kind)
  }

  private control(action: PhoneAction): Promise<boolean> {
    const state = this.state.getSnapshot()
    if (state.unconfirmed || state.connection !== 'ready' || state.snapshot?.status !== 'ready') return Promise.resolve(false)
    return this.execute(() => this.ctx.remote.virtualLivePhone.action(
      action, AbortSignal.any([this.lifetime.signal, this.requestLifetime.signal]),
    ), 'input')
  }

  private execute(call: () => ReturnType<Context['remote']['virtualLivePhone']['observe']>, kind: 'manual' | 'automatic' | 'input'): Promise<boolean> {
    if (this.lifetime.signal.aborted || this.requestLifetime.signal.aborted || this.pending !== undefined) return Promise.resolve(false)
    this.state.update((state) => { state.busy = true })
    this.pending = Promise.resolve().then(call).then((result) => {
      if (!result.ok) {
        this.inspectionRequired = true
        this.state.update((state) => { state.unconfirmed ||= kind === 'input'; state.connection = 'failed' })
        return false
      }
      if (result.value.status === 'failed' || result.value.status === 'uncertain') this.inspectionRequired = true
      else if (kind === 'manual' && result.value.status === 'ready') this.inspectionRequired = false
      this.state.update((state) => {
        state.snapshot = result.value
        state.connection = this.inspectionRequired ? 'failed' : 'ready'
        if (kind === 'manual' && result.value.status === 'ready') state.unconfirmed = false
      })
      return result.value.status === 'ready'
    }).catch((error: unknown) => {
      void error
      this.ctx.logger.warn('Phone operation was not confirmed; inspect its screen before further input')
      this.inspectionRequired = true
      this.state.update((state) => { state.unconfirmed ||= kind === 'input'; state.connection = 'failed' })
      return false
    }).finally(() => { this.pending = undefined; this.state.update((state) => { state.busy = false }) })
    return this.pending
  }

  /**
   * Withdraw phone observations and clear retained content when follow access is revoked.
   * @returns After stream readers and admitted calls settle; a later grant may reconnect.
   */
  disconnect(): Promise<void> {
    this.requestLifetime.abort()
    const work = this.connectionWork.then(async () => {
      this.requestLifetime.abort()
      await this.stream?.dispose()
      await this.reading
      await this.pending
      this.stream = undefined
      this.state.update((state) => { state.snapshot = null; state.connection = 'failed' })
    })
    this.connectionWork = work
    return work
  }

  /**
   * Abort transport calls, close the observation stream, and await all callbacks.
   * @returns When this controller can no longer update its retained state.
   */
  async dispose(): Promise<void> {
    this.lifetime.abort()
    await this.disconnect()
    await Promise.all(this.watching)
  }
}
