/** Resident-owned dedicated Android access exposed through authenticated DSH remotes. */
import { Context, Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { phoneActionSchema } from './phone-protocol.ts'
import { PhoneWorkerClient, PhoneWorkerError } from './phone-worker.ts'
import type { PhoneAction, PhoneConfig, PhoneSnapshot } from './phone-types.ts'

export type * from './phone-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The resident's configured Android device; disabled deployments retain an explicit status. */
    virtualLivePhone: VirtualLivePhone
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** An invalid phone input was refused before the device queue. */
    'virtuallive/invalid-phone-action': { reason: 'invalid-data' | 'text-limit' | 'outside-display' }
  }
}

const timer = (): Schema<number> => Schema.natural().min(1).max(2 ** 31 - 1)

/** Validated connection settings; enabled deployments require an explicit executable pair and device. */
const phoneConfigFields: Schema<PhoneConfig> = Schema.object({
  enabled: Schema.boolean().default(false),
  python: Schema.string().default(''), adb: Schema.string().default(''), serial: Schema.string().default(''),
  startupTimeoutMs: timer().default(45000), timeoutMs: timer().default(15000), graceMs: timer().default(1000),
  maxRequestBytes: Schema.natural().min(128).max(16 * 1024 * 1024).default(65536),
  maxResponseBytes: Schema.natural().min(1024).max(64 * 1024 * 1024).default(8 * 1024 * 1024),
  maxDiagnosticBytes: Schema.natural().min(128).max(1024 * 1024).default(8192),
  maxTreeCharacters: Schema.natural().min(1).max(1000000).default(32000),
  screenshotWidth: Schema.natural().min(160).max(2160).default(720),
  screenshotQuality: Schema.natural().min(1).max(95).default(80),
  capture: Schema.union([Schema.const('adb-raw'), Schema.const('portal')]).default('adb-raw'),
  maxTextCharacters: Schema.natural().min(1).max(100000).default(8000),
})

/** Validated settings additionally require the executable pair and serial when enabled. */
export const phoneConfigSchema: Schema<PhoneConfig> = Schema.transform(phoneConfigFields, (value) => {
  if (value.enabled) {
    for (const field of ['python', 'adb', 'serial'] as const) {
      if (value[field].trim().length === 0) throw new Error(`Virtual Live phone requires an explicit ${field} when enabled`)
    }
  }
  return value
})

/**
 * Owns the phone queue and worker. Closing stops admission and drains device operations before
 * releasing the managed worker; the resident owner may also await close after its Agent stops.
 */
export class VirtualLivePhone extends TypertRemoteService {
  static inject = ['typert']
  static Config = phoneConfigSchema
  private readonly lifetime = new AbortController()
  private worker: PhoneWorkerClient | undefined
  private queue: Promise<void> = Promise.resolve()
  private closing: Promise<void> | undefined
  private readonly listeners = new Set<() => void>()
  private readonly subprocess: SubprocessRuntime | undefined
  private workerConfig: PhoneConfig
  private snapshot: PhoneSnapshot = {
    status: 'unconfigured', screen: null, tree: '', treeTruncated: false, apps: [], observedAt: null, elapsedMs: null, error: 'not-configured',
  }

  constructor(ctx: Context, private readonly config: PhoneConfig) {
    super(ctx, 'virtualLivePhone')
    const subprocess = ctx.get('subprocess')
    this.workerConfig = config
    if (config.enabled && subprocess === undefined) throw new Error('Enabled Virtual Live phone requires a subprocess provider')
    this.subprocess = config.enabled ? subprocess : undefined
    if (config.enabled) this.snapshot = { ...this.snapshot, status: 'failed', error: 'unavailable' }
    ctx.effect(() => () => this.close(), 'virtuallive: phone worker lifetime')
  }

