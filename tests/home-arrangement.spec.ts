/** Arrangement decisions are pure with supplied time; only the host adapter appends. */
import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { planHomeArrangement } from '../src/domain/home/arrangement.ts'
import { commitHomeArrangement } from '../src/host/resident/arrangement.ts'
import { HOME_SPACE, canStandAt, initialHomeLayout } from '../src/home-space.ts'
import { initialResidentState } from '../src/state.ts'

function stateAtCenter() {
  const state = initialResidentState()
  state.journey = { path: [{ ...HOME_SPACE.places.center }], startedAt: 1000, speed: 1 }
  return state
}

describe('home arrangement planning', () => {
  it('plans one record using supplied time and derives the next revision', () => {
    const state = stateAtCenter()
    const plan = planHomeArrangement(state, { layout: state.home, expectedRevision: 0 }, 1000)
    expect(plan).toEqual({
      kind: 'append',
      record: { layout: state.home, position: HOME_SPACE.places.center, changedAt: 1000 },
      result: { status: 'arranged', layout: state.home, homeRevision: 1, position: HOME_SPACE.places.center },
    })
  })

  it('rejects a stale revision without planning a write', () => {
    const state = stateAtCenter()
    expect(planHomeArrangement(state, { layout: state.home, expectedRevision: 1 }, 1000)).toEqual({
      kind: 'reject', result: { status: 'conflict', homeRevision: 0 },
    })
  })

  it('rejects malformed layout data and malformed revisions', () => {
    const state = stateAtCenter()
    expect(planHomeArrangement(state, { layout: { ...state.home, background: 'dawn' }, expectedRevision: 0 }, 1000))
      .toEqual({ kind: 'reject', result: { status: 'invalid', reason: 'invalid-data' } })
    expect(planHomeArrangement(state, { layout: state.home, expectedRevision: -1 }, 1000))
      .toEqual({ kind: 'reject', result: { status: 'invalid', reason: 'invalid-data' } })
    expect(planHomeArrangement(state, { layout: state.home, expectedRevision: '0' }, 1000))
      .toEqual({ kind: 'reject', result: { status: 'invalid', reason: 'invalid-data' } })
    expect(planHomeArrangement(state, { layout: state.home, expectedRevision: 1.5 }, 1000))
      .toEqual({ kind: 'reject', result: { status: 'invalid', reason: 'invalid-data' } })
  })

  it('rejects an invalid supplied clock before reading the room', () => {
    const state = stateAtCenter()
    expect(planHomeArrangement(state, { layout: state.home, expectedRevision: 0 }, Number.NaN))
      .toEqual({ kind: 'reject', result: { status: 'invalid', reason: 'invalid-data' } })
    expect(planHomeArrangement(state, { layout: state.home, expectedRevision: 0 }, -1))
      .toEqual({ kind: 'reject', result: { status: 'invalid', reason: 'invalid-data' } })
  })

  it('rejects furniture that would block the resident at the supplied time', () => {
    const state = stateAtCenter()
    const layout = initialHomeLayout()
    layout.layers.sofa = { ...layout.layers.sofa, x: HOME_SPACE.places.center.x, z: HOME_SPACE.places.center.z }
    expect(canStandAt(HOME_SPACE.places.center, layout)).toBe(false)
    expect(planHomeArrangement(state, { layout, expectedRevision: 0 }, 1000))
      .toEqual({ kind: 'reject', result: { status: 'invalid', reason: 'resident-blocked' } })
  })

  it('keeps the command synchronous and appends no record on refusal', () => {
    const state = stateAtCenter()
    const session = Session.create(SessionId('arrangement-command'))
    expect(commitHomeArrangement(session, state, state.home, 0, 1000)).toMatchObject({ status: 'arranged', homeRevision: 1 })
    expect(session.snapshotEvents()).toHaveLength(1)
    state.homeRevision = 1
    state.home.layers.bed = { ...state.home.layers.bed, x: HOME_SPACE.places.center.x, z: HOME_SPACE.places.center.z }
    expect(commitHomeArrangement(session, state, state.home, 1, 1000)).toEqual({ status: 'invalid', reason: 'resident-blocked' })
    expect(session.snapshotEvents()).toHaveLength(1)
  })

  it('does not append on a conflict or malformed layout', () => {
    const state = stateAtCenter()
    const session = Session.create(SessionId('arrangement-refusal'))
    expect(commitHomeArrangement(session, state, state.home, 1, 1000)).toEqual({ status: 'conflict', homeRevision: 0 })
    expect(commitHomeArrangement(session, state, { ...state.home, background: 'dawn' }, 0, 1000))
      .toEqual({ status: 'invalid', reason: 'invalid-data' })
    expect(session.snapshotEvents()).toHaveLength(0)
  })
})
