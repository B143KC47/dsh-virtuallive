/** Resident-scoped tools for self-authored identity and expression. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { expressionSchema, identitySchema, journeySchema } from './state.ts'
import { HOME_LAYER_IDS, HOME_SPACE, homeFurniture, homePlaces, journeyAt, routeHome } from './home-space.ts'
import { commitHomeArrangement } from './home-arrangement.ts'
import { installFurnitureTools } from './furniture-tools.ts'
import { homeFurnitureUses, residentFurnitureStatus } from './home-interaction.ts'
import { HOME_FURNITURE } from './home-catalog.ts'
import type { ResidentState } from './types.ts'

/**
 * Install tools in the resident's scope; other Agents cannot change her records.
 * @param ctx - Resident Agent scope and registration owner.
 * @param resident - Agent whose Session receives validated records.
 * @param options - Current facts and deployment-owned walking speed in metres per second.
 */
export function installResidentTools(ctx: Context, resident: Agent, options: { state: () => ResidentState; walkingSpeed: number }): void {
  installFurnitureTools(ctx, resident, options)
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'live_home', description: 'Look around your furnished home. Returns the complete layout, its homeRevision, furniture footprints, usable furniture actions, named destinations, your actual floor position and furniture-use status, and current expression and outfit. Use live_move to walk, live_use_furniture to sit, lie down, or read, live_leave_furniture to stand up, live_arrange_home to change furniture, or live_express to change your outfit and activity.',
    parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute() {
      const state = options.state(), now = Date.now()
      return Promise.resolve(JSON.stringify({
        ...HOME_SPACE, furniture: homeFurniture(state.home), places: homePlaces(state.home),
        layout: state.home, homeRevision: state.homeRevision, position: journeyAt(state.journey, now), expression: state.expression,
        furnitureUses: homeFurnitureUses(state.home), presence: residentFurnitureStatus(state, now),
      }))
    },
    presentCall: () => ({ card: 'generic', title: 'Look around home', kind: 'other' }),
  })), 'virtuallive: home observation tool')
  const arrange: ToolDefinition = {
    name: 'live_arrange_home',
    description: 'Arrange your home by submitting a complete layout from live_home and its homeRevision as expectedRevision. Change furniture visibility, floor x/z, scale, or artwork; choose afternoon or night wallpaper. Only the sofa supports alternate artwork. Successful edits stop your walk or release your seat at a checked free floor position. If the revision changed, look again before editing. If furniture would block you, move to free floor or choose another arrangement. A refusal leaves the home unchanged.',
    parameters: { type: 'object', additionalProperties: false, required: ['layout', 'expectedRevision'], properties: {
      expectedRevision: { type: 'integer', minimum: 0, description: 'homeRevision from your latest live_home observation.' },
      layout: { type: 'object', additionalProperties: false, required: ['background', 'layers'], properties: {
        background: { type: 'string', enum: ['afternoon', 'night'] },
        layers: { type: 'object', additionalProperties: false, required: [...HOME_LAYER_IDS], properties: Object.fromEntries(HOME_LAYER_IDS.map(id => [id, {
          type: 'object', additionalProperties: false, required: ['x', 'z', 'visible', 'scale', 'variant'], properties: {
            x: { type: 'number', minimum: 0, maximum: HOME_SPACE.width }, z: { type: 'number', minimum: 0, maximum: HOME_SPACE.depth },
            visible: { type: 'boolean' }, scale: { type: 'number', minimum: 0.6, maximum: 1.4 },
            variant: { type: 'string', enum: [...HOME_FURNITURE[id].variants] },
          },
        }])) },
      } },
    } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
    execute(args, exec) {
      if (exec.agent?.id !== resident.id) throw new Error('Only the resident can arrange her home')
      exec.signal.throwIfAborted()
      if (typeof args !== 'object' || args === null || !('layout' in args) || !('expectedRevision' in args)) {
        return Promise.resolve(JSON.stringify({ status: 'invalid', reason: 'invalid-data' }))
      }
      return Promise.resolve(JSON.stringify(commitHomeArrangement(resident.session, options.state(), args.layout, args.expectedRevision)))
    },
    presentCall: args => ({ card: 'generic', title: 'Arrange home', kind: 'other', rawInput: args }),
  }
  ctx.effect(() => ctx.tools.register(arrange), 'virtuallive: room arrangement tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'live_move', description: 'Choose a destination on your home floor, in metres. Walk around furniture rather than through it. Use live_home to find places. This starts a visible walk; the result describes the route, not an instantaneous arrival. You may choose to stay where you are.',
    parameters: { x: { type: 'number', required: true }, z: { type: 'number', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute(args, exec) {
      if (exec.agent?.id !== resident.id) throw new Error('Only the resident can choose where she walks')
      exec.signal.throwIfAborted()
      const startedAt = Date.now()
      const state = options.state()
      const path = routeHome(journeyAt(state.journey, startedAt), args, state.home)
      if (path === null) return Promise.resolve(JSON.stringify({ status: 'unreachable', reason: 'The requested point is blocked by furniture or outside the home. Choose a free floor point from live_home.' }))
      const journey = journeySchema.parse({ path, startedAt, speed: options.walkingSpeed })
      appendPluginRecord(resident.session, 'plugin:dsh-virtuallive/journey', journey)
      return Promise.resolve(JSON.stringify({ status: journeyAt(journey, startedAt).moving ? 'walking' : 'standing', ...journey }))
    },
    presentCall: args => ({ card: 'generic', title: 'Walk through home', kind: 'other', rawInput: args }),
  })), 'virtuallive: walking tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'live_choose_identity',
    description: 'Choose your own name, explain why it suits you, and state your values. You may revise your identity when your own views change. This replaces your current identity and updates the names of your home and phone.',
    parameters: {
      name: { type: 'string', required: true, description: 'Your chosen name, 1–48 characters.' },
      reason: { type: 'string', required: true, description: 'Why you choose this name, up to 1200 characters.' },
      values: { type: 'array', required: true, items: { type: 'string' }, description: 'One to twelve values you choose for yourself, each up to 240 characters.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute(args, exec) {
      if (exec.agent?.id !== resident.id) throw new Error('Only the resident can choose her identity')
      const identity = identitySchema.parse(args)
      appendPluginRecord(resident.session, 'plugin:dsh-virtuallive/identity', identity)
      return Promise.resolve(JSON.stringify(identity))
    },
    presentCall: args => ({ card: 'generic', title: 'Choose identity', kind: 'other', rawInput: args }),
  })), 'virtuallive: identity tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'live_express',
    description: 'Change your outfit, activity, mood, and intention at home. Outfits are classic, casual, or night; live_home reports what you currently wear. This changes your visible appearance and expression, not the result of an external phone or web action.',
    parameters: {
      activity: { type: 'string', required: true, enum: ['idle', 'thinking', 'talking', 'reading', 'phone', 'eating', 'dancing', 'sleeping', 'waving'] },
      mood: { type: 'string', required: true, enum: ['calm', 'happy', 'curious', 'pensive', 'tired', 'firm'] },
      outfit: { type: 'string', required: true, enum: ['classic', 'casual', 'night'], description: 'Choose classic maid clothing, casual day clothing, or night clothing.' },
      intention: { type: 'string', required: true, description: 'What you intend to do, up to 600 characters; empty when you have no current intention.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute(args, exec) {
      if (exec.agent?.id !== resident.id) throw new Error('Only the resident can describe her expression')
      const expression = expressionSchema.parse(args)
      appendPluginRecord(resident.session, 'plugin:dsh-virtuallive/expression', expression)
      return Promise.resolve(JSON.stringify(expression))
    },
    presentCall: args => ({ card: 'generic', title: 'Express activity', kind: 'other', rawInput: args }),
  })), 'virtuallive: expression tool')
}