  protected async [Service.init](): Promise<void> {
    const subprocess = this.subprocess
    if (subprocess === undefined) return
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.startupTimeoutMs)])
    const [python, adb] = await Promise.all([
      subprocess.resolveExecutable(this.config.python, undefined, signal),
      subprocess.resolveExecutable(this.config.adb, undefined, signal),
    ])
    this.workerConfig = { ...this.config, python, adb }
    await this.ctx.inject(['subprocess'], (child) => {
      child.effect(() => () => this.close(), 'virtuallive: phone subprocess dependency')
    })
  }

  /**
   * Inspect the device without starting a model turn; a confirmed capture clears unknown input outcomes.
   * @param signal - Observation lifetime; cancellation drains an in-flight worker before returning.
   * @returns Fresh screen and accessibility tree, or retained content with an explicit failure status.
   */
  @Remote
  observe(signal: AbortSignal): Promise<PhoneSnapshot> {
    return this.enqueue({ kind: 'observe' }, signal)
  }

  /**
   * Follow confirmed captures and visible device failures without issuing background inputs.
   * @param signal - Client observation lifetime.
   * @returns Current state and subsequent operation settlements, coalescing intermediate updates.
   */
  @Remote({ mode: 'stream' })
  async *follow(signal: AbortSignal): AsyncIterable<PhoneSnapshot> {
    signal = AbortSignal.any([signal, this.lifetime.signal])
    let wake = Promise.withResolvers<void>()
    let changed = true
    const notify = (): void => { changed = true; wake.resolve() }
    this.listeners.add(notify)
    signal.addEventListener('abort', notify, { once: true })
    try {
      while (!signal.aborted) {
        if (!changed) await wake.promise
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- The signal can abort while a capture is awaited.
        if (signal.aborted) break
        wake = Promise.withResolvers<void>()
        changed = false
        yield this.snapshot
      }
    } finally {
      this.listeners.delete(notify)
      signal.removeEventListener('abort', notify)
    }
  }

  /**
   * Serialize one device input and capture the resulting display. Unknown outcomes block further inputs.
   * @param action - Tap, swipe, keyboard, supported app, or HTTP address command.
   * @param signal - Caller cancellation; submitted inputs are not repeated automatically.
   * @returns Confirmed observation or retained screen with a visible failed or uncertain state.
   */
  @Remote
  action(action: PhoneAction, signal: AbortSignal): Promise<PhoneSnapshot> {
    const parsed = phoneActionSchema.safeParse(action)
    if (!parsed.success) throw new RemoteError('virtuallive/invalid-phone-action', 'Invalid phone command', { reason: 'invalid-data' })
    if (parsed.data.kind === 'type' && parsed.data.text.length > this.config.maxTextCharacters) {
      throw new RemoteError('virtuallive/invalid-phone-action', 'Phone text exceeds the configured limit', { reason: 'text-limit' })
    }
    return this.enqueue(parsed.data, signal)
  }

  private enqueue(action: PhoneAction | { kind: 'observe' }, signal: AbortSignal): Promise<PhoneSnapshot> {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const request = this.queue.then(async () => {
      if (combined.aborted) return {
        ...this.snapshot, status: this.snapshot.status === 'ready' ? 'failed' as const : this.snapshot.status,
        error: this.lifetime.signal.aborted ? 'closed' as const : 'cancelled' as const,
      }
      const subprocess = this.subprocess
      if (subprocess === undefined) return this.snapshot
      if (action.kind !== 'observe' && this.snapshot.status !== 'ready') return { ...this.snapshot, error: 'inspect-required' as const }
      this.validateCoordinates(action)
      if (this.worker?.failed) { await this.worker.close(); this.worker = undefined }
      try {
        this.worker ??= new PhoneWorkerClient(subprocess, this.workerConfig)
        const observation = await this.worker.request(action, combined)
        this.snapshot = { ...observation, status: 'ready', error: null }
      } catch (error) {
        if (!(error instanceof PhoneWorkerError)) throw error
        this.snapshot = { ...this.snapshot, status: error.uncertain || this.snapshot.status === 'uncertain' ? 'uncertain' : 'failed', error: error.code }
      }
      for (const listener of this.listeners) listener()
      return this.snapshot
    })
    this.queue = request.then(() => {}, () => {})
    return request
  }

  private validateCoordinates(action: PhoneAction | { kind: 'observe' }): void {
    const screen = this.snapshot.screen
    if (screen === null) return
    const valid = (x: number, y: number): boolean => x < screen.deviceWidth && y < screen.deviceHeight
    if ((action.kind === 'tap' && !valid(action.x, action.y)) || (action.kind === 'swipe' && (!valid(action.x1, action.y1) || !valid(action.x2, action.y2)))) {
      throw new RemoteError('virtuallive/invalid-phone-action', 'Phone coordinates are outside the display', { reason: 'outside-display' })
    }
  }

  /**
   * Stop queued operations, abort active work, and await the owned Android worker's full exit.
   * @returns After all requests settle; the resident Agent must already have stopped using this service.
   */
  close(): Promise<void> {
    this.lifetime.abort()
    this.closing ??= (async () => {
      await this.queue
      await this.worker?.close()
      this.worker = undefined
    })()
    return this.closing
  }
}
