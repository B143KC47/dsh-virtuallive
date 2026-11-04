/** The layered resident keeps shared joints attached through standing, walking, and furniture poses. */
import { expect, it } from 'vitest'
import { residentNeutralSkeleton } from '../src/client/resident-rig.ts'
import { residentSkeleton, residentBoneDeformation, type ResidentBone } from '../src/client/resident-skeleton.ts'
import { residentGait, RESIDENT_STRIDE_DISTANCE } from '../src/client/resident-motion.ts'
import type { ResidentActivity } from '../src/types.ts'

const rest = residentNeutralSkeleton(true)
const clock = { time: 0, motion: true }
const sample = (phase: number) => residentGait({ height: 300, stride: { x: 136, y: 0 }, distance: phase * RESIDENT_STRIDE_DISTANCE }, true)
const length = (bone: ResidentBone) => Math.hypot(bone.end.x - bone.start.x, bone.end.y - bone.start.y)

it('keeps every walking arm and leg connected without lengthening the painted limb', () => {
  for (let tick = 0; tick < 120; tick++) {
    const pose = residentSkeleton(rest, clock, sample(tick / 120), true, 'walking')
    for (const [upper, lower] of [
      ['nearUpperArm', 'nearForearm'], ['farUpperArm', 'farForearm'], ['nearThigh', 'nearShin'], ['farThigh', 'farShin'],
    ] as const) {
      expect(pose[upper].end).toEqual(pose[lower].start)
      expect(length(pose[upper])).toBeCloseTo(length(rest[upper]), 10)
      expect(length(pose[lower])).toBeCloseTo(length(rest[lower]), 10)
    }
  }
})

it('moves the near arm opposite the advancing near foot and leaves the head upright', () => {
  const forward = residentSkeleton(rest, clock, sample(0), true, 'walking')
  const backward = residentSkeleton(rest, clock, sample(0.5), true, 'walking')
  expect(forward.nearShoe.start.x).toBeGreaterThan(backward.nearShoe.start.x)
  expect(forward.nearForearm.end.x).toBeLessThan(backward.nearForearm.end.x)
  for (const pose of [forward, backward]) {
    const lean = (pose.head.end.x - pose.head.start.x) / (pose.head.start.y - pose.head.end.y)
    expect(Math.abs(lean)).toBeLessThan(0.15)
  }
})

it('transfers support continuously through both heel contact and toe release', () => {
  for (const phase of [0.1, 0.5, 0.6, 1]) {
    const before = residentSkeleton(rest, clock, sample(phase - 0.00001), true, 'walking')
    const after = residentSkeleton(rest, clock, sample(phase + 0.00001), true, 'walking')
    for (const bone of ['torso', 'head', 'nearThigh', 'nearShin', 'farThigh', 'farShin'] as const) {
      expect(Math.hypot(before[bone].start.x - after[bone].start.x, before[bone].start.y - after[bone].start.y)).toBeLessThan(0.0001)
      expect(Math.hypot(before[bone].end.x - after[bone].end.x, before[bone].end.y - after[bone].end.y)).toBeLessThan(0.0001)
    }
  }
})

it('anchors sitting at the pelvis with thighs over the seat and feet below the knees', () => {
  const pose = residentSkeleton(rest, { ...clock, motion: false }, sample(0), true, 'sitting')
  expect(pose.torso.start).toEqual({ x: 0, y: 0 })
  for (const [thigh, shin, shoe] of [['nearThigh', 'nearShin', 'nearShoe'], ['farThigh', 'farShin', 'farShoe']] as const) {
    expect(pose[thigh].end.x).toBeGreaterThan(pose[thigh].start.x)
    expect(pose[shin].end.y).toBeGreaterThan(pose[shin].start.y)
    expect(pose[shoe].start.y).toBeGreaterThan(pose[shin].end.y)
  }
})

