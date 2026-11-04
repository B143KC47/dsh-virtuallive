/** Provider tests exercise secret isolation, confirmation parsing, and bounded reads without external accounts. */
import { describe, expect, it, vi } from 'vitest'
import { BilibiliConnection } from '../src/bilibili-connection.ts'
import type { ConnectionConfig } from '../src/connections-types.ts'

const config: ConnectionConfig = {
  requestTimeoutMs: 15000, loginLifetimeMs: 180000, verificationLifetimeMs: 300000, maxResponseBytes: 65536,
}
const signal = (): AbortSignal => new AbortController().signal
const response = (data: object, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(data), headers === undefined ? {} : { headers })

describe('Bilibili account protocol', () => {
  it('uses fixed official endpoints and accepts only explicit confirmed login cookies', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ code: 0, data: { url: 'https://passport.bilibili.com/h5-app/passport/login/scan?key=secret', qrcode_key: 'provider-key' } }))
      .mockResolvedValueOnce(response({ code: 0, data: { code: 86101 } }))
      .mockResolvedValueOnce(response({ code: 0, data: { code: 86090 } }))
      .mockResolvedValueOnce(response({ code: 0, data: { code: 0 } }, { 'Set-Cookie': 'SESSDATA=private-cookie; Path=/; Secure' }))
      .mockResolvedValueOnce(response({ code: 0, data: { isLogin: true, mid: 123, uname: 'Example' } }))
    const client = new BilibiliConnection(config, request)
    expect(await client.begin(signal())).toMatchObject({ key: 'provider-key' })
    expect(await client.check('provider-key', signal())).toEqual({ status: 'waiting' })
    expect(await client.check('provider-key', signal())).toEqual({ status: 'scanned' })
    expect(await client.check('provider-key', signal())).toEqual({ status: 'confirmed', sessdata: 'private-cookie' })
    expect(await client.verify('private-cookie', signal())).toEqual({ id: '123', name: 'Example' })
    for (const [, options] of request.mock.calls) expect(options?.redirect).toBe('error')
    expect(request.mock.calls.at(-1)).toMatchObject(['https://api.bilibili.com/x/web-interface/nav', { headers: { Cookie: 'SESSDATA=private-cookie' } }])
    expect(JSON.stringify(request.mock.calls.slice(0, -1))).not.toContain('private-cookie')
  })

  it('parses official nested cross-domain data without following its URL', async () => {
    const target = 'https://passport.bilibili.com/crossDomain?SESSDATA=account-cookie&DedeUserID=42'
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({ code: 0, data: { code: 0, url: `https://account.bilibili.com/login?next=${encodeURIComponent(target)}` } }))
    expect(await new BilibiliConnection(config, request).check('key', signal())).toEqual({ status: 'confirmed', sessdata: 'account-cookie' })
    expect(request).toHaveBeenCalledOnce()
  })

  it.each([{ code: 86038 }, { code: 0, data: { code: 86038 } }])('reports an expired QR without claiming account access: %j', async (body) => {
    const client = new BilibiliConnection(config, vi.fn<typeof fetch>().mockResolvedValue(response(body)))
    expect(await client.check('key', signal())).toEqual({ status: 'expired' })
  })

  it.each([{ code: -101 }, { code: 0, data: { isLogin: false } }])('rejects expired accounts: %j', async (body) => {
    const client = new BilibiliConnection(config, vi.fn<typeof fetch>().mockResolvedValue(response(body)))
    expect(await client.verify('private-cookie', signal())).toBeNull()
  })

  it('rejects unexpected response fields and non-provider QR destinations', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ code: 0, data: { url: 'https://example.invalid/steal', qrcode_key: 'secret' } }))
      .mockResolvedValueOnce(response({ code: 0, data: { code: 0, url: 'https://example.invalid/?SESSDATA=secret' } }))
      .mockResolvedValueOnce(response({ code: 0, data: { isLogin: true } }))
      .mockResolvedValueOnce(new Response('private-cookie is not JSON'))
    const client = new BilibiliConnection(config, request)
    for (const call of [() => client.begin(signal()), () => client.check('key', signal()), () => client.verify('secret', signal()), () => client.verify('secret', signal())]) {
      await expect(call()).rejects.toMatchObject({ reason: 'invalid-response' })
    }
  })

  it('stops oversized response streams and excludes raw bodies from errors', async () => {
    const cancelled = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('private-cookie'.repeat(200))) }, cancel: cancelled,
    })
    const client = new BilibiliConnection({ ...config, maxResponseBytes: 1024 },
      vi.fn<typeof fetch>().mockResolvedValue(new Response(body)))
    await expect(client.verify('secret', signal())).rejects.toMatchObject({ reason: 'invalid-response' })
    expect(cancelled).toHaveBeenCalledOnce()
  })

  it('contains network and cancellation errors without exposing credentials', async () => {
    const controller = new AbortController()
    controller.abort()
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('provider-key private-cookie'))
    const client = new BilibiliConnection(config, request)
    await expect(client.begin(signal())).rejects.toMatchObject({ reason: 'network', message: 'Account connection failed: network' })
    await expect(client.begin(controller.signal)).rejects.toMatchObject({ reason: 'cancelled' })
  })
})
