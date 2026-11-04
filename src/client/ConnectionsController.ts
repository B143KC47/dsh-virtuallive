/** Account requests and credential-free viewing state owned outside React. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-dsh-virtuallive/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ConnectionFailure, ConnectionLogin, ConnectionStatus } from '../connections-types.ts'

/** Account state remains visible while a later operation is pending or rejected. */
export interface ConnectionsState {
  snapshot: ConnectionStatus | null
  loading: boolean
  loadFailed: boolean
  busy: boolean
  login: ConnectionLogin | null
  loginStatus: 'waiting' | 'scanned' | 'expired' | null
  notice: { id: number; kind: 'linked' | 'disconnected' | 'failed'; reason?: ConnectionFailure } | null
}

/** Narrow account operations shared by the settings page and main panel. */
export interface ConnectionsFace {
  hooks: { connections: HostObservable<ConnectionsState> }
  refreshConnections: () => Promise<void>
  beginLogin: () => Promise<void>
  checkLogin: () => Promise<void>
  cancelLogin: () => Promise<void>
  verifyAccount: () => Promise<void>
  disconnectAccount: () => Promise<void>
  dismissConnectionNotice: () => void
}

/** An owner aborts and drains its requests before withdrawing the reactive view. */
export class ConnectionsController {
  private readonly lifetime = new AbortController()
  private readonly state = createSnapshotStore<ConnectionsState>({
    snapshot: null, loading: true, loadFailed: false, busy: false, login: null, loginStatus: null, notice: null,
  })
  private pending: Promise<void> | undefined
  private expiry: ReturnType<typeof setTimeout> | undefined
  private noticeId = 0

  constructor(private readonly remote: Context['remote']['virtualLiveConnections']) {}

  /**
   * Bind state and gestures without giving a component the controller or Context.
   * @returns Observable data and account operations.
   */
  face(): ConnectionsFace {
    return {
      hooks: { connections: this.state }, refreshConnections: () => this.refresh(),
      beginLogin: () => this.begin(), checkLogin: () => this.check(), cancelLogin: () => this.cancel(),
      verifyAccount: () => this.verify(), disconnectAccount: () => this.disconnect(),
      dismissConnectionNotice: () => { this.state.update((state) => { state.notice = null }) },
    }
  }

  private refresh(): Promise<void> {
    return this.execute(() => this.remote.status(this.lifetime.signal), (snapshot) => {
      this.state.update((state) => { state.snapshot = snapshot; state.loadFailed = false })
    }, true)
  }

  private begin(): Promise<void> {
    return this.execute(() => this.remote.beginBilibiliLogin(this.lifetime.signal), (login) => {
      this.state.update((state) => { state.login = login; state.loginStatus = 'waiting' })
    })
  }

  private check(): Promise<void> {
    const login = this.state.getSnapshot().login
    if (login === null) return Promise.resolve()
    return this.execute(() => this.remote.checkBilibiliLogin(login.id, this.lifetime.signal), (result) => {
      this.state.update((state) => {
        state.snapshot = result.connection
        state.loginStatus = result.status === 'verified' ? null : result.status
        if (result.status === 'expired' || result.status === 'verified') state.login = null
      })
      if (result.status === 'verified') this.notice('linked')
    })
  }

  private cancel(): Promise<void> {
    const login = this.state.getSnapshot().login
    if (login === null) return Promise.resolve()
    return this.execute(() => this.remote.cancelBilibiliLogin(login.id, this.lifetime.signal), () => {
      this.state.update((state) => { state.login = null; state.loginStatus = null })
    })
  }

  private verify(): Promise<void> {
    this.state.update((state) => {
      if (state.snapshot?.bilibili.status === 'verified') state.snapshot = { ...state.snapshot, bilibili: { ...state.snapshot.bilibili, status: 'unverified' } }
    })
    return this.execute(() => this.remote.verifyBilibili(this.lifetime.signal), (snapshot) => {
      this.state.update((state) => { state.snapshot = snapshot })
    })
  }

  private disconnect(): Promise<void> {
    return this.execute(() => this.remote.disconnectBilibili(this.lifetime.signal), (snapshot) => {
      this.state.update((state) => { state.snapshot = snapshot; state.login = null; state.loginStatus = null })
      this.notice('disconnected')
    })
  }

  private notice(kind: 'linked' | 'disconnected' | 'failed', reason?: ConnectionFailure): void {
    const id = ++this.noticeId
    this.state.update((state) => { state.notice = { id, kind, ...(reason === undefined ? {} : { reason }) } })
  }

  private execute<T>(request: () => Promise<RemoteResult<T>>, commit: (value: T) => void, loading = false): Promise<void> {
    if (this.pending !== undefined || this.lifetime.signal.aborted) return Promise.resolve()
    this.state.update((state) => { state.busy = true; if (loading && state.snapshot === null) state.loading = true })
    this.pending = request().then((result) => {
      if (this.lifetime.signal.aborted) return
      if (result.ok) commit(result.value)
      else {
        if (loading) this.state.update((state) => { state.loadFailed = true })
        else {
          const reason = result.error.code === 'virtuallive/connection-failed' ? result.error.details.reason : 'network'
          if (reason === 'invalid-attempt' || reason === 'expired') this.state.update((state) => { state.login = null; state.loginStatus = 'expired' })
          this.notice('failed', reason)
        }
      }
    }).catch((error: unknown) => {
      void error
      if (this.lifetime.signal.aborted) return
      if (loading) this.state.update((state) => { state.loadFailed = true })
      else this.notice('failed', 'network')
    }).finally(() => {
      this.pending = undefined
      if (!this.lifetime.signal.aborted) {
        this.state.update((state) => { state.busy = false; state.loading = false })
        this.scheduleExpiry()
      }
    })
    return this.pending
  }

  private scheduleExpiry(): void {
    clearTimeout(this.expiry)
    const state = this.state.getSnapshot()
    const expires = [state.login?.expiresAt, state.snapshot?.bilibili.status === 'verified' ? state.snapshot.bilibili.verifiedUntil : null].filter((time): time is number => time !== undefined && time !== null)
    if (expires.length === 0) return
    this.expiry = setTimeout(() => {
      const now = Date.now()
      this.state.update((current) => {
        if (current.login !== null && current.login.expiresAt <= now) { current.login = null; current.loginStatus = 'expired' }
        const account = current.snapshot?.bilibili
        if (current.snapshot !== null && account?.status === 'verified' && account.verifiedUntil !== null && account.verifiedUntil <= now) current.snapshot = { ...current.snapshot, bilibili: { ...account, status: 'unverified' } }
      })
      this.scheduleExpiry()
    }, Math.max(0, Math.min(...expires) - Date.now()))
  }

  /**
   * Abort transport work and remove expiry callbacks before the controller is released.
   * @returns After every admitted callback settles; the Host's pending QR expires independently.
   */
  async dispose(): Promise<void> {
    this.lifetime.abort()
    clearTimeout(this.expiry)
    await this.pending
  }
}
