/** Furniture attachments use durable approach timing and the artwork's registered coordinates. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendPluginRecord, Session, SessionId } from '@deepseek-ai/dsh-session'
import { HOME_FURNITURE, HOME_LAYER_IDS, furnitureFloorPoint, furnitureRectangle } from '../src/home-catalog.ts'
import { HOME_CALIBRATION, projectFloor, unprojectFloor } from '../src/home-camera.ts'
import { homeFurnitureUses, planFurnitureUse, residentFurnitureStatus, residentPresenceAt } from '../src/home-interaction.ts'
import { commitHomeArrangement } from '../src/home-arrangement.ts'
import { canStandAt, journeyArrivalAt, journeyAt } from '../src/home-space.ts'
import { applyResidentEvent, initialResidentState, residentProjectionDefinition } from '../src/state.ts'
import type { FurnitureAction, HomeLayerId, ResidentFurnitureRecord, ResidentState } from '../src/types.ts'

afterEach(() => vi.restoreAllMocks())

function recordedUse(furnitureId: HomeLayerId = 'sofa', action: FurnitureAction = 'sit'): { session: Session; record: ResidentFurnitureRecord; state: ResidentState; arrivesAt: number } {
  const session = Session.create(SessionId(`furniture-${furnitureId}-${action}`))
  const plan = planFurnitureUse(initialResidentState(), { furnitureId, action, expectedRevision: 0 }, { startedAt: 1000, speed: 1 })
  if (plan.status !== 'approaching' && plan.status !== 'using') throw new Error(`The authored ${furnitureId} approach is unavailable`)
  appendPluginRecord(session, 'plugin:dsh-virtuallive/furniture-use', plan.record)
  const state = session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
  return { session, record: plan.record, arrivesAt: plan.arrivesAt, state }
}

describe('furniture approach and release', () => {
  it('announces a scheduled approach and attaches only after the recorded walk arrives', () => {
    const { state, record, arrivesAt } = recordedUse()
    const before = residentPresenceAt(state, record.journey.startedAt, HOME_CALIBRATION.illustration)
    expect(before.phase).toBe('approaching')
    expect(before.moving).toBe(true)
    expect(before.interaction).toBeNull()
    expect(residentFurnitureStatus(state, record.journey.startedAt)).toMatchObject({ phase: 'approaching', arrivesAt, interaction: record.interaction })
    expect(residentPresenceAt(state, arrivesAt - 1, HOME_CALIBRATION.illustration).phase).toBe('approaching')
    const arrived = residentPresenceAt(state, arrivesAt, HOME_CALIBRATION.illustration)
    expect(arrived).toMatchObject({ phase: 'using', moving: false, interaction: { furnitureId: 'sofa', action: 'sit', pose: 'sitting', attachment: { anchor: 'pelvis' } } })
    expect(arrived.position).toEqual(record.journey.path.at(-1))
    expect(residentFurnitureStatus(state, arrivesAt).phase).toBe('using')
    expect(state.journey).toEqual(record.journey)
  })

  it('keeps the chosen pose and route after restart without creating an arrival record', () => {
    const { state, session, arrivesAt } = recordedUse('bed', 'lie')
    const restored = Session.create(SessionId('furniture-restored'), session.snapshotEvents())
    const restoredCount = restored.snapshotEvents().length
    const replayed = restored.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
    expect(replayed).toEqual(state)
    expect(residentProjectionDefinition.stateSchema.parse(replayed)).toEqual(state)
    expect(residentPresenceAt(replayed, 1000, HOME_CALIBRATION.illustration).phase).toBe('approaching')
    expect(residentPresenceAt(replayed, arrivesAt + 1, HOME_CALIBRATION.illustration)).toMatchObject({ phase: 'using', interaction: { pose: 'lying', attachment: { anchor: 'torso' } } })
    expect(restored.snapshotEvents()).toHaveLength(restoredCount)
  })

  it('can use every advertised initial furniture action through a clear approach', () => {
    const state = initialResidentState()
    const furniture = homeFurnitureUses(state.home)
    expect(furniture.map(item => item.furnitureId)).toEqual(['sofa', 'chair', 'bed'])
    for (const item of furniture) for (const use of item.actions) {
      expect(use.available).toBe(true)
      const plan = planFurnitureUse(state,
        { furnitureId: item.furnitureId, action: use.action, expectedRevision: 0 }, { startedAt: 1000, speed: 1 })
      expect(plan.status).toBe('approaching')
      if (plan.status !== 'approaching') throw new Error('Expected a reachable approach')
      expect(plan.record.journey.path.at(-1)).toEqual(use.approach)
      for (const point of plan.record.journey.path) expect(canStandAt(point, state.home)).toBe(true)
    }
  })

  it('keeps resident clearance beside resized furniture without scaling her body', () => {
    for (const furnitureId of ['sofa', 'chair', 'bed'] as const) for (const scale of [0.6, 1.4]) {
      const state = initialResidentState()
      for (const placement of Object.values(state.home.layers)) placement.visible = false
      state.home.layers[furnitureId] = { ...state.home.layers[furnitureId], x: 5, z: 3, scale, visible: true }
      for (const use of homeFurnitureUses(state.home)[0]!.actions.filter(use => use.action !== 'lie')) {
        expect(use.available).toBe(true)
        expect(canStandAt(use.approach, state.home)).toBe(true)
      }
    }
  })

  it('refuses lying on an undersized bed while preserving seats and safely replaying older lying intents', () => {
    const state = initialResidentState()
    state.home.layers.bed.scale = 0.6
    const request = { furnitureId: 'bed', action: 'lie', expectedRevision: 0 } as const
    expect(planFurnitureUse(state, request, { startedAt: 1000, speed: 1 })).toEqual({ status: 'unavailable', reason: 'too-small', minimumScale: 0.9 })
    expect(homeFurnitureUses(state.home).find(item => item.furnitureId === 'bed')?.actions.map(use => [use.action, use.available])).toEqual([
      ['sit', true], ['lie', false], ['read', true],
    ])
    const session = Session.create(SessionId('undersized-bed-restored'))
    appendPluginRecord(session, 'plugin:dsh-virtuallive/home', { layout: state.home, position: { x: 4.7, z: 4.5 }, changedAt: 0 })
    appendPluginRecord(session, 'plugin:dsh-virtuallive/furniture-use', {
      interaction: { furnitureId: 'bed', action: 'lie', homeRevision: 1 },
      journey: { path: [{ x: 4.7, z: 4.5 }], startedAt: 0, speed: 1 },
    })
    const restored = session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
    expect(residentPresenceAt(restored, 1000, HOME_CALIBRATION.illustration)).toMatchObject({ phase: 'standing', interaction: null })
    expect(residentFurnitureStatus(restored, 1000)).toMatchObject({ phase: 'standing', interaction: null, arrivesAt: null })
    state.home.layers.bed.scale = 0.9
    expect(planFurnitureUse(state, request, { startedAt: 1000, speed: 1 }).status).toBe('approaching')
  })

  it('refuses stale revisions, unsupported actions, hidden furniture, and obstructed approaches', () => {
    const state = initialResidentState()
    const timing = { startedAt: 1000, speed: 1 }
    expect(planFurnitureUse(state, { furnitureId: 'sofa', action: 'sit', expectedRevision: 1 }, timing)).toEqual({ status: 'conflict', homeRevision: 0 })
    expect(planFurnitureUse(state, { furnitureId: 'sofa', action: 'lie', expectedRevision: 0 }, timing)).toEqual({ status: 'unavailable', reason: 'unsupported' })
    state.home.layers.sofa.visible = false
    expect(planFurnitureUse(state, { furnitureId: 'sofa', action: 'sit', expectedRevision: 0 }, timing)).toEqual({ status: 'unavailable', reason: 'hidden' })
    expect(homeFurnitureUses(state.home).some(item => item.furnitureId === 'sofa')).toBe(false)
    state.home.layers.sofa.visible = true
    state.home.layers.plant = { ...state.home.layers.plant, x: 2.4, z: 2.25 }
    expect(planFurnitureUse(state, { furnitureId: 'sofa', action: 'sit', expectedRevision: 0 }, timing)).toEqual({ status: 'unavailable', reason: 'approach-blocked' })
    expect(homeFurnitureUses(state.home).find(item => item.furnitureId === 'sofa')?.actions[0]?.available).toBe(false)
  })

  it('refuses a free chair approach separated from the resident by an unbroken furniture barrier', () => {
    const state = initialResidentState()
    for (const placement of Object.values(state.home.layers)) placement.visible = false
    state.home.layers.chair.visible = true
    state.home.layers.sofa = { ...state.home.layers.sofa, x: 2, z: 4, scale: 1.4, visible: true }
    state.home.layers.desk = { ...state.home.layers.desk, x: 5.5, z: 4, scale: 1.4, visible: true }
    state.home.layers.bed = { ...state.home.layers.bed, x: 9, z: 4, scale: 1.4, visible: true }
    state.journey = { path: [{ x: 5.5, z: 6.5 }], startedAt: 0, speed: 1 }
    expect(canStandAt(state.journey.path[0]!, state.home)).toBe(true)
    expect(homeFurnitureUses(state.home).find(item => item.furnitureId === 'chair')?.actions[0]?.available).toBe(true)
    expect(planFurnitureUse(state, { furnitureId: 'chair', action: 'sit', expectedRevision: 0 }, { startedAt: 1000, speed: 1 })).toEqual({ status: 'unavailable', reason: 'unreachable' })
  })

  it('releases a seated resident at the checked approach floor when furniture moves or is hidden', () => {
    for (const visible of [true, false]) {
      const { session, state, arrivesAt, record } = recordedUse()
      vi.spyOn(Date, 'now').mockReturnValue(arrivesAt + 1)
      const layout = structuredClone(state.home)
      layout.layers.sofa = { ...layout.layers.sofa, x: 5, z: 5, visible }
      const result = commitHomeArrangement(session, state, layout, 0)
      expect(result).toMatchObject({ status: 'arranged', homeRevision: 1, position: record.journey.path.at(-1) })
      const updated = session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
      expect(updated.interaction).toBeNull()
      expect(residentPresenceAt(updated, arrivesAt + 1, HOME_CALIBRATION.illustration).phase).toBe('standing')
      expect(canStandAt(updated.journey.path[0]!, updated.home)).toBe(true)
      vi.restoreAllMocks()
    }
  })

  it('keeps the seated resident and arrangement unchanged when the edit obstructs her release point', () => {
    const { session, state, arrivesAt } = recordedUse()
    vi.spyOn(Date, 'now').mockReturnValue(arrivesAt + 1)
    const layout = structuredClone(state.home)
    layout.layers.bed = { ...layout.layers.bed, x: 2.4, z: 2.25 }
    const count = session.snapshotEvents().length
    expect(commitHomeArrangement(session, state, layout, 0)).toEqual({ status: 'invalid', reason: 'resident-blocked' })
    expect(session.snapshotEvents()).toHaveLength(count)
    expect(session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())).toEqual(state)
  })

  it('clears a furniture attachment when an ordinary walk starts, retaining a free-floor origin', () => {
    const { session, state, arrivesAt } = recordedUse('chair', 'read')
    const { x, z } = journeyAt(state.journey, arrivesAt + 1)
    appendPluginRecord(session, 'plugin:dsh-virtuallive/journey', { path: [{ x, z }, { x: 5.5, z: 4.5 }], startedAt: arrivesAt + 1, speed: 1 })
    const updated = session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
    expect(updated.interaction).toBeNull()
    expect(residentFurnitureStatus(updated, arrivesAt + 1).phase).toBe('walking')
    expect(canStandAt(updated.journey.path[0]!, updated.home)).toBe(true)
  })

  it('reports immediate use only when already standing at the authored approach', () => {
    const state = initialResidentState()
    state.journey.path = [{ x: 2.4, z: 2.25 }]
    const plan = planFurnitureUse(state, { furnitureId: 'sofa', action: 'read', expectedRevision: 0 }, { startedAt: 1000, speed: 1 })
    expect(plan.status).toBe('using')
    if (plan.status !== 'using') throw new Error('Expected immediate use from the approach')
    expect(plan.arrivesAt).toBe(1000)
    expect(journeyArrivalAt(plan.record.journey)).toBe(1000)
  })

  it('keeps stale or unsupported durable attachment intents off the furniture', () => {
    for (const interaction of [
      { furnitureId: 'sofa', action: 'lie', homeRevision: 0 },
      { furnitureId: 'sofa', action: 'sit', homeRevision: 9 },
    ] as const) {
      const session = Session.create(SessionId(`unusable-${interaction.action}`))
      appendPluginRecord(session, 'plugin:dsh-virtuallive/furniture-use', {
        interaction, journey: { path: [{ x: 4.7, z: 4.5 }], startedAt: 0, speed: 1 },
      })
      const restored = session.snapshotEvents().reduce(applyResidentEvent, initialResidentState())
      expect(residentPresenceAt(restored, 1000, HOME_CALIBRATION.illustration)).toMatchObject({ phase: 'standing', interaction: null })
      expect(residentFurnitureStatus(restored, 1000)).toMatchObject({ phase: 'standing', interaction: null, arrivesAt: null })
    }
  })
})

describe('authored furniture registration', () => {
  it('keeps every solid image grounded on its declared floor point at different scales and viewports', () => {
    const layout = initialResidentState().home
    for (const viewport of [HOME_CALIBRATION.illustration, { width: 640, height: 360 }, { width: 800, height: 600 }]) {
      for (const id of HOME_LAYER_IDS) {
        const definition = HOME_FURNITURE[id]
        if (definition.plane !== 'furniture') continue
        for (const scale of [0.6, 1, 1.4]) {
          layout.layers[id].scale = scale
          const box = furnitureRectangle(id, layout, viewport)
          const ground = unprojectFloor({
            x: (box.x + box.width * definition.anchor) / viewport.width, y: (box.y + box.height) / viewport.height + definition.lift,
          })
          const authored = furnitureFloorPoint(layout.layers[id], { x: 0, z: definition.frontOffset })
          expect(ground.x).toBeCloseTo(authored.x, 10)
          expect(ground.z).toBeCloseTo(authored.z, 10)
        }
      }
    }
  })

  it('keeps the pelvis on the selected seat after movement, scaling, artwork changes, and resizing', () => {
    for (const id of ['sofa', 'chair', 'bed'] as const) {
      const { state } = recordedUse(id)
      const variants = id === 'sofa' ? ['standard', 'alternate'] as const : ['standard'] as const
      for (const variant of variants) for (const scale of [0.6, 1, 1.4]) {
        state.home.layers[id] = { ...state.home.layers[id], x: 3, z: 3, scale, variant }
        for (const viewport of [HOME_CALIBRATION.illustration, { width: 600, height: 400 }]) {
          const presence = residentPresenceAt(state, 100000, viewport)
          const box = furnitureRectangle(id, state.home, viewport)
          const pixel = presence.interaction!.attachment.illustration
          const seat = HOME_FURNITURE[id].uses.sit!.attachment[variant]
          expect((pixel.x * viewport.width - box.x) / box.width).toBeCloseTo(seat.x, 12)
          expect((pixel.y * viewport.height - box.y) / box.height).toBeCloseTo(seat.y, 12)
          expect(presence.interaction!.attachment.scale).toBe(projectFloor(state.home.layers[id]).scale)
          const ground = presence.interaction!.attachment.ground
          expect(ground.x).toBe(pixel.x)
          expect(ground.y * viewport.height).toBeCloseTo(box.y + box.height, 10)
          expect(ground.y).toBeGreaterThan(pixel.y)
        }
      }
    }
  })
})
