/** Durable memory delivery and observable Hindsight readiness for one resident. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Caller-supplied Hindsight UUID, stable across retries and process restarts. */
export type MemoryOperationId = Branded<'VirtualLiveMemoryOperationId'>

/** Deployment-owned Hindsight connection and optional managed Python interpreter. */
export interface MemoryConfig {
  /** Enable the resident's isolated Hindsight memory bank. */
  enabled: boolean
  /** Hindsight HTTP origin, without inline credentials or query parameters. */
  endpoint: string
  /** Empty selects the resident's Session id as its isolated memory bank. */
  bankId: string
  /** Environment variable containing the server's bearer token; empty means no token. */
  apiKeyEnvironment: string
  /** Retain newly committed user and resident messages after the bank is bound. */
  automatic: boolean
  /** Maximum duration of one HTTP request in milliseconds. */
  requestTimeoutMs: number
  /** Maximum wait for one admitted retention operation in milliseconds. */
  operationTimeoutMs: number
  /** Delay between retention-status checks in milliseconds. */
  pollIntervalMs: number
  /** Delay before checking pending delivery again in milliseconds. */
  retryIntervalMs: number
  /** Token budget requested for recalled material. */
  recallMaxTokens: number
  /** Maximum recalled tool-result length in characters. */
  resultMaxCharacters: number
  /** Maximum content length accepted for one chosen memory. */
  maxMemoryCharacters: number
  /** Empty connects to an independently managed server; otherwise starts Python. */
  pythonExecutable: string
  /** Explicit Hindsight settings passed only to the managed Python process. */
  serverEnvironment: Record<string, string>
  /** Empty inherits the Harness working directory. */
  serverWorkingDirectory: string
  /** Empty uses the Hindsight server's separately configured model endpoint. */
  localModelExecutable: string
  /** Arguments passed to the managed local inference executable. */
  localModelArguments: string[]
  /** Environment additions for the managed local inference process. */
  localModelEnvironment: Record<string, string>
  /** Empty inherits the Harness working directory. */
  localModelWorkingDirectory: string
  /** Maximum graceful managed-process shutdown time in milliseconds. */
  shutdownTimeoutMs: number
}

/** Stable external destination; existing pending entries cannot silently move banks. */
export interface MemoryBinding { endpoint: string; bankId: string; automatic: boolean }

/** An unsent or unconfirmed memory; its source text remains available after restart. */
export interface MemoryPending {
  operationId: MemoryOperationId
  content: string
  timestamp: string
  source: 'user' | 'resident' | 'chosen'
}

/** Session-derived delivery state; only the undelivered backlog grows with history. */
export interface MemoryState {
  binding: MemoryBinding | null
  pending: MemoryPending[]
  retained: number
  lastRetainedAt: string | null
}

/** Failures preserve the backlog and never imply that an uncertain write was absent. */
export type MemoryFailure = 'connection' | 'operation' | 'binding' | 'durability' | 'process' | 'invalid-response'

/** Host-owned readiness; counts describe confirmed deliveries and outstanding entries. */
export type MemorySnapshot = {
  engine: 'hindsight'
  bankId: string
  pending: number
  retained: number
  lastRetainedAt: string | null
} & (
  | { phase: 'disabled' | 'connecting' | 'ready' | 'retaining' }
  | { phase: 'failed'; failure: MemoryFailure }
)

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Complete delivery state after binding, deliberate memory admission, or acknowledgement. */
    'plugin:dsh-virtuallive/memory': MemoryState
  }
}
