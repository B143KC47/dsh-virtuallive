/** Furniture use shares the floor route, authored image anchors, and recorded room revision. */
import { HOME_FURNITURE, HOME_LAYER_IDS, furnitureApproach, furnitureRectangle, type FurnitureUseDefinition } from './home-catalog.ts'
import { projectFloor, type IllustrationPoint } from './home-camera.ts'
import { canStandAt, journeyArrivalAt, journeyAt, routeHome } from './home-space.ts'
import type { FurnitureAction, HomeLayerId, HomeLayout, ResidentFurnitureRecord, ResidentFurnitureUse, ResidentState, RoomPoint } from './types.ts'

/** A refusal leaves the current room, journey, and furniture-use intent unchanged. */
export type FurnitureUsePlan =
  | { status: 'approaching' | 'using'; record: ResidentFurnitureRecord; arrivesAt: number; position: RoomPoint }
  | { status: 'conflict'; homeRevision: number }
  | { status: 'unavailable'; reason: 'hidden' | 'unsupported' | 'approach-blocked' | 'unreachable' }
  | { status: 'unavailable'; reason: 'too-small'; minimumScale: number }

/** An attachment identifies the renderer's body origin and the exact registered image point. */
export interface FurnitureAttachment {
  anchor: 'pelvis' | 'torso'
  illustration: IllustrationPoint
  /** Floor level at the furniture's front support depth, directly below the body attachment. */
  ground: IllustrationPoint
  scale: number
  depth: number
  facing: number
  rotation: number
}

/** Current pose derived from committed facts; reading it never advances the Session. */
export interface ResidentPresence {
  phase: 'standing' | 'walking' | 'approaching' | 'using'
  position: RoomPoint
  facing: number
  moving: boolean
  interaction: null | {
    furnitureId: HomeLayerId
    action: FurnitureAction
    pose: 'sitting' | 'lying'
    attachment: FurnitureAttachment
  }
}

function resolveUse(state: ResidentState): { intent: ResidentFurnitureUse; definition: FurnitureUseDefinition } | null {
  const intent = state.interaction
  if (intent === null || intent.homeRevision !== state.homeRevision || !state.home.layers[intent.furnitureId].visible) return null
  const definition = HOME_FURNITURE[intent.furnitureId].uses[intent.action]
  return definition === undefined || state.home.layers[intent.furnitureId].scale < definition.minimumScale ? null : { intent, definition }
}

/**
 * Describe furniture actions and their authored free-floor approach points.
 * @param layout - Current committed furniture placements and visibility.
 * @returns Visible usable items, including whether their size and approach permit each action.
 */
export function homeFurnitureUses(layout: HomeLayout): {
  furnitureId: HomeLayerId
  actions: { action: FurnitureAction; approach: RoomPoint; available: boolean }[]
}[] {
  return HOME_LAYER_IDS.flatMap((furnitureId) => {
    const placement = layout.layers[furnitureId]
    if (!placement.visible) return []
    const actions = (['sit', 'lie', 'read'] as const).flatMap((action) => {
      const use = HOME_FURNITURE[furnitureId].uses[action]
      if (use === undefined) return []
      const approach = furnitureApproach(placement, use)
      return [{ action, approach, available: placement.scale >= use.minimumScale && canStandAt(approach, layout) }]
    })
    return actions.length === 0 ? [] : [{ furnitureId, actions }]
  })
}

/**
 * Resolve a furniture-use request against one observed room revision.
 * @param state - Current resident projection.
 * @param request - Selected furniture, authored action, and observed room revision.
 * @param timing - Recorded start time and configured walking speed in metres per second.
 * @returns A complete atomic record or a refusal, without mutating the Session.
 */
export function planFurnitureUse(
  state: ResidentState,
  request: { furnitureId: HomeLayerId; action: FurnitureAction; expectedRevision: number },
  timing: { startedAt: number; speed: number },
): FurnitureUsePlan {
  if (request.expectedRevision !== state.homeRevision) return { status: 'conflict', homeRevision: state.homeRevision }
  const placement = state.home.layers[request.furnitureId]
  if (!placement.visible) return { status: 'unavailable', reason: 'hidden' }
  const use = HOME_FURNITURE[request.furnitureId].uses[request.action]
  if (use === undefined) return { status: 'unavailable', reason: 'unsupported' }
  if (placement.scale < use.minimumScale) return { status: 'unavailable', reason: 'too-small', minimumScale: use.minimumScale }
  const approach = furnitureApproach(placement, use)
  if (!canStandAt(approach, state.home)) return { status: 'unavailable', reason: 'approach-blocked' }
  const { x, z } = journeyAt(state.journey, timing.startedAt)
  const path = routeHome({ x, z }, approach, state.home)
  if (path === null) return { status: 'unavailable', reason: 'unreachable' }
  const record: ResidentFurnitureRecord = {
    interaction: { furnitureId: request.furnitureId, action: request.action, homeRevision: state.homeRevision },
    journey: { path, ...timing },
  }
  const arrivesAt = journeyArrivalAt(record.journey)
  return { status: arrivesAt > timing.startedAt ? 'approaching' : 'using', record, arrivesAt, position: { x, z } }
}

/**
 * Report whether a committed furniture-use intent is still approaching or has arrived.
 * @param state - Current projection including the original approach journey.
 * @param time - Current Unix time in milliseconds.
 * @returns Actual movement status and any valid scheduled furniture action.
 */
export function residentFurnitureStatus(state: ResidentState, time: number): {
  phase: ResidentPresence['phase']
  position: RoomPoint
  interaction: ResidentFurnitureUse | null
  arrivesAt: number | null
} {
  const { x, z, moving } = journeyAt(state.journey, time)
  const use = resolveUse(state)
  return {
    phase: use === null ? (moving ? 'walking' : 'standing') : (moving ? 'approaching' : 'using'),
    position: { x, z }, interaction: use?.intent ?? null, arrivesAt: use === null ? null : journeyArrivalAt(state.journey),
  }
}

/**
 * Place the resident's named body anchor on the same image coordinates used for furniture.
 * @param state - Current resident projection.
 * @param time - Current Unix time in milliseconds.
 * @param viewport - Displayed wallpaper dimensions in CSS pixels.
 * @returns A floor posture until arrival, then a registered furniture posture.
 */
export function residentPresenceAt(state: ResidentState, time: number, viewport: { width: number; height: number }): ResidentPresence {
  const { x, z, facing, moving } = journeyAt(state.journey, time)
  const use = resolveUse(state)
  const base: ResidentPresence = { phase: moving ? 'walking' : 'standing', position: { x, z }, facing, moving, interaction: null }
  if (use === null) return base
  if (moving) return { ...base, phase: 'approaching' }
  const { intent, definition } = use
  const placement = state.home.layers[intent.furnitureId]
  const box = furnitureRectangle(intent.furnitureId, state.home, viewport)
  const anchor = definition.attachment[placement.variant]
  const illustration = { x: (box.x + box.width * anchor.x) / viewport.width, y: (box.y + box.height * anchor.y) / viewport.height }
  const depth = placement.z + HOME_FURNITURE[intent.furnitureId].frontOffset * placement.scale
  const ground = projectFloor({ x: placement.x, z: depth })
  return {
    ...base, phase: 'using', facing: definition.facing,
    interaction: {
      furnitureId: intent.furnitureId, action: intent.action, pose: definition.pose,
      attachment: {
        anchor: definition.anchor,
        illustration,
        ground: { x: illustration.x, y: ground.y },
        scale: projectFloor(placement).scale,
        depth,
        facing: definition.facing,
        rotation: definition.rotation,
      },
    },
  }
}
