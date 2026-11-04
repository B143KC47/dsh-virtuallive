// @vitest-environment jsdom
/** Unknown device input stays blocked until a fresh inspection succeeds; visible views own automatic reads. */
import { Context } from '@deepseek-ai/cordis'
import { RemoteStream, type RemoteStreamOptions } from '@deepseek-ai/dsh-api-gateway/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { RemoteError, type RemoteStreamHandle } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { PhoneController } from '../src/client/PhoneController.ts'
import type { PhoneSnapshot } from '../src/phone-types.ts'

type PhoneRemote = Context['remote']['virtualLivePhone']

function phoneStream(source: AsyncIterable<PhoneSnapshot>): RemoteStreamHandle<PhoneSnapshot, never> {
  return {
    [Symbol.asyncIterator]: () => source[Symbol.asyncIterator](),
    send() {},
    end() {},
    dispose() {},
  }
}
const observed: PhoneSnapshot = {
  status: 'ready', screen: null, tree: '', treeTruncated: false, apps: [],
  observedAt: 1, elapsedMs: 5, error: null,
}

function fixture() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const remote = {
    observe: vi.fn<PhoneRemote['observe']>().mockResolvedValue({ ok: true, value: observed }),
    action: vi.fn<PhoneRemote['action']>().mockResolvedValue({ ok: true, value: observed }),
    follow: vi.fn<PhoneRemote['follow']>(() => { throw new Error('The fixture has no live stream generation') }),
  }
  const generation = createSnapshotStore(undefined)
  ctx.reflect.provide('remote', {
    virtualLivePhone: remote,
    $stream: <Item>(options: RemoteStreamOptions<Item>) => new RemoteStream({ generation }, options),
  })
  const controller = new PhoneController(ctx, 3000)
  onTestFinished(() => controller.dispose())
  const face = controller.face()
  return { controller, remote, face, state: () => face.hooks.phone.getSnapshot() }
}

it.each(['response', 'transport'] as const)('retains unknown input after a failed %s refresh', async (failure) => {
  const f = fixture()
  await f.face.refreshPhone()
  f.remote.action.mockRejectedValueOnce(new Error('The input response was lost'))
  expect(await f.face.controlPhone({ kind: 'button', button: 'home' })).toBe(false)
  expect(f.state().unconfirmed).toBe(true)
  if (failure === 'response') {
    f.remote.observe.mockResolvedValueOnce({
      ok: false, error: new RemoteError('gateway/internal', 'Inspection failed', {}),
    })
  } else {
    f.remote.observe.mockRejectedValueOnce(new Error('The inspection response was lost'))
  }
  await f.face.refreshPhone()
  expect(f.state()).toMatchObject({ unconfirmed: true, connection: 'failed', snapshot: observed })
  expect(await f.face.controlPhone({ kind: 'button', button: 'home' })).toBe(false)
  expect(f.remote.action).toHaveBeenCalledOnce()
  await f.face.refreshPhone()
  expect(f.state()).toMatchObject({ unconfirmed: false, connection: 'ready' })
  expect(await f.face.controlPhone({ kind: 'button', button: 'home' })).toBe(true)
  expect(f.remote.action).toHaveBeenCalledTimes(2)
})

async function visibleFixture(initial: PhoneSnapshot = observed) {
  vi.useFakeTimers()
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const view = new AbortController()
  let watching = Promise.resolve()
  onTestFinished(async () => {
    view.abort()
    await watching
    visibility.mockRestore()
    vi.useRealTimers()
  })
  const f = fixture()
  f.remote.observe.mockResolvedValueOnce({ ok: true, value: initial })
  await f.face.refreshPhone()
  f.remote.observe.mockClear()
  watching = f.face.watchPhone(view.signal)
  return {
    ...f, view, watching,
    visibility: (value: DocumentVisibilityState): void => {
      visibility.mockReturnValue(value)
      document.dispatchEvent(new Event('visibilitychange'))
    },
  }
}

