/** Painted identity, clothing, and props share the resident's directional skeletons. */
import type { ResidentOutfit } from '../types.ts'
import { createResidentRig, dressResidentRig, type ResidentRig } from './resident-rig.ts'
import {
  RESIDENT_CASUAL_SIDE_RIG, RESIDENT_CASUAL_FRONT_RIG, RESIDENT_CASUAL_BACK_RIG,
  RESIDENT_CLASSIC_WARDROBE, RESIDENT_NIGHT_WARDROBE, RESIDENT_HAIR_RIG, RESIDENT_NIGHT_SLEEVES,
} from './resident-rig-registration.ts'
import { ResidentSurface } from './resident-surface.ts'
import casualSide from './assets/resident-rig-casual-side-v2.png'
import casualFront from './assets/resident-rig-casual-front-v1.png'
import casualBack from './assets/resident-rig-casual-back-v1.png'
import classicWardrobe from './assets/resident-rig-classic-wardrobe-v1.png'
import nightWardrobe from './assets/resident-rig-night-wardrobe-v1.png'
import nightSleeves from './assets/resident-rig-night-sleeves-v1.png'
import hairSource from './assets/resident-rig-hair-v1.png'
import propSource from './assets/resident-rig-props-v1.png'

/** An authored camera view selects its own linework without changing the anatomy. */
export type ResidentDirection = 'front' | 'side' | 'back'

/** Decoded identity textures are shared across all outfit variants in one mounted home. */
export type ResidentArtwork = Record<ResidentOutfit, Record<ResidentDirection, ResidentRig>> & {
  props: HTMLImageElement
  surface: ResidentSurface
}

/**
 * Decode each shared atlas once and register clothing onto the same neutral joints.
 * @param load - Mount-owned abortable image loader.
 * @returns Complete directional outfits, shared props, and their disposable GPU surface.
 */
export async function loadResidentArtwork(load: (url: string) => Promise<HTMLImageElement>): Promise<ResidentArtwork> {
  const [side, front, back, classic, night, hair, props, sleeves] = await Promise.all([
    load(casualSide), load(casualFront), load(casualBack), load(classicWardrobe), load(nightWardrobe), load(hairSource), load(propSource),
    load(nightSleeves),
  ])
  const base = {
    side: createResidentRig(side, RESIDENT_CASUAL_SIDE_RIG, true),
    front: createResidentRig(front, RESIDENT_CASUAL_FRONT_RIG, false),
    back: createResidentRig(back, RESIDENT_CASUAL_BACK_RIG, false),
  }
  const frontLayers = base.front.layers.filter(layer => layer.bone !== 'farUpperArm' && layer.bone !== 'farForearm')
  frontLayers.splice(frontLayers.findIndex(layer => layer.bone === 'torso') + 1, 0,
    ...base.front.layers.filter(layer => layer.bone === 'farUpperArm' || layer.bone === 'farForearm'))
  base.front = { ...base.front, layers: frontLayers }
  const casual = Object.fromEntries((['front', 'side', 'back'] as const).map(direction => [
    direction, dressResidentRig(base[direction], createResidentRig(hair, RESIDENT_HAIR_RIG[direction], direction === 'side')),
  ])) as Record<ResidentDirection, ResidentRig>
  const outfit = (image: HTMLImageElement, registration: typeof RESIDENT_CLASSIC_WARDROBE): Record<ResidentDirection, ResidentRig> =>
    Object.fromEntries((['front', 'side', 'back'] as const).map(direction => [
      direction, dressResidentRig(casual[direction], createResidentRig(image, registration[direction], direction === 'side')),
    ])) as Record<ResidentDirection, ResidentRig>
  const nightOutfit = outfit(night, RESIDENT_NIGHT_WARDROBE)
  for (const direction of ['front', 'side', 'back'] as const) {
    const sleeveRig = createResidentRig(sleeves, RESIDENT_NIGHT_SLEEVES[direction], direction === 'side')
    nightOutfit[direction] = dressResidentRig(nightOutfit[direction], sleeveRig)
  }
  return { casual, classic: outfit(classic, RESIDENT_CLASSIC_WARDROBE), night: nightOutfit,
    props, surface: new ResidentSurface() }
}
