import { describe, expect, it } from 'vitest'
import { session } from '../../../office/sim/fixtures'
import { buildLayout } from '../../../office/sim/layout'
import { resolveEffectiveWorld } from '../../../office/sim/effective-world'
import { PROJECTS } from '../../../renderer/office/fixture/fixture-projects'
import { sessionFor } from '../../../renderer/office/fixture/fixture-sessions'
import {
  createWorldDocumentStore,
  WORLD_DOCUMENT_STORAGE_KEY
} from '../../../renderer/office-live/world-document-store'
import { cityScenerySites } from '../city-scenery'
import { cityBlocksFor } from '../city-block-layout'
import { overlaps } from '../world-document-geometry'
import { createWorldDocument, validateWorldDocument } from '../world-document'
import { mergeActiveWorldDocument } from '../world-document-layout'
import { arrangeWorldDocument } from '../world-document-placement'
import { singleFloorWorldDocument } from '../world-document-single-floor'

const fixtureSessions = PROJECTS.flatMap((project) =>
  project.sessions.map((fixture, index) =>
    sessionFor(project, fixture, index, { tick: 0, nowMs: 1_000_000 })
  )
)
const fixtureLayout = buildLayout(fixtureSessions, undefined)
const fixtureDocument = createWorldDocument(fixtureLayout, fixtureSessions)
const protectedSites = [...fixtureDocument.buildings, ...fixtureDocument.venues].map(
  (site) => site.footprint
)
const SCENERY_CAP = 64
const PROTECTED_CLEARANCE_METRES = 3

describe('recovered city parcels', () => {
  // Every building's floor keeps room for its game corner, so the offices take more frontage.
  it('retains 44 lots around walkable offices, including 6.9 m rear and 5.46 m side strips', () => {
    const lots = cityScenerySites(protectedSites)
    expect(lots).toHaveLength(44)
    expect(lots.some((lot) => Math.abs(lot.depth - 6.9) < 0.001)).toBe(true)
    expect(lots.some((lot) => Math.abs(lot.width - 5.457692307692309) < 0.001)).toBe(true)
    expect(Math.min(...lots.flatMap((lot) => [lot.width, lot.depth]))).toBeCloseTo(
      5.457692307692309
    )
  })

  it('keeps every recovered parcel disjoint from other lots and the protected 3 m envelope', () => {
    const lots = cityScenerySites(protectedSites)
    expect(lots.length).toBeGreaterThan(0)
    for (const [index, lot] of lots.entries()) {
      expect(lot.width).toBeGreaterThanOrEqual(4)
      expect(lot.depth).toBeGreaterThanOrEqual(4)
      for (const protectedSite of protectedSites)
        expect(overlaps(lot, protectedSite, PROTECTED_CLEARANCE_METRES)).toBe(false)
      for (const other of lots.slice(index + 1)) expect(overlaps(lot, other)).toBe(false)
    }
  })

  it('distributes recovered frontage across all nine blocks rather than exhausting one strip', () => {
    const lots = cityScenerySites(protectedSites)
    const counts = Map.groupBy(lots, (lot) => `city-block:${lot.column}:${lot.row}`)
    expect([...counts.keys()].sort()).toEqual(
      cityBlocksFor(protectedSites)
        .map((block) => block.id)
        .sort()
    )
    expect(counts.size).toBe(9)
    expect(Math.min(...[...counts.values()].map((blockLots) => blockLots.length))).toBe(2)
    expect(Math.max(...[...counts.values()].map((blockLots) => blockLots.length))).toBe(6)
  })

  it('is repeatable, input-order independent and identical to simulation obstacles', () => {
    const before = structuredClone(protectedSites)
    const lots = cityScenerySites(protectedSites)
    const effective = resolveEffectiveWorld(fixtureLayout, fixtureDocument, fixtureSessions)
    expect(cityScenerySites(protectedSites)).toEqual(lots)
    expect(cityScenerySites([...protectedSites].reverse())).toEqual(lots)
    expect(effective.streetBlocks).toEqual(lots)
    expect(protectedSites).toEqual(before)
  })

  it('caps large extents at 64 lots while sampling both ends of the eligible block range', () => {
    const wideSites = [
      { ...protectedSites[0], x: -640, z: -560 },
      { ...protectedSites[0], x: 640, z: 560 }
    ]
    const blocks = cityBlocksFor(wideSites).sort(
      (first, second) => first.column - second.column || first.row - second.row
    )
    const lots = cityScenerySites(wideSites)
    const selectedBlocks = new Set(lots.map((lot) => `city-block:${lot.column}:${lot.row}`))
    expect(blocks.length).toBeGreaterThan(SCENERY_CAP)
    expect(lots).toHaveLength(SCENERY_CAP)
    expect(selectedBlocks.size).toBe(SCENERY_CAP)
    expect(selectedBlocks.has(blocks[0].id)).toBe(true)
    expect(selectedBlocks.has(blocks[blocks.length - 1].id)).toBe(true)
    expect(cityScenerySites(wideSites)).toEqual(lots)
  })

  it.each([{ sites: [] }, { sites: [{ x: 32, z: 28, width: 40, depth: 32 }] }])(
    'does not invent parcels in empty or fully protected blocks: %j',
    ({ sites }) => {
      expect(cityScenerySites(sites)).toEqual([])
    }
  )
})

