/** Validation of Android worker frames and untrusted phone commands. */
import { z } from 'zod'

const coordinate = z.number().int().min(0).max(32767)
const app = z.enum(['qq', 'wechat', 'bilibili', 'rednote', 'x', 'youtube'])

/** Complete accepted input commands; unknown fields are refused before queue admission. */
export const phoneActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tap'), x: coordinate, y: coordinate }).strict(),
  z.object({ kind: z.literal('swipe'), x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, durationMs: z.number().int().min(100).max(3000) }).strict(),
  z.object({ kind: z.literal('type'), text: z.string(), clear: z.boolean() }).strict(),
  z.object({ kind: z.literal('button'), button: z.enum(['back', 'home', 'enter']) }).strict(),
  z.object({ kind: z.literal('open'), app }).strict(),
  z.object({ kind: z.literal('url'), url: z.url({ protocol: /^https?$/, hostname: /.+/ }).max(8192).refine((value) => {
    const url = new URL(value)
    return url.username === '' && url.password === ''
  }) }).strict(),
])

/** Bounded response contents, followed by byte validation in the JSONL reader. */
export const phoneObservationSchema = z.object({
  screen: z.object({
    mediaType: z.literal('image/jpeg'), data: z.string().min(1),
    width: z.number().int().positive().max(32768), height: z.number().int().positive().max(32768),
    deviceWidth: z.number().int().positive().max(32768), deviceHeight: z.number().int().positive().max(32768),
  }).strict(),
  tree: z.string(), treeTruncated: z.boolean(),
  apps: z.array(z.object({ id: app, installed: z.boolean(), login: z.literal('unknown') }).strict()).length(6),
  observedAt: z.number().int().nonnegative(), elapsedMs: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.apps.map(item => item.id)).size !== 6) ctx.addIssue({ code: 'custom', message: 'Application shortcuts must be unique' })
})

/** Every reply belongs to the sole active request; errors never include entered content. */
export const phoneReplySchema = z.union([
  z.object({ id: z.number().int().positive(), result: phoneObservationSchema }).strict(),
  z.object({ id: z.number().int().positive(), error: z.object({ code: z.enum(['unavailable', 'protocol']), uncertain: z.boolean() }).strict() }).strict(),
])

/** Worker observation before Host readiness is added. */
export type PhoneObservation = z.infer<typeof phoneObservationSchema>
