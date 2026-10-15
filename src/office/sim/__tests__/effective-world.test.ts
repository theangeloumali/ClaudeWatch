import { expect, it } from 'vitest'
import { session, subagent } from '../fixtures'
import { buildLayout } from '../layout'
import { resolveEffectiveWorld } from '../effective-world'
import { createWorldDocument, validateWorldDocument } from '../../../shared/office/world-document'
import { cityScenerySites } from '../../../shared/office/city-scenery'
import { overlaps } from '../../../shared/office/world-document-geometry'
import { WORLD_STREET_METRES } from '../../../shared/office/world-document-limits'

it('generates one real floor and prunes its tree without mutating source inputs', () => {
  const sessions = Array.from({ length: 12 }, (_, index) => session(`worker-${index}`))
  const layout = buildLayout(sessions, undefined)
  const document = createWorldDocument(layout, sessions)
  const before = structuredClone({ layout, document, sessions })
  const effective = resolveEffectiveWorld(layout, document, sessions)
  expect(effective.floors).toHaveLength(1)
  expect(effective.floors.map((floor) => floor.elevation)).toEqual([0])
  expect(
    effective.floors
      .flatMap((floor) => floor.rooms)
      .map((room) => room.sessionKey)
      .sort()
  ).toEqual(sessions.map((worker) => worker.key).sort())
  for (const floor of effective.floors) {
    expect(floor.id).toBe(
      `building:${floor.buildingId?.replace(/^building:/, '')}:${floor.floorNumber}`
    )
    expect(
      floor.zones
        .flatMap((zone) => zone.children.flatMap((project) => project.children))
        .map((room) => room.id)
        .sort()
    ).toEqual(floor.rooms.map((room) => room.id).sort())
    for (const room of floor.rooms) {
      expect(room.floorId).toBe(floor.id)
      expect(effective.reservations[room.sessionKey!].floorId).toBe(floor.id)
    }
  }
  expect({ layout, document, sessions }).toEqual(before)
})

it('shares rendered scenery exclusions with a saved off-grid east-facing venue entrance', () => {
  const sessions = [session('one')]
  const layout = buildLayout(sessions, undefined)
  const document = createWorldDocument(layout, sessions)
  const venue = document.venues[0]
  if (!venue) throw new Error('Fixture needs a venue')
  venue.footprint.x = 360
  venue.footprint.z = 0
  venue.entrance = { x: venue.footprint.width / 2, z: 0 }
  expect(validateWorldDocument(document, { layout, sessions })).toEqual([])
  const effective = resolveEffectiveWorld(layout, document, sessions)
  const rendered = cityScenerySites([
    ...effective.floors.filter((floor) => (floor.elevation ?? 0) === 0),
    ...document.venues.map((venue) => ({
      ...venue.footprint,
      entrance: { x: venue.footprint.x + venue.entrance.x, z: venue.footprint.z + venue.entrance.z }
    }))
  ])
  expect(effective.streetBlocks).toEqual(rendered)
})

it('uses durable targets through bay churn and keeps local labels out of source identity', () => {
  const sessions = [session('one'), session('two')]
  const layout = buildLayout(sessions, undefined)
  const document = createWorldDocument(layout, sessions)
  const override = document.rooms.find((room) => room.target === 'session:two')!
  override.displayName = 'Quiet study'
  const latest = buildLayout([sessions[1]], undefined)
  const effective = resolveEffectiveWorld(latest, document, [sessions[1]])
  const room = effective.floors.flatMap((floor) => floor.rooms)[0]
  expect(room.sessionKey).toBe('two')
  expect(room.displayLabel).toBe('Quiet study')
  expect(room.label).toBe('two')
  expect(effective.floors.flatMap((floor) => floor.rooms)).toHaveLength(1)
  expect(resolveEffectiveWorld(buildLayout([], undefined), document, []).floors).toEqual([])
})

it('distributes projects around streets with separate bounded footprints', () => {
  const sessions = ['a', 'b', 'c', 'd'].map((project) => session(project, project))
  const layout = buildLayout(sessions, undefined)
  const document = createWorldDocument(layout, sessions)
  expect(document.buildings).toHaveLength(4)
  expect(
    new Set(document.buildings.map((building) => `${building.footprint.x},${building.footprint.z}`))
      .size
  ).toBe(4)
  for (const [index, building] of document.buildings.entries())
    for (const other of document.buildings.slice(index + 1))
      expect(overlaps(building.footprint, other.footprint, WORLD_STREET_METRES)).toBe(false)
  const effective = resolveEffectiveWorld(layout, document, sessions)
  expect(effective.floors).toHaveLength(4)
  expect(effective.floors.every((floor) => floor.width < 100 && floor.depth < 100)).toBe(true)
})

