/** Replay-only memory outbox; restoring it never contacts Hindsight or repeats tools. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { MemoryOperationId, MemoryState } from './memory-types.ts'

/** Complete outbox records and persisted checkpoints accept the same JSON fields. */
export const memoryStateSchema: z.ZodType<MemoryState> = z.object({
  binding: z.object({ endpoint: z.url(), bankId: z.string().min(1), automatic: z.boolean() }).strict().nullable(),
  pending: z.array(z.object({
    operationId: z.uuid().transform(value => value as MemoryOperationId),
    content: z.string().min(1), timestamp: z.iso.datetime(), source: z.enum(['user', 'resident', 'chosen']),
  }).strict()),
  retained: z.number().int().nonnegative(), lastRetainedAt: z.iso.datetime().nullable(),
}).strict()

/**
 * Start with no external destination and no invented memories.
 * @returns An independent empty outbox.
 */
export function initialMemoryState(): MemoryState {
  return { binding: null, pending: [], retained: 0, lastRetainedAt: null }
}

/**
 * Derive a caller UUID from one committed message without mutable random state.
 * @param bankId - Resident-isolated destination.
 * @param event - Message event carrying its immutable sequence and payload.
 * @returns The same valid UUID for every replay of that message in that bank.
 */
export function messageMemoryId(bankId: string, event: SessionEvent): MemoryOperationId {
  const digest = createHash('sha256').update(JSON.stringify([bankId, event.seq, event.type, event.data])).digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}` as MemoryOperationId
}

/**
 * Fold acknowledgements and newly committed conversation text into the outbox.
 * @param state - Previously projected delivery facts.
 * @param event - Next committed or restored event.
 * @returns Updated delivery facts, retaining reference identity for unrelated events.
 */
export function applyMemoryEvent(state: MemoryState, event: SessionEvent): MemoryState {
  const record = pluginRecordOf(event)
  if (record?.type === 'plugin:dsh-virtuallive/memory') return memoryStateSchema.parse(record.data)
  if (state.binding === null || !state.binding.automatic) return state
  if (event.type !== 'user/message' && event.type !== 'assistant/message') return state
  const message = event.type === 'user/message' ? event.data : event.data.message
  const content = message.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim()
  if (content.length === 0) return state
  return {
    ...state,
    pending: [...state.pending, {
      operationId: messageMemoryId(state.binding.bankId, event), content,
      timestamp: new Date(event.time).toISOString(), source: event.type === 'user/message' ? 'user' : 'resident',
    }],
  }
}

/** Host-private outbox with O(backlog text) retained memory and O(backlog) admission. */
export const memoryProjectionDefinition = {
  key: 'virtualLiveMemory', stateVersion: 1, stateSchema: memoryStateSchema,
  init: initialMemoryState, apply: applyMemoryEvent,
} satisfies ProjectionDefinition<'virtualLiveMemory', MemoryState>
