/** Bilibili web QR and account checks, following CZX2244/dsh-bilibili's login endpoint sequence. */
import { brandString } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import type { BilibiliAccount, BilibiliUserId, ConnectionConfig, ConnectionFailure } from './connections-types.ts'

const passport = 'https://passport.bilibili.com/x/passport-login/web'
const headers = { 'User-Agent': 'Mozilla/5.0', Origin: 'https://www.bilibili.com', Referer: 'https://www.bilibili.com/' }
const envelope = z.object({ code: z.number(), data: z.unknown().optional() })
const qr = z.object({ url: z.url(), qrcode_key: z.string().min(1).max(1024) })
const poll = z.object({ code: z.number(), url: z.string().optional() })
const nav = z.object({ isLogin: z.boolean(), mid: z.number().int().positive().optional(), uname: z.string().max(256).optional() })
const cookieValue = z.string().min(1).max(8192).regex(/^[\x21-\x3A\x3C-\x7E]+$/)

/** Expected provider failure; messages contain neither response bodies nor credentials. */
export class ConnectionError extends Error {
  constructor(readonly reason: ConnectionFailure) { super(`Account connection failed: ${reason}`) }
}

/** Bounded account-only HTTP client; it cannot send messages, publish, or follow redirects. */
export class BilibiliConnection {
  constructor(private readonly config: ConnectionConfig, private readonly request: typeof fetch = fetch) {}

  /**
   * Create a QR challenge without granting account access.
   * @param signal - Caller cancellation combined with the service lifetime.
   * @returns Provider polling key and locally rendered QR content.
   */
  async begin(signal: AbortSignal): Promise<{ key: string; url: string }> {
    const { body } = await this.json(`${passport}/qrcode/generate?source=main-fe-header`, signal)
    if (body.code !== 0) throw new ConnectionError('rejected')
    const parsed = qr.safeParse(body.data)
    if (!parsed.success) throw new ConnectionError('invalid-response')
    const url = new URL(parsed.data.url)
    if (url.protocol !== 'https:' || !['bilibili.com', 'www.bilibili.com', 'passport.bilibili.com', 'account.bilibili.com'].includes(url.hostname) || url.username || url.password) throw new ConnectionError('invalid-response')
    return { key: parsed.data.qrcode_key, url: url.href }
  }

  /**
   * Check one challenge once; no credential is returned before explicit mobile confirmation.
   * @param key - Provider-issued polling key, retained only on the Host.
   * @param signal - Caller cancellation combined with the service lifetime.
   * @returns Waiting state or the confirmed cookie for the credential owner to commit.
   */
  async check(key: string, signal: AbortSignal): Promise<{ status: 'waiting' | 'scanned' | 'expired' } | { status: 'confirmed'; sessdata: string }> {
    const { body, response } = await this.json(`${passport}/qrcode/poll?qrcode_key=${encodeURIComponent(key)}&source=main-fe-header`, signal)
    const parsed = body.code === 0 ? poll.safeParse(body.data) : null
    if (parsed !== null && !parsed.success) throw new ConnectionError('invalid-response')
    const code = parsed?.success ? parsed.data.code : body.code
    if (code === 86101) return { status: 'waiting' }
    if (code === 86090) return { status: 'scanned' }
    if (code === 86038) return { status: 'expired' }
    if (code !== 0) throw new ConnectionError('rejected')
    const fromHeader = response.headers.getSetCookie().find(value => value.startsWith('SESSDATA='))?.split(';')[0]?.slice('SESSDATA='.length)
    const token = fromHeader ?? (parsed?.success ? sessionCookieFromUrl(parsed.data.url ?? '') : null)
    const secret = cookieValue.safeParse(token)
    if (!secret.success) throw new ConnectionError('invalid-response')
    return { status: 'confirmed', sessdata: secret.data }
  }

  /**
   * Verify the credential with Bilibili, without retrieving private messages or changing the account.
   * @param sessdata - Stored cookie; sent only to the fixed Bilibili API origin.
   * @param signal - Caller cancellation combined with the service lifetime.
   * @returns Public account identity, or null when Bilibili reports signed-out status.
   */
  async verify(sessdata: string, signal: AbortSignal): Promise<BilibiliAccount | null> {
    if (!cookieValue.safeParse(sessdata).success) throw new ConnectionError('invalid-response')
    const { body } = await this.json('https://api.bilibili.com/x/web-interface/nav', signal, `SESSDATA=${sessdata}`)
    if (body.code === -101) return null
    if (body.code !== 0) throw new ConnectionError('rejected')
    const parsed = nav.safeParse(body.data)
    if (!parsed.success) throw new ConnectionError('invalid-response')
    if (!parsed.data.isLogin) return null
    if (parsed.data.mid === undefined || parsed.data.uname === undefined) throw new ConnectionError('invalid-response')
    return { id: brandString<BilibiliUserId>(String(parsed.data.mid)), name: parsed.data.uname }
  }

  private async json(url: string, owner: AbortSignal, cookie?: string): Promise<{ body: z.infer<typeof envelope>; response: Response }> {
    const signal = AbortSignal.any([owner, AbortSignal.timeout(this.config.requestTimeoutMs)])
    try {
      const response = await this.request(url, { signal, redirect: 'error', headers: { ...headers, ...(cookie === undefined ? {} : { Cookie: cookie }) } })
      if (!response.ok) { await response.body?.cancel(); throw new ConnectionError('rejected') }
      if (response.body === null) throw new ConnectionError('invalid-response')
      const reader = response.body.getReader()
      let complete = false
      try {
        const parts: Uint8Array[] = []
        let bytes = 0
        while (true) {
          signal.throwIfAborted()
          const chunk = await reader.read()
          if (chunk.done) { complete = true; break }
          bytes += chunk.value.byteLength
          if (bytes > this.config.maxResponseBytes) throw new ConnectionError('invalid-response')
          parts.push(chunk.value)
        }
        const body = envelope.safeParse(JSON.parse(Buffer.concat(parts).toString('utf8')))
        if (!body.success) throw new ConnectionError('invalid-response')
        return { body: body.data, response }
      } finally {
        if (!complete) await reader.cancel()
        reader.releaseLock()
      }
    } catch (error) {
      if (error instanceof ConnectionError) throw error
      if (owner.aborted) throw new ConnectionError('cancelled')
      if (error instanceof SyntaxError) throw new ConnectionError('invalid-response')
      throw new ConnectionError('network')
    }
  }
}

/** Read nested official cross-domain redirects as data; they are never followed. */
function sessionCookieFromUrl(value: string): string | null {
  const queue = [value]
  const visited = new Set<string>()
  let checked = 0
  for (const candidate of queue) {
    if (checked++ >= 8) break
    if (visited.has(candidate)) continue
    visited.add(candidate)
    let url: URL
    try { url = new URL(candidate) } catch (error) { void error; continue /* The provider may include non-URL parameter values. */ }
    if (url.protocol !== 'https:' || !(url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com'))) continue
    const token = url.searchParams.get('SESSDATA')
    if (token) return token
    for (const nested of url.searchParams.values()) if (nested.startsWith('https://')) queue.push(nested)
  }
  return null
}
