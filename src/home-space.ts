/** Authored floor geometry for the illustrated home and its walking routes. */
import type { HomeLayerId, HomeLayout, ResidentJourney, RoomPoint } from './types.ts'
import { HOME_CALIBRATION, isVisibleFloor } from './home-camera.ts'
import { HOME_FURNITURE, HOME_LAYER_IDS, furnitureApproach } from './home-catalog.ts'

export { HOME_LAYER_IDS } from './home-catalog.ts'

/** A furniture footprint shared by rendering and navigation. */
export interface HomeFurniture {
  id: HomeLayerId
  x: number
  z: number
  width: number
  depth: number
}

/** Fixed authored room dimensions and furniture placements. */
export const HOME_SPACE = {
  width: HOME_CALIBRATION.floor.width,
  depth: HOME_CALIBRATION.floor.depth,
  clearance: 0.25,
  step: 0.25,
  furniture: HOME_LAYER_IDS.flatMap((id): HomeFurniture[] => {
    const item = HOME_FURNITURE[id]
    return item.footprint === null ? [] : [{ id, ...item.initial, ...item.footprint }]
  }),
  places: {
    center: { x: 4.7, z: 4.5 }, sofa: { x: 2.4, z: 2.25 }, desk: { x: 5.5, z: 1.75 },
    bed: { x: 6.25, z: 3.5 }, kitchen: { x: 1.8, z: 4.1 }, phone: { x: 6.1, z: 7.25 }, window: { x: 6.25, z: 1.75 },
  },
} as const

/**
 * Create an independent furnished arrangement using the authored floor plan.
 * @returns Mutable placement data owned by one resident projection.
 */
export function initialHomeLayout(): HomeLayout {
  const placement = (id: HomeLayerId) => ({ ...HOME_FURNITURE[id].initial, visible: true, scale: 1, variant: 'standard' as const })
  return { background: 'afternoon', layers: {
    sofa: placement('sofa'), coffee: placement('coffee'), desk: placement('desk'), chair: placement('chair'),
    bed: placement('bed'), kitchen: placement('kitchen'), phone: placement('phone'), plant: placement('plant'),
    rug: placement('rug'), curtains: placement('curtains'), shelf: placement('shelf'),
  } }
}

/**
 * Resolve collision footprints from the same visible placements used by the scene.
 * @param layout - Current independent furniture layers; omission uses the authored layout.
 * @returns Only solid, visible furniture at its current position and scale.
 */
export function homeFurniture(layout?: HomeLayout): HomeFurniture[] {
  return HOME_SPACE.furniture.flatMap((item) => {
    const placed = layout?.layers[item.id]
    if (!placed) return [{ ...item }]
    return placed.visible ? [{ ...item, x: placed.x, z: placed.z, width: item.width * placed.scale, depth: item.depth * placed.scale }] : []
  })
}

/**
 * Resolve place invitations beside the current furniture instead of its original location.
 * @param layout - Current visible layers and their placements.
 * @returns Authored destinations with free floor access; hidden or obstructed places are omitted.
 */
export function homePlaces(layout: HomeLayout): Partial<Record<keyof typeof HOME_SPACE.places, RoomPoint>> {
  const result: Partial<Record<keyof typeof HOME_SPACE.places, RoomPoint>> = {}
  const owners = { sofa: 'sofa', desk: 'desk', bed: 'bed', kitchen: 'kitchen', phone: 'phone', window: 'curtains' } as const
  const original = initialHomeLayout()
  for (const [place, point] of Object.entries(HOME_SPACE.places)) {
    const name = place as keyof typeof HOME_SPACE.places
    let target: RoomPoint = point
    if (name !== 'center') {
      const id = owners[name], layer = layout.layers[id], base = original.layers[id]
      if (!layer.visible && name !== 'window') continue
      const seat = HOME_FURNITURE[id].uses.sit
      target = seat === undefined
        ? { x: layer.x + (point.x - base.x) * layer.scale, z: layer.z + (point.z - base.z) * layer.scale }
        : furnitureApproach(layer, seat)
    }
    if (canStandAt(target, layout)) result[name] = target
  }
  return result
}

/**
 * Test a floor point against walls and expanded furniture footprints.
 * @param point - World-space floor location.
 * @param layout - Current furniture arrangement.
 * @returns Whether the resident has enough clearance to stand here.
 */
export function canStandAt(point: RoomPoint, layout?: HomeLayout): boolean {
  const { x, z } = point
  const { clearance, width, depth } = HOME_SPACE
  if (!Number.isFinite(x) || !Number.isFinite(z)
    || x < clearance || x > width - clearance || z < clearance || z > depth - clearance || !isVisibleFloor(point)) return false
  return !homeFurniture(layout).some(item => Math.abs(x - item.x) < item.width / 2 + clearance
    && Math.abs(z - item.z) < item.depth / 2 + clearance)
}