describe('visible phone capture', () => {
  it.each(['configured', 'unconfigured'] as const)('captures an initial followed snapshot only for a %s phone', async (configuration) => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const view = new AbortController()
    let watching = Promise.resolve()
    onTestFinished(async () => {
      view.abort()
      await watching
      visibility.mockRestore()
      vi.useRealTimers()
    })
    const f = fixture()
    const initial: PhoneSnapshot = {
      ...observed, observedAt: null,
      status: configuration === 'configured' ? 'failed' : 'unconfigured',
      error: configuration === 'configured' ? 'unavailable' : 'not-configured',
    }
    f.remote.follow.mockImplementation((signal) => {
      if (signal === undefined) throw new Error('Phone follow omitted its signal')
      return phoneStream((async function* () {
        yield initial
        if (signal.aborted) return
        await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      })())
    })
    const followed = Promise.withResolvers<PhoneSnapshot>()
    const unsubscribe = f.face.hooks.phone.subscribe(() => {
      const snapshot = f.state().snapshot
      if (snapshot !== null) followed.resolve(snapshot)
    })
    onTestFinished(unsubscribe)
    watching = f.face.watchPhone(view.signal)
    await f.controller.connect()
    await followed.promise
    await vi.advanceTimersByTimeAsync(0)
    expect(f.remote.observe).toHaveBeenCalledTimes(configuration === 'configured' ? 1 : 0)
    expect(f.remote.action).not.toHaveBeenCalled()
  })

  it('captures on entry and after the configured delay, pausing in a hidden document', async () => {
    const f = await visibleFixture()
    expect(f.face.watchPhone).toBe(f.controller.face().watchPhone)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.remote.observe).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(2999)
    expect(f.remote.observe).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.remote.observe).toHaveBeenCalledTimes(2)
    f.visibility('hidden')
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(30000)
    expect(f.remote.observe).toHaveBeenCalledTimes(2)
    f.visibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(f.remote.observe).toHaveBeenCalledTimes(3)
    expect(f.remote.action).not.toHaveBeenCalled()
  })

  it('waits for an admitted read and an input to settle without overlap or input replay', async () => {
    const f = await visibleFixture()
    const capture = Promise.withResolvers<Awaited<ReturnType<PhoneRemote['observe']>>>()
    const input = Promise.withResolvers<Awaited<ReturnType<PhoneRemote['action']>>>()
    f.remote.observe.mockReturnValueOnce(capture.promise)
    let action: Promise<boolean> | undefined
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(f.state().busy).toBe(true)
      await vi.advanceTimersByTimeAsync(12000)
      expect(f.remote.observe).toHaveBeenCalledOnce()
      await f.face.refreshPhone()
      expect(await f.face.controlPhone({ kind: 'button', button: 'home' })).toBe(false)
      expect(f.remote.action).not.toHaveBeenCalled()
      capture.resolve({ ok: true, value: observed })
      await vi.advanceTimersByTimeAsync(0)
      f.remote.action.mockReturnValueOnce(input.promise)
      action = f.face.controlPhone({ kind: 'button', button: 'home' })
      await vi.advanceTimersByTimeAsync(12000)
      expect(f.remote.action).toHaveBeenCalledOnce()
      expect(f.remote.observe).toHaveBeenCalledOnce()
      input.resolve({ ok: true, value: observed })
      expect(await action).toBe(true)
      await vi.advanceTimersByTimeAsync(2999)
      expect(f.remote.observe).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(1)
      expect(f.remote.observe).toHaveBeenCalledTimes(2)
      expect(f.remote.action).toHaveBeenCalledOnce()
    } finally {
      capture.resolve({ ok: true, value: observed })
      input.resolve({ ok: true, value: observed })
      await action
    }
  })

  it('keeps automatic reads stopped after an error until a successful manual refresh', async () => {
    const f = await visibleFixture()
    f.remote.observe.mockRejectedValueOnce(new Error('Capture unavailable'))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.state()).toMatchObject({ connection: 'failed', snapshot: observed, unconfirmed: false })
    expect(vi.getTimerCount()).toBe(0)
    f.visibility('hidden')
    f.visibility('visible')
    await vi.advanceTimersByTimeAsync(30000)
    expect(f.remote.observe).toHaveBeenCalledOnce()
    f.remote.observe.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'Inspection failed', {}) })
    await f.face.refreshPhone()
    await vi.advanceTimersByTimeAsync(30000)
    expect(f.remote.observe).toHaveBeenCalledTimes(2)
    await f.face.refreshPhone()
    expect(f.state().connection).toBe('ready')
    await vi.advanceTimersByTimeAsync(2999)
    expect(f.remote.observe).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.remote.observe).toHaveBeenCalledTimes(4)
    expect(f.remote.action).not.toHaveBeenCalled()
  })

  it('does not automatically inspect an uncertain input', async () => {
    const uncertain = await visibleFixture()
    await vi.advanceTimersByTimeAsync(0)
    uncertain.remote.action.mockResolvedValueOnce({ ok: true, value: { ...observed, status: 'uncertain', error: 'timeout' } })
    expect(await uncertain.face.controlPhone({ kind: 'button', button: 'home' })).toBe(false)
    await vi.advanceTimersByTimeAsync(30000)
    expect(uncertain.remote.observe).toHaveBeenCalledOnce()
  })

  it('does not automatically inspect an unconfigured device', async () => {
    const unconfigured = await visibleFixture({ ...observed, status: 'unconfigured', error: 'not-configured' })
    await vi.advanceTimersByTimeAsync(30000)
    expect(unconfigured.remote.observe).not.toHaveBeenCalled()
    expect(unconfigured.state().snapshot?.status).toBe('unconfigured')
  })

  it('releases a removed view immediately and awaits its admitted read', async () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    onTestFinished(() => { add.mockRestore(); remove.mockRestore() })
    const f = await visibleFixture()
    const capture = Promise.withResolvers<Awaited<ReturnType<PhoneRemote['observe']>>>()
    f.remote.observe.mockReturnValueOnce(capture.promise)
    let settled = false
    void f.watching.then(() => { settled = true })
    try {
      await vi.advanceTimersByTimeAsync(0)
      f.view.abort()
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
      const listener = add.mock.calls.find(([name]) => name === 'visibilitychange')?.[1]
      expect(listener).toBeDefined()
      expect(remove).toHaveBeenCalledWith('visibilitychange', listener)
      f.visibility('visible')
      expect(f.remote.observe).toHaveBeenCalledOnce()
    } finally {
      capture.resolve({ ok: true, value: observed })
      await f.watching
    }
    expect(settled).toBe(true)
    await vi.advanceTimersByTimeAsync(30000)
    expect(f.remote.observe).toHaveBeenCalledOnce()
  })

  it('awaits capture settlement when the controller is disposed and leaves no timer', async () => {
    const f = await visibleFixture()
    const capture = Promise.withResolvers<Awaited<ReturnType<PhoneRemote['observe']>>>()
    f.remote.observe.mockReturnValueOnce(capture.promise)
    await vi.advanceTimersByTimeAsync(0)
    const signal = f.remote.observe.mock.calls[0]?.[0]
    if (signal === undefined) throw new Error('Phone observation omitted its signal')
    let disposed = false
    const disposal = f.controller.dispose().then(() => { disposed = true })
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(signal.aborted).toBe(true)
      expect(disposed).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      capture.resolve({ ok: true, value: observed })
      await disposal
      await f.watching
    }
    expect(disposed).toBe(true)
    await vi.advanceTimersByTimeAsync(30000)
    expect(f.remote.observe).toHaveBeenCalledOnce()
  })
})
