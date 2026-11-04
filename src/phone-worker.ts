/** Bounded, serial JSONL requests over a provider-managed Android Python process. */
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { phoneReplySchema, type PhoneObservation } from './phone-protocol.ts'
import type { PhoneAction, PhoneConfig, PhoneFailureCode } from './phone-types.ts'

/** A typed failure preserves whether an input may have reached Android. */
export class PhoneWorkerError extends Error {
  /**
   * @param code - Machine-readable failure identity.
   * @param uncertain - A submitted device input may have taken effect.
   */
  constructor(readonly code: PhoneFailureCode, readonly uncertain: boolean) {
    super(`Android phone operation failed: ${code}`)
    this.name = 'PhoneWorkerError'
  }
}

/** One worker process and one outstanding response; callers own request serialization. */
export class PhoneWorkerClient {
  private readonly handle: SubprocessHandle
  private readonly chunks: Buffer[] = []
  private bufferedBytes = 0
  private nextId = 0
  private active: {
    id: number
    mutation: boolean
    resolve: (result: PhoneObservation) => void
    reject: (error: PhoneWorkerError) => void
  } | undefined
  private failure: PhoneWorkerError | undefined
  private closing: Promise<void> | undefined
  private first = true

  /**
   * @param subprocess - Managed process provider retained through close.
   * @param config - Validated executable paths, serial, capture bounds, and deadlines.
   */
  constructor(subprocess: Pick<SubprocessRuntime, 'spawn'>, private readonly config: PhoneConfig) {
    const workerPath = fileURLToPath(new URL('../assets/phone-worker.py', import.meta.url))
    this.handle = subprocess.spawn({
      argv: [config.python, '-u', workerPath, '--config', JSON.stringify(config)],
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: config.maxDiagnosticBytes } }, graceMs: config.graceMs,
      env: { ADBUTILS_ADB_PATH: config.adb, PYTHONUNBUFFERED: '1' },
    })
    if (this.handle.stdin === undefined || this.handle.stdout === undefined) this.fail('unavailable')
    this.handle.stdout?.on('data', (chunk: Buffer) => { this.receive(chunk) })
    this.handle.stdout?.on('error', () => { this.fail('unavailable') })
    this.handle.stdout?.on('end', () => { this.fail('unavailable') })
    this.handle.stdin?.on('error', () => { this.fail('unavailable') })
    void this.handle.done.then(() => { this.fail('unavailable') }, () => { this.fail('unavailable') })
  }

  /** Whether this process has lost its connection and must be replaced. */
  get failed(): boolean { return this.failure !== undefined }

  /**
   * Send one command; cancellation terminates and drains this worker before rejection.
   * @param action - Validated observation or device input.
   * @param signal - Caller-owned cancellation.
   * @returns Fresh capture after the operation; a failed input is never repeated automatically.
   */
  async request(action: PhoneAction | { kind: 'observe' }, signal: AbortSignal): Promise<PhoneObservation> {
    if (signal.aborted) throw new PhoneWorkerError('cancelled', false)
    if (this.failure !== undefined) { await this.close(); throw this.failure }
    if (this.active !== undefined) throw new Error('Android worker requests must be serialized')
    const id = ++this.nextId
    const frame = `${JSON.stringify({ id, action })}\n`
    if (Buffer.byteLength(frame) > this.config.maxRequestBytes) throw new PhoneWorkerError('request-limit', false)
    const result = Promise.withResolvers<PhoneObservation>()
    this.active = { id, mutation: action.kind !== 'observe', resolve: result.resolve, reject: result.reject }
    const abort = (): void => { this.fail('cancelled') }
    signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => { this.fail('timeout') }, this.first ? this.config.startupTimeoutMs : this.config.timeoutMs)
    this.first = false
    try {
      this.handle.stdin?.write(frame, (error) => { if (error) this.fail('unavailable') })
      return await result.promise
    } catch (error) {
      if (this.failed) await this.close()
      throw error
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  }

  /**
   * Terminate the complete managed range and release its byte streams.
   * @returns After process exit and all pending response callbacks have settled.
   */
  close(): Promise<void> {
    this.fail('closed')
    this.closing ??= (async () => {
      await this.handle.waitForExit()
      await Promise.allSettled([this.handle.done])
      this.handle.stdin?.destroy()
      this.handle.stdout?.destroy()
    })()
    return this.closing
  }

  private fail(code: PhoneFailureCode): void {
    if (this.failure !== undefined) return
    this.failure = new PhoneWorkerError(code, this.active?.mutation ?? false)
    this.active?.reject(this.failure)
    this.active = undefined
    this.chunks.length = 0
    this.bufferedBytes = 0
    this.handle.terminate()
  }

  private receive(chunk: Buffer): void {
    let offset = 0
    while (offset < chunk.length && this.failure === undefined) {
      const newline = chunk.indexOf(10, offset)
      const end = newline < 0 ? chunk.length : newline + 1
      const piece = chunk.subarray(offset, end)
      if (this.bufferedBytes + piece.length > this.config.maxResponseBytes) { this.fail('protocol'); return }
      this.chunks.push(piece)
      this.bufferedBytes += piece.length
      if (newline >= 0) this.receiveFrame()
      offset = end
    }
  }

  private receiveFrame(): void {
    try {
      const frame = Buffer.concat(this.chunks, this.bufferedBytes)
      const line = new TextDecoder('utf-8', { fatal: true }).decode(frame.subarray(0, frame.length - 1))
      const response = phoneReplySchema.parse(JSON.parse(line))
      const active = this.active
      if (active === undefined || active.id !== response.id) { this.fail('protocol'); return }
      this.chunks.length = 0
      this.bufferedBytes = 0
      this.active = undefined
      if ('error' in response) {
        active.reject(new PhoneWorkerError(response.error.code, response.error.uncertain))
        this.fail(response.error.code)
      }
      else if (response.result.tree.length > this.config.maxTreeCharacters || response.result.screen.width > this.config.screenshotWidth) {
        active.reject(new PhoneWorkerError('protocol', active.mutation))
        this.fail('protocol')
      } else active.resolve(response.result)
    } catch (error) {
      // Frames are untrusted; parse details can include captured screen or entered text.
      void error
      this.fail('protocol')
    }
  }
}
