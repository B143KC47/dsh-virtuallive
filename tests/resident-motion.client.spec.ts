/** Continuous motion preserves painted shoes, floor contact, and closed-mouth idle frames. */
import { expect, it } from 'vitest'
import { RESIDENT_STRIDE_DISTANCE, residentGait, residentLocomotionAt } from '../src/client/resident-motion.ts'
import { projectFloor } from '../src/home-camera.ts'

const placement = { height: 200, stride: { x: 60, y: 20 }, distance: 0 }

it('settles the final stride without advancing its distance after the journey ends', () => {
  const journey = { path: [{ x: 1, z: 2 }, { x: 3, z: 2 }], startedAt: 1000, speed: 1 }
  expect(residentLocomotionAt(journey, 1000, true)).toEqual({ distance: 0, amount: 0 })
  expect(residentLocomotionAt(journey, 1180, true).amount).toBe(1)
  expect(residentLocomotionAt(journey, 3000, false)).toEqual({ distance: 2, amount: 1 })
  expect(residentLocomotionAt(journey, 3090, false)).toEqual({ distance: 2, amount: 0.5 })
  expect(residentLocomotionAt(journey, 3180, false)).toEqual({ distance: 2, amount: 0 })
  expect(residentLocomotionAt({ ...journey, path: [{ x: 1, z: 2 }] }, 1100, false)).toEqual({ distance: 0, amount: 0 })
})

it('keeps the heel, flat sole, and toe stationary through their supporting portions of a step', () => {
  for (const [name, begin] of [['right', 0], ['left', 0.5]] as const) {
    for (const [from, to] of [[0, 0.09], [0.1, 0.45], [0.47, 0.59]]) {
      const planted: { x: number; y: number }[] = []
      for (let tick = 0; tick < 20; tick++) {
        const phase = begin + (from as number) + tick / 20 * ((to as number) - (from as number))
        const foot = residentGait({ ...placement, distance: phase * RESIDENT_STRIDE_DISTANCE }, true)[name]
        expect(foot.contact).toBe(true)
        planted.push({
          x: (foot.x + foot.pivot * Math.cos(foot.angle)) * placement.height + phase * placement.stride.x,
          y: (foot.y + foot.pivot * Math.sin(foot.angle)) * placement.height + phase * placement.stride.y,
        })
      }
      for (const point of planted) {
        expect(point.x).toBeCloseTo(planted[0]?.x as number, 10)
        expect(point.y).toBeCloseTo(planted[0]?.y as number, 10)
      }
    }
  }
})

it('alternates supporting legs and raises only the returning shoe above the projected floor', () => {
  const first = residentGait({ ...placement, stride: { x: 60, y: 0 }, distance: RESIDENT_STRIDE_DISTANCE * 0.25 }, true)
  const second = residentGait({ ...placement, stride: { x: 60, y: 0 }, distance: RESIDENT_STRIDE_DISTANCE * 0.75 }, true)
  expect(first.right.contact).toBe(true)
  expect(first.right.y).toBe(0.004)
  expect(first.left.contact).toBe(false)
  expect(first.left.y).toBeLessThan(-0.035)
  expect(second.left.contact).toBe(true)
  expect(second.left.y).toBe(-0.004)
  expect(second.right.contact).toBe(false)
  expect(second.right.y).toBeLessThan(-0.035)
})

it('keeps a supporting depth-facing foot on the same floor point as perspective changes', () => {
  const soles: number[] = []
  for (let tick = 0; tick < 30; tick++) {
    const distance = tick / 60 * RESIDENT_STRIDE_DISTANCE, position = { x: 4.7, z: 3 + distance }
    const body = projectFloor(position), height = body.scale * 720
    const gait = residentGait({ height, distance, stride: { x: 0, y: 0 }, projectStride: (amount) => {
      const foot = projectFloor({ x: position.x, z: position.z + amount * RESIDENT_STRIDE_DISTANCE })
      return { x: (foot.x - body.x) * 1280, y: (foot.y - body.y) * 720 }
    } }, false)
    expect(gait.right.contact).toBe(true)
    soles.push(body.y * 720 + gait.right.y * height)
  }
  for (const sole of soles) expect(sole).toBeCloseTo(soles[0] as number, 10)
})

it('produces a different articulated pose at every 60 Hz sample rather than repeating six drawings', () => {
  for (let second = 0; second < 4; second++) {
    const poses = new Set<string>()
    for (let tick = 0; tick < 60; tick++) {
      const gait = residentGait({ ...placement, distance: (second + tick / 60) * 1.1 }, true)
      poses.add(JSON.stringify([gait.left.x, gait.left.y, gait.right.x, gait.right.y]))
    }
    expect(poses.size).toBe(60)
  }
})

it('joins the stride and half-stride continuously including the shoe velocity', () => {
  const epsilon = 1e-6
  for (const seam of [0.1, 0.5, 0.6, 1]) {
    const before = residentGait({ ...placement, distance: (seam - epsilon) * RESIDENT_STRIDE_DISTANCE }, true)
    const at = residentGait({ ...placement, distance: seam * RESIDENT_STRIDE_DISTANCE }, true)
    const after = residentGait({ ...placement, distance: (seam + epsilon) * RESIDENT_STRIDE_DISTANCE }, true)
    for (const leg of ['left', 'right'] as const) {
      expect(Math.hypot(before[leg].x - after[leg].x, before[leg].y - after[leg].y)).toBeLessThan(1e-5)
      expect((after[leg].x - at[leg].x) / epsilon).toBeCloseTo((at[leg].x - before[leg].x) / epsilon, 3)
      expect((after[leg].y - at[leg].y) / epsilon).toBeCloseTo((at[leg].y - before[leg].y) / epsilon, 3)
    }
  }
})

it('repeats the gait after one travelled stride without depending on a restarted browser clock', () => {
  for (const phase of [0, 0.1, 0.33, 0.6, 0.9]) {
    const a = residentGait({ ...placement, distance: phase * RESIDENT_STRIDE_DISTANCE }, false)
    const b = residentGait({ ...placement, distance: (phase + 1) * RESIDENT_STRIDE_DISTANCE }, false)
    expect(a.left.x).toBeCloseTo(b.left.x, 12)
    expect(a.left.y).toBeCloseTo(b.left.y, 12)
    expect(a.right.x).toBeCloseTo(b.right.x, 12)
    expect(a.right.y).toBeCloseTo(b.right.y, 12)
  }
  expect(residentGait({ ...placement, distance: -1 }, true).phase).toBe(0)
})
