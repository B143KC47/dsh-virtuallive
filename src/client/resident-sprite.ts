/** Articulated two-dimensional identity and clothing layers for every resident pose. */
import type { ResidentExpression } from '../types.ts'
import type { ResidentArtwork, ResidentDirection } from './resident-art.ts'
import { residentGait } from './resident-motion.ts'
import { residentBoneDeformation, residentSkeleton, type ResidentPosture } from './resident-skeleton.ts'
import { residentEyePoint, residentFaceState, residentProps } from './resident-expression.ts'
import type { ResidentMeshLayer } from './resident-surface.ts'

/** Current floor or furniture attachment and optional decorative motion. */
export interface SpritePlacement {
  x: number
  y: number
  height: number
  moving: boolean
  facing: number
  time: number
  motion: boolean
  speaking: boolean
  distance: number
  /** Continuous start/stop blend; the journey distance freezes when the route ends. */
  walkAmount: number
  posture: ResidentPosture
  /** Authored rotation around the furniture attachment, in radians. */
  rotation?: number
  /** Canvas-pixel floor level constrains the feet when seated. */
  groundY?: number
  /** Canvas-pixel displacement for one full stride along the current floor direction. */
  stride: { x: number; y: number }
  /** Exact projected stride fraction; omission uses the linear canvas displacement. */
  projectStride?: (amount: number) => { x: number; y: number }
}

/**
 * Select authored directional linework for both motion and the final resting direction.
 * @param facing - World-floor bearing retained after a journey ends.
 * @returns A view and horizontal reflection for that bearing.
 */
export function residentDirection(facing: number): { direction: ResidentDirection; mirror: number } {
  if (Math.abs(Math.cos(facing)) > 0.7) return { direction: Math.cos(facing) < 0 ? 'back' : 'front', mirror: 1 }
  return { direction: 'side', mirror: Math.sin(facing) < 0 ? -1 : 1 }
}

/**
 * Articulate registered layers around one shared skeleton without replacing the outfit.
 * @param context - Room-owned canvas drawing context.
 * @param artwork - Decoded directional identity, wardrobe, and prop textures.
 * @param expression - Resident-authored visible activity.
 * @param placement - Position, direction, posture, and animation time.
 */
export function drawResident(
  context: CanvasRenderingContext2D, artwork: ResidentArtwork, expression: ResidentExpression, placement: SpritePlacement,
): void {
  const { direction, mirror } = residentDirection(placement.facing), rig = artwork[expression.outfit][direction]
  const projectStride = placement.projectStride
  const gait = residentGait({ ...placement, stride: { x: placement.stride.x * mirror, y: placement.stride.y },
    ...(projectStride ? { projectStride: (amount: number) => {
      const point = projectStride(amount)
      return { x: point.x * mirror, y: point.y }
    } } : {}),
  }, direction === 'side')
  const poseInput = { ...placement, activity: expression.activity,
    ...(placement.groundY !== undefined ? { ground: (placement.groundY - placement.y) / placement.height } : {}),
  }
  const walking = placement.walkAmount > 0 && (placement.posture === 'walking' || placement.posture === 'standing')
  const bones = residentSkeleton(rig.bones, poseInput, gait, direction === 'side', walking ? 'walking' : placement.posture)
  if (walking && placement.walkAmount < 1) {
    const standing = residentSkeleton(rig.bones, poseInput, gait, direction === 'side', 'standing')
    for (const id of Object.keys(bones) as (keyof typeof bones)[]) {
      for (const end of ['start', 'end'] as const) {
        bones[id][end] = { x: standing[id][end].x + (bones[id][end].x - standing[id][end].x) * placement.walkAmount,
          y: standing[id][end].y + (bones[id][end].y - standing[id][end].y) * placement.walkAmount }
      }
    }
  }
  const face = residentFaceState(expression, placement)
  const props = residentProps(artwork.props, expression.activity, bones, direction)
  const layers: ResidentMeshLayer[] = []
  for (const layer of rig.layers) {
    if (layer.id === 'nearForearm') layers.push(...props)
    const attach = residentBoneDeformation(rig.bones[layer.bone], bones[layer.bone])
    layers.push({ mesh: layer.mesh, deform: (point) => {
      if (layer.id === 'head') return attach(residentEyePoint(point, direction, face.eyes))
      const posed = attach(placement.posture === 'lying' && layer.id === 'skirt' ? { x: point.x * 0.7, y: point.y } : point)
      if (placement.posture === 'lying' && (layer.id === 'backHair' || layer.id === 'tail')) {
        const root = bones[layer.bone].start
        return { x: posed.x, y: root.y + (posed.y - root.y) * (layer.id === 'backHair' ? 0.38 : 0.55) }
      }
      if (layer.id !== 'skirt' || placement.posture !== 'sitting' || point.y <= rig.bones.torso.start.y) return posed
      const progress = Math.min(1, (point.y - rig.bones.torso.start.y) / 0.15)
      const knee = bones.nearThigh.end, pelvis = bones.torso.start
      const floor = placement.groundY === undefined ? Infinity : (placement.groundY - placement.y) / placement.height - 0.025
      const hem = Math.min(knee.y + 0.08, floor)
      return { x: pelvis.x + (posed.x - pelvis.x) * (1 - progress * 0.35) + (knee.x - pelvis.x) * progress,
        y: pelvis.y + (hem - pelvis.y) * progress }
    } })
  }
  context.save()
  context.translate(placement.x, placement.y)
  context.rotate(placement.rotation ?? 0)
  context.scale(mirror, 1)
  const view = placement.posture === 'lying' ? { left: -0.8, top: -0.6, width: 1.6, height: 1.2 }
    : placement.posture === 'sitting' ? { left: -0.65, top: -0.8, width: 1.3, height: 1.25 }
      : { left: -0.7, top: -1.15, width: 1.4, height: 1.25 }
  artwork.surface.draw(context, placement.height, layers, view)
  if (direction !== 'back' && face.mouth > 0.08) {
    const attach = residentBoneDeformation(rig.bones.head, bones.head)
    const mouth = attach({ x: direction === 'side' ? 0.087 : 0, y: direction === 'side' ? -0.790 : -0.792 })
    context.fillStyle = '#805259'; context.beginPath()
    context.ellipse(mouth.x * placement.height, mouth.y * placement.height,
      placement.height * 0.005, placement.height * (0.001 + face.mouth * 0.004), 0, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}
