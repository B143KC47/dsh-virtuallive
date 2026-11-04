/** Every painted part is measured against the native PNG, not its resized preview. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  RESIDENT_CASUAL_FRONT_RIG, RESIDENT_CASUAL_SIDE_RIG, RESIDENT_CASUAL_BACK_RIG,
  RESIDENT_CLASSIC_WARDROBE, RESIDENT_NIGHT_WARDROBE, RESIDENT_HAIR_RIG, RESIDENT_NIGHT_SLEEVES,
} from '../src/client/resident-rig-registration.ts'
import type { ResidentRigRegistration } from '../src/client/resident-rig.ts'

const sheets: readonly [string, readonly ResidentRigRegistration[]][] = [
  ['resident-rig-casual-front-v1.png', [RESIDENT_CASUAL_FRONT_RIG]],
  ['resident-rig-casual-side-v2.png', [RESIDENT_CASUAL_SIDE_RIG]],
  ['resident-rig-casual-back-v1.png', [RESIDENT_CASUAL_BACK_RIG]],
  ['resident-rig-classic-wardrobe-v1.png', Object.values(RESIDENT_CLASSIC_WARDROBE)],
  ['resident-rig-night-wardrobe-v1.png', Object.values(RESIDENT_NIGHT_WARDROBE)],
  ['resident-rig-hair-v1.png', Object.values(RESIDENT_HAIR_RIG)],
  ['resident-rig-night-sleeves-v1.png', Object.values(RESIDENT_NIGHT_SLEEVES)],
]

it('keeps every layer rectangle inside its actual PNG and gives it two distinct attachment joints', () => {
  for (const [file, registrations] of sheets) {
    const png = readFileSync(new URL(`../src/client/assets/${file}`, import.meta.url))
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
    for (const registration of registrations) {
      expect({ width: registration.width, height: registration.height }).toEqual({ width, height })
      for (const layer of registration.layers) {
        expect(layer.left).toBeGreaterThanOrEqual(0); expect(layer.top).toBeGreaterThanOrEqual(0)
        expect(layer.left + layer.width).toBeLessThanOrEqual(width)
        expect(layer.top + layer.height).toBeLessThanOrEqual(height)
        expect(Math.hypot(layer.start.x - layer.end.x, layer.start.y - layer.end.y)).toBeGreaterThan(0)
      }
    }
  }
})

it('keeps the identity in the base rig while clothing overrides replace only their own pieces', () => {
  for (const base of [RESIDENT_CASUAL_FRONT_RIG, RESIDENT_CASUAL_SIDE_RIG, RESIDENT_CASUAL_BACK_RIG]) {
    expect(new Set(base.layers.map(layer => layer.id)).size).toBe(16)
  }
  for (const outfit of [RESIDENT_CLASSIC_WARDROBE, RESIDENT_NIGHT_WARDROBE]) {
    for (const registration of Object.values(outfit)) {
      expect(registration.layers.some(layer => layer.id === 'head' || layer.id === 'tail' || layer.id === 'backHair')).toBe(false)
      expect(new Set(registration.layers.map(layer => layer.id)).size).toBe(registration.layers.length)
    }
  }
})
