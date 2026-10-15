import { expect, it } from 'vitest'
import { session } from '../../../../office/sim/fixtures'
import { buildLayout } from '../../../../office/sim/layout'
import { resolveEffectiveWorld } from '../../../../office/sim/effective-world'
import { createWorldDocument } from '../../../../shared/office/world-document'
import { toFloorGeometry } from '../../../office-live/layout-geometry'
import { INITIAL_OFFICE_STATE, officeReducer } from '../../logic/office-reducer'
import { makeFrame } from '../fixtures'

it('targets a physical upper-floor zone without falling back to the ground-floor identity', () => {
  const sessions = [session('one')]
  const base = buildLayout(sessions, undefined)
  const document = createWorldDocument(base, sessions)
  document.buildings[0].floors = 3
  document.rooms[0].floorNumber = 3
  const floors = toFloorGeometry(resolveEffectiveWorld(base, document, sessions), sessions)
  const frame = makeFrame({ floors, sessions })
  const next = officeReducer(
    { ...INITIAL_OFFICE_STATE, frame, focusedFloorId: floors[0].floorId },
    { type: 'zone-flown', zoneId: floors[2].zones[0].id }
  )
  expect(next.focusedFloorId).toBe(floors[2].floorId)
  expect(new Set(floors.map((floor) => floor.zones[0].id)).size).toBe(3)
})
