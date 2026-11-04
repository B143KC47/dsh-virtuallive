/** Neutral two-dimensional bones share joint locations across clothing layers. */
import type { ResidentGait, ResidentPoint } from './resident-motion.ts'
import type { SpritePlacement } from './resident-sprite.ts'
import type { ResidentActivity } from '../types.ts'

/** Independently painted pieces attach to these articulated bones. */
export type ResidentBoneId = 'torso' | 'head' | 'backHair' | 'frontHair' | 'tail' | 'skirt'
  | 'farUpperArm' | 'farForearm' | 'nearUpperArm' | 'nearForearm'
  | 'farThigh' | 'farShin' | 'farShoe' | 'nearThigh' | 'nearShin' | 'nearShoe'

/** A bone's endpoints use crown-to-sole units, with standing soles at zero. */
export interface ResidentBone { start: ResidentPoint; end: ResidentPoint }

/** Clothing variants register to the same neutral joints. */
export type ResidentSkeleton = Record<ResidentBoneId, ResidentBone>

/** Furniture poses use the pelvis or torso as their drawing origin. */
export type ResidentPosture = 'standing' | 'walking' | 'sitting' | 'lying'

/**
 * Place rigid painted limbs around shared joints while preserving their lengths.
 * @param rest - Neutral source joints for the selected camera view.
 * @param placement - Animation time, activity, and optional floor level relative to the attachment.
 * @param gait - Floor-relative shoes for a walking pose.
 * @param side - Whether knees and elbows bend visibly in profile.
 * @param posture - Furniture poses change the drawing origin to their attachment.
 * @returns Target bones for every painted layer.
 */
