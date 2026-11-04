/** Resident-scoped phone tools whose screenshots enter durable attachment-backed results. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { admitEncodedImages, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition, ToolOutputDefinition } from '@deepseek-ai/dsh-tools'
import type { VirtualLivePhone } from './phone.ts'
import type { PhoneAction, PhoneSnapshot } from './phone-types.ts'
import { phoneActionSchema } from './phone-protocol.ts'

type PhoneToolResult = { text: string; attachment?: { [K in keyof ImageAttachmentRef]: ImageAttachmentRef[K] } }

/**
 * Install phone tools in one resident scope; every result uses the normal logged tool pipeline.
 * @param ctx - Resident Agent registration owner.
 * @param resident - Sole Agent authorized to operate this phone.
 * @param phone - Device owner retained until this scope's executions settle.
 */
export function installPhoneTools(ctx: Context, resident: Agent, phone: VirtualLivePhone): void {
  const output: ToolOutputDefinition = {
    schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, attachment: { type: 'object' } }, additionalProperties: false },
    render: (_args, value): ContentBlock[] => {
      const result = value as PhoneToolResult
      return [{ type: 'text', text: result.text }, ...result.attachment === undefined ? [] : [{ type: 'image' as const, attachment: result.attachment }]]
    },
  }

  async function result(snapshot: PhoneSnapshot, signal: AbortSignal): Promise<PhoneToolResult> {
    const { screen, ...metadata } = snapshot
    const value: PhoneToolResult = { text: JSON.stringify({ ...metadata, screen: screen === null ? null : {
      width: screen.width, height: screen.height, deviceWidth: screen.deviceWidth, deviceHeight: screen.deviceHeight,
      coordinateSpace: 'android-pixels',
    } }) }
    if (screen === null || snapshot.status !== 'ready') return value
    const header = resident.session.requestHeader()?.config
    const provider = header?.provider ?? resident.options.provider
    const model = header?.model ?? resident.options.model
    const llm = ctx.get('llm')
    if (provider === undefined || model === undefined || llm === undefined) return value
    const info = await llm.resolveModelInfo(provider, model, signal)
    signal.throwIfAborted()
    if (!info.inputModalities?.includes('image')) return value
    const attachments = ctx.get('attachments')
    if (attachments === undefined) throw new Error('Phone screenshots require an attachment store')
    const references = await admitEncodedImages(attachments, [{ mediaType: screen.mediaType, data: screen.data }])
    signal.throwIfAborted()
    const reference = references[0]
    if (reference === undefined) throw new Error('Phone screenshot admission returned no attachment')
    value.attachment = reference
    return value
  }

  const look: ToolDefinition = {
    name: 'live_phone_look',
    description: 'Inspect your dedicated Android phone. Returns its current screen, visible text, interactive controls, Android pixel bounds, native app installation, and unverified login status. Call this before acting and after any unknown outcome. This does not sign in or send messages.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
    async execute(_args, exec) {
      if (exec.agent?.id !== resident.id) throw new Error('Only the resident can use her phone')
      return result(await phone.observe(exec.signal), exec.signal)
    },
    presentCall: () => ({ card: 'generic', title: 'Look at phone', kind: 'other' }),
  }
  ctx.effect(() => ctx.tools.register(look), 'virtuallive: phone observation tool')

  const control: ToolDefinition = {
    name: 'live_phone',
    description: 'Operate your dedicated Android phone once, then inspect the result. Choose tap, swipe, type, button, open, or url. Coordinates use original Android pixels from live_phone_look; scale screenshot coordinates by deviceWidth/width and deviceHeight/height. Open supports qq, wechat, bilibili, rednote, x, youtube: installed apps open natively, otherwise their official website opens. Login is unverified until you inspect the actual account UI. Text input does not press Enter. External messages require explicit user authorization. Unknown outcomes must be inspected before further input; never automatically repeat them.',
    parameters: { type: 'object', additionalProperties: false, required: ['kind'], properties: {
      kind: { type: 'string', enum: ['tap', 'swipe', 'type', 'button', 'open', 'url'] },
      x: { type: 'integer' }, y: { type: 'integer' }, x1: { type: 'integer' }, y1: { type: 'integer' }, x2: { type: 'integer' }, y2: { type: 'integer' },
      durationMs: { type: 'integer', description: 'Swipe duration, 100–3000 milliseconds; required for swipe.' },
      text: { type: 'string' }, clear: { type: 'boolean', description: 'Replace focused text; required for type.' },
      button: { type: 'string', enum: ['back', 'home', 'enter'] }, app: { type: 'string', enum: ['qq', 'wechat', 'bilibili', 'rednote', 'x', 'youtube'] },
      url: { type: 'string', description: 'HTTP or HTTPS address, without embedded credentials.' },
    } }, output,
    async execute(args, exec) {
      if (exec.agent?.id !== resident.id) throw new Error('Only the resident can use her phone')
      const action: PhoneAction = phoneActionSchema.parse(args)
      return result(await phone.action(action, exec.signal), exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: 'Use phone', kind: 'other', rawInput: args }),
  }
  ctx.effect(() => ctx.tools.register(control), 'virtuallive: phone input tool')
}
