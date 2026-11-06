/** Pure room-arrangement decision with an explicit clock. */
import { canStandAt, journeyAt } from '../../home-space.ts'
import { homeLayoutSchema } from './layout.ts'
import type { HomeArrangement, HomeArrangementResult, ResidentJourney } from '../../types.ts'

/** The projected facts an arrangement decision may read. */
export interface ArrangementState {
  homeRevision: number
  journey: ResidentJourney
}

/** A complete arrangement command before any durable write. */
export interface ArrangementCommand {
  layout: unknown
  expectedRevision: unknown
}

/** A refusal, or one exact record to append. */
export type ArrangementPlan =
  | { kind: 'reject'; result: HomeArrangementResult }
  | { kind: 'append'; record: HomeArrangement; result: Extract<HomeArrangementResult, { status: 'arranged' }> }

/**
 * Decide one room edit without reading a Session, contacting a service, or
 * consulting the wall clock.
 * @param state - Projection state read immediately before this call.
 * @param command - Complete layout and the revision observed by the caller.
 * @param now - Host time in milliseconds since the epoch.
 * @returns A refusal with no side effect, or the record the host may append.
 */
export function planHomeArrangement(state: Readonly<ArrangementState>, command: ArrangementCommand, now: number): ArrangementPlan {
  if (!Number.isFinite(now) || now < 0) return { kind: 'reject', result: { status: 'invalid', reason: 'invalid-data' } }
  const parsed = homeLayoutSchema.safeParse(command.layout)
  const expectedRevision = command.expectedRevision
  if (!parsed.success || typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { kind: 'reject', result: { status: 'invalid', reason: 'invalid-data' } }
  }
  if (state.homeRevision !== expectedRevision) {
    return { kind: 'reject', result: { status: 'conflict', homeRevision: state.homeRevision } }
  }
  const { x, z } = journeyAt(state.journey, now)
  const position = { x, z }
  if (!canStandAt(position, parsed.data)) return { kind: 'reject', result: { status: 'invalid', reason: 'resident-blocked' } }
  return {
    kind: 'append',
    record: { layout: parsed.data, position, changedAt: now },
    result: { status: 'arranged', layout: parsed.data, homeRevision: state.homeRevision + 1, position },
  }
}
