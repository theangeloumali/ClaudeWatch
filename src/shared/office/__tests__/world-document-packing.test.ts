import { describe, expect, it } from 'vitest'
import { session } from '../../../office/sim/fixtures'
import { buildLayout } from '../../../office/sim/layout'
import {
  compactWorldDocument,
  createWorldDocument,
  parseWorldDocument,
  validateWorldDocument,
  type WorldDocument,
  type WorldFootprint
} from '../world-document'
import { overlaps } from '../world-document-geometry'
import { mergeActiveWorldDocument } from '../world-document-layout'
import { WORLD_DOCUMENT_LIMITS, WORLD_STREET_METRES } from '../world-document-limits'

const mixedSessions = [
  { projectKey: 'p_alpha', sessionCount: 1 },
  { projectKey: 'p_beta', sessionCount: 2 },
  { projectKey: 'p_gamma', sessionCount: 9 },
  { projectKey: 'p_delta', sessionCount: 4 }
].flatMap(({ projectKey, sessionCount }) =>
  Array.from({ length: sessionCount }, (_, index) => session(`${projectKey}:${index}`, projectKey))
)
const mixedLayout = buildLayout(mixedSessions, undefined)
const MAX_RADIAL_AREA_RATIO = 0.75

// dry-new: geometry exports overlap checks, but not a tight footprint-area measurement.
function footprintArea(footprints: readonly WorldFootprint[]): number {
  const west = Math.min(...footprints.map((footprint) => footprint.x - footprint.width / 2))
  const east = Math.max(...footprints.map((footprint) => footprint.x + footprint.width / 2))
  const north = Math.min(...footprints.map((footprint) => footprint.z - footprint.depth / 2))
  const south = Math.max(...footprints.map((footprint) => footprint.z + footprint.depth / 2))
  return (east - west) * (south - north)
}

function expectAccessibleSites(document: WorldDocument): void {
  const footprints = [...document.buildings, ...document.venues].map((site) => site.footprint)
  const gate = { x: 0, z: 0, width: WORLD_STREET_METRES, depth: WORLD_STREET_METRES }
  for (const [index, footprint] of footprints.entries()) {
    expect(overlaps(footprint, gate)).toBe(false)
    expect(Math.abs(footprint.x) + footprint.width / 2).toBeLessThanOrEqual(
      WORLD_DOCUMENT_LIMITS.worldMetres
    )
    expect(Math.abs(footprint.z) + footprint.depth / 2).toBeLessThanOrEqual(
      WORLD_DOCUMENT_LIMITS.worldMetres
    )
    for (const other of footprints.slice(index + 1)) {
      expect(overlaps(footprint, other, WORLD_STREET_METRES)).toBe(false)
    }
  }
}

