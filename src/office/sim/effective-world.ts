import { buildLayout, type LayoutMap } from './layout'
import type { SessionRef } from '../../shared/office/types'
import {
  createWorldDocument,
  validateWorldDocument,
  type WorldDocument,
  type WorldValidationError
} from '../../shared/office/world-document'
import { allocationLayout } from '../../shared/office/world-document-allocation'
import { mergeActiveWorldDocument } from '../../shared/office/world-document-layout'
import { buildEffectiveFloors } from './effective-world-floors'
import { cityScenerySites } from '../../shared/office/city-scenery'
import { cityVenueSite } from '../../shared/office/city-access'
import { districtStreets } from '../../shared/office/district-streets'

// The session fields resolveEffectiveWorld reads; of `subagents`, only the count. Tokens,
// activity and observation never change the world, so a message carrying only those reuses it.
export const EFFECTIVE_WORLD_SESSION_FIELDS = [
  'key',
  'companyKey',
  'companyLabel',
  'projectKey',
  'projectLabel',
  'name',
  'worktree',
  'subagents'
] as const satisfies readonly (keyof SessionRef)[]

// Same key, same resolved world (perf-5): keyed on its inputs, not on `base` alone.
export function effectiveWorldKey(
  baseLayout: LayoutMap,
  document: WorldDocument,
  sessions: readonly SessionRef[]
): string {
  const inputs = sessions.map((session) =>
    EFFECTIVE_WORLD_SESSION_FIELDS.map((field) =>
      field === 'subagents' ? session.subagents.length : session[field]
    )
  )
  return JSON.stringify([baseLayout, document.revision, inputs])
}

// dry-new: buildLayout owns source allocation; this pure projection adds device-local physical storeys.
export function resolveEffectiveWorld(
  baseLayout: LayoutMap,
  document: WorldDocument,
  sessions: readonly SessionRef[]
): LayoutMap {
  const baseline = buildLayout([...sessions], allocationLayout(document.allocation, baseLayout))
  const defaults = createWorldDocument(baseline, sessions)
  const requested = mergeActiveWorldDocument(defaults, document)
  const context = { layout: baseLayout, sessions }
  const errors = validateWorldDocument(requested, context)
  let effective = requested
  if (errors.length) {
    const adapted = adaptTeamCapacity(requested, defaults, errors)
    effective = validateWorldDocument(adapted, context).length ? defaults : adapted
  }
  const floors = buildEffectiveFloors({ baseline, legacy: baseLayout, document: effective })
  const roomFloors = new Map(
    floors.flatMap((floor) =>
      floor.rooms
        .filter((room) => room.sessionKey !== null)
        .map((room) => [room.sessionKey, floor.id] as const)
    )
  )
  const groundSites = [
    ...floors.filter((floor) => (floor.elevation ?? 0) === 0),
    ...effective.venues.map(cityVenueSite)
  ]
  const streetBlocks = cityScenerySites(groundSites)
  return {
    version: 1,
    floors,
    effectiveVenues: effective.venues,
    streetBlocks,
    streets: districtStreets({ sites: groundSites, obstacles: [...groundSites, ...streetBlocks] }),
    reservations: Object.fromEntries(
      Object.entries(baseline.reservations).map(([key, held]) => [
        key,
        { ...held, floorId: roomFloors.get(key) ?? held.floorId }
      ])
    )
  }
}

// Live roster growth changes geometry, not the saved document or unrelated building choices.
function adaptTeamCapacity(
  requested: WorldDocument,
  defaults: WorldDocument,
  errors: readonly WorldValidationError[]
): WorldDocument {
  if (
    errors.some((error) => error.reason !== 'occupied-capacity' || !error.field.startsWith('rooms'))
  )
    return defaults
  const targets = new Set(errors.map((error) => error.target))
  const affected = new Set(
    requested.rooms.filter((room) => targets.has(room.target)).map((room) => room.buildingId)
  )
  return {
    ...requested,
    buildings: requested.buildings.map((building) => {
      if (!affected.has(building.id)) return building
      const generated = defaults.buildings.find((candidate) => candidate.id === building.id)
      return generated
        ? {
            ...generated,
            displayName: building.displayName,
            themeId: building.themeId,
            floors: building.floors,
            footprint: { ...generated.footprint, x: building.footprint.x, z: building.footprint.z }
          }
        : building
    }),
    rooms: requested.rooms.map((room) => {
      if (!affected.has(room.buildingId)) return room
      const generated = defaults.rooms.find((candidate) => candidate.target === room.target)
      return generated
        ? {
            ...generated,
            buildingId: room.buildingId,
            floorNumber: room.floorNumber,
            displayName: room.displayName,
            themeId: room.themeId
          }
        : room
    })
  }
}