export function residentSkeleton(
  rest: ResidentSkeleton, placement: Pick<SpritePlacement, 'time' | 'motion'> & { activity?: ResidentActivity; ground?: number },
  gait: ResidentGait, side: boolean, posture: ResidentPosture,
): ResidentSkeleton {
  const walking = posture === 'walking' && placement.motion
  const dancing = placement.activity === 'dancing' && posture === 'standing' && placement.motion
  const phase = gait.phase * Math.PI * 2
  const leftSole = walking ? gait.left : rest.farShoe.start
  const rightSole = walking ? gait.right : rest.nearShoe.start
  const leftAngle = walking ? gait.left.angle : 0, rightAngle = walking ? gait.right.angle : 0
  const leftAnkle = add(leftSole, rotate(subtract(rest.farShin.end, rest.farShoe.start), leftAngle))
  const rightAnkle = add(rightSole, rotate(subtract(rest.nearShin.end, rest.nearShoe.start), rightAngle))
  const pelvis = rest.torso.start
  let displacement: ResidentPoint = { x: 0, y: 0 }
  if (walking && side) {
    const reach = (thigh: ResidentBone, shin: ResidentBone, ankle: ResidentPoint): number => {
      const length = (boneLength(thigh) + boneLength(shin)) * 0.997
      return ankle.y - Math.sqrt(Math.max(0, length * length - (ankle.x - thigh.start.x) ** 2))
    }
    displacement = { x: 0, y: Math.max(
      reach(rest.farThigh, rest.farShin, leftAnkle) - rest.farThigh.start.y,
      reach(rest.nearThigh, rest.nearShin, rightAnkle) - rest.nearThigh.start.y,
    ) }
  } else if (walking) {
    displacement = { x: Math.sin(phase) * 0.005, y: -gait.lift }
  } else if (posture === 'sitting') {
    displacement = { x: -pelvis.x, y: -pelvis.y }
  } else if (dancing) {
    displacement = { x: Math.sin(placement.time * 3.4) * 0.014, y: -(Math.sin(placement.time * 3.4) ** 2) * 0.003 }
  }
  const lean = dancing ? Math.sin(placement.time * 3.4) * 0.035 : walking && side ? 0.025 : 0
  const body = (point: ResidentPoint): ResidentPoint => {
    const moved = add(add(pelvis, displacement), rotate(subtract(point, pelvis), lean))
    const breath = posture === 'standing' && placement.motion ? Math.sin(placement.time * 1.7) * 0.0015 : 0
    return { x: moved.x, y: moved.y - breath * Math.max(0, Math.min(1, (pelvis.y - point.y) / 0.35)) }
  }
  const translated = (bone: ResidentBone): ResidentBone => ({ start: body(bone.start), end: body(bone.end) })
  const result: ResidentSkeleton = {
    torso: translated(rest.torso), head: translated(rest.head), backHair: translated(rest.backHair),
    frontHair: translated(rest.frontHair), tail: translated(rest.tail), skirt: translated(rest.skirt),
    farUpperArm: translated(rest.farUpperArm), farForearm: translated(rest.farForearm),
    nearUpperArm: translated(rest.nearUpperArm), nearForearm: translated(rest.nearForearm),
    farThigh: translated(rest.farThigh), farShin: translated(rest.farShin), farShoe: translated(rest.farShoe),
    nearThigh: translated(rest.nearThigh), nearShin: translated(rest.nearShin), nearShoe: translated(rest.nearShoe),
  }
  for (const [thighId, shinId, shoeId, sole, ankle, angle] of [
    ['farThigh', 'farShin', 'farShoe', leftSole, leftAnkle, leftAngle],
    ['nearThigh', 'nearShin', 'nearShoe', rightSole, rightAnkle, rightAngle],
  ] as const) {
    const hip = body(rest[thighId].start)
    if (posture === 'sitting') {
      const thigh = boneLength(rest[thighId]), shin = boneLength(rest[shinId])
      let knee = add(hip, { x: side ? thigh * Math.sqrt(0.96) : 0, y: thigh * 0.2 })
      let seatedAnkle = add(knee, { x: 0, y: shin })
      const soleOffset = subtract(rest[shoeId].start, rest[shinId].end)
      if (placement.ground !== undefined && seatedAnkle.y + soleOffset.y > placement.ground) {
        seatedAnkle = { x: seatedAnkle.x, y: placement.ground - soleOffset.y }
        knee = kneeAt(hip, seatedAnkle, thigh, shin)
      }
      result[thighId] = { start: hip, end: knee }
      result[shinId] = { start: knee, end: seatedAnkle }
      const seatedSole = add(seatedAnkle, soleOffset)
      result[shoeId] = { start: seatedSole, end: add(seatedSole, subtract(rest[shoeId].end, rest[shoeId].start)) }
    } else if (walking) {
      const knee = side ? kneeAt(hip, ankle, boneLength(rest[thighId]), boneLength(rest[shinId]))
        : { x: (hip.x + ankle.x) / 2, y: (hip.y + ankle.y) / 2 }
      result[thighId] = { start: hip, end: knee }
      result[shinId] = { start: knee, end: ankle }
      result[shoeId] = { start: sole, end: add(sole, rotate(subtract(rest[shoeId].end, rest[shoeId].start), angle)) }
    }
  }
  if (walking) {
    for (const [upperId, lowerId, direction] of [
      ['nearUpperArm', 'nearForearm', 1], ['farUpperArm', 'farForearm', -1],
    ] as const) {
      const shoulder = body(rest[upperId].start), swing = Math.cos(phase) * direction * (side ? 0.25 : 0.045)
      const elbow = add(shoulder, rotate({ x: 0, y: boneLength(rest[upperId]) }, swing))
      const wrist = add(elbow, rotate({ x: 0, y: boneLength(rest[lowerId]) }, swing - (side ? 0.16 : 0)))
      result[upperId] = { start: shoulder, end: elbow }
      result[lowerId] = { start: elbow, end: wrist }
    }
  }
  poseArms(result, rest, placement, side, posture)
  if (placement.motion) {
    const rhythm = walking ? phase : placement.time * 1.7
    const secondary = [['backHair', 0.018, 0.8], ['frontHair', 0.006, 0.4], ['tail', 0.04, 1.1], ['skirt', 0.012, 0.3]] as const
    for (const [id, amount, delay] of secondary) {
      const bone = result[id]
      result[id] = {
        start: bone.start, end: add(bone.start, rotate(subtract(bone.end, bone.start), Math.sin(rhythm - delay) * amount)),
      }
    }
  }
  if (posture === 'lying') {
    const origin = { x: (rest.torso.start.x + rest.torso.end.x) / 2, y: (rest.torso.start.y + rest.torso.end.y) / 2 }
    for (const id of Object.keys(result) as ResidentBoneId[]) {
      result[id] = {
        start: rotate(subtract(result[id].start, origin), -Math.PI / 2),
        end: rotate(subtract(result[id].end, origin), -Math.PI / 2),
      }
    }
    const hair = result.backHair, tail = result.tail
    result.backHair = { start: hair.start, end: { x: hair.end.x, y: hair.start.y + 0.025 } }
    result.tail = { start: tail.start, end: { x: tail.start.x + 0.24, y: tail.start.y + 0.015 } }
  }
  return result
}

