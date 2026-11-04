/** Dedicated Android observations and commands shared by Host and Client. */

/** Supported shortcuts; an absent native app opens its official website. */
export type PhoneAppId = 'qq' | 'wechat' | 'bilibili' | 'rednote' | 'x' | 'youtube'

/** A freshly inspected native installation; login is never inferred from installation. */
export interface PhoneApp {
  id: PhoneAppId
  installed: boolean
  login: 'unknown'
}

/** A captured display and its original Android coordinate dimensions. */
export interface PhoneScreen {
  mediaType: 'image/jpeg'
  data: string
  width: number
  height: number
  deviceWidth: number
  deviceHeight: number
}

/** One phone operation, validated before it enters the device queue. */
export type PhoneAction =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'swipe'; x1: number; y1: number; x2: number; y2: number; durationMs: number }
  | { kind: 'type'; text: string; clear: boolean }
  | { kind: 'button'; button: 'back' | 'home' | 'enter' }
  | { kind: 'open'; app: PhoneAppId }
  | { kind: 'url'; url: string }

/** Failures distinguish an operation that never started from an unknown input outcome. */
export type PhoneFailureCode = 'not-configured' | 'unavailable' | 'timeout' | 'cancelled' | 'protocol' | 'request-limit' | 'closed' | 'inspect-required'

/** Latest confirmed observation, retained when a later request fails. */
export interface PhoneSnapshot {
  status: 'unconfigured' | 'ready' | 'failed' | 'uncertain'
  screen: PhoneScreen | null
  tree: string
  treeTruncated: boolean
  apps: PhoneApp[]
  observedAt: number | null
  elapsedMs: number | null
  error: PhoneFailureCode | null
}

/** Deployment-owned Android connection and complete per-request resource limits. */
export interface PhoneConfig {
  /** Enable access to the explicitly configured device. */
  enabled: boolean
  /** Python interpreter with mobilerun-core-local installed. */
  python: string
  /** Android Debug Bridge executable. */
  adb: string
  /** Exact ADB device serial; no implicit device selection occurs. */
  serial: string
  /** Maximum executable resolution and worker startup time in milliseconds. */
  startupTimeoutMs: number
  /** Maximum duration of one device request in milliseconds. */
  timeoutMs: number
  /** Grace period before terminating an unresponsive worker in milliseconds. */
  graceMs: number
  /** Maximum encoded request size sent to the worker. */
  maxRequestBytes: number
  /** Maximum encoded response size accepted from the worker. */
  maxResponseBytes: number
  /** Maximum retained worker diagnostic output in bytes. */
  maxDiagnosticBytes: number
  /** Maximum accessibility-tree text included in an observation. */
  maxTreeCharacters: number
  /** Maximum screenshot width in pixels; Android input uses original dimensions. */
  screenshotWidth: number
  /** JPEG quality used for captured screenshots. */
  screenshotQuality: number
  /** Raw ADB capture or the installed mobile-control portal. */
  capture: 'adb-raw' | 'portal'
  /** Maximum text length accepted by one phone typing action. */
  maxTextCharacters: number
}
