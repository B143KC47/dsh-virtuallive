/** Human-owned account setup outside resident Sessions and model-visible tool output. */
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import QRCode from 'qrcode'
import { z } from 'zod'
import { BilibiliConnection, ConnectionError } from './bilibili-connection.ts'
import type { BilibiliAccount, BilibiliUserId, ConnectionAttemptId, ConnectionConfig, ConnectionLogin, ConnectionLoginCheck, ConnectionStatus } from './connections-types.ts'

export type * from './connections-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Account setup never infers authorization from a phone app or a stored token. */
    virtualLiveConnections: VirtualLiveConnections
  }
}

const credential = credentialKey('dsh-virtuallive', 'bilibili')
const saved = z.object({
  version: z.literal(1), sessdata: z.string().min(1).max(8192).regex(/^[\x21-\x3A\x3C-\x7E]+$/),
  account: z.object({ id: z.string().regex(/^\d+$/), name: z.string().max(256) }),
})
const duration = (): Schema<number> => Schema.natural().min(1).max(2 ** 31 - 1)

/** Human login and bounded provider requests are independently configurable. */
export const connectionsConfigSchema: Schema<ConnectionConfig> = Schema.object({
  requestTimeoutMs: duration().default(15000),
  loginLifetimeMs: duration().default(180000),
  verificationLifetimeMs: duration().default(300000),
  maxResponseBytes: Schema.natural().min(1024).max(1024 * 1024).default(65536),
})

/** One serialized account owner; credential writes finish before disposal returns. */
export class VirtualLiveConnections extends TypertRemoteService {
  static inject = ['typert']
  static Config = connectionsConfigSchema
  private readonly lifetime = new AbortController()
  private queue: Promise<void> = Promise.resolve()
  private pending: { id: ConnectionAttemptId; key: string; expiresAt: number } | undefined
  private verified: { account: BilibiliAccount; at: number; until: number; expired: boolean } | undefined
  private readonly client: BilibiliConnection

  constructor(ctx: Context, private readonly config: ConnectionConfig) {
    super(ctx, 'virtualLiveConnections')
    this.client = new BilibiliConnection(config)
    ctx.on('credentials/record-updated', (key) => { if (key === credential) this.verified = undefined })
    ctx.effect(() => () => this.close(), 'virtuallive: account operation lifetime')
  }

  /**
   * Describe credential presence and the last bounded verification without making a network request.
   * @param signal - Caller observation lifetime.
   * @returns Displayable identity and storage availability; never secret values or QR polling keys.
   */
  @Remote
  status(signal: AbortSignal): Promise<ConnectionStatus> {
    return this.run(signal, () => this.readStatus())
  }

  /**
   * Replace the previous login attempt and create a QR challenge for the requesting browser.
   * @param signal - Caller cancellation; cancelled attempts cannot store a credential.
   * @returns Locally rendered QR image and an opaque attempt id; login still requires mobile confirmation.
   */
  @Remote
  beginBilibiliLogin(signal: AbortSignal): Promise<ConnectionLogin> {
    return this.run(signal, async (operation) => {
      const provider = this.provider()
      if (!(await provider.describeRecord(credential)).writable) throw new ConnectionError('storage')
      this.pending = undefined
      const challenge = await this.client.begin(operation)
      const image = await QRCode.toDataURL(challenge.url, { errorCorrectionLevel: 'M', margin: 2, width: 280 })
      operation.throwIfAborted()
      const id = brandString<ConnectionAttemptId>(randomUUID())
      const expiresAt = Date.now() + this.config.loginLifetimeMs
      this.pending = { id, key: challenge.key, expiresAt }
      return { id, image, expiresAt }
    })
  }

  /**
   * Check one explicit mobile confirmation and verify its account before committing the credential.
   * @param id - Opaque id returned to the browser that began this attempt.
   * @param signal - Caller cancellation; an admitted credential write settles before returning.
   * @returns Waiting, scanned, expired, or verified; a failed check leaves the previous credential intact.
   */
  @Remote
  checkBilibiliLogin(id: ConnectionAttemptId, signal: AbortSignal): Promise<ConnectionLoginCheck> {
    return this.run(signal, async (operation) => {
      const attempt = this.pending
      if (attempt?.id !== id) throw new ConnectionError('invalid-attempt')
      if (Date.now() >= attempt.expiresAt) {
        this.pending = undefined
        return { status: 'expired', connection: await this.readStatus() }
      }
      const checked = await this.client.check(attempt.key, operation)
      if (checked.status !== 'confirmed') {
        if (checked.status === 'expired') this.pending = undefined
        return { status: checked.status, connection: await this.readStatus() }
      }
      const account = await this.client.verify(checked.sessdata, operation)
      if (account === null) throw new ConnectionError('expired')
      operation.throwIfAborted()
      if (Date.now() >= attempt.expiresAt) {
        this.pending = undefined
        return { status: 'expired', connection: await this.readStatus() }
      }
      await this.provider().modifyRecord(credential, () => Promise.resolve({ kind: 'grant' as const, payload: { version: 1, sessdata: checked.sessdata, account } }))
      this.pending = undefined
      const at = Date.now()
      this.verified = { account, at, until: at + this.config.verificationLifetimeMs, expired: false }
      return { status: 'verified', connection: await this.readStatus() }
    })
  }

