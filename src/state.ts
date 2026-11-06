/** Replay-safe resident state; rendering and prompt assembly read the same projection. */
import { z } from 'zod'
import { pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { ResidentExpression, ResidentFurnitureRecord, ResidentFurnitureUse, ResidentIdentity, ResidentJourney, ResidentState } from './types.ts'
import { HOME_LAYER_IDS, HOME_SPACE, initialHomeLayout } from './home-space.ts'
import { homeArrangementSchema, homeLayoutSchema } from './domain/home/layout.ts'

export { homeArrangementSchema, homeLayoutSchema } from './domain/home/layout.ts'

/** Resident identity accepted at the tool and durable-record parsers. */
export const identitySchema: z.ZodType<ResidentIdentity> = z.object({
  name: z.string().trim().min(1).max(48),
  reason: z.string().trim().min(1).max(1200),
  values: z.array(z.string().trim().min(1).max(240)).min(1).max(12),
}).strict()

/** Self-reported visual expression accepted at the tool and durable-record parsers. */
export const expressionSchema: z.ZodType<ResidentExpression> = z.object({
  activity: z.enum(['idle', 'thinking', 'talking', 'reading', 'phone', 'eating', 'dancing', 'sleeping', 'waving']),
  mood: z.enum(['calm', 'happy', 'curious', 'pensive', 'tired', 'firm']),
  outfit: z.enum(['classic', 'casual', 'night']),
  intention: z.string().trim().max(600),
}).strict()

/** Walking records validated before replay or admission. */
export const journeySchema: z.ZodType<ResidentJourney> = z.object({
  path: z.array(z.object({ x: z.number(), z: z.number() }).strict()).min(1).max(256),
  startedAt: z.number().nonnegative(), speed: z.number().positive(),
}).strict()

// Early local walking records included the renderer's transient facing and moving fields.
const storedJourneySchema = z.object({
  path: z.array(z.object({ x: z.number(), z: z.number(), facing: z.number().optional(), moving: z.boolean().optional() }).strict()
    .transform(({ x, z }) => ({ x, z }))).min(1).max(256),
  startedAt: z.number().nonnegative(), speed: z.number().positive(),
}).strict()

const furnitureUseSchema: z.ZodType<ResidentFurnitureUse> = z.object({
  furnitureId: z.enum(HOME_LAYER_IDS), action: z.enum(['sit', 'lie', 'read']), homeRevision: z.number().int().nonnegative(),
}).strict()

/** An attachment and its approach route always share one durable commit. */
export const furnitureRecordSchema: z.ZodType<ResidentFurnitureRecord> = z.object({
  interaction: furnitureUseSchema, journey: journeySchema,
}).strict()

const stateSchema: z.ZodType<ResidentState> = z.object({
  identity: identitySchema.nullable(),
  expression: expressionSchema,
  lastSpoken: z.string().nullable(),
  journey: journeySchema,
  home: homeLayoutSchema,
  homeRevision: z.number().int().nonnegative(),
  interaction: furnitureUseSchema.nullable(),
  turn: z.object({
    number: z.number().int().nonnegative(),
    outcome: z.enum(['running', 'completed', 'error', 'aborted', 'blocked', 'max-tokens', 'interrupted', 'forked', 'other']),
  }).strict().nullable(),
}).strict()

/**
 * Start without a name or invented biography.
 * @returns An independent initial projection value.
 */
export function initialResidentState(): ResidentState {
  return {
    identity: null,
    expression: { activity: 'idle', mood: 'curious', outfit: 'classic', intention: '' },
    lastSpoken: null,
    journey: { path: [{ ...HOME_SPACE.places.center }], startedAt: 0, speed: 1 },
    home: initialHomeLayout(),
    homeRevision: 0,
    interaction: null,
    turn: null,
  }
}

/**
 * Fold a committed record without running tools or contacting external services.
 * @param state - Previously projected resident facts.
 * @param event - Next committed or restored Session event.
 * @returns Updated facts, or the same object for an unrelated event.
 */
export function applyResidentEvent(state: ResidentState, event: SessionEvent): ResidentState {
  if (event.type === 'turn/start') return { ...state, turn: { number: event.data.turn, outcome: 'running' } }
  if (event.type === 'turn/end') {
    const kind = event.data.reason.kind
    switch (kind) {
      case 'completed': case 'error': case 'aborted': case 'blocked': case 'max-tokens': case 'interrupted': case 'forked':
        return { ...state, turn: { number: event.data.turn, outcome: kind } }
      default:
        // Plugin-defined endings retain a neutral terminal state without interpreting their payload.
        return { ...state, turn: { number: event.data.turn, outcome: 'other' } }
    }
  }
  const record = pluginRecordOf(event)
  if (record?.type === 'plugin:dsh-virtuallive/identity') {
    return { ...state, identity: identitySchema.parse(record.data) }
  }
  if (record?.type === 'plugin:dsh-virtuallive/expression') {
    return { ...state, expression: expressionSchema.parse(record.data) }
  }
  if (record?.type === 'plugin:dsh-virtuallive/journey') {
    const journey = storedJourneySchema.parse(record.data)
    return { ...state, journey, interaction: null }
  }
  if (record?.type === 'plugin:dsh-virtuallive/furniture-use') {
    const use = furnitureRecordSchema.parse(record.data)
    return { ...state, journey: use.journey, interaction: use.interaction }
  }
  if (record?.type === 'plugin:dsh-virtuallive/home') {
    const arrangement = homeArrangementSchema.parse(record.data)
    return {
      ...state, home: arrangement.layout, homeRevision: state.homeRevision + 1, interaction: null,
      journey: { path: [arrangement.position], startedAt: arrangement.changedAt, speed: state.journey.speed },
    }
  }
  if (event.type === 'assistant/message' && state.identity !== null) {
    const spoken = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    if (spoken.length > 0) return { ...state, lastSpoken: spoken }
  }
  return state
}

/** The service retains its registration handle; callers read through the service. */
export const residentProjectionDefinition = {
  key: 'virtualLive',
  stateVersion: 8,
  stateSchema,
  init: initialResidentState,
  apply: applyResidentEvent,
} satisfies ProjectionDefinition<'virtualLive', ResidentState>