function segmentIsClear(start: RoomPoint, end: RoomPoint, layout?: HomeLayout): boolean {
  return !homeFurniture(layout).some((item) => {
    let entry = 0, exit = 1
    for (const [axis, size] of [['x', 'width'], ['z', 'depth']] as const) {
      const low = item[axis] - item[size] / 2 - HOME_SPACE.clearance
      const high = item[axis] + item[size] / 2 + HOME_SPACE.clearance
      const delta = end[axis] - start[axis]
      if (delta === 0) {
        if (start[axis] <= low || start[axis] >= high) return false
      } else {
        const a = (low - start[axis]) / delta, b = (high - start[axis]) / delta
        entry = Math.max(entry, Math.min(a, b))
        exit = Math.min(exit, Math.max(a, b))
      }
    }
    return entry < exit
  })
}

function nearbyGridPoint(value: RoomPoint, layout?: HomeLayout): RoomPoint | undefined {
  const step = HOME_SPACE.step
  const candidates: RoomPoint[] = []
  for (const x of [Math.floor(value.x / step), Math.ceil(value.x / step)]) {
    for (const z of [Math.floor(value.z / step), Math.ceil(value.z / step)]) {
      const candidate = { x: x * step, z: z * step }
      if (canStandAt(candidate, layout) && segmentIsClear(value, candidate, layout)) candidates.push(candidate)
    }
  }
  return candidates.sort((a, b) => Math.hypot(a.x - value.x, a.z - value.z) - Math.hypot(b.x - value.x, b.z - value.z))[0]
}

/**
 * Find a shortest orthogonal grid route with furniture clearance.
 * @param start - Current unobstructed resident position.
 * @param target - Exact requested unobstructed destination.
 * @param layout - Current visible furniture arrangement.
 * @returns Route including its resolved endpoints, or null when unreachable.
 */
export function routeHome(start: RoomPoint, target: RoomPoint, layout?: HomeLayout): RoomPoint[] | null {
  if (!canStandAt(start, layout) || !canStandAt(target, layout)) return null
  if (start.x === target.x && start.z === target.z) return [{ x: start.x, z: start.z }]
  const { step } = HOME_SPACE
  const columns = Math.round(HOME_SPACE.width / step) + 1
  const rows = Math.round(HOME_SPACE.depth / step) + 1
  const index = (point: RoomPoint): number => Math.round(point.z / step) * columns + Math.round(point.x / step)
  const point = (id: number): RoomPoint => ({ x: id % columns * step, z: Math.floor(id / columns) * step })
  const startGrid = nearbyGridPoint(start, layout), targetGrid = nearbyGridPoint(target, layout)
  if (!startGrid || !targetGrid) return null
  const first = index(startGrid), last = index(targetGrid)
  const parents = new Int32Array(columns * rows).fill(-1)
  const queue = [first]
  parents[first] = first
  for (const current of queue) {
    if (current === last) {
      const path: RoomPoint[] = []
      for (let id = last; id !== first; id = parents[id] as number) path.push(point(id))
      return [{ x: start.x, z: start.z }, point(first), ...path.reverse(), { x: target.x, z: target.z }]
    }
    const column = current % columns, row = Math.floor(current / columns)
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const x = column + dx, z = row + dz
      const next = z * columns + x
      if (x < 0 || x >= columns || z < 0 || z >= rows || parents[next] !== -1
        || !canStandAt(point(next), layout) || !segmentIsClear(point(current), point(next), layout)) continue
      parents[next] = current
      queue.push(next)
    }
  }
  return null
}

/**
 * Project a logged walk onto its current position without mutating durable state.
 * @param journey - Resident-authored path and movement timing.
 * @param time - Current Unix time in milliseconds.
 * @returns Floor location, facing angle in radians, and whether travel remains.
 */
export function journeyAt(journey: ResidentJourney, time: number): RoomPoint & { facing: number; moving: boolean } {
  let remaining = Math.max(0, time - journey.startedAt) / 1000 * journey.speed
  let previous = journey.path[0] as RoomPoint
  let facing = 0
  for (const next of journey.path.slice(1)) {
    const dx = next.x - previous.x, dz = next.z - previous.z
    const distance = Math.hypot(dx, dz)
    if (distance === 0) continue
    facing = Math.atan2(dx, dz)
    if (remaining < distance) return {
      x: previous.x + dx * remaining / distance, z: previous.z + dz * remaining / distance, facing, moving: true,
    }
    remaining -= distance
    previous = next
  }
  return { ...previous, facing, moving: false }
}

/**
 * Calculate the scheduled arrival time from the durable path and walking speed.
 * @param journey - Validated route with its recorded start time.
 * @returns Unix milliseconds when the resident reaches the final point.
 */
export function journeyArrivalAt(journey: ResidentJourney): number {
  let distance = 0
  for (let index = 1; index < journey.path.length; index++) {
    const start = journey.path[index - 1] as RoomPoint, end = journey.path[index] as RoomPoint
    distance += Math.hypot(end.x - start.x, end.z - start.z)
  }
  return journey.startedAt + distance / journey.speed * 1000
}
