/** Credential commits require mobile confirmation, an account check, and a live caller. */
import { afterEach, describe, expect, it, onTestFinished, vi, type MockInstance } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Typert from '@deepseek-ai/dsh-typert-registry'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { VirtualLiveConnections } from '../src/connections.ts'
import type { ConnectionConfig } from '../src/connections-types.ts'

const credential = credentialKey('dsh-virtuallive', 'bilibili')
const signal = (): AbortSignal => new AbortController().signal
const json = (value: object, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(value), headers === undefined ? {} : { headers })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

async function fixture(config: Partial<ConnectionConfig> = {}, storage = true) {
  const request = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unscripted provider request'))
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(Typert)
  if (storage) await ctx.plugin(MemoryCredentials)
  const fork = await ctx.plugin(VirtualLiveConnections, { ...VirtualLiveConnections.Config(), ...config })
  return { ctx, fork, service: ctx.virtualLiveConnections, request }
}

function providerResponses(request: MockInstance<typeof fetch>) {
  return request.mockReset()
    .mockResolvedValueOnce(json({ code: 0, data: { url: 'https://passport.bilibili.com/h5-app/passport/login/scan?key=private-key', qrcode_key: 'private-key' } }))
    .mockResolvedValueOnce(json({ code: 0, data: { code: 0 } }, { 'Set-Cookie': 'SESSDATA=private-cookie; Path=/; Secure' }))
    .mockResolvedValueOnce(json({ code: 0, data: { isLogin: true, mid: 123, uname: 'Example' } }))
}

describe('account connection owner', () => {
  it('commits only verified accounts, omits secrets from every view, and forgets the credential explicitly', async () => {
    const f = await fixture()
    providerResponses(f.request)
    expect(await f.service.status(signal())).toMatchObject({ storage: 'available', bilibili: { status: 'not-linked' } })
    const login = await f.service.beginBilibiliLogin(signal())
    expect(login.image.startsWith('data:image/png;base64,')).toBe(true)
    expect(await f.ctx.credentials.readRecord(credential)).toBeUndefined()
    const result = await f.service.checkBilibiliLogin(login.id, signal())
    expect(result).toMatchObject({ status: 'verified', connection: { bilibili: { status: 'verified', account: { id: '123', name: 'Example' } } } })
    expect(JSON.stringify(result)).not.toMatch(/private-key|private-cookie|SESSDATA/)
    expect(await f.ctx.credentials.readRecord(credential)).toMatchObject({ kind: 'grant', payload: { sessdata: 'private-cookie' } })
    expect(await f.service.disconnectBilibili(signal())).toMatchObject({ bilibili: { status: 'not-linked' } })
    expect(await f.ctx.credentials.readRecord(credential)).toBeUndefined()
    await expect(f.service.checkBilibiliLogin(login.id, signal())).rejects.toMatchObject({ details: { reason: 'invalid-attempt' } })
  })

  it('restores credential presence without restoring a verified claim and detects provider logout', async () => {
    const f = await fixture()
    await f.ctx.credentials.modifyRecord(credential, async () => ({ kind: 'grant', payload: { version: 1, sessdata: 'stored-cookie', account: { id: '123', name: 'Example' } } }))
    expect(await f.service.status(signal())).toMatchObject({ bilibili: { status: 'unverified', verifiedAt: null } })
    f.request.mockResolvedValue(json({ code: -101 }))
    expect(await f.service.verifyBilibili(signal())).toMatchObject({ bilibili: { status: 'expired' } })
    expect(await f.ctx.credentials.readRecord(credential)).toBeDefined()
  })

  it('expires QR challenges and successful account checks using the configured lifetimes', async () => {
    const f = await fixture({ loginLifetimeMs: 20, verificationLifetimeMs: 30 })
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const fetch = providerResponses(f.request)
    const first = await f.service.beginBilibiliLogin(signal())
    clock.mockReturnValue(1020)
    expect(await f.service.checkBilibiliLogin(first.id, signal())).toMatchObject({ status: 'expired' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(await f.ctx.credentials.readRecord(credential)).toBeUndefined()
    providerResponses(f.request)
    const second = await f.service.beginBilibiliLogin(signal())
    expect(await f.service.checkBilibiliLogin(second.id, signal())).toMatchObject({ status: 'verified' })
    clock.mockReturnValue(1050)
    expect(await f.service.status(signal())).toMatchObject({ bilibili: { status: 'unverified' } })
  })

  it('does not persist a confirmed cookie when the account endpoint fails', async () => {
    const f = await fixture()
    const fetch = providerResponses(f.request)
    const login = await f.service.beginBilibiliLogin(signal())
    fetch.mockReset().mockResolvedValueOnce(json({ code: 0, data: { code: 0 } }, { 'Set-Cookie': 'SESSDATA=private-cookie' })).mockRejectedValueOnce(new Error('private-cookie'))
    await expect(f.service.checkBilibiliLogin(login.id, signal())).rejects.toMatchObject({ details: { reason: 'network' } })
    expect(await f.ctx.credentials.readRecord(credential)).toBeUndefined()
  })

  it('shows absent or invalid credential storage and still permits explicit removal of invalid records', async () => {
    const absent = await fixture({}, false)
    expect(await absent.service.status(signal())).toMatchObject({ storage: 'unavailable' })
    await expect(absent.service.beginBilibiliLogin(signal())).rejects.toMatchObject({ details: { reason: 'unavailable' } })
    const invalid = await fixture()
    await invalid.ctx.credentials.modifyRecord(credential, async () => ({ kind: 'grant', payload: { token: 'unexpected' } }))
    expect(await invalid.service.status(signal())).toMatchObject({ bilibili: { status: 'invalid' } })
    expect(await invalid.service.disconnectBilibili(signal())).toMatchObject({ bilibili: { status: 'not-linked' } })
  })

  it('drains a cancelled provider call before disposal and cannot publish its late credential', async () => {
    const f = await fixture()
    const started = Promise.withResolvers<null>()
    const stopped = Promise.withResolvers<null>()
    f.request.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      started.resolve(null)
      options?.signal?.addEventListener('abort', () => { stopped.resolve(null); reject(new Error('cancelled')) }, { once: true })
    }))
    const beginning = f.service.beginBilibiliLogin(signal()).then(value => ({ value }), (error: unknown) => ({ error }))
    await started.promise
    await f.fork.dispose()
    await stopped.promise
    expect(await beginning).toMatchObject({ error: { details: { reason: 'cancelled' } } })
    expect(await f.ctx.credentials.readRecord(credential)).toBeUndefined()
  })
})
