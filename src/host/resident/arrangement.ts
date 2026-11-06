/** Host adapter that protects the arrangement read, decision, and append. */
import { appendPluginRecord, type Session } from '@deepseek-ai/dsh-session'
import { planHomeArrangement } from '../../domain/home/arrangement.ts'
import type { HomeArrangementResult, ResidentState } from '../../types.ts'

/**
 * Commit one room edit, stopping travel or releasing a seat at its checked approach floor position.
 *
 * The caller must read the projection immediately before this synchronous call. The revision check,
 * resident-position calculation, and append stay in one section; do not await between them.
 * @param session - Resident Session that owns the room record.
 * @param state - Current projection, read immediately before this operation.
 * @param layout - Complete room data received from a user or model.
 * @param expectedRevision - Revision returned by the preceding room observation.
 * @param now - Host time captured for this decision; defaults to the current wall clock.
 * @returns Committed arrangement or a refusal; a refusal appends no record.
 */
export function commitHomeArrangement(
  session: Session, state: ResidentState, layout: unknown, expectedRevision: unknown, now = Date.now(),
): HomeArrangementResult {
  const plan = planHomeArrangement(state, { layout, expectedRevision }, now)
  if (plan.kind === 'reject') return plan.result
  appendPluginRecord(session, 'plugin:dsh-virtuallive/home', plan.record)
  return plan.result
}
