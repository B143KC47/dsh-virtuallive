/** Painted layer registration and neutral joints for the resident's two-dimensional skeleton. */
import type { ResidentMesh } from './resident-mesh.ts'
import type { ResidentPoint } from './resident-motion.ts'
import type { ResidentBone, ResidentBoneId, ResidentSkeleton } from './resident-skeleton.ts'

/** One complete painted part, including hidden overlap at both joints. */
export interface ResidentLayerRegistration {
  id: ResidentBoneId | 'headband'
  bone: ResidentBoneId
  left: number
  top: number
  width: number
  height: number
  start: ResidentPoint
  end: ResidentPoint
  widthScale: number
  mirrorX: boolean
}

/** Measured native image rectangles share one outfit-independent set of joints. */
export interface ResidentRigRegistration { width: number; height: number; layers: readonly ResidentLayerRegistration[] }

/** One decoded layer atlas and its neutral skeleton are owned by the mounted room. */
export interface ResidentRig {
  bones: ResidentSkeleton
  layers: readonly { id: ResidentLayerRegistration['id']; bone: ResidentBoneId; mesh: ResidentMesh }[]
}

/**
 * Construct relaxed, upright joint locations for a directional character drawing.
 * @param side - A profile view overlaps the hips; depth-facing views retain their lateral separation.
 * @returns The same neutral anatomy for every clothing variant.
 */
export function residentNeutralSkeleton(side: boolean): ResidentSkeleton {
  const pelvis = { x: 0, y: -0.39 }, neck = { x: side ? 0.012 : 0, y: -0.74 }
  const head = { x: side ? 0.025 : 0, y: -0.86 }
  const bone = (start: ResidentPoint, end: ResidentPoint): ResidentBone => ({ start, end })
  const arm = (near: boolean): { upper: ResidentBone; lower: ResidentBone } => {
    const x = side ? near ? -0.05 : 0.045 : near ? 0.1 : -0.1
    const shoulder = { x, y: -0.70 }, elbow = { x: x + (side ? -0.006 : near ? 0.018 : -0.018), y: -0.55 }
    return { upper: bone(shoulder, elbow), lower: bone(elbow, { x: elbow.x + (side ? 0.02 : 0), y: -0.41 }) }
  }
  const leg = (near: boolean): { thigh: ResidentBone; shin: ResidentBone; shoe: ResidentBone } => {
    const x = side ? near ? 0.008 : -0.008 : near ? 0.035 : -0.035
    const soleY = side ? near ? 0.004 : -0.004 : 0
    return { thigh: bone({ x, y: -0.39 }, { x, y: -0.225 }),
      shin: bone({ x, y: -0.225 }, { x, y: -0.06 + soleY }),
      shoe: bone({ x: x + (side ? 0.026 : 0), y: soleY }, { x: x + (side ? 0.126 : 0.1), y: soleY }) }
  }
  const nearArm = arm(true), farArm = arm(false), nearLeg = leg(true), farLeg = leg(false)
  return {
    torso: bone(pelvis, neck), head: bone(neck, head),
    backHair: bone({ x: side ? -0.08 : 0, y: head.y }, { x: side ? -0.13 : 0, y: -0.40 }),
    frontHair: bone(head, { x: side ? 0.035 : 0, y: -0.70 }),
    tail: bone({ x: -0.08, y: -0.32 }, { x: side ? -0.30 : -0.28, y: -0.48 }),
    skirt: bone({ x: 0, y: -0.60 }, { x: 0, y: -0.24 }),
    nearUpperArm: nearArm.upper, nearForearm: nearArm.lower, farUpperArm: farArm.upper, farForearm: farArm.lower,
    nearThigh: nearLeg.thigh, nearShin: nearLeg.shin, nearShoe: nearLeg.shoe,
    farThigh: farLeg.thigh, farShin: farLeg.shin, farShoe: farLeg.shoe,
  }
}

/**
 * Register crop-centered painted pieces onto shared neutral bones.
 * @param image - Decoded transparent layer sheet retained by the mounted artwork.
 * @param registration - Native rectangles and measured joints for every part.
 * @param side - Whether the atlas depicts a profile rather than a depth-facing view.
 * @returns Rigid layer quads ready for bone articulation.
 */
