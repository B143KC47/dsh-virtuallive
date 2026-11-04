/** Android RPC cancellation, frame validation, and process quiescence. */
import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { SubprocessRuntime, type SubprocessHandle, type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { PhoneWorkerClient } from '../src/phone-worker.ts'
import { phoneConfigSchema, VirtualLivePhone } from '../src/phone.ts'
import { phoneActionSchema } from '../src/phone-protocol.ts'
import type { PhoneConfig } from '../src/phone-types.ts'
import { Context } from '@deepseek-ai/cordis'

const observation = {
  screen: { mediaType: 'image/jpeg', data: 'aW1hZ2U=', width: 360, height: 640, deviceWidth: 720, deviceHeight: 1280 },
  tree: '{"nodes":[]}', treeTruncated: false,
  apps: ['qq', 'wechat', 'bilibili', 'rednote', 'x', 'youtube'].map(id => ({ id, installed: false, login: 'unknown' })),
  observedAt: 1, elapsedMs: 10,
}

function channel() {
  const frames: Array<{ id: number; action: Record<string, unknown> }> = []
  const dispatched = Promise.withResolvers<undefined>()
  const exited = Promise.withResolvers<{ exitCode: number; signal: null }>()
  const emptyRange = Promise.withResolvers<boolean>()
  const stdout = new PassThrough()
  const stdin = new Writable({ write(chunk: Buffer, _encoding, callback) {
    frames.push(JSON.parse(chunk.toString('utf8')) as { id: number; action: Record<string, unknown> })
    dispatched.resolve(undefined)
    callback()
  } })
  const terminate = vi.fn()
  const handle: SubprocessHandle = {
    stdin, stdout, stderr: undefined, control: undefined, collected: {}, done: exited.promise,
    terminate, waitForExit: () => emptyRange.promise,
  }
  const exit = (): void => { exited.resolve({ exitCode: 0, signal: null }); emptyRange.resolve(true) }
  onTestFinished(() => { exit(); stdout.destroy(); stdin.destroy() })
  return { handle, frames, dispatched: dispatched.promise, stdout, stdin, terminate, exit }
}

function fixture(override: Partial<PhoneConfig> = {}) {
  const config = { ...phoneConfigSchema({ ...phoneConfigSchema(), enabled: true, python: 'python', adb: 'adb', serial: 'test-device' }), ...override }
  const transport = channel()
  const spawn = vi.fn<SubprocessRuntime['spawn']>(() => transport.handle)
  const client = new PhoneWorkerClient({ spawn }, config)
  onTestFinished(async () => { transport.exit(); await client.close() })
  return { ...transport, client, config, spawn }
}

class ControlledSubprocess extends SubprocessRuntime {
  constructor(ctx: Context, private readonly create: (spec: SubprocessSpawnSpec) => SubprocessHandle) { super(ctx) }
  override resolveExecutable(command: string): Promise<string> { return Promise.resolve(command) }
  override terminalEnvironment(): Promise<{ platform: 'windows' }> { return Promise.resolve({ platform: 'windows' }) }
  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle { return this.create(spec) }
  override spawnTerminal(): never { throw new Error('Terminals are not used by the phone') }
}

describe('phone input validation', () => {
  it('requires an explicit Python, adb and serial only when enabled', () => {
    expect(phoneConfigSchema({ ...phoneConfigSchema(), enabled: false }).enabled).toBe(false)
    for (const field of ['python', 'adb', 'serial']) {
      expect(() => phoneConfigSchema({ ...phoneConfigSchema(), enabled: true, python: 'python', adb: 'adb', serial: 'device', [field]: '' })).toThrow(field)
    }
    expect(() => phoneConfigSchema({ ...phoneConfigSchema(), enabled: true, python: 'python', adb: 'adb', serial: 'device', timeoutMs: 0 })).toThrow()
  })

  it('rejects unknown commands, extra fields, fractional pixels and credential-bearing URLs', () => {
    for (const action of [
      { kind: 'delete' }, { kind: 'tap', x: 1.5, y: 1 }, { kind: 'tap', x: -1, y: 1 },
      { kind: 'button', button: 'home', text: 'extra' }, { kind: 'url', url: 'file:///private' },
      { kind: 'url', url: 'https://user:password@example.test/' },
      { kind: 'swipe', x1: 1, y1: 1, x2: 2, y2: 2, durationMs: 99 },
    ]) expect(phoneActionSchema.safeParse(action).success).toBe(false)
    expect(phoneActionSchema.parse({ kind: 'type', text: '你好', clear: false })).toEqual({ kind: 'type', text: '你好', clear: false })
  })
})

describe('phone worker lifetime', () => {
  it('assembles split UTF-8 JSONL frames and confirms exactly one operation', async () => {
    const f = fixture()
    const pending = f.client.request({ kind: 'observe' }, new AbortController().signal)
    await f.dispatched
    const frame = Buffer.from(`${JSON.stringify({ id: f.frames[0]!.id, result: { ...observation, tree: '手机' } })}\n`)
    const split = frame.indexOf(Buffer.from('手机')) + 1
    f.stdout.write(frame.subarray(0, split))
    f.stdout.write(frame.subarray(split))
    expect(await pending).toMatchObject({ tree: '手机' })
    expect(f.frames).toHaveLength(1)
    expect(f.spawn.mock.calls[0]![0].argv).toContain(JSON.stringify(f.config))
  })

  it('cancels submitted input once and waits for the managed range to exit', async () => {
    const f = fixture()
    const controller = new AbortController()
    let settled = false
    const pending = f.client.request({ kind: 'tap', x: 1, y: 2 }, controller.signal)
    const assertion = expect(pending).rejects.toMatchObject({ code: 'cancelled', uncertain: true })
    void pending.then(() => { settled = true }, () => { settled = true })
    await f.dispatched
    controller.abort()
    await Promise.resolve()
    expect(f.terminate).toHaveBeenCalledOnce()
    expect(settled).toBe(false)
    expect(f.frames).toHaveLength(1)
    f.exit()
    await assertion
    expect(settled).toBe(true)
  })

  it('does not start a pre-cancelled command or oversized request', async () => {
    const f = fixture({ maxRequestBytes: 128 })
    await expect(f.client.request({ kind: 'button', button: 'home' }, AbortSignal.abort())).rejects.toMatchObject({ code: 'cancelled', uncertain: false })
    await expect(f.client.request({ kind: 'type', text: 'x'.repeat(256), clear: false }, new AbortController().signal)).rejects.toMatchObject({ code: 'request-limit', uncertain: false })
    expect(f.frames).toHaveLength(0)
    expect(f.terminate).not.toHaveBeenCalled()
  })

  it('refuses mismatched request ids and bounded oversized response frames', async () => {
    for (const frame of [`${JSON.stringify({ id: 999, result: observation })}\n`, 'x'.repeat(1025)]) {
      const f = fixture({ maxResponseBytes: 1024 })
      const pending = f.client.request({ kind: 'observe' }, new AbortController().signal)
      const assertion = expect(pending).rejects.toMatchObject({ code: 'protocol', uncertain: false })
      await f.dispatched
      f.stdout.write(frame)
      f.exit()
      await assertion
      expect(f.terminate).toHaveBeenCalledOnce()
    }
  })

  it('enforces the configured deadline without repeating an uncertain input', async () => {
    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    const f = fixture({ startupTimeoutMs: 20 })
    const pending = f.client.request({ kind: 'button', button: 'home' }, new AbortController().signal)
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout', uncertain: true })
    await f.dispatched
    await vi.advanceTimersByTimeAsync(20)
    expect(f.frames).toHaveLength(1)
    f.exit()
    await assertion
  })

  it('reports worker errors without leaking captured or entered content', async () => {
    const f = fixture()
    const pending = f.client.request({ kind: 'type', text: 'private input', clear: false }, new AbortController().signal)
    const assertion = expect(pending).rejects.toMatchObject({ code: 'unavailable', uncertain: true, message: 'Android phone operation failed: unavailable' })
    await f.dispatched
    f.stdout.write(`${JSON.stringify({ id: f.frames[0]!.id, error: { code: 'unavailable', uncertain: true } })}\n`)
    f.exit()
    await assertion
  })

  it('stops disabled phone admission and disposes without starting a process', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    const phone = new VirtualLivePhone(ctx, phoneConfigSchema({ ...phoneConfigSchema(), enabled: false }))
    expect(await phone.observe(new AbortController().signal)).toMatchObject({ status: 'unconfigured', screen: null })
    await Promise.all([phone.close(), phone.close()])
    expect(await phone.observe(new AbortController().signal)).toMatchObject({ error: 'closed' })
  })
})

