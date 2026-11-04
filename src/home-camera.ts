/** Floor projection calibrated to the empty illustrated room's wall intersections. */
import type { RoomPoint } from './types.ts'

/** Both empty wallpapers use this measured floor plane and reference image aspect ratio. */
export const HOME_CALIBRATION = {
  illustration: { width: 1672, height: 941 },
  floor: { width: 10, depth: 8 },
  vanishingPoint: { x: 0.535, y: 0.168 },
  backY: 0.475, frontY: 0.965, backWidth: 0.64, cameraX: 0.47, residentBackHeight: 0.26,
} as const

const { x: HORIZON_X, y: HORIZON_Y } = HOME_CALIBRATION.vanishingPoint
const { backY: BACK_Y, frontY: FRONT_Y, backWidth: BACK_WIDTH, cameraX: CAMERA_X } = HOME_CALIBRATION
const DEPTH_FACTOR = 1 - (BACK_Y - HORIZON_Y) / (FRONT_Y - HORIZON_Y)

/** A location normalized to the full room illustration. */
export interface IllustrationPoint { x: number; y: number }

/**
 * Project a floor location using the wallpaper's single vanishing point.
 * @param point - Metre coordinates on the authored floor.
 * @returns Image coordinates and resident height relative to the image height.
 */
export function projectFloor(point: RoomPoint): IllustrationPoint & { scale: number } {
  const perspective = 1 / (1 - DEPTH_FACTOR * point.z / HOME_CALIBRATION.floor.depth)
  return {
    x: HORIZON_X + (point.x / HOME_CALIBRATION.floor.width - CAMERA_X) * BACK_WIDTH * perspective,
    y: HORIZON_Y + (BACK_Y - HORIZON_Y) * perspective,
    scale: HOME_CALIBRATION.residentBackHeight * perspective,
  }
}

/**
 * Resolve an illustration location onto the authored floor before collision checks.
 * @param point - Normalized image coordinates.
 * @returns Floor coordinates, including locations outside the room.
 */
export function unprojectFloor(point: IllustrationPoint): RoomPoint {
  const perspective = (point.y - HORIZON_Y) / (BACK_Y - HORIZON_Y)
  return {
    x: ((point.x - HORIZON_X) / (BACK_WIDTH * perspective) + CAMERA_X) * HOME_CALIBRATION.floor.width,
    z: (1 - 1 / perspective) / DEPTH_FACTOR * HOME_CALIBRATION.floor.depth,
  }
}

/**
 * Keep the resident's feet and body inside the visible floor crop.
 * @param point - Proposed floor location.
 * @returns Whether the projected location leaves a visible margin at either side.
 */
export function isVisibleFloor(point: RoomPoint): boolean {
  const projected = projectFloor(point)
  return projected.x >= 0.06 && projected.x <= 0.94 && projected.y >= BACK_Y && projected.y <= FRONT_Y
}
