/** Individually authored anime furniture layers, separate from the empty wallpaper. */
import type { FurnitureAction, HomeLayerId, HomeLayout } from '../types.ts'
import { HOME_FURNITURE, HOME_LAYER_IDS, furnitureRectangle, type HomeFurnitureDefinition } from '../home-catalog.ts'
import { projectFloor } from './room-projection.ts'
import afternoon from './assets/room-empty-afternoon-v2.png'
import night from './assets/room-empty-night-v2.png'
import sofa from './assets/furniture-sofa-v2.png'
import sofaIvory from './assets/furniture-sofa-ivory-v2.png'
import coffee from './assets/furniture-side-table-v2.png'
import desk from './assets/furniture-desk-v2.png'
import chair from './assets/furniture-chair-v2.png'
import bed from './assets/furniture-bed-v4.png'
import kitchen from './assets/furniture-kitchen-v3.png'
import phone from './assets/furniture-phone-v3.png'
import plant from './assets/furniture-plant-v2.png'
import rug from './assets/furniture-rug-v3.png'
import curtains from './assets/furniture-curtains-v2.png'
import shelf from './assets/furniture-shelf-v2.png'

/** Empty architectural wallpapers with matching camera calibration. */
export const ROOM_WALLPAPERS = { afternoon, night } as const
const FURNITURE_ASSETS: Record<HomeLayerId, { standard: string; alternate: string }> = {
  sofa: { standard: sofa, alternate: sofaIvory }, coffee: { standard: coffee, alternate: coffee },
  desk: { standard: desk, alternate: desk }, chair: { standard: chair, alternate: chair },
  bed: { standard: bed, alternate: bed }, kitchen: { standard: kitchen, alternate: kitchen },
  phone: { standard: phone, alternate: phone }, plant: { standard: plant, alternate: plant },
  rug: { standard: rug, alternate: rug }, curtains: { standard: curtains, alternate: curtains },
  shelf: { standard: shelf, alternate: shelf },
}

/** Decoded images remain owned by the mounted room. */
export interface LoadedFurniture {
  definition: HomeFurnitureDefinition
  standard: HTMLImageElement
  alternate: HTMLImageElement
  floorCache?: { key: string; canvas: HTMLCanvasElement }
  hitContext?: CanvasRenderingContext2D
}

/**
 * Decode each independently replaceable image once for this room's lifetime.
 * @param load - Caller-owned, abortable image loader.
 * @returns Complete artwork ready for synchronous painting.
 */
export async function loadFurnitureArtwork(load: (url: string) => Promise<HTMLImageElement>): Promise<LoadedFurniture[]> {
  return Promise.all(HOME_LAYER_IDS.map(async (id) => {
    const urls = FURNITURE_ASSETS[id]
    const standard = await load(urls.standard)
    const alternate = urls.alternate === urls.standard ? standard : await load(urls.alternate)
    return { definition: HOME_FURNITURE[id], standard, alternate }
  }))
}

/**
 * Paint ground, wall, and furniture layers on the appropriate side of the resident.
 * @param context - Room-owned drawing context.
 * @param artwork - Decoded independent furniture assets.
 * @param layout - Current committed arrangement.
 * @param viewport - Canvas size, resident depth, painting side, and optional active attachment.
 * An absent or null attachment uses ordinary depth ordering.
 */