it('rebinds a worker to a real destination storey without renaming its source identity', () => {
  const sessions = [session('one', 'project-a'), session('two', 'project-b')]
  const layout = buildLayout(sessions, undefined)
  const document = createWorldDocument(layout, sessions)
  const destination = document.buildings.find((building) => building.projectKey === 'project-b')!
  destination.floors = 2
  const room = document.rooms.find((candidate) => candidate.target === 'session:one')!
  room.buildingId = destination.id
  room.floorNumber = 2
  room.position = { x: 0, z: 0 }
  const effective = resolveEffectiveWorld(layout, document, sessions)
  const moved = effective.floors
    .flatMap((floor) => floor.rooms)
    .find((candidate) => candidate.sessionKey === 'one')!
  expect(moved.buildingId).toBe(destination.id)
  expect(moved.floorNumber).toBe(2)
  expect(moved.projectKey).toBe('project-a')
  expect(moved.id).toBe(
    layout.floors[0].rooms.find((candidate) => candidate.sessionKey === 'one')!.id
  )
  expect(sessions[0].projectKey).toBe('project-a')
})

it('creates defaults from source allocation rather than re-importing projected world coordinates', () => {
  const sessions = Array.from({ length: 12 }, (_, index) => session(`worker-${index}`))
  const layout = buildLayout(sessions, undefined)
  const document = createWorldDocument(layout, sessions)
  const effective = resolveEffectiveWorld(layout, document, sessions)
  const recreated = createWorldDocument(effective, sessions)
  expect(recreated.buildings).toEqual(document.buildings)
  expect(recreated.rooms).toEqual(document.rooms)
})

it('grows active team capacity without discarding another saved building or writing the document', () => {
  const records = [
    session('alpha', 'a'),
    {
      ...session('beta', 'b'),
      subagents: Array.from({ length: 5 }, (_, index) => subagent(`guest:${index}`))
    }
  ]
  const base = buildLayout(records, undefined)
  const saved = createWorldDocument(base, records)
  const building = saved.buildings.find((building) => building.projectKey === 'a')!
  building.floors = 3
  const edited = saved.rooms.find((room) => room.target === 'session:alpha')!
  edited.displayName = 'Window studio'
  edited.floorNumber = 3
  const before = structuredClone(saved)
  const current = [
    records[0],
    {
      ...records[1],
      subagents: Array.from({ length: 10 }, (_, index) => subagent(`guest:${index}`))
    }
  ]
  const effective = resolveEffectiveWorld(buildLayout(current, base), saved, current)
  const retained = effective.floors
    .flatMap((floor) => floor.rooms)
    .find((room) => room.sessionKey === 'alpha')!
  expect(retained.floorNumber).toBe(3)
  expect(retained.displayLabel).toBe('Window studio')
  const team = effective.floors
    .flatMap((floor) => floor.rooms)
    .find((room) => room.projectKey === 'b' && room.kind === 'team')!
  const sourceTeam = buildLayout(current, base)
    .floors.flatMap((floor) => floor.rooms)
    .find((room) => room.projectKey === 'b' && room.kind === 'team')!
  expect(team.slots).toHaveLength(sourceTeam.slots.length)
  expect(saved).toEqual(before)
})

it('keeps saved storeys and labels when a new project needs a non-conflicting generated plot', () => {
  const original = [session('alpha', 'a')]
  const base = buildLayout(original, undefined)
  const saved = createWorldDocument(base, original)
  saved.buildings[0].floors = 3
  saved.rooms[0].floorNumber = 3
  saved.rooms[0].displayName = 'Existing upper studio'
  const before = structuredClone(saved)
  const current = [...original, session('beta', 'b')]
  const effective = resolveEffectiveWorld(buildLayout(current, base), saved, current)
  const retained = effective.floors
    .flatMap((floor) => floor.rooms)
    .find((room) => room.sessionKey === 'alpha')
  expect(retained?.floorNumber).toBe(3)
  expect(retained?.displayLabel).toBe('Existing upper studio')
  expect(
    effective.floors.flatMap((floor) => floor.rooms).some((room) => room.sessionKey === 'beta')
  ).toBe(true)
  expect(saved).toEqual(before)
})
