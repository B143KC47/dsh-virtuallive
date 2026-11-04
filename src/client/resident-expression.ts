/** Facial motion and hand-held props use the same head and arm joints as locomotion. */
import type { ResidentExpression } from '../types.ts'
import type { ResidentDirection } from './resident-art.ts'
import type { ResidentPoint } from './resident-motion.ts'
import type { SpritePlacement } from './resident-sprite.ts'
import type { ResidentMeshLayer } from './resident-surface.ts'
import type { ResidentSkeleton } from './resident-skeleton.ts'

/** Eye closure and mouth opening are independent of retained activity intentions. */
export interface ResidentFaceState { eyes: number; mouth: number }

/**
 * Animate speech only during an active speaking turn, and retain a closed idle mouth.
 * @param expression - Current resident activity.
 * @param placement - Motion preference, animation time, and active speech state.
 * @returns Continuous eye and mouth parameters between zero and one.
 */
export function residentFaceState(
  expression: ResidentExpression, placement: Pick<SpritePlacement, 'time' | 'motion' | 'speaking'>,
): ResidentFaceState {
  const blink = placement.time % 5.3
  return {
    eyes: expression.activity === 'sleeping' ? 1 : placement.motion && blink < 0.18 ? Math.sin(blink / 0.18 * Math.PI) : 0,
    mouth: expression.activity === 'talking' && placement.speaking && placement.motion
      ? (Math.sin(placement.time * 15) + 1) / 2 : 0,
  }
}

/**
 * Close the source eyes locally without changing the face outline or head position.
 * @param point - A neutral head-mesh vertex.
 * @param direction - The authored view; rear hair has no facial deformation.
 * @param closure - Eye closure between zero and one.
 * @returns A head-local vertex for subsequent bone transformation.
 */
export function residentEyePoint(point: ResidentPoint, direction: ResidentDirection, closure: number): ResidentPoint {
  if (direction === 'back' || closure === 0) return point
  const eyes = direction === 'side' ? [{ x: 0.068, y: -0.824 }] : [{ x: -0.037, y: -0.828 }, { x: 0.037, y: -0.828 }]
  let y = point.y
  for (const eye of eyes) {
    const xWeight = Math.max(0, 1 - Math.abs(point.x - eye.x) / 0.03)
    const distance = Math.abs(point.y - eye.y), yWeight = Math.max(0, Math.min(1, (0.038 - distance) / 0.018))
    y -= (point.y - eye.y) * closure * 0.95 * Math.min(1, xWeight * 3) * yWeight
  }
  return { x: point.x, y }
}

/**
 * Attach a painted object to the posed hand or hands holding it.
 * @param image - Shared phone, book, bowl, and spoon atlas.
 * @param activity - Activity selecting the held object.
 * @param bones - Posed skeleton, including furniture transforms.
 * @param direction - Authored view controlling the width of a held object.
 * @returns Prop layers inserted above the body and below the hands.
 */
export function residentProps(
  image: HTMLImageElement, activity: ResidentExpression['activity'], bones: ResidentSkeleton, direction: ResidentDirection,
): ResidentMeshLayer[] {
  const side = direction === 'side'
  const prop = (
    rectangle: readonly [number, number, number, number], center: ResidentPoint, width: number, angle = 0,
  ): ResidentMeshLayer => {
    const [left, top, textureWidth, textureHeight] = rectangle, height = width * textureHeight / textureWidth
    const points = [{ x: -width / 2, y: -height / 2 }, { x: width / 2, y: -height / 2 },
      { x: -width / 2, y: height / 2 }, { x: width / 2, y: height / 2 }].map(point => ({
      x: center.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
      y: center.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
    }))
    return { mesh: { image, points, columns: 1, rows: 1, texture: { left, top, width: textureWidth, height: textureHeight } },
      deform: point => point }
  }
  const near = bones.nearForearm.end, far = bones.farForearm.end
  if (activity === 'phone') return [prop([62, 105, 408, 520], { x: near.x + (side ? 0.012 : -0.006), y: near.y - 0.043 }, 0.075, -0.12)]
  if (activity === 'reading') return [prop([520, 134, 677, 466], {
    x: (near.x + far.x) / 2 + (side ? 0.025 : 0), y: (near.y + far.y) / 2 - 0.018,
  }, side ? 0.19 : 0.24)]
  if (activity === 'eating') return [
    prop([1211, 250, 483, 343], { x: far.x + (side ? 0.035 : 0.045), y: far.y - 0.05 }, 0.145),
    prop([1724, 222, 422, 331], { x: near.x - 0.017, y: near.y - 0.022 }, 0.085, side ? 0.3 : 0),
  ]
  return []
}
