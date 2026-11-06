/** Home layout schemas shared by durable replay and arrangement planning. */
import { z } from 'zod'
import { HOME_LAYER_IDS, HOME_SPACE } from '../../home-space.ts'
import { HOME_FURNITURE } from '../../home-catalog.ts'
import type { HomeArrangement, HomeLayout } from '../../types.ts'

/** Complete arrangement data accepted from the wire and durable room records. */
export const homeLayoutSchema: z.ZodType<HomeLayout> = z.object({
  background: z.enum(['afternoon', 'night']),
  layers: z.record(z.enum(HOME_LAYER_IDS), z.object({
    x: z.number().min(0).max(HOME_SPACE.width), z: z.number().min(0).max(HOME_SPACE.depth),
    visible: z.boolean(), scale: z.number().min(0.6).max(1.4), variant: z.enum(['standard', 'alternate']),
  }).strict()),
}).strict().refine(layout => HOME_LAYER_IDS.every(id => HOME_FURNITURE[id].variants.includes(layout.layers[id].variant)), 'Unavailable furniture artwork')

/** A committed room arrangement, including the resident's stationary floor position. */
export const homeArrangementSchema: z.ZodType<HomeArrangement> = z.object({
  layout: homeLayoutSchema, position: z.object({ x: z.number(), z: z.number() }).strict(), changedAt: z.number().nonnegative(),
}).strict()
