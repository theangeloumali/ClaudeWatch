import { describe, expect, it } from 'vitest'
import { buildLayout } from '../../../office/sim/layout'
import { session } from '../../../office/sim/fixtures'
import { createWorldDocument, validateWorldDocument } from '../world-document'
import { arrangeWorldDocument } from '../world-document-placement'
import { CAMPUS_HUB_RADIUS_M, ringWorldDocument } from '../world-document-ring'
import type { WorldDocument, WorldFootprint } from '../world-document-types'

function campusOf(count: number): {
  document: WorldDocument
  layout: ReturnType<typeof buildLayout>
  sessions: ReturnType<typeof session>[]
} {
  const sessions = Array.from({ length: count }, (_, index) => ({
    ...session(`worker:${index}`, `project:${String(index).padStart(2, '0')}`),
    companyKey: `company:${index % 3}`,
    companyLabel: `Company ${index % 3}`
  }))
  const layout = buildLayout(sessions, undefined)
  return { document: createWorldDocument(layout, sessions), layout, sessions }
}

const boundingRadius = (footprint: WorldFootprint) =>
  Math.hypot(footprint.width, footprint.depth) / 2
const centreDistance = (footprint: WorldFootprint) => Math.hypot(footprint.x, footprint.z)

describe('ringWorldDocument', () => {
  it('keeps the hub plaza clear and no two footprints within the gap', () => {
    const { document } = campusOf(7)
    const ring = ringWorldDocument(document)
    for (const [index, building] of ring.buildings.entries()) {
      const footprint = building.footprint
      expect(centreDistance(footprint) - boundingRadius(footprint)).toBeGreaterThanOrEqual(
        CAMPUS_HUB_RADIUS_M
      )
      for (const other of ring.buildings.slice(index + 1)) {
        const gap =
          Math.hypot(footprint.x - other.footprint.x, footprint.z - other.footprint.z) -
          boundingRadius(footprint) -
          boundingRadius(other.footprint)
        expect(gap).toBeGreaterThanOrEqual(4 - 1e-6)
      }
    }
  })

  it('drops venues and stays a valid document', () => {
    const { document, layout, sessions } = campusOf(3)
    expect(document.venues.length).toBeGreaterThan(0)
    const ring = ringWorldDocument(document)
    expect(ring.venues).toEqual([])
    expect(validateWorldDocument(ring, { layout, sessions })).toEqual([])
    expect(document.venues.length).toBeGreaterThan(0)
  })

  it('orders the ring by company, then project, then id, clockwise from the top', () => {
    const { document } = campusOf(6)
    const ring = ringWorldDocument(document)
    const expected = ring.buildings
      .toSorted(
        (first, second) =>
          first.companyKey.localeCompare(second.companyKey) ||
          first.projectKey.localeCompare(second.projectKey) ||
          first.id.localeCompare(second.id)
      )
      .map((building) => building.id)
    const angleOf = (footprint: WorldFootprint) =>
      (Math.atan2(footprint.x, -footprint.z) + 2 * Math.PI) % (2 * Math.PI)
    const byAngle = ring.buildings
      .toSorted((first, second) => angleOf(first.footprint) - angleOf(second.footprint))
      .map((building) => building.id)
    expect(byAngle).toEqual(expected)
  })

  it('opens an outer ring above ten buildings', () => {
    const { document } = campusOf(13)
    const ring = ringWorldDocument(document)
    const radii = [...new Set(ring.buildings.map((b) => Math.round(centreDistance(b.footprint))))]
    expect(radii).toHaveLength(2)
    const [inner, outer] = radii.toSorted((a, b) => a - b)
    expect(
      ring.buildings.filter((b) => Math.round(centreDistance(b.footprint)) === inner)
    ).toHaveLength(10)
    expect(outer).toBeGreaterThan(inner ?? 0)
  })

  it('handles an empty world and a single building', () => {
    const empty = ringWorldDocument({ ...campusOf(1).document, buildings: [], rooms: [] })
    expect(empty.buildings).toEqual([])
    const single = ringWorldDocument(campusOf(1).document)
    const footprint = single.buildings[0]?.footprint
    expect(footprint).toBeDefined()
    if (footprint)
      expect(centreDistance(footprint) - boundingRadius(footprint)).toBeGreaterThanOrEqual(
        CAMPUS_HUB_RADIUS_M
      )
  })

  it('refuses a ring past the world limits', () => {
    const { document } = campusOf(1)
    const [building] = document.buildings
    if (!building) throw new Error('fixture has no building')
    const huge = {
      ...document,
      buildings: Array.from({ length: 128 }, (_, index) => ({
        ...building,
        id: `b${index}`,
        footprint: { ...building.footprint, width: 256, depth: 256 }
      }))
    }
    expect(() => ringWorldDocument(huge)).toThrow(RangeError)
  })

  it('is the ring mode of arrangeWorldDocument', () => {
    const { document } = campusOf(4)
    expect(arrangeWorldDocument(document, 'ring')).toEqual(ringWorldDocument(document))
  })
})
