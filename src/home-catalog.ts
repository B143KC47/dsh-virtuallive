/** Authored floor, image registration, and furniture-use coordinates for the home. */
import { projectFloor } from './home-camera.ts'
import type { HomeLayerId, HomeLayerPlacement, HomeLayout, FurnitureAction, RoomPoint } from './types.ts'

/** A point normalized to the cropped opaque artwork, independent of its resolution. */
export interface FurnitureImagePoint { x: number; y: number }

/** Cropped source pixels, measured before the image is placed in the room. */
export type FurnitureImageBounds = readonly [left: number, top: number, right: number, bottom: number]

/** A usable furniture position with a free floor approach and a named body attachment. */
export interface FurnitureUseDefinition {
  pose: 'sitting' | 'lying'
  anchor: 'pelvis' | 'torso'
  /** Offsets from the furniture's floor center, in metres before placement scaling. */
  approach: RoomPoint
  /** Resident clearance in floor metres; resizing the furniture does not resize the resident. */
  standOff: RoomPoint
  /** Attachment coordinates in each variant's cropped artwork. */
  attachment: { standard: FurnitureImagePoint; alternate: FurnitureImagePoint }
  /** Smallest authored furniture scale that supports the resident without resizing her body. */
  minimumScale: number
  facing: number
  /** Clockwise image-space rotation around the attached body joint, in radians. */
  rotation: number
  /** Artwork polygons painted over the attached resident; an empty list paints none. */
  foreground: readonly (readonly FurnitureImagePoint[])[]
}

/** Every room item declares placement, physical occupancy, artwork registration, and uses. */
export interface HomeFurnitureDefinition {
  id: HomeLayerId
  initial: RoomPoint
  footprint: { width: number; depth: number } | null
  plane: 'floor' | 'wall' | 'furniture'
  /** Display width relative to the wallpaper width at the authored initial depth. */
  width: number
  /** Horizontal image coordinate resting on the projected front ground anchor. */
  anchor: number
  frontOffset: number
  lift: number
  floor: { width: number; depth: number } | null
  bounds: { standard: FurnitureImageBounds; alternate: FurnitureImageBounds }
  variants: readonly HomeLayerPlacement['variant'][]
  uses: Partial<Record<FurnitureAction, FurnitureUseDefinition>>
}

/** Stable editing and model-observation order of the independent room layers. */
export const HOME_LAYER_IDS = ['sofa', 'coffee', 'desk', 'chair', 'bed', 'kitchen', 'phone', 'plant', 'rug', 'curtains', 'shelf'] as const satisfies readonly HomeLayerId[]

const sofaSeat: FurnitureUseDefinition = {
  pose: 'sitting', anchor: 'pelvis', minimumScale: 0.6, approach: { x: 0, z: 1 }, standOff: { x: 0, z: 0.25 },
  attachment: { standard: { x: 0.73, y: 0.55 }, alternate: { x: 0.73, y: 0.55 } }, facing: Math.PI / 2, rotation: 0,
  foreground: [[{ x: 0.88, y: 0.32 }, { x: 1, y: 0.29 }, { x: 1, y: 1 }, { x: 0.88, y: 1 }]],
}
const chairSeat: FurnitureUseDefinition = {
  pose: 'sitting', anchor: 'pelvis', minimumScale: 0.6, approach: { x: 0, z: 0.85 }, standOff: { x: 0, z: 0.25 },
  attachment: { standard: { x: 0.48, y: 0.45 }, alternate: { x: 0.48, y: 0.45 } }, facing: -Math.PI / 2, rotation: 0,
  foreground: [
    [{ x: 0.29, y: 0.05 }, { x: 1, y: 0 }, { x: 0.95, y: 0.3 }, { x: 0.37, y: 0.34 }],
    [{ x: 0.36, y: 0.09 }, { x: 0.46, y: 0.1 }, { x: 0.37, y: 0.98 }, { x: 0.31, y: 1 }],
  ],
}
const bedSeat: FurnitureUseDefinition = {
  pose: 'sitting', anchor: 'pelvis', minimumScale: 0.6, approach: { x: -1.5, z: 1.7 }, standOff: { x: -0.25, z: 0 },
  attachment: { standard: { x: 0.2, y: 0.43 }, alternate: { x: 0.2, y: 0.43 } }, facing: -Math.PI / 2, rotation: 0, foreground: [],
}
const bedRest: FurnitureUseDefinition = {
  pose: 'lying', anchor: 'torso', minimumScale: 0.9, approach: { x: -1.5, z: 1.7 }, standOff: { x: -0.25, z: 0 },
  attachment: { standard: { x: 0.44, y: 0.30 }, alternate: { x: 0.44, y: 0.30 } }, facing: Math.PI / 2, rotation: 0.32, foreground: [],
}

