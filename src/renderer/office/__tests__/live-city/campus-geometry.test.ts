import { expect, it } from 'vitest'
import { buildLayout } from '../../../../office/sim/layout'
import { session } from '../../../../office/sim/fixtures'
import { resolveEffectiveWorld } from '../../../../office/sim/effective-world'
import { createWorldDocument } from '../../../../shared/office/world-document'
import { CAMPUS_HUB_RADIUS_M } from '../../../../shared/office/world-document-ring'
import { toFloorGeometry } from '../../../office-live/layout-geometry'
import { campusGeometry } from '../../logic/campus-geometry'

const sessions = [
  session('one', 'project:a'),
  session('two', 'project:b'),
  session('three', 'project:c')
]
const base = buildLayout(sessions, undefined)
const floors = toFloorGeometry(
  resolveEffectiveWorld(base, createWorldDocument(base, sessions), sessions, 'campus'),
  sessions,
  { keepEmptyHeadquarters: false }
)

it('runs one spoke per ground building from its hub-side edge to the hub rim', () => {
  const { hub, spokes } = campusGeometry(floors)
  expect(hub).toEqual({ x: 0, z: 0, radius: CAMPUS_HUB_RADIUS_M })
  expect(spokes.map((spoke) => spoke.projectKey).toSorted()).toEqual([
    'project:a',
    'project:b',
    'project:c'
  ])
  for (const spoke of spokes) {
    expect(Math.hypot(spoke.to.x, spoke.to.z)).toBeCloseTo(CAMPUS_HUB_RADIUS_M)
    expect(Math.hypot(spoke.from.x, spoke.from.z)).toBeGreaterThan(CAMPUS_HUB_RADIUS_M)
    const floor = floors.find((candidate) => candidate.buildingId === spoke.buildingId)
    if (!floor) throw new Error('spoke without a building')
    const onEdge =
      Math.abs(Math.abs(spoke.from.x - floor.x) - floor.width / 2) < 1e-6 ||
      Math.abs(Math.abs(spoke.from.z - floor.z) - floor.depth / 2) < 1e-6
    expect(onEdge).toBe(true)
  }
})

it('is empty but keeps the hub with no buildings', () => {
  expect(campusGeometry([])).toEqual({
    hub: { x: 0, z: 0, radius: CAMPUS_HUB_RADIUS_M },
    spokes: []
  })
})
