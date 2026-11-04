/** Outbox recovery is pure and retains the source of every unconfirmed delivery. */
import { describe, expect, it } from 'vitest'
import { appendPluginRecord, Session, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { applyMemoryEvent, initialMemoryState, memoryStateSchema, messageMemoryId } from '../src/memory-state.ts'

const binding = { endpoint: 'http://127.0.0.1:8888', bankId: 'resident-bank', automatic: true }

describe('resident memory recovery', () => {
  it('retains newly committed text with the same UUID through a checkpoint and suffix replay', () => {
    const session = Session.create(SessionId('memory-recovery'))
    appendPluginRecord(session, 'plugin:dsh-virtuallive/memory', { ...initialMemoryState(), binding })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '我喜欢周二在窗边喝乌龙茶' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const events = session.snapshotEvents()
    const folded = events.reduce(applyMemoryEvent, initialMemoryState())
    expect(folded.pending).toHaveLength(1)
    expect(folded.pending[0]?.content).toBe('我喜欢周二在窗边喝乌龙茶')
    expect(folded.pending[0]?.source).toBe('user')
    const checkpoint = memoryStateSchema.parse(JSON.parse(JSON.stringify(folded)))
    appendPluginRecord(session, 'plugin:dsh-virtuallive/memory', {
      ...folded, pending: [], retained: 1, lastRetainedAt: '2026-10-26T00:00:00.000Z',
    })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '今天想读一本科幻小说' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const all = session.snapshotEvents()
    expect(all.slice(events.length).reduce(applyMemoryEvent, checkpoint)).toEqual(all.reduce(applyMemoryEvent, initialMemoryState()))
    expect(all.reduce(applyMemoryEvent, initialMemoryState()).pending).toHaveLength(1)
    expect(events.reduce(applyMemoryEvent, initialMemoryState()).pending[0]?.operationId).toBe(folded.pending[0]?.operationId)
    expect(messageMemoryId('different-bank', events[1]!)).not.toBe(folded.pending[0]?.operationId)
  })

  it('ignores history before binding and unrelated or blank events without changing the state reference', () => {
    const session = Session.create(SessionId('memory-unbound'))
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Earlier history is not fabricated as a newly delivered memory' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const initial = initialMemoryState()
    expect(session.snapshotEvents().reduce(applyMemoryEvent, initial)).toBe(initial)
    appendPluginRecord(session, 'plugin:dsh-virtuallive/memory', { ...initialMemoryState(), binding })
    const bound = session.snapshotEvents().reduce(applyMemoryEvent, initial)
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: ' ' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    expect(session.snapshotEvents().slice(2).reduce(applyMemoryEvent, bound)).toBe(bound)
  })

  it('keeps disabled automatic retention empty and rejects malformed durable acknowledgements', () => {
    const session = Session.create(SessionId('memory-explicit'))
    appendPluginRecord(session, 'plugin:dsh-virtuallive/memory', { ...initialMemoryState(), binding: { ...binding, automatic: false } })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Explicit retention only' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    expect(session.snapshotEvents().reduce(applyMemoryEvent, initialMemoryState()).pending).toEqual([])
    expect(memoryStateSchema.safeParse({ ...initialMemoryState(), retained: -1 }).success).toBe(false)
    expect(memoryStateSchema.safeParse({ ...initialMemoryState(), pending: [{ operationId: 'not-a-uuid', content: 'source', timestamp: 'today', source: 'user' }] }).success).toBe(false)
  })
})