describe('generated compact world layout', () => {
  it('explicitly compacts mixed-project bounds compared with the radial cross', () => {
    const document = compactWorldDocument(createWorldDocument(mixedLayout, mixedSessions))
    expect(document.buildings).toHaveLength(4)
    expect(document.venues).toHaveLength(5)
    expect(
      new Set(document.buildings.map((building) => building.footprint.width)).size
    ).toBeGreaterThan(1)
    const radialPitch = Math.max(
      24,
      ...document.buildings.map(
        (building) =>
          Math.max(building.footprint.width, building.footprint.depth) + WORLD_STREET_METRES
      )
    )
    const radialBuildingOrigins = [
      { x: 0, z: -radialPitch },
      { x: radialPitch, z: 0 },
      { x: 0, z: radialPitch },
      { x: -radialPitch, z: 0 }
    ]
    const radialVenueOrigins = [
      { x: radialPitch, z: radialPitch },
      { x: -radialPitch, z: radialPitch },
      { x: -radialPitch, z: -radialPitch },
      { x: radialPitch, z: -radialPitch },
      { x: radialPitch * 2, z: radialPitch }
    ]
    const radialBuildings = document.buildings.map((building, index) => ({
      ...building.footprint,
      ...radialBuildingOrigins[index]
    }))
    const radialVenues = document.venues.map((venue, index) => ({
      ...venue.footprint,
      ...radialVenueOrigins[index]
    }))
    const buildings = document.buildings.map((building) => building.footprint)
    const venues = document.venues.map((venue) => venue.footprint)

    expect(footprintArea(buildings)).toBeLessThan(
      footprintArea(radialBuildings) * MAX_RADIAL_AREA_RATIO
    )
    expect(footprintArea([...buildings, ...venues])).toBeLessThan(
      footprintArea([...radialBuildings, ...radialVenues]) * MAX_RADIAL_AREA_RATIO
    )
  })

  it('leaves physical streets between every building and venue and keeps the origin gate open', () => {
    const document = createWorldDocument(mixedLayout, mixedSessions)
    expectAccessibleSites(document)
    expect(
      validateWorldDocument(document, { layout: mixedLayout, sessions: mixedSessions })
    ).toEqual([])
  })

  it('is repeatable and independent of session input order without mutating inputs', () => {
    const layoutBefore = structuredClone(mixedLayout)
    const sessionsBefore = structuredClone(mixedSessions)
    const document = createWorldDocument(mixedLayout, mixedSessions)
    const reversedSessions = [...mixedSessions].reverse()

    expect(createWorldDocument(mixedLayout, mixedSessions)).toEqual(document)
    expect(createWorldDocument(buildLayout(reversedSessions, undefined), reversedSessions)).toEqual(
      document
    )
    expect(mixedLayout).toEqual(layoutBefore)
    expect(mixedSessions).toEqual(sessionsBefore)
  })

  it('keeps an empty city empty and valid', () => {
    const emptyLayout = buildLayout([], undefined)
    const document = createWorldDocument(emptyLayout, [])

    expect(document).toMatchObject({
      version: 2,
      revision: 0,
      buildings: [],
      rooms: [],
      venues: []
    })
    expect(parseWorldDocument(document)).toEqual({ success: true, document })
    expect(validateWorldDocument(document, { layout: emptyLayout, sessions: [] })).toEqual([])
  })

  it('packs the maximum saved building count and footprint size within world coordinates', () => {
    const maximumSessions = Array.from({ length: WORLD_DOCUMENT_LIMITS.buildings }, (_, index) =>
      session(`maximum:${index}`, `p_maximum:${index}`)
    )
    const maximumLayout = buildLayout(maximumSessions, undefined)
    const saved = createWorldDocument(maximumLayout, maximumSessions)
    for (const building of saved.buildings) {
      building.footprint.width = WORLD_DOCUMENT_LIMITS.buildingMetres
      building.footprint.depth = WORLD_DOCUMENT_LIMITS.buildingMetres
    }
    const document = compactWorldDocument(saved)
    expect(document.buildings).toHaveLength(WORLD_DOCUMENT_LIMITS.buildings)
    for (const building of document.buildings) {
      expect(building.footprint.width).toBe(WORLD_DOCUMENT_LIMITS.buildingMetres)
      expect(building.footprint.depth).toBe(WORLD_DOCUMENT_LIMITS.buildingMetres)
    }
    expectAccessibleSites(document)
  })

  it('never compacts saved overrides during the active-world merge', () => {
    const defaults = createWorldDocument(mixedLayout, mixedSessions)
    const saved = structuredClone(defaults)
    saved.revision = 17
    saved.buildings[0].footprint.x = 1700
    saved.buildings[0].footprint.z = -1300
    saved.buildings[0].displayName = 'Saved project name'
    saved.buildings[0].themeId = 'saved-building-theme'
    saved.rooms[0].displayName = 'Saved room name'
    saved.rooms[0].themeId = 'saved-room-theme'
    saved.venues[0].footprint.x = -1800
    saved.venues[0].footprint.z = 1400
    const savedBytes = JSON.stringify(saved)
    const defaultsBefore = structuredClone(defaults)

    const merged = mergeActiveWorldDocument(defaults, saved)

    expect(merged).toEqual({ ...saved, allocation: defaults.allocation })
    expect(JSON.stringify(saved)).toBe(savedBytes)
    expect(defaults).toEqual(defaultsBefore)
  })
})