export function createResidentRig(image: HTMLImageElement, registration: ResidentRigRegistration, side: boolean): ResidentRig {
  const bones = residentNeutralSkeleton(side)
  return { bones, layers: registration.layers.map((part) => {
    const mirror = (point: ResidentPoint): ResidentPoint => part.mirrorX ? { x: 2 * part.left + part.width - point.x, y: point.y } : point
    const source = { start: mirror(part.start), end: mirror(part.end) }, target = bones[part.bone]
    const sourceLength = Math.hypot(source.end.x - source.start.x, source.end.y - source.start.y)
    const targetLength = Math.hypot(target.end.x - target.start.x, target.end.y - target.start.y)
    const axis = { x: (source.end.x - source.start.x) / sourceLength, y: (source.end.y - source.start.y) / sourceLength }
    const scale = targetLength / sourceLength * part.widthScale
    const targetAxis = { x: (target.end.x - target.start.x) / targetLength, y: (target.end.y - target.start.y) / targetLength }
    const columns = part.id === 'head' ? 32 : part.bone === 'skirt' ? 8 : 1
    const rows = part.id === 'head' ? 40 : part.bone === 'skirt' ? 12 : 1
    const points = Array.from({ length: (columns + 1) * (rows + 1) }, (_, index) => {
      const native = { x: part.left + index % (columns + 1) / columns * part.width,
        y: part.top + Math.floor(index / (columns + 1)) / rows * part.height }
      const point = mirror(native), dx = point.x - source.start.x, dy = point.y - source.start.y
      const along = (dx * axis.x + dy * axis.y) * targetLength / sourceLength
      const across = (-dx * axis.y + dy * axis.x) * scale
      return { x: target.start.x + along * targetAxis.x - across * targetAxis.y,
        y: target.start.y + along * targetAxis.y + across * targetAxis.x }
    })
    const root = part.bone.endsWith('Forearm') || part.bone.endsWith('Thigh') || part.bone.endsWith('Shin')
    const tip = part.bone.endsWith('UpperArm') || part.bone.endsWith('Thigh') || part.bone.endsWith('Shin')
    const canvas = document.createElement('canvas'); canvas.width = part.width; canvas.height = part.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The browser could not prepare resident limb layers')
    context.drawImage(image, part.left, part.top, part.width, part.height, 0, 0, part.width, part.height)
    removeAtlasFragments(context, part.width, part.height)
    if (part.bone === 'backHair') {
      context.globalCompositeOperation = 'destination-in'
      context.beginPath(); context.moveTo(part.width * 0.32, 0); context.lineTo(part.width * 0.68, 0)
      context.lineTo(part.width, part.height * 0.26); context.lineTo(part.width, part.height)
      context.lineTo(0, part.height); context.lineTo(0, part.height * 0.26); context.closePath(); context.fill()
    }
    if (!root && !tip) return { id: part.id, bone: part.bone, mesh: { image: canvas, points, columns, rows,
      texture: { left: 0, top: 0, width: part.width, height: part.height } } }
    const nativeAxis = { x: (part.end.x - part.start.x) / sourceLength, y: (part.end.y - part.start.y) / sourceLength }
    const overlap = sourceLength * 0.008 / targetLength, extent = sourceLength + overlap * 2
    const gradient = context.createLinearGradient(
      part.start.x - part.left - nativeAxis.x * overlap, part.start.y - part.top - nativeAxis.y * overlap,
      part.end.x - part.left + nativeAxis.x * overlap, part.end.y - part.top + nativeAxis.y * overlap,
    )
    gradient.addColorStop(0, root ? 'rgba(0,0,0,0)' : 'black')
    gradient.addColorStop(overlap / extent, 'black')
    gradient.addColorStop(1 - overlap / extent, 'black')
    gradient.addColorStop(1, tip ? 'rgba(0,0,0,0)' : 'black')
    context.globalCompositeOperation = 'destination-in'; context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height)
    return { id: part.id, bone: part.bone, mesh: { image: canvas, points, columns, rows,
      texture: { left: 0, top: 0, width: part.width, height: part.height } } }
  }) }
}

function removeAtlasFragments(context: CanvasRenderingContext2D, width: number, height: number): void {
  const pixels = context.getImageData(0, 0, width, height), groups = new Int32Array(width * height)
  const queue = new Int32Array(width * height), sizes = [0]
  for (let index = 0; index < groups.length; index++) {
    if (groups[index] || !pixels.data[index * 4 + 3]) continue
    const group = sizes.length
    let read = 0, end = 1; queue[0] = index; groups[index] = group
    while (read < end) {
      const current = queue[read++] as number, x = current % width, y = Math.floor(current / width)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const next = ny * width + nx
          if (!groups[next] && pixels.data[next * 4 + 3]) { groups[next] = group; queue[end++] = next }
        }
      }
    }
    sizes.push(end)
  }
  const minimum = Math.max(...sizes) * 0.025
  for (let index = 0; index < groups.length; index++) {
    if ((sizes[groups[index] as number] as number) < minimum) pixels.data[index * 4 + 3] = 0
  }
  context.putImageData(pixels, 0, 0)
}

/**
 * Replace clothing pieces while retaining the identity layers and their joint registration.
 * @param base - Directional identity and complete casual clothing.
 * @param wardrobe - Only the painted pieces that the outfit replaces or adds.
 * @returns A complete outfit sharing the base skeleton and unchanged identity textures.
 */
export function dressResidentRig(base: ResidentRig, wardrobe: ResidentRig): ResidentRig {
  const replacements = new Map(wardrobe.layers.map(layer => [layer.id, layer]))
  const layers = base.layers.map(layer => replacements.get(layer.id) ?? layer)
  for (const layer of wardrobe.layers) if (!base.layers.some(existing => existing.id === layer.id)) layers.push(layer)
  return { bones: base.bones, layers }
}