it('preserves painted width while mapping the attachment joints onto their animated locations', () => {
  const source = { start: { x: 10, y: 20 }, end: { x: 10, y: 100 } }
  const target = { start: { x: 3, y: 4 }, end: { x: 63, y: 84 } }
  const deform = residentBoneDeformation(source, target)
  expect(deform(source.start)).toEqual(target.start)
  expect(deform(source.end)).toEqual(target.end)
  const a = deform({ x: 7, y: 60 }), b = deform({ x: 13, y: 60 })
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(6, 10)
})

it('bends seated legs above a low floor and lets them dangle from a taller seat without stretching', () => {
  for (const ground of [0.05, 0.12, 0.25, 0.45]) {
    const pose = residentSkeleton(rest, { ...clock, ground }, sample(0), true, 'sitting')
    for (const [thigh, shin, shoe] of [['nearThigh', 'nearShin', 'nearShoe'], ['farThigh', 'farShin', 'farShoe']] as const) {
      expect(pose[shoe].start.y).toBeLessThanOrEqual(ground)
      expect(pose[thigh].end).toEqual(pose[shin].start)
      expect(length(pose[thigh])).toBeCloseTo(length(rest[thigh]), 10)
      expect(length(pose[shin])).toBeCloseTo(length(rest[shin]), 10)
    }
    if (ground === 0.45) expect(pose.nearShoe.start.y).toBeLessThan(ground - 0.1)
  }
})

it('anchors a supine pose at the torso center with the face above the mattress and the hair resting along it', () => {
  const pose = residentSkeleton(rest, { ...clock, motion: false }, sample(0), true, 'lying')
  expect((pose.torso.start.x + pose.torso.end.x) / 2).toBeCloseTo(0, 12)
  expect((pose.torso.start.y + pose.torso.end.y) / 2).toBeCloseTo(0, 12)
  expect(pose.head.end.x).toBeLessThan(pose.torso.end.x)
  const head = residentBoneDeformation(rest.head, pose.head)
  expect(head({ x: rest.head.end.x + 0.05, y: rest.head.end.y }).y).toBeLessThan(head(rest.head.end).y)
  expect(pose.backHair.end.y - pose.backHair.start.y).toBeLessThan(0.03)
})

it('keeps the idle soles fixed while breathing and hair continue to change', () => {
  const heads = new Set<string>(), hair = new Set<string>()
  for (let tick = 0; tick < 180; tick++) {
    const pose = residentSkeleton(rest, { time: tick / 60, motion: true }, sample(0), true, 'standing')
    for (const shoe of ['nearShoe', 'farShoe'] as const) {
      expect(pose[shoe].start.x).toBeCloseTo(rest[shoe].start.x, 12)
      expect(pose[shoe].start.y).toBeCloseTo(rest[shoe].start.y, 12)
      expect(pose[shoe].end.x).toBeCloseTo(rest[shoe].end.x, 12)
      expect(pose[shoe].end.y).toBeCloseTo(rest[shoe].end.y, 12)
    }
    heads.add(JSON.stringify(pose.head)); hair.add(JSON.stringify(pose.backHair))
  }
  expect(heads.size).toBe(180); expect(hair.size).toBe(180)
})

it('holds activity poses still under reduced motion and preserves elbow attachment when animated', () => {
  const activities: ResidentActivity[] = ['waving', 'thinking', 'reading', 'phone', 'eating', 'dancing', 'sleeping']
  for (const activity of activities) {
    const first = residentSkeleton(rest, { time: 0, motion: false, activity }, sample(0), true, 'standing')
    const later = residentSkeleton(rest, { time: 4, motion: false, activity }, sample(0), true, 'standing')
    expect(later).toEqual(first)
    for (let tick = 0; tick < 60; tick++) {
      const pose = residentSkeleton(rest, { time: tick / 30, motion: true, activity }, sample(0), true, 'standing')
      expect(pose.nearUpperArm.end).toEqual(pose.nearForearm.start)
      expect(pose.farUpperArm.end).toEqual(pose.farForearm.start)
    }
  }
})
