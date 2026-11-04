/** Walking respects the same furniture footprints used by the home renderer. */
import { describe, expect, it } from 'vitest'
import { canStandAt, HOME_SPACE, homeFurniture, homePlaces, initialHomeLayout, journeyAt, routeHome } from '../src/home-space.ts'

describe('home movement', () => {
  it('uses visible, moved furniture for both collision and destination invitations', () => {
    const layout = initialHomeLayout()
    for (const item of Object.values(layout.layers)) item.visible = false
    expect(homeFurniture(layout)).toEqual([])
    expect(homePlaces(layout).sofa).toBeUndefined()
    expect(routeHome(HOME_SPACE.places.center, { x: 2.5, z: 0.5 }, layout)).not.toBeNull()
    layout.layers.sofa = { x: 5, z: 3, scale: 1, visible: true, variant: 'alternate' }
    expect(canStandAt({ x: 5, z: 3 }, layout)).toBe(false)
    expect(canStandAt({ x: 2.5, z: 0.5 }, layout)).toBe(true)
    const target = homePlaces(layout).sofa!
    expect(target).toEqual({ x: 5, z: 4.25 })
    const path = routeHome({ x: 5, z: 6 }, target, layout)
    expect(path?.at(-1)).toEqual(target)
    for (const point of path!) expect(canStandAt(point, layout)).toBe(true)
  })

  it('reaches every named place without crossing furniture', () => {
    for (const from of Object.values(HOME_SPACE.places)) {
      for (const to of Object.values(HOME_SPACE.places)) {
        const path = routeHome(from, to)
        expect(path, `${JSON.stringify(from)} to ${JSON.stringify(to)}`).not.toBeNull()
        if (path === null) continue
        for (let i = 1; i < path.length; i++) {
          const start = path[i - 1]!, end = path[i]!
          for (let step = 0; step <= 10; step++) {
            expect(canStandAt({ x: start.x + (end.x - start.x) * step / 10, z: start.z + (end.z - start.z) * step / 10 })).toBe(true)
          }
        }
        expect(path.at(-1)).toEqual(to)
      }
    }
  })
  it('refuses destinations inside furniture and outside the house', () => {
    for (const item of HOME_SPACE.furniture) expect(routeHome(HOME_SPACE.places.center, item)).toBeNull()
    expect(routeHome(HOME_SPACE.places.center, { x: -1, z: 3 })).toBeNull()
  })
  it('omits a named invitation when another item blocks its authored approach', () => {
    const layout = initialHomeLayout()
    layout.layers.bed = { ...layout.layers.bed, x: 2.4, z: 2.25 }
    const place = homePlaces(layout).sofa
    expect(place).toBeUndefined()
  })
  it('refuses a narrow gap whose free point cannot connect to the navigation grid', () => {
    const layout = initialHomeLayout()
    for (const layer of Object.values(layout.layers)) layer.visible = false
    layout.layers.plant = { ...layout.layers.plant, x: 4.65, z: 4.1, scale: 0.6, visible: true }
    layout.layers.coffee = { ...layout.layers.coffee, x: 5.65, z: 4.1, scale: 0.6, visible: true }
    const point = { x: 5.1, z: 4.1 }, outside = { x: 5.1, z: 6 }
    expect(canStandAt(point, layout)).toBe(true)
    expect(routeHome(outside, point, layout)).toBeNull()
    expect(routeHome(point, outside, layout)).toBeNull()
  })
  it('redirects a resident between grid points without clipping a furniture corner', () => {
    const start = { x: 7.62, z: 3.88, facing: 0, moving: true }
    const target = { x: 4.12, z: 5.08 }
    const path = routeHome(start, target)
    expect(path).not.toBeNull()
    expect(path?.[0]).toEqual({ x: start.x, z: start.z })
    expect(path?.at(-1)).toEqual(target)
    for (let i = 1; i < path!.length; i++) {
      const from = path![i - 1]!, to = path![i]!
      for (let step = 0; step <= 100; step++) {
        expect(canStandAt({ x: from.x + (to.x - from.x) * step / 100, z: from.z + (to.z - from.z) * step / 100 })).toBe(true)
      }
    }
  })
  it('interpolates logged movement by distance and stops exactly at the destination', () => {
    const journey = { path: [{ x: 3, z: 5 }, { x: 4, z: 5 }, { x: 4, z: 6 }], startedAt: 1000, speed: 1 }
    expect(journeyAt(journey, 1500)).toMatchObject({ x: 3.5, z: 5, moving: true })
    expect(journeyAt(journey, 2500)).toMatchObject({ x: 4, z: 5.5, moving: true })
    expect(journeyAt(journey, 4000)).toMatchObject({ x: 4, z: 6, moving: false })
  })
})
