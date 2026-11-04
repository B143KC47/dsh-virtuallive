/** The same image point must select the location where the resident is drawn. */
import { expect, it } from 'vitest'
import { HOME_SPACE } from '../src/home-space.ts'
import { projectFloor, unprojectFloor } from '../src/client/room-projection.ts'

it('picks every named destination at its painted foot position', () => {
  for (const destination of Object.values(HOME_SPACE.places)) {
    const image = projectFloor(destination)
    expect(image.x).toBeGreaterThan(0)
    expect(image.x).toBeLessThan(1)
    expect(image.y).toBeGreaterThan(0)
    expect(image.y).toBeLessThan(1)
    const picked = unprojectFloor(image)
    expect(picked.x).toBeCloseTo(destination.x)
    expect(picked.z).toBeCloseTo(destination.z)
  }
})

it('uses the same perspective ratio for floor spans and character height', () => {
  for (const z of [0, 2, 4, 6, 8]) {
    const left = projectFloor({ x: 3, z }), right = projectFloor({ x: 7, z })
    const backLeft = projectFloor({ x: 3, z: 0 }), backRight = projectFloor({ x: 7, z: 0 })
    expect((right.x - left.x) / (backRight.x - backLeft.x)).toBeCloseTo(left.scale / backLeft.scale)
  }
  const backSpacing = projectFloor({ x: 5, z: 2 }).y - projectFloor({ x: 5, z: 0 }).y
  const frontSpacing = projectFloor({ x: 5, z: 8 }).y - projectFloor({ x: 5, z: 6 }).y
  expect(frontSpacing).toBeGreaterThan(backSpacing)
})
