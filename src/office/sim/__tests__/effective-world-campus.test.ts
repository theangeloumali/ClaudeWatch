import { expect, it } from 'vitest'
import { resolveEffectiveWorld } from '../effective-world'
import { session } from '../fixtures'
import { buildLayout } from '../layout'
import { createWorldDocument } from '../../../shared/office/world-document'

it('draws the city when the rooms are too big to ring, never failing the Campus layout', () => {
  // The document limits allow 128 buildings of 256 m; no ring of those fits the world.
  const sessions = Array.from({ length: 128 }, (_, index) =>
    session(`claude:${index}`, `p_${String(index).padStart(3, '0')}`)
  )
  const base = buildLayout([...sessions], undefined)
  const document = createWorldDocument(base, sessions)
  const huge = {
    ...document,
    buildings: document.buildings.map((building) => ({
      ...building,
      footprint: { ...building.footprint, width: 256, depth: 256 }
    }))
  }
  const campus = resolveEffectiveWorld(base, huge, sessions, 'campus')
  expect(campus).toEqual(resolveEffectiveWorld(base, huge, sessions, 'city'))
  // The screen reads this to draw the city it got, not a Campus hub over it.
  expect(campus.worldLayout).toBe('city')
  expect(resolveEffectiveWorld(base, document, sessions, 'campus').worldLayout).toBe('campus')
})
