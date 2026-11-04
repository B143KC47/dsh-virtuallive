/** Host snapshot observation and message admission for the resident's home. */
import type { Context } from '@deepseek-ai/cordis'
import { RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client'
import type { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-experimental-dsh-virtuallive/remote'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { HomeLayout, ResidentSnapshot } from '../types.ts'

/** A retained observation and the current connection and submission status. */
export interface HomeState {
  snapshot: ResidentSnapshot | null
  connection: 'loading' | 'ready' | 'reconnecting' | 'failed'
  sending: boolean
  submission: 'none' | 'accepted' | 'unconfirmed'
  arranging: boolean
  arrangementError: 'none' | 'invalid' | 'conflict' | 'unconfirmed'
  openingConversation: boolean
  conversationError: boolean
}

/** Renderable observations and Host actions injected into the main slot. */
export interface HomeFace {
  hooks: { resident: HostObservable<HomeState> }
  send: (text: string) => Promise<boolean>
  reconnect: () => void
  arrange: (layout: HomeLayout, revision: number) => Promise<boolean>
  openConversation: () => Promise<void>
}

/** Owns observation independently of the mounted panel and retains failed drafts in the form. */
export class HomeController {
  private readonly state = createSnapshotStore<HomeState>({ snapshot: null, connection: 'loading', sending: false, submission: 'none', arranging: false, arrangementError: 'none', openingConversation: false, conversationError: false })
  private stream: RemoteStream<ResidentSnapshot> | undefined
  private reading: Promise<void> | undefined
  private connecting: Promise<void> | undefined
  private sending: Promise<boolean> | undefined
  private arranging: Promise<boolean> | undefined
  private openingConversation: Promise<void> | undefined
  private closed = false

  constructor(private readonly ctx: Context) {}

  /**
   * Connect renderer Hooks to the data owner without passing Context into React.
   * @returns Bare observable plus user actions.
   */
  face(): HomeFace {
    return {
      hooks: { resident: this.state }, send: text => this.send(text),
      arrange: (layout, revision) => this.arrange(layout, revision), reconnect: () => { void this.connect() },
      openConversation: () => this.openConversation(),
    }
  }

  private openConversation(): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (this.openingConversation !== undefined) return this.openingConversation
    this.state.update((state) => { state.openingConversation = true; state.conversationError = false })
    this.openingConversation = this.ctx.remote.virtualLive.snapshot().then((result) => {
      if (!result.ok) throw result.error
      if (this.closed) return
      this.state.update((state) => { state.snapshot = result.value })
      this.ctx.uiWorkspace.openSession(result.value.sessionId)
    }).catch((error: unknown) => {
      if (this.closed) return
      this.ctx.logger.warn('Resident conversation could not open; retry from the conversation mode selector', error)
      this.state.update((state) => { state.conversationError = true })
    }).finally(() => {
      this.state.update((state) => { state.openingConversation = false })
      this.openingConversation = undefined
    })
    return this.openingConversation
  }

  /**
   * Replace the observation stream; terminal failures require explicit reconnection.
   * @returns After the previous reader closes and the new reader starts.
   */
  connect(): Promise<void> {
    this.connecting ??= this.replaceConnection().catch((error: unknown) => {
      if (this.closed) return
      this.ctx.logger.warn('Resident connection failed; reconnect the home panel', error)
      this.state.update((state) => { state.connection = 'failed' })
    }).finally(() => { this.connecting = undefined })
    return this.connecting
  }

  private async replaceConnection(): Promise<void> {
    await this.stream?.dispose()
    await this.reading
    if (this.closed) return
    this.state.update((state) => { state.connection = state.snapshot === null ? 'loading' : 'reconnecting' })
    const stream = this.ctx.remote.$stream<ResidentSnapshot>({
      name: 'Virtual Live resident',
      open: signal => this.ctx.remote.virtualLive.follow(signal),
      ended: () => new RemoteStreamCarrierError('Resident stream ended'),
      carrierFailed: () => { this.state.update((state) => { state.connection = 'reconnecting' }) },
    })
    this.stream = stream
    this.reading = this.read(stream)
  }

  private async read(stream: RemoteStream<ResidentSnapshot>): Promise<void> {
    let first = true
    try {
      for await (const item of stream) {
        this.state.update((state) => {
          state.snapshot = item.value; state.connection = 'ready'
          if (first) state.arrangementError = 'none'
        })
        first = false
        item.accept()
      }
    } catch (error) {
      if (this.closed || stream !== this.stream) return
      this.ctx.logger.warn('Resident observation failed; reconnect the home panel', error)
      this.state.update((state) => { state.connection = 'failed' })
    }
  }

  private send(text: string): Promise<boolean> {
    if (this.closed || this.state.getSnapshot().connection !== 'ready') return Promise.resolve(false)
    if (this.sending !== undefined) return this.sending
    this.state.update((state) => { state.sending = true; state.submission = 'none' })
    const signal = this.stream?.signal
    this.sending = this.ctx.remote.virtualLive.speak(text, signal).then((result) => {
      if (!result.ok) throw result.error
      this.state.update((state) => { state.submission = 'accepted' })
      return true
    }).catch((error: unknown) => {
      this.ctx.logger.warn('Resident message admission was not confirmed; check the conversation before resending', error)
      this.state.update((state) => { state.submission = 'unconfirmed' })
      return false
    }).finally(() => {
      this.state.update((state) => { state.sending = false })
      this.sending = undefined
    })
    return this.sending
  }

  private arrange(layout: HomeLayout, revision: number): Promise<boolean> {
    if (this.closed || this.state.getSnapshot().connection !== 'ready' || this.state.getSnapshot().arrangementError === 'unconfirmed' || this.arranging) return Promise.resolve(false)
    this.state.update((state) => { state.arranging = true; state.arrangementError = 'none' })
    this.arranging = this.ctx.remote.virtualLive.arrange(layout, revision, this.stream?.signal).then((result) => {
      if (result.ok) return true
      this.state.update((state) => { state.arrangementError = result.error.code === 'virtuallive/invalid-arrangement' ? 'invalid' : result.error.code === 'virtuallive/stale-arrangement' ? 'conflict' : 'unconfirmed' })
      return false
    }).catch((error: unknown) => {
      this.ctx.logger.warn('Room arrangement was not confirmed; reconnect before changing it again', error)
      this.state.update((state) => { state.arrangementError = 'unconfirmed' })
      return false
    }).finally(() => { this.state.update((state) => { state.arranging = false }); this.arranging = undefined })
    return this.arranging
  }

  /**
   * Stop observations and await in-flight transport calls.
   * @returns When callbacks can no longer update this controller.
   */
  async dispose(): Promise<void> {
    this.closed = true
    await this.stream?.dispose()
    await this.connecting
    await this.reading
    await this.sending
    await this.arranging
    await this.openingConversation
  }
}
