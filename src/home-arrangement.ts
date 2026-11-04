/** Both human and resident room edits commit through the same safety checks. */
import { appendPluginRecord, type Session } from '@deepseek-ai/dsh-session'
import { canStandAt, journeyAt } from './home-space.ts'
import { homeLayoutSchema } from './state.ts'
import type { HomeArrangementResult, ResidentState } from './types.ts'

/**
 * Commit one room edit, stopping travel or releasing a seat at its checked approach floor position.
 * @param session - Resident Session that owns the room record.
 * @param state - Current projection, read immediately before this synchronous operation.
 * @param layout - Complete room data received from a user or model.
 * @param expectedRevision - Revision returned by the preceding room observation.
 * @returns Committed arrangement or a refusal; a refusal appends no record.
 */
export function commitHomeArrangement(
  session: Session, state: ResidentState, layout: unknown, expectedRevision: unknown,
): HomeArrangementResult {
  const parsed = homeLayoutSchema.safeParse(layout)
  if (!parsed.success || typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { status: 'invalid', reason: 'invalid-data' }
  }
  if (state.homeRevision !== expectedRevision) return { status: 'conflict', homeRevision: state.homeRevision }
  const changedAt = Date.now()
  const { x, z } = journeyAt(state.journey, changedAt)
  const position = { x, z }
  if (!canStandAt(position, parsed.data)) return { status: 'invalid', reason: 'resident-blocked' }
  appendPluginRecord(session, 'plugin:dsh-virtuallive/home', { layout: parsed.data, position, changedAt })
  return { status: 'arranged', layout: parsed.data, homeRevision: state.homeRevision + 1, position }
}