/** Calibration belongs to the item, including decorative items that occupy no floor area. */
export const HOME_FURNITURE: Record<HomeLayerId, HomeFurnitureDefinition> = {
  sofa: {
    id: 'sofa', initial: { x: 2.4, z: 1 }, footprint: { width: 3.2, depth: 1 }, plane: 'furniture',
    width: 0.245, anchor: 0.5, frontOffset: 0.5, lift: 0, floor: null,
    bounds: { standard: [23, 121, 1762, 843], alternate: [19, 111, 1766, 844] }, variants: ['standard', 'alternate'],
    uses: { sit: sofaSeat, read: sofaSeat },
  },
  coffee: {
    id: 'coffee', initial: { x: 6.15, z: 2.65 }, footprint: { width: 0.65, depth: 0.65 }, plane: 'furniture',
    width: 0.07, anchor: 0.5, frontOffset: 0.325, lift: 0, floor: null,
    bounds: { standard: [175, 26, 908, 1498], alternate: [175, 26, 908, 1498] }, variants: ['standard'], uses: {},
  },
  desk: {
    id: 'desk', initial: { x: 5.35, z: 0.25 }, footprint: { width: 2.5, depth: 0.5 }, plane: 'furniture',
    width: 0.1665, anchor: 0.5, frontOffset: 0.25, lift: 0, floor: null,
    bounds: { standard: [24, 158, 1512, 851], alternate: [24, 158, 1512, 851] }, variants: ['standard'], uses: {},
  },
  chair: {
    id: 'chair', initial: { x: 5.55, z: 0.65 }, footprint: { width: 0.9, depth: 0.9 }, plane: 'furniture',
    width: 0.07, anchor: 0.5, frontOffset: 0.45, lift: 0, floor: null,
    bounds: { standard: [189, 50, 1186, 1169], alternate: [189, 50, 1186, 1169] }, variants: ['standard'], uses: { sit: chairSeat, read: chairSeat },
  },
  bed: {
    id: 'bed', initial: { x: 8, z: 1.8 }, footprint: { width: 2.7, depth: 3.6 }, plane: 'furniture',
    width: 0.289, anchor: 0.544, frontOffset: 1.8, lift: 0, floor: null,
    bounds: { standard: [187, 159, 1523, 868], alternate: [187, 159, 1523, 868] }, variants: ['standard'],
    uses: { sit: bedSeat, lie: bedRest, read: bedSeat },
  },
  kitchen: {
    id: 'kitchen', initial: { x: 0.7, z: 4.1 }, footprint: { width: 1.2, depth: 3.5 }, plane: 'furniture',
    width: 0.27, anchor: 0.273, frontOffset: 1.75, lift: 0, floor: null,
    bounds: { standard: [37, 59, 1207, 1148], alternate: [37, 59, 1207, 1148] }, variants: ['standard'], uses: {},
  },
  phone: {
    id: 'phone', initial: { x: 7.1, z: 7.35 }, footprint: { width: 0.8, depth: 0.7 }, plane: 'furniture',
    width: 0.14, anchor: 0.531, frontOffset: 0.35, lift: 0, floor: null,
    bounds: { standard: [239, 92, 1098, 1097], alternate: [239, 92, 1098, 1097] }, variants: ['standard'], uses: {},
  },
  plant: {
    id: 'plant', initial: { x: 4.1, z: 2 }, footprint: { width: 0.5, depth: 0.6 }, plane: 'furniture',
    width: 0.08, anchor: 0.5, frontOffset: 0.3, lift: 0, floor: null,
    bounds: { standard: [19, 14, 999, 1501], alternate: [19, 14, 999, 1501] }, variants: ['standard'], uses: {},
  },
  rug: {
    id: 'rug', initial: { x: 4.4, z: 3.9 }, footprint: null, plane: 'floor',
    width: 0, anchor: 0.5, frontOffset: 0, lift: 0, floor: { width: 5.1, depth: 4.9 },
    bounds: { standard: [17, 103, 1238, 1153], alternate: [17, 103, 1238, 1153] }, variants: ['standard'], uses: {},
  },
  curtains: {
    id: 'curtains', initial: { x: 4.65, z: 0 }, footprint: null, plane: 'wall',
    width: 0.44, anchor: 0.5, frontOffset: 0, lift: 0.02, floor: null,
    bounds: { standard: [7, 10, 1664, 921], alternate: [7, 10, 1664, 921] }, variants: ['standard'], uses: {},
  },
  shelf: {
    id: 'shelf', initial: { x: 8.75, z: 0 }, footprint: null, plane: 'wall',
    width: 0.15, anchor: 0.5, frontOffset: 0, lift: 0.13, floor: null,
    bounds: { standard: [113, 28, 1423, 1011], alternate: [113, 28, 1423, 1011] }, variants: ['standard'], uses: {},
  },
}

/**
 * Resolve an item's floor offset using its placement and physical scale.
 * @param placement - Committed floor center and scale.
 * @param offset - Authored relative floor coordinates.
 * @returns Absolute coordinates in metres.
 */
export function furnitureFloorPoint(placement: HomeLayerPlacement, offset: RoomPoint): RoomPoint {
  return { x: placement.x + offset.x * placement.scale, z: placement.z + offset.z * placement.scale }
}

/**
 * Keep the resident's floor clearance constant when the target furniture changes size.
 * @param placement - Committed floor center and furniture scale.
 * @param use - Authored approach offset and resident stand-off distance.
 * @returns The unobstructed approach candidate, before route validation.
 */
export function furnitureApproach(placement: HomeLayerPlacement, use: FurnitureUseDefinition): RoomPoint {
  const point = furnitureFloorPoint(placement, use.approach)
  return { x: point.x + use.standOff.x, z: point.z + use.standOff.z }
}

/**
 * Resolve the same image rectangle for painting, picking, and body attachments.
 * @param id - Authored item identifier.
 * @param layout - Committed room placement and artwork variant.
 * @param viewport - Displayed wallpaper dimensions in CSS pixels.
 * @returns Rectangle in CSS pixels with the front ground anchor registered to the floor.
 */
export function furnitureRectangle(
  id: HomeLayerId, layout: HomeLayout, viewport: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const art = HOME_FURNITURE[id], placement = layout.layers[id]
  const [left, top, right, bottom] = art.bounds[placement.variant]
  const point = projectFloor(furnitureFloorPoint(placement, { x: 0, z: art.frontOffset }))
  const scale = placement.scale * projectFloor(placement).scale / projectFloor(art.initial).scale
  const width = art.width * viewport.width * scale
  const height = width * (bottom - top) / (right - left)
  return { x: point.x * viewport.width - width * art.anchor, y: (point.y - art.lift) * viewport.height - height, width, height }
}