describe('phone device queue', () => {
  it('blocks queued inputs after an unknown result until a successful fresh observation', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    const first = channel(), failedInspection = channel(), recovery = channel()
    const spawn = vi.fn()
      .mockReturnValueOnce(first.handle).mockReturnValueOnce(failedInspection.handle).mockReturnValueOnce(recovery.handle)
    new ControlledSubprocess(ctx, spawn)
    const config = phoneConfigSchema({
      ...phoneConfigSchema(), enabled: true, python: 'python', adb: 'adb', serial: 'test-device',
    })
    const phone = new VirtualLivePhone(ctx, config)
    const signal = new AbortController().signal
    expect(await phone.action({ kind: 'button', button: 'home' }, signal)).toMatchObject({ error: 'inspect-required' })
    expect(spawn).not.toHaveBeenCalled()
    const observed = phone.observe(signal)
    await first.dispatched
    first.stdout.write(`${JSON.stringify({ id: 1, result: observation })}\n`)
    expect(await observed).toMatchObject({ status: 'ready' })
    const acted = phone.action({ kind: 'tap', x: 1, y: 2 }, signal)
    const queued = phone.action({ kind: 'button', button: 'home' }, signal)
    await vi.waitFor(() => { expect(first.frames).toHaveLength(2) })
    first.stdout.write(`${JSON.stringify({ id: 2, error: { code: 'unavailable', uncertain: true } })}\n`)
    first.exit()
    expect(await acted).toMatchObject({ status: 'uncertain', screen: observation.screen })
    expect(await queued).toMatchObject({ status: 'uncertain', error: 'inspect-required' })
    expect(first.frames).toHaveLength(2)
    const failed = phone.observe(signal)
    await failedInspection.dispatched
    failedInspection.stdout.write(`${JSON.stringify({ id: 1, error: { code: 'unavailable', uncertain: false } })}\n`)
    failedInspection.exit()
    expect(await failed).toMatchObject({ status: 'uncertain' })
    const recovered = phone.observe(signal)
    await recovery.dispatched
    recovery.stdout.write(`${JSON.stringify({ id: 1, result: { ...observation, observedAt: 2 } })}\n`)
    expect(await recovered).toMatchObject({ status: 'ready', observedAt: 2, error: null })
    recovery.exit()
    await phone.close()
  })

  it('rejects coordinates outside a confirmed display and retains the screen', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    const transport = channel()
    new ControlledSubprocess(ctx, () => transport.handle)
    const config = phoneConfigSchema({ ...phoneConfigSchema(), enabled: true, python: 'python', adb: 'adb', serial: 'test-device' })
    const phone = new VirtualLivePhone(ctx, config)
    const observed = phone.observe(new AbortController().signal)
    await transport.dispatched
    transport.stdout.write(`${JSON.stringify({ id: 1, result: observation })}\n`)
    await observed
    await expect(phone.action({ kind: 'tap', x: 720, y: 0 }, new AbortController().signal)).rejects.toMatchObject({ code: 'virtuallive/invalid-phone-action', details: { reason: 'outside-display' } })
    expect(transport.frames).toHaveLength(1)
    transport.exit()
    await phone.close()
  })
})
