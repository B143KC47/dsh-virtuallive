/** Account-linking views; credential values and QR polling keys never enter these views. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** One short-lived login attempt, unrelated to the provider's secret polling key. */
export type ConnectionAttemptId = Branded<'VirtualLiveConnectionAttemptId'>

/** Bilibili's numeric user identifier, distinct from a local Session or account. */
export type BilibiliUserId = Branded<'VirtualLiveBilibiliUserId'>

/** Displayable identity returned by Bilibili's authenticated account endpoint. */
export interface BilibiliAccount {
  id: BilibiliUserId
  name: string
}

/** Stored credentials remain unverified after restart or after the verification interval. */
export interface ConnectionStatus {
  storage: 'available' | 'unavailable' | 'read-only'
  bilibili: {
    status: 'not-linked' | 'unverified' | 'verified' | 'expired' | 'invalid'
    account: BilibiliAccount | null
    verifiedAt: number | null
    verifiedUntil: number | null
  }
}

/** A locally rendered QR image belongs only to the browser that starts the attempt. */
export interface ConnectionLogin {
  id: ConnectionAttemptId
  image: string
  expiresAt: number
}

/** One explicit check; waiting never implies authorization. */
export interface ConnectionLoginCheck {
  status: 'waiting' | 'scanned' | 'expired' | 'verified'
  connection: ConnectionStatus
}

/** Deployment-owned network and human-interaction limits. */
export interface ConnectionConfig {
  /** Maximum duration of one provider HTTP request in milliseconds. */
  requestTimeoutMs: number
  /** Maximum lifetime of one QR login attempt in milliseconds. */
  loginLifetimeMs: number
  /** Interval before a verified account requires another check, in milliseconds. */
  verificationLifetimeMs: number
  /** Maximum provider response body size accepted in bytes. */
  maxResponseBytes: number
}

/** Stable failure labels safe to localize without displaying external response bodies. */
export type ConnectionFailure = 'unavailable' | 'network' | 'rejected' | 'invalid-response' | 'invalid-attempt' | 'expired' | 'storage' | 'cancelled'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** A bounded account operation failed; no response body or credential is exposed. */
    'virtuallive/connection-failed': { reason: ConnectionFailure }
  }
}