describe('explicit world document compaction', () => {
  it('changes only footprint origins while retaining local geometry, identity and presentation', () => {
    const document = createWorldDocument(mixedLayout, mixedSessions)
    document.revision = 42
    for (const [index, building] of document.buildings.entries()) {
      building.footprint.x += 1700
      building.footprint.z -= 1200
      building.displayName = `Saved building ${index}`
      building.themeId = `building-theme:${index}`
    }
    for (const [index, room] of document.rooms.entries()) {
      room.displayName = `Saved room ${index}`
      room.themeId = `room-theme:${index}`
    }
    for (const [index, venue] of document.venues.entries()) {
      venue.footprint.x -= 1900
      venue.footprint.z += 1300
      venue.displayName = `Saved venue ${index}`
      venue.themeId = `venue-theme:${index}`
    }
    const before = structuredClone(document)

    const compacted = compactWorldDocument(document)

    expect(compacted).toEqual({
      ...before,
      buildings: before.buildings.map((building, index) => ({
        ...building,
        footprint: {
          ...building.footprint,
          x: compacted.buildings[index].footprint.x,
          z: compacted.buildings[index].footprint.z
        }
      })),
      venues: before.venues.map((venue, index) => ({
        ...venue,
        footprint: {
          ...venue.footprint,
          x: compacted.venues[index].footprint.x,
          z: compacted.venues[index].footprint.z
        }
      }))
    })
    expect(compacted.buildings[0].footprint).not.toEqual(before.buildings[0].footprint)
    expect(document).toEqual(before)
    expectAccessibleSites(compacted)
  })

  it('returns independently editable nested data, including allocation records', () => {
    const document = createWorldDocument(mixedLayout, mixedSessions)
    const before = structuredClone(document)
    const compacted = compactWorldDocument(document)

    expect(compacted).not.toBe(document)
    compacted.revision++
    compacted.buildings[0].footprint.x++
    compacted.buildings[0].entrance.x++
    const connector = compacted.buildings[0].connector
    expect(connector).toBeDefined()
    if (connector) connector.x++
    compacted.rooms[0].position.x++
    compacted.rooms[0].size.width++
    compacted.rooms[0].door.x++
    compacted.rooms[0].desks[0].x++
    compacted.rooms[0].desks.push({ id: 'draft-desk', x: 0, z: 0, heading: 0 })
    compacted.venues[0].footprint.x++
    compacted.venues[0].entrance.x++
    compacted.venues[0].slots[0].x++
    compacted.venues[0].slots.push({ id: 'draft-slot', x: 0, z: 0, heading: 0 })
    expect(compacted.allocation).toBeDefined()
    if (compacted.allocation) {
      compacted.allocation.reservations[0].bay++
      compacted.allocation.order[0].index++
      compacted.allocation.reservations.pop()
      compacted.allocation.order.pop()
    }
    compacted.buildings.pop()
    compacted.rooms.pop()
    compacted.venues.pop()

    expect(document).toEqual(before)
  })

  it('is idempotent and assigns the same origins despite building, room and venue permutations', () => {
    const document = createWorldDocument(mixedLayout, mixedSessions)
    const compacted = compactWorldDocument(document)
    const permuted = structuredClone({
      ...document,
      buildings: [...document.buildings].reverse(),
      rooms: [...document.rooms].reverse(),
      venues: [...document.venues].reverse()
    })
    for (const site of [...permuted.buildings, ...permuted.venues]) {
      site.footprint.x += 2300
      site.footprint.z -= 1800
    }

    expect(compactWorldDocument(compacted)).toEqual(compacted)
    expect(compactWorldDocument(permuted)).toEqual({
      ...compacted,
      buildings: [...compacted.buildings].reverse(),
      rooms: [...compacted.rooms].reverse(),
      venues: [...compacted.venues].reverse()
    })
  })

  it('handles an empty document without introducing allocation or shared arrays', () => {
    const document: WorldDocument = {
      version: 2,
      revision: 23,
      buildings: [],
      rooms: [],
      venues: []
    }
    const compacted = compactWorldDocument(document)

    expect(compacted).toEqual(document)
    expect(compacted).not.toBe(document)
    expect(compacted.buildings).not.toBe(document.buildings)
    expect(compacted.rooms).not.toBe(document.rooms)
    expect(compacted.venues).not.toBe(document.venues)
    expect(compacted).not.toHaveProperty('allocation')
  })

  it('compacts a venue-only document with mixed dimensions and preserves valid entrances', () => {
    const document = createWorldDocument(mixedLayout, mixedSessions)
    document.buildings = []
    document.rooms = []
    delete document.allocation
    for (const [index, venue] of document.venues.entries()) {
      venue.footprint = { x: 0, z: 0, width: 12 + index * 7, depth: 10 + index * 9 }
      venue.entrance.z = -venue.footprint.depth / 2
    }
    const before = structuredClone(document)
    const compacted = compactWorldDocument(document)

    expectAccessibleSites(compacted)
    expect(compacted.buildings).toEqual([])
    expect(compacted.rooms).toEqual([])
    expect(document).toEqual(before)
    expect(
      validateWorldDocument(compacted, { layout: buildLayout([], undefined), sessions: [] })
    ).toEqual([])
  })

  it('bounds 128 maximum-sized buildings alongside mixed maximum-sized venues', () => {
    const seedSessions = [session('maximum-seed')]
    const document = createWorldDocument(buildLayout(seedSessions, undefined), seedSessions)
    const seedBuilding = document.buildings[0]
    document.buildings = Array.from({ length: WORLD_DOCUMENT_LIMITS.buildings }, (_, index) => ({
      ...structuredClone(seedBuilding),
      id: `building:maximum:${index}`,
      projectKey: `p_maximum:${index}`,
      footprint: {
        x: 2000,
        z: -2000,
        width: WORLD_DOCUMENT_LIMITS.buildingMetres,
        depth: WORLD_DOCUMENT_LIMITS.buildingMetres
      },
      entrance: { x: 0, z: -WORLD_DOCUMENT_LIMITS.buildingMetres / 2 }
    }))
    document.rooms = []
    delete document.allocation
    const venueSizes = [
      { width: 256, depth: 256 },
      { width: 32, depth: 256 },
      { width: 256, depth: 20 },
      { width: 8, depth: 10 },
      { width: 120, depth: 64 }
    ]
    for (const [index, venue] of document.venues.entries()) {
      venue.footprint = { x: 0, z: 0, ...venueSizes[index] }
      venue.entrance.z = -venue.footprint.depth / 2
    }
    const before = structuredClone(document)

    const compacted = compactWorldDocument(document)

    expect(compacted.buildings).toHaveLength(WORLD_DOCUMENT_LIMITS.buildings)
    expect(compacted.venues).toHaveLength(5)
    expectAccessibleSites(compacted)
    expect(parseWorldDocument(compacted)).toEqual({ success: true, document: compacted })
    expect(document).toEqual(before)
  })
})