// dry-new: existing session fixtures do not provide a saved multi-storey world and its local store.
function legacyWorld() {
  const sessions = [session('legacy:one'), session('legacy:two'), session('other', 'p_b')]
  const layout = buildLayout(sessions, undefined)
  const saved = createWorldDocument(layout, sessions)
  const building = saved.buildings.find((candidate) => candidate.projectKey === 'p_a')
  if (!building) throw new Error('Legacy fixture requires its shared-project building')
  building.floors = 3
  building.displayName = 'Saved upper-floor office'
  building.themeId = 'violet-court'
  for (const [index, room] of saved.rooms
    .filter((room) => room.buildingId === building.id)
    .entries()) {
    room.floorNumber = (index % 2) + 2
    room.displayName = `Saved study ${index}`
    room.themeId = 'cyberpunk-city'
  }
  saved.revision = 7
  const bytes = new Map([[WORLD_DOCUMENT_STORAGE_KEY, JSON.stringify(saved)]])
  const options = {
    storage: {
      getItem: (key: string) => bytes.get(key) ?? null,
      setItem: (key: string, content: string) => {
        bytes.set(key, content)
      }
    },
    lock: {
      runExclusive: async <Output>(operation: () => Output | Promise<Output>) => operation()
    },
    getLayout: () => layout,
    getSessions: () => sessions
  }
  return { sessions, layout, saved, bytes, options }
}

describe('explicit single-floor rebuilding', () => {
  it('creates four single-floor offices for a fresh fixture without discarding any room targets', () => {
    expect(fixtureDocument.buildings).toHaveLength(4)
    expect(fixtureDocument.buildings.every((building) => building.floors === 1)).toBe(true)
    expect(fixtureDocument.rooms.every((room) => room.floorNumber === 1)).toBe(true)
    expect(new Set(fixtureDocument.rooms.map((room) => room.target)).size).toBe(
      fixtureDocument.rooms.length
    )
    expect(
      validateWorldDocument(fixtureDocument, { layout: fixtureLayout, sessions: fixtureSessions })
    ).toEqual([])
  })

  it('never silently consolidates a saved legacy office during load, merge, reconciliation or simulation', () => {
    const { layout, sessions, saved, bytes, options } = legacyWorld()
    const before = bytes.get(WORLD_DOCUMENT_STORAGE_KEY)
    const store = createWorldDocumentStore(options)
    try {
      expect(store.get().errors).toEqual([])
      store.reconcile()
      const merged = mergeActiveWorldDocument(createWorldDocument(layout, sessions), saved)
      const effective = resolveEffectiveWorld(layout, saved, sessions)
      expect(merged).toEqual(saved)
      expect(store.get().document).toEqual(saved)
      expect(effective.floors).toHaveLength(4)
      expect(
        effective.floors
          .filter(
            (floor) =>
              floor.buildingId === saved.buildings.find((building) => building.floors === 3)?.id
          )
          .map((floor) => floor.floorNumber)
      ).toEqual([1, 2, 3])
      expect(bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(before)
    } finally {
      store.dispose()
    }
  })

  it('repacks only room origins and storey assignments while preserving identity and local geometry', () => {
    const { layout, sessions, saved } = legacyWorld()
    const before = structuredClone(saved)
    const rebuilt = arrangeWorldDocument(singleFloorWorldDocument(saved, layout))
    expect(rebuilt.buildings.every((building) => building.floors === 1)).toBe(true)
    expect(rebuilt.rooms.every((room) => room.floorNumber === 1)).toBe(true)
    expect(rebuilt.rooms).toEqual(
      before.rooms.map((room, index) => ({
        ...room,
        floorNumber: 1,
        position: rebuilt.rooms[index].position
      }))
    )
    expect(
      rebuilt.buildings.map(({ id, companyKey, projectKey, displayName, themeId }) => ({
        id,
        companyKey,
        projectKey,
        displayName,
        themeId
      }))
    ).toEqual(
      before.buildings.map(({ id, companyKey, projectKey, displayName, themeId }) => ({
        id,
        companyKey,
        projectKey,
        displayName,
        themeId
      }))
    )
    expect(rebuilt.venues.map(({ footprint: _footprint, ...venue }) => venue)).toEqual(
      before.venues.map(({ footprint: _footprint, ...venue }) => venue)
    )
    expect(rebuilt.allocation).toEqual(before.allocation)
    expect(validateWorldDocument(rebuilt, { layout, sessions })).toEqual([])
    expect(saved).toEqual(before)
  })

  it('previews without persistence, saves the explicit rebuild and undoes to the exact saved legacy geometry', async () => {
    const { layout, saved, bytes, options } = legacyWorld()
    const store = createWorldDocumentStore(options)
    const beforeBytes = bytes.get(WORLD_DOCUMENT_STORAGE_KEY)
    const rebuilt = arrangeWorldDocument(singleFloorWorldDocument(saved, layout))
    try {
      expect(store.preview(rebuilt).success).toBe(true)
      expect(store.get().document).toEqual(saved)
      expect(bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(beforeBytes)
      expect((await store.save(rebuilt, saved.revision)).success).toBe(true)
      expect(store.get().document).toEqual({ ...rebuilt, revision: saved.revision + 1 })
      const reloaded = createWorldDocumentStore(options)
      try {
        expect(reloaded.get().document).toEqual(store.get().document)
      } finally {
        reloaded.dispose()
      }
      expect((await store.undo()).success).toBe(true)
      const restored = { ...saved, revision: saved.revision + 2 }
      expect(store.get().document).toEqual(restored)
      const persisted: unknown = JSON.parse(bytes.get(WORLD_DOCUMENT_STORAGE_KEY) ?? 'null')
      expect(persisted).toEqual(restored)
    } finally {
      store.dispose()
    }
  })
})
