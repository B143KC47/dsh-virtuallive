import { describe, expect, it } from 'vitest'
import { appendPluginRecord, Session, SessionId } from '@deepseek-ai/dsh-session'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { applyResidentEvent, homeLayoutSchema, identitySchema, initialResidentState } from '../src/state.ts'
import { residentPersona } from '../src/persona.ts'

describe('resident identity', () => {
  it('waits for the resident to choose a name and preserves that choice through replay', () => {
    const session = Session.create(SessionId('virtuallive-test'))
    const initial = initialResidentState()
    expect(initial.identity).toBeNull()
    expect(residentPersona(initial)).toContain('你还没有名字')

    appendPluginRecord(session, 'plugin:dsh-virtuallive/identity', {
      name: '汐音', reason: '我喜欢潮汐的节奏', values: ['诚实', '好奇', '相互尊重'],
    })
    appendPluginRecord(session, 'plugin:dsh-virtuallive/expression', {
      activity: 'reading', mood: 'calm', outfit: 'casual', intention: '读完今天选的书',
    })

    const restored = Session.create(SessionId('virtuallive-restored'), session.snapshotEvents())
    const replay = restored.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
    expect(replay.identity?.name).toBe('汐音')
    expect(replay.expression).toEqual({
      activity: 'reading', mood: 'calm', outfit: 'casual', intention: '读完今天选的书',
    })
    expect(residentPersona(replay)).toContain('汐音')
    expect(residentPersona(replay)).not.toContain('你还没有名字')
  })

  it('leaves the resident state unchanged for an unrelated committed event', () => {
    const session = Session.create(SessionId('unrelated'))
    session.append('step/start', { turn: 1, step: 1 })
    const initial = initialResidentState()
    expect(session.snapshotEvents().reduce(applyResidentEvent, initial)).toBe(initial)
  })

  it('restores a terminal failure from logged outcomes and clears it when the next turn starts', () => {
    const session = Session.create(SessionId('failed-greeting'))
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'AUTH', message: 'Provider refused the request' } } })
    const failed = session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
    expect(failed.turn).toEqual({ number: 1, outcome: 'error' })
    const restored = Session.create(SessionId('restored-failure'), session.snapshotEvents())
    expect(restored.snapshotEvents().reduce(applyResidentEvent, initialResidentState())).toEqual(failed)
    session.append('turn/start', { turn: 2 })
    expect(session.snapshotEvents().reduce(applyResidentEvent, initialResidentState()).turn).toEqual({ number: 2, outcome: 'running' })
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    expect(session.snapshotEvents().reduce(applyResidentEvent, initialResidentState()).turn).toEqual({ number: 2, outcome: 'completed' })
  })

  it('replays local walking records with transient renderer fields as floor points', () => {
    const session = Session.create(SessionId('local-walk'))
    const point = { x: 5, z: 5, facing: 1.2, moving: false }
    appendPluginRecord(session, 'plugin:dsh-virtuallive/journey', { path: [point, { x: 6, z: 5 }], startedAt: 1000, speed: 1 })
    const state = session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
    expect(state.journey.path).toEqual([{ x: 5, z: 5 }, { x: 6, z: 5 }])
  })

  it('rejects invalid persisted identity data instead of inventing a replacement name', () => {
    const session = Session.create(SessionId('invalid-identity'))
    appendPluginRecord(session, 'plugin:dsh-virtuallive/identity', { name: '', reason: 'x', values: ['honesty'] })
    expect(() => session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())).toThrow()
    expect(identitySchema.safeParse({ name: '   ', reason: 'x', values: ['honesty'] }).success).toBe(false)
  })

  it('retains only spoken text after naming and keeps it when a later response contains no speech', () => {
    const session = Session.create(SessionId('resident-speech'))
    const appendSpeech = (content: Parameters<typeof createMessage>[0]['content']) => {
      session.append('assistant/message', {
        stream: [], turn: 1, step: 1,
        message: createMessage({ role: 'assistant', content, source: { kind: 'model', provider: 'test', model: 'test' } }),
      }, { surfaceOp: 'append' })
    }
    appendSpeech([{ type: 'text', text: 'Before choosing a name.' }])
    expect(session.snapshotEvents().reduce(applyResidentEvent, initialResidentState()).lastSpoken).toBeNull()
    appendPluginRecord(session, 'plugin:dsh-virtuallive/identity', { name: 'Wren', reason: 'A name I chose.', values: ['honesty'] })
    appendSpeech([{ type: 'reasoning', text: 'Private reasoning.' }, { type: 'text', text: 'Hello.' }, { type: 'text', text: 'I am Wren.' }])
    appendSpeech([{ type: 'reasoning', text: 'Thinking without speech.' }])
    expect(session.snapshotEvents().reduce(applyResidentEvent, initialResidentState()).lastSpoken).toBe('Hello.\nI am Wren.')
  })

  it('accepts authored artwork variants and rejects an item without that variant', () => {
    const layout = initialResidentState().home
    layout.layers.sofa.variant = 'alternate'
    expect(homeLayoutSchema.safeParse(layout).success).toBe(true)
    layout.layers.chair.variant = 'alternate'
    expect(homeLayoutSchema.safeParse(layout).success).toBe(false)
  })

  it('keeps refusal, truthful memory and action authorization in the resident persona', () => {
    const persona = residentPersona(initialResidentState())
    expect(persona).toContain('你有权说不')
    expect(persona).toContain('不要为了迎合对方而编造')
    expect(persona).toContain('遵循宿主的权限与确认机制')
  })
})
