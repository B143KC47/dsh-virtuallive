/** A registered painted part is a regular texture grid in character-height units. */
import type { ResidentPoint } from './resident-motion.ts'

/** Source pixels remain separate from the skeleton's continuous vertex positions. */
export interface ResidentMesh {
  image: HTMLImageElement | HTMLCanvasElement
  points: readonly ResidentPoint[]
  columns: number
  rows: number
  texture: { left: number; top: number; width: number; height: number }
}
