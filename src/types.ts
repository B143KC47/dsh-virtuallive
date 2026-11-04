/** Durable identity and expression records for one Virtual Live resident. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MemorySnapshot } from './memory-types.ts'

export type * from './phone-types.ts'
export type * from './memory-types.ts'
export type * from './connections-types.ts'

/** An identity chosen by the resident, including her own explanation and values. */
export interface ResidentIdentity {
  name: string
  reason: string
  values: string[]
}

/** An action represented by a character animation. */
export type ResidentActivity = 'idle' | 'thinking' | 'talking' | 'reading' | 'phone' | 'eating' | 'dancing' | 'sleeping' | 'waving'

/** A resident-selected outfit, independent of her current activity. */
export type ResidentOutfit = 'classic' | 'casual' | 'night'

/** Metre coordinates on the home's floor. */
export interface RoomPoint { x: number; z: number }

/** Independently replaceable furniture and decoration layers. */
export type HomeLayerId = 'sofa' | 'coffee' | 'desk' | 'chair' | 'bed' | 'kitchen' | 'phone' | 'plant' | 'rug' | 'curtains' | 'shelf'

/** A furniture layer's placement and selected authored artwork. */
export interface HomeLayerPlacement extends RoomPoint { visible: boolean; scale: number; variant: 'standard' | 'alternate' }

/** A complete room arrangement; the empty architecture is always a separate layer. */
export interface HomeLayout {
  background: 'afternoon' | 'night'
  layers: Record<HomeLayerId, HomeLayerPlacement>
}

/** A room edit stops movement and releases furniture use at a checked free floor point. */
export interface HomeArrangement { layout: HomeLayout; position: RoomPoint; changedAt: number }

/** A complete room edit either commits once or leaves the room and movement unchanged. */
export type HomeArrangementResult =
  | { status: 'arranged'; layout: HomeLayout; homeRevision: number; position: RoomPoint }
  | { status: 'conflict'; homeRevision: number }
  | { status: 'invalid'; reason: 'invalid-data' | 'resident-blocked' }

/** A resident-selected walking route; clients interpolate the same recorded movement. */
export interface ResidentJourney {
  path: RoomPoint[]
  startedAt: number
  speed: number
}

/** Authored actions that attach the resident to a usable furniture position. */
export type FurnitureAction = 'sit' | 'lie' | 'read'

/** An attachment intent becomes active only after its recorded approach journey finishes. */
export interface ResidentFurnitureUse {
  furnitureId: HomeLayerId
  action: FurnitureAction
  homeRevision: number
}

/** One atomic choice of furniture and the free-floor route needed to reach it. */
export interface ResidentFurnitureRecord {
  interaction: ResidentFurnitureUse
  journey: ResidentJourney
}

/** A self-reported expression; it does not infer feelings from user text. */
export interface ResidentExpression {
  activity: ResidentActivity
  mood: 'calm' | 'happy' | 'curious' | 'pensive' | 'tired' | 'firm'
  outfit: ResidentOutfit
  intention: string
}

/** Latest logged turn progress; detailed failures remain in the full conversation. */
export interface ResidentTurn {
  number: number
  outcome: 'running' | 'completed' | 'error' | 'aborted' | 'blocked' | 'max-tokens' | 'interrupted' | 'forked' | 'other'
}

/** Bounded resident facts reconstructed from the Session log. */
export interface ResidentState {
  identity: ResidentIdentity | null
  expression: ResidentExpression
  lastSpoken: string | null
  journey: ResidentJourney
  home: HomeLayout
  homeRevision: number
  interaction: ResidentFurnitureUse | null
  turn: ResidentTurn | null
}

/** Host-owned resident readiness with the Session that carries her history. */
export interface ResidentSnapshot {
  sessionId: SessionId
  state: ResidentState
  phase: 'unmet' | 'idle' | 'running' | 'failed'
  memory: MemorySnapshot
}

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Resident-authored identity, committed after a validated identity tool call. */
    'plugin:dsh-virtuallive/identity': ResidentIdentity
    /** Resident-authored intention and visual expression. */
    'plugin:dsh-virtuallive/expression': ResidentExpression
    /** A validated route through the home, with its start time and walking speed. */
    'plugin:dsh-virtuallive/journey': ResidentJourney
    /** A complete furniture arrangement and the resident's stationary floor position. */
    'plugin:dsh-virtuallive/home': HomeArrangement
    /** A validated furniture-use intent and its approach route, committed together. */
    'plugin:dsh-virtuallive/furniture-use': ResidentFurnitureRecord
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** A message rejected before durable inbox admission. */
    'virtuallive/invalid-message': { maximum: number }
    /** An arrangement contains invalid fields or would block the resident. */
    'virtuallive/invalid-arrangement': { reason: 'invalid-data' | 'resident-blocked' }
    /** Another edit has replaced the arrangement observed by this client. */
    'virtuallive/stale-arrangement': { currentRevision: number }
  }
}