export function drawFurniture(context: CanvasRenderingContext2D, artwork: readonly LoadedFurniture[], layout: HomeLayout, viewport: {
  width: number
  height: number
  depth: number
  side: 'behind' | 'front'
  interaction?: { furnitureId: HomeLayerId; action: FurnitureAction } | null
}): void {
  const visible = artwork.filter(item => layout.layers[item.definition.id].visible)
  visible.sort((a, b) => furnitureDepth(a, layout) - furnitureDepth(b, layout))
  context.save()
  if (layout.background === 'night') context.filter = 'brightness(0.72) saturate(0.85)'
  for (const item of visible) {
    const art = item.definition, placement = layout.layers[art.id]
    const use = viewport.interaction?.furnitureId === art.id ? art.uses[viewport.interaction.action] : undefined
    if (use === undefined && (furnitureDepth(item, layout) <= viewport.depth) !== (viewport.side === 'behind')) continue
    if (use !== undefined && viewport.side === 'front' && use.foreground.length === 0) continue
    const image = item[placement.variant]
    if (art.floor) { drawFloorLayer(context, item, placement, viewport); continue }
    const [left, top, right, bottom] = art.bounds[placement.variant]
    const box = furnitureRectangle(art.id, layout, viewport)
    context.save()
    if (use !== undefined && viewport.side === 'front') {
      context.beginPath()
      for (const polygon of use.foreground) {
        polygon.forEach((point, index) => {
          const x = box.x + point.x * box.width, y = box.y + point.y * box.height
          if (index === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        })
        context.closePath()
      }
      context.clip()
    }
    context.drawImage(image, left, top, right - left, bottom - top,
      box.x, box.y, box.width, box.height)
    context.restore()
  }
  context.restore()
}

function furnitureDepth(item: LoadedFurniture, layout: HomeLayout): number {
  const art = item.definition, placement = layout.layers[art.id]
  return art.plane === 'floor' ? -Infinity : art.plane === 'wall' ? -1 : placement.z + art.frontOffset * placement.scale
}

/**
 * Pick the frontmost furniture pixel using the same placement and alpha as painting.
 * @param artwork - Images owned by the mounted room.
 * @param layout - Current visible placements and variants.
 * @param viewport - Room size in CSS pixels.
 * @param point - Pointer location relative to the room, in CSS pixels.
 * @returns The visible furniture layer, or undefined for empty floor and transparent margins.
 */
export function furnitureAtPoint(
  artwork: readonly LoadedFurniture[], layout: HomeLayout, viewport: { width: number; height: number }, point: { x: number; y: number },
): HomeLayerId | undefined {
  const visible = artwork.filter(item => item.definition.plane !== 'floor' && layout.layers[item.definition.id].visible)
  visible.sort((a, b) => furnitureDepth(b, layout) - furnitureDepth(a, layout))
  for (const item of visible) {
    const box = furnitureRectangle(item.definition.id, layout, viewport)
    const u = (point.x - box.x) / box.width, v = (point.y - box.y) / box.height
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
    if (!item.hitContext) {
      const canvas = document.createElement('canvas')
      canvas.width = 1; canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('The browser could not inspect the furniture image')
      item.hitContext = context
    }
    const variant = layout.layers[item.definition.id].variant
    const [left, top, right, bottom] = item.definition.bounds[variant]
    item.hitContext.clearRect(0, 0, 1, 1)
    item.hitContext.drawImage(item[variant], Math.floor(left + u * (right - left)), Math.floor(top + v * (bottom - top)), 1, 1, 0, 0, 1, 1)
    if ((item.hitContext.getImageData(0, 0, 1, 1).data[3] ?? 0) >= 64) return item.definition.id
  }
  return undefined
}

function drawFloorLayer(context: CanvasRenderingContext2D, item: LoadedFurniture, placement: HomeLayout['layers'][HomeLayerId], viewport: { width: number; height: number }): void {
  const floor = item.definition.floor
  if (!floor) return
  const ratio = context.getTransform().a
  const key = JSON.stringify([placement, viewport.width, viewport.height, ratio])
  if (item.floorCache?.key !== key) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio)
    const target = canvas.getContext('2d')
    if (!target) throw new Error('The browser could not project the floor illustration')
    target.scale(ratio, ratio)
    target.imageSmoothingQuality = 'high'
    const [left, top, right, bottom] = item.definition.bounds[placement.variant]
    const width = floor.width * placement.scale, depth = floor.depth * placement.scale
    // Each texture row lies parallel to the back wall; only its span and depth change.
    for (let row = 0; row < bottom - top; row++) {
      const z = placement.z - depth / 2 + row / (bottom - top) * depth
      const nextZ = placement.z - depth / 2 + (row + 1) / (bottom - top) * depth
      const start = projectFloor({ x: placement.x - width / 2, z })
      const end = projectFloor({ x: placement.x + width / 2, z: nextZ })
      target.drawImage(item[placement.variant], left, top + row, right - left, 1,
        start.x * viewport.width, start.y * viewport.height, (end.x - start.x) * viewport.width,
        (end.y - start.y) * viewport.height + 0.25 / ratio)
    }
    item.floorCache = { key, canvas }
  }
  context.drawImage(item.floorCache.canvas, 0, 0, viewport.width, viewport.height)
}