  /**
   * Withdraw a browser's QR attempt; this does not revoke any existing account credential.
   * @param id - Opaque attempt id; an already replaced or expired attempt is a no-op.
   * @param signal - Caller cancellation.
   * @returns After the matching local polling key is forgotten.
   */
  @Remote
  cancelBilibiliLogin(id: ConnectionAttemptId, signal: AbortSignal): Promise<void> {
    return this.run(signal, () => { if (this.pending?.id === id) this.pending = undefined })
  }

  /**
   * Check the stored credential with the account endpoint; refusal retains it for explicit removal.
   * @param signal - Caller cancellation and network deadline.
   * @returns Verified account or expired status; network failure never preserves a verified claim.
   */
  @Remote
  verifyBilibili(signal: AbortSignal): Promise<ConnectionStatus> {
    return this.run(signal, async (operation) => {
      this.verified = undefined
      const stored = await this.readCredential()
      if (stored === null) return this.readStatus()
      const account = await this.client.verify(stored.sessdata, operation)
      const at = Date.now()
      this.verified = { account: account ?? stored.account, at, until: at + this.config.verificationLifetimeMs, expired: account === null }
      return this.readStatus()
    })
  }

  /**
   * Forget this feature's credential and pending login; phone and website sessions remain independently owned.
   * @param signal - Caller cancellation before the credential deletion starts.
   * @returns The committed disconnected state; this is not a provider-wide account revocation.
   */
  @Remote
  disconnectBilibili(signal: AbortSignal): Promise<ConnectionStatus> {
    return this.run(signal, async (operation) => {
      this.pending = undefined
      operation.throwIfAborted()
      await this.provider().deleteRecord(credential)
      this.verified = undefined
      return this.readStatus()
    })
  }

  private provider(): CredentialProvider {
    const provider = this.ctx.get('credentials')
    if (provider === undefined) throw new ConnectionError('unavailable')
    return provider
  }

  private async readCredential(): Promise<{ sessdata: string; account: BilibiliAccount } | null> {
    const record = await this.provider().readRecord(credential)
    if (record === undefined) return null
    const parsed = saved.safeParse(record.kind === 'grant' ? record.payload : undefined)
    if (!parsed.success) throw new ConnectionError('storage')
    return { sessdata: parsed.data.sessdata, account: { ...parsed.data.account, id: brandString<BilibiliUserId>(parsed.data.account.id) } }
  }

  private async readStatus(): Promise<ConnectionStatus> {
    const blank: ConnectionStatus['bilibili'] = { status: 'not-linked', account: null, verifiedAt: null, verifiedUntil: null }
    const provider = this.ctx.get('credentials')
    if (provider === undefined) return { storage: 'unavailable', bilibili: blank }
    const info = await provider.describeRecord(credential)
    const storage = info.writable ? 'available' : 'read-only'
    if (!info.configured) return { storage, bilibili: blank }
    const record = await provider.readRecord(credential)
    if (record === undefined) return { storage, bilibili: blank }
    const parsed = saved.safeParse(record.kind === 'grant' ? record.payload : undefined)
    if (!parsed.success) return { storage, bilibili: { ...blank, status: 'invalid' } }
    const account: BilibiliAccount = { ...parsed.data.account, id: brandString<BilibiliUserId>(parsed.data.account.id) }
    const verified = this.verified
    if (verified === undefined || Date.now() >= verified.until) return { storage, bilibili: { ...blank, status: 'unverified', account } }
    return { storage, bilibili: { status: verified.expired ? 'expired' : 'verified', account: verified.account, verifiedAt: verified.at, verifiedUntil: verified.until } }
  }

  private run<T>(signal: AbortSignal, work: (operation: AbortSignal) => T | Promise<T>): Promise<T> {
    const operation = AbortSignal.any([signal, this.lifetime.signal])
    const result = this.queue.then(async () => {
      try {
        operation.throwIfAborted()
        return await work(operation)
      } catch (error) {
        const reason = error instanceof ConnectionError ? error.reason : operation.aborted ? 'cancelled' : 'storage'
        throw new RemoteError('virtuallive/connection-failed', 'Account setup could not be completed', { reason })
      }
    })
    this.queue = result.then(() => {}, () => {})
    return result
  }

  /**
   * Stop admission, abort HTTP operations, and drain admitted credential writes.
   * @returns When no operation can retain a polling key or change credential storage.
   */
  async close(): Promise<void> {
    this.lifetime.abort()
    await this.queue
    this.pending = undefined
    this.verified = undefined
  }
}