function poseArms(
  result: ResidentSkeleton, rest: ResidentSkeleton,
  placement: { activity?: ResidentActivity; time: number; motion: boolean }, side: boolean, posture: ResidentPosture,
): void {
  const activity = placement.activity, pelvis = result.torso.start
  const reach = (near: boolean, target: ResidentPoint): void => {
    const upper = near ? 'nearUpperArm' : 'farUpperArm', lower = near ? 'nearForearm' : 'farForearm'
    const shoulder = result[upper].start, first = boneLength(rest[upper]), second = boneLength(rest[lower])
    const offset = subtract(target, shoulder), distance = Math.hypot(offset.x, offset.y)
    const length = Math.min(distance, (first + second) * 0.995)
    const wrist = add(shoulder, { x: offset.x * length / distance, y: offset.y * length / distance })
    const elbow = kneeAt(shoulder, wrist, first, second, side || !near ? -1 : 1)
    result[upper] = { start: shoulder, end: elbow }; result[lower] = { start: elbow, end: wrist }
  }
  const at = (x: number, y: number): ResidentPoint => add(pelvis, { x, y })
  if (activity === 'waving') {
    const shoulder = result.nearUpperArm.start, sway = placement.motion ? Math.sin(placement.time * 5) * 0.24 : 0
    const elbow = add(shoulder, rotate({ x: 0, y: -boneLength(rest.nearUpperArm) }, side ? -0.6 : 0.8))
    result.nearUpperArm = { start: shoulder, end: elbow }
    result.nearForearm = { start: elbow, end: add(elbow, rotate({ x: 0, y: -boneLength(rest.nearForearm) }, sway)) }
  } else if (activity === 'reading') {
    reach(false, at(side ? 0.13 : -0.09, -0.13)); reach(true, at(side ? 0.18 : 0.09, -0.12))
  } else if (activity === 'phone') {
    reach(true, at(side ? 0.17 : 0.09, -0.23))
  } else if (activity === 'thinking') {
    reach(true, at(side ? 0.09 : 0.035, -0.34))
  } else if (activity === 'eating') {
    const bite = placement.motion ? (1 - Math.cos(placement.time * 1.8)) / 2 : 0
    reach(false, at(side ? 0.17 : -0.065, -0.14))
    reach(true, at(side ? 0.16 - bite * 0.055 : 0.08 - bite * 0.055, -0.14 - bite * 0.17))
  } else if (activity === 'dancing') {
    const beat = placement.motion ? Math.sin(placement.time * 3.4) : 0
    reach(false, at(-0.22, -0.19 + beat * 0.045)); reach(true, at(0.22, -0.19 - beat * 0.045))
  } else if (posture === 'sitting') {
    reach(false, at(side ? 0.075 : -0.085, -0.025)); reach(true, at(side ? 0.09 : 0.085, -0.025))
  }
}

/**
 * Attach a layer to its bone without changing its painted cross-section.
 * @param source - Source bone measured on the transparent layer atlas.
 * @param target - Corresponding animated bone.
 * @returns Mapping used by the mount-owned GPU surface.
 */
export function residentBoneDeformation(source: ResidentBone, target: ResidentBone): (point: ResidentPoint) => ResidentPoint {
  const sourceLength = boneLength(source), targetLength = boneLength(target)
  const sourceAxis = subtract(source.end, source.start), targetAxis = subtract(target.end, target.start)
  const sx = sourceAxis.x / sourceLength, sy = sourceAxis.y / sourceLength
  const tx = targetAxis.x / targetLength, ty = targetAxis.y / targetLength
  return (point) => {
    const offset = subtract(point, source.start)
    const along = (offset.x * sx + offset.y * sy) * targetLength / sourceLength
    const across = -offset.x * sy + offset.y * sx
    return { x: target.start.x + along * tx - across * ty, y: target.start.y + along * ty + across * tx }
  }
}

function kneeAt(hip: ResidentPoint, ankle: ResidentPoint, thigh: number, shin: number, bendDirection = 1): ResidentPoint {
  const direction = subtract(ankle, hip), distance = Math.hypot(direction.x, direction.y)
  const along = Math.min(thigh, (distance * distance + thigh * thigh - shin * shin) / (2 * distance))
  const bend = Math.sqrt(Math.max(0, thigh * thigh - along * along)) * bendDirection
  return { x: hip.x + (direction.x * along + direction.y * bend) / distance,
    y: hip.y + (direction.y * along - direction.x * bend) / distance }
}

function boneLength(bone: ResidentBone): number { return Math.hypot(bone.end.x - bone.start.x, bone.end.y - bone.start.y) }
function add(a: ResidentPoint, b: ResidentPoint): ResidentPoint { return { x: a.x + b.x, y: a.y + b.y } }
function subtract(a: ResidentPoint, b: ResidentPoint): ResidentPoint { return { x: a.x - b.x, y: a.y - b.y } }
function rotate(point: ResidentPoint, angle: number): ResidentPoint {
  return { x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) }
}
