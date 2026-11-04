/** Floor-relative foot contact and distance-based stride transitions. */
import type { SpritePlacement } from './resident-sprite.ts'
import type { ResidentJourney } from '../types.ts'
import { journeyArrivalAt } from '../home-space.ts'

/** Scene metres travelled during one complete left-and-right stride. */
export const RESIDENT_STRIDE_DISTANCE = 1.04

/** A point measured in crown-to-sole character heights, with the floor at zero. */
export interface ResidentPoint { x: number; y: number }

/** A shoe's position and whether its sole currently supports the character. */
export interface ResidentFoot extends ResidentPoint { contact: boolean; angle: number; pivot: number }

/** One continuous gait sample with a short two-foot support interval at each step. */
export interface ResidentGait { phase: number; lift: number; left: ResidentFoot; right: ResidentFoot }

/**
 * Settle the last stride into standing without restarting its phase after arrival.
 * @param journey - Committed route, speed, and start time.
 * @param time - Current wall-clock time in milliseconds.
 * @param moving - Whether the resident is still traversing that route.
 * @returns Frozen-on-arrival distance and a short continuous gait blend at either end.
 */
export function residentLocomotionAt(journey: ResidentJourney, time: number, moving: boolean): { distance: number; amount: number } {
  const arrival = journeyArrivalAt(journey)
  const distance = Math.max(0, Math.min(time, arrival) - journey.startedAt) / 1000 * journey.speed
  const amount = arrival === journey.startedAt ? 0 : moving ? smooth((time - journey.startedAt) / 180) : 1 - smooth((time - arrival) / 180)
  return { distance, amount }
}

/**
 * Keep each supporting heel or toe stationary against the projected floor.
 * @param placement - Continuous travelled distance and projected full-stride displacement.
 * @param side - Whether the artwork faces sideways rather than towards or away from the camera.
 * @returns Continuous shoe positions and a small shared body lift.
 */
export function residentGait(
  placement: Pick<SpritePlacement, 'distance' | 'stride' | 'height' | 'projectStride'>, side: boolean,
): ResidentGait {
  const phase = Math.max(0, placement.distance) / RESIDENT_STRIDE_DISTANCE % 1
  const stride = { x: placement.stride.x / placement.height, y: placement.stride.y / placement.height }
  const foot = (offset: number, separation: number): ResidentFoot => {
    const progress = (phase + offset) % 1
    const contact = progress < 0.6
    const swing = (progress - 0.6) / 0.4
    const travel = contact ? 0.3 - progress
      : -0.3 + swing * (-0.4 + swing * (3 - 2 * swing))
    const projected = placement.projectStride?.(travel)
    const floor = projected ? { x: projected.x / placement.height, y: projected.y / placement.height }
      : { x: stride.x * travel, y: stride.y * travel }
    const lift = contact ? 0 : Math.sin(swing * Math.PI) ** 2 * (side ? 0.042 : 0.032)
    const heel = -0.052, toe = 0.062
    const angle = !side ? contact ? 0 : Math.sin(swing * Math.PI * 2) * 0.035
      : contact ? -0.1 * (1 - smooth(progress / 0.1)) + 0.18 * smooth((progress - 0.46) / 0.14)
        : 0.18 * (1 - smooth(swing / 0.5)) - 0.1 * smooth((swing - 0.5) / 0.5)
    const pivot = side && contact ? progress < 0.1 ? heel : progress > 0.46 ? toe : 0 : 0
    const rock = (at: number, rotation: number): ResidentPoint => ({ x: at * (1 - Math.cos(rotation)), y: -at * Math.sin(rotation) })
    const planted = rock(pivot, angle), release = rock(toe, 0.18), land = rock(heel, -0.1)
    const amount = smooth(swing)
    const rolling = !side ? { x: 0, y: 0 } : contact ? planted
      : { x: release.x + (land.x - release.x) * amount, y: release.y + (land.y - release.y) * amount }
    return {
      x: separation + floor.x + rolling.x,
      y: floor.y - lift + rolling.y + (side ? offset === 0 ? 0.004 : -0.004 : 0),
      contact,
      angle, pivot,
    }
  }
  return {
    phase,
    lift: (1 - Math.cos(phase * Math.PI * 4)) * 0.004,
    left: foot(0.5, side ? 0 : -0.034),
    right: foot(0, side ? 0 : 0.034),
  }
}

function smooth(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return clamped * clamped * (3 - 2 * clamped)
}
