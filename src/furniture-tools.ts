/** Resident-owned furniture actions commit their approach and attachment intent together. */
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { HOME_LAYER_IDS, canStandAt, journeyAt } from './home-space.ts'
import { planFurnitureUse, residentFurnitureStatus } from './home-interaction.ts'
import { furnitureRecordSchema } from './state.ts'
import type { ResidentState } from './types.ts'

const requestSchema = z.object({
  furnitureId: z.enum(HOME_LAYER_IDS), action: z.enum(['sit', 'lie', 'read']), expectedRevision: z.number().int().nonnegative(),
}).strict()

/**
 * Install the resident's furniture-use and stand-up tools with disposal owned by her Agent.
 * @param ctx - Resident scope and tool registration owner.
 * @param resident - Agent whose Session receives the committed action.
 * @param options - Current projection and configured walking speed in metres per second.
 */
export function installFurnitureTools(ctx: Context, resident: Agent, options: { state: () => ResidentState; walkingSpeed: number }): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'live_use_furniture',
    description: 'Walk to visible furniture and sit, lie down, or read in an authored usable position. Read live_home for supported actions and homeRevision, then pass that revision as expectedRevision. Approaching means you are still walking; arrivesAt is the scheduled arrival time, not confirmation that you have arrived. Read live_home again to observe your current position. Hidden, unsupported, too-small, blocked, or unreachable furniture is refused without changing your current action. A too-small result includes the minimumScale needed to support your body. Use live_leave_furniture to stand up, or live_move to stand and walk elsewhere.',
    parameters: {
      furnitureId: { type: 'string', required: true, enum: [...HOME_LAYER_IDS] },
      action: { type: 'string', required: true, enum: ['sit', 'lie', 'read'] },
      expectedRevision: { type: 'integer', required: true, description: 'Nonnegative homeRevision from your latest live_home observation.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute(args, exec) {
      if (exec.agent?.id !== resident.id) throw new Error('Only the resident can choose how she uses furniture')
      exec.signal.throwIfAborted()
      const request = requestSchema.parse(args)
      const plan = planFurnitureUse(options.state(), request, { startedAt: Date.now(), speed: options.walkingSpeed })
      if (plan.status === 'conflict' || plan.status === 'unavailable') return Promise.resolve(JSON.stringify(plan))
      const record = furnitureRecordSchema.parse(plan.record)
      appendPluginRecord(resident.session, 'plugin:dsh-virtuallive/furniture-use', record)
      return Promise.resolve(JSON.stringify({ status: plan.status, ...record, arrivesAt: plan.arrivesAt, position: plan.position }))
    },
    presentCall: args => ({ card: 'generic', title: 'Use furniture', kind: 'other', rawInput: args }),
  })), 'virtuallive: furniture use tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'live_leave_furniture',
    description: 'Leave your current seat or bed and stand at its checked free-floor approach point. If you are still approaching furniture, stop the approach at your current floor position. Returns your actual floor position; when you are not using or approaching furniture, reports unchanged and preserves any ordinary walk.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute(_args, exec) {
      if (exec.agent?.id !== resident.id) throw new Error('Only the resident can choose to leave furniture')
      exec.signal.throwIfAborted()
      const state = options.state(), startedAt = Date.now()
      if (state.interaction === null) return Promise.resolve(JSON.stringify({ status: 'unchanged', ...residentFurnitureStatus(state, startedAt) }))
      const { x, z } = journeyAt(state.journey, startedAt), position = { x, z }
      if (!canStandAt(position, state.home)) return Promise.resolve(JSON.stringify({ status: 'unavailable', reason: 'resident-blocked' }))
      appendPluginRecord(resident.session, 'plugin:dsh-virtuallive/journey', { path: [position], startedAt, speed: options.walkingSpeed })
      return Promise.resolve(JSON.stringify({ status: 'standing', position }))
    },
    presentCall: () => ({ card: 'generic', title: 'Leave furniture', kind: 'other' }),
  })), 'virtuallive: leave furniture tool')
}
