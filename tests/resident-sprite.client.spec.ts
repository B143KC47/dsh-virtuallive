/** Retained activity intentions do not open an idle mouth or change the resting view. */
import { expect, it } from 'vitest'
import { residentFaceState, residentEyePoint } from '../src/client/resident-expression.ts'
import { residentDirection } from '../src/client/resident-sprite.ts'
import type { ResidentExpression } from '../src/types.ts'

const expression: ResidentExpression = { activity: 'talking', mood: 'calm', outfit: 'classic', intention: 'Resting at home' }

it('keeps the mouth closed after speech ends throughout the eye and speech cycles', () => {
  const eyes = new Set<number>()
  for (let tick = 0; tick < 1800; tick++) {
    const face = residentFaceState(expression, { time: tick / 60, motion: true, speaking: false })
    expect(face.mouth).toBe(0); eyes.add(face.eyes)
  }
  expect(eyes.has(0)).toBe(true)
  expect([...eyes].some(value => value > 0.9)).toBe(true)
  expect(residentFaceState(expression, { time: 0.5, motion: true, speaking: true }).mouth).toBeGreaterThan(0)
  expect(residentFaceState(expression, { time: 0.5, motion: false, speaking: true })).toEqual({ eyes: 0, mouth: 0 })
})

it('closes sleeping eyes while leaving the head outline and rear view unchanged', () => {
  const sleeping = residentFaceState({ ...expression, activity: 'sleeping' }, { time: 2, motion: false, speaking: false })
  expect(sleeping).toEqual({ eyes: 1, mouth: 0 })
  const eye = { x: 0.037, y: -0.818 }, crown = { x: 0, y: -1 }
  expect(Math.abs(residentEyePoint(eye, 'front', 1).y + 0.828)).toBeLessThan(0.001)
  expect(residentEyePoint(crown, 'front', 1)).toEqual(crown)
  expect(residentEyePoint(eye, 'back', 1)).toBe(eye)
})

it('retains the final journey bearing for standing linework and mirrors only the side view', () => {
  expect(residentDirection(0)).toEqual({ direction: 'front', mirror: 1 })
  expect(residentDirection(Math.PI)).toEqual({ direction: 'back', mirror: 1 })
  expect(residentDirection(Math.PI / 2)).toEqual({ direction: 'side', mirror: 1 })
  expect(residentDirection(-Math.PI / 2)).toEqual({ direction: 'side', mirror: -1 })
})
