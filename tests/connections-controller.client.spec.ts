/** Login expiry and transport failures never become verified account state. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-dsh-virtuallive/remote'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { ConnectionsController } from '../src/client/ConnectionsController.ts'
import type { ConnectionAttemptId, ConnectionStatus } from '../src/connections-types.ts'

type ConnectionRemote = Context['remote']['virtualLiveConnections']
const status: ConnectionStatus = { storage: 'available', bilibili: { status: 'not-linked', account: null, verifiedAt: null, verifiedUntil: null } }
afterEach(() => { vi.useRealTimers() })

function fixture() {
  const remote = {
    status: vi.fn<ConnectionRemote['status']>().mockResolvedValue({ ok: true, value: status }),
    beginBilibiliLogin: vi.fn<ConnectionRemote['beginBilibiliLogin']>().mockResolvedValue({ ok: true, value: { id: 'attempt' as ConnectionAttemptId, image: 'data:image/png;base64,cXI=', expiresAt: Date.now() + 30 } }),
    checkBilibiliLogin: vi.fn<ConnectionRemote['checkBilibiliLogin']>().mockResolvedValue({ ok: true, value: { status: 'waiting', connection: status } }),
    cancelBilibiliLogin: vi.fn<ConnectionRemote['cancelBilibiliLogin']>().mockResolvedValue({ ok: true, value: undefined }),
    verifyBilibili: vi.fn<ConnectionRemote['verifyBilibili']>().mockResolvedValue({ ok: true, value: status }),
    disconnectBilibili: vi.fn<ConnectionRemote['disconnectBilibili']>().mockResolvedValue({ ok: true, value: status }),
  }
  const controller = new ConnectionsController(remote)
  onTestFinished(() => controller.dispose())
  const face = controller.face()
  return { remote, controller, face, snapshot: () => face.hooks.connections.getSnapshot() }
}

it('expires QR images without a timer-driven account request', async () => {
  vi.useFakeTimers()
  const f = fixture()
  await f.face.beginLogin()
  expect(f.snapshot().login).not.toBeNull()
  await vi.advanceTimersByTimeAsync(30)
  expect(f.snapshot()).toMatchObject({ login: null, loginStatus: 'expired' })
  expect(f.remote.checkBilibiliLogin).not.toHaveBeenCalled()
})

it('retains account state on a failed refresh and reports operation failures in the shared toast', async () => {
  const f = fixture()
  await f.face.refreshConnections()
  f.remote.status.mockRejectedValueOnce(new Error('transport failed'))
  await f.face.refreshConnections()
  expect(f.snapshot()).toMatchObject({ snapshot: status, loadFailed: true })
  f.remote.beginBilibiliLogin.mockResolvedValueOnce({ ok: false, error: new RemoteError('virtuallive/connection-failed', 'failed', { reason: 'network' }) })
  await f.face.beginLogin()
  expect(f.snapshot()).toMatchObject({ login: null, notice: { kind: 'failed', reason: 'network' } })
  f.face.dismissConnectionNotice()
  expect(f.snapshot().notice).toBeNull()
})

it('removes verification when its lifetime ends and does not infer renewal from a saved credential', async () => {
  vi.useFakeTimers()
  const f = fixture()
  f.remote.status.mockResolvedValueOnce({ ok: true, value: { ...status, bilibili: { ...status.bilibili, status: 'verified', verifiedAt: Date.now(), verifiedUntil: Date.now() + 20 } } })
  await f.face.refreshConnections()
  expect(f.snapshot().snapshot?.bilibili.status).toBe('verified')
  await vi.advanceTimersByTimeAsync(20)
  expect(f.snapshot().snapshot?.bilibili.status).toBe('unverified')
  expect(f.remote.verifyBilibili).not.toHaveBeenCalled()
})

it('removes a QR image when the Host says the attempt was replaced', async () => {
  const f = fixture()
  await f.face.beginLogin()
  f.remote.checkBilibiliLogin.mockResolvedValueOnce({ ok: false, error: new RemoteError('virtuallive/connection-failed', 'failed', { reason: 'invalid-attempt' }) })
  await f.face.checkLogin()
  expect(f.snapshot()).toMatchObject({ login: null, loginStatus: 'expired', notice: { kind: 'failed', reason: 'invalid-attempt' } })
})

it('drains an admitted request and rejects its late state publication on disposal', async () => {
  const f = fixture()
  const response = Promise.withResolvers<Awaited<ReturnType<ConnectionRemote['status']>>>()
  f.remote.status.mockImplementationOnce(() => response.promise)
  const pending = f.face.refreshConnections()
  const disposed = f.controller.dispose()
  response.resolve({ ok: true, value: status })
  await Promise.all([disposed, pending])
  expect(f.snapshot().snapshot).toBeNull()
  await f.face.beginLogin()
  expect(f.remote.beginBilibiliLogin).not.toHaveBeenCalled()
})
