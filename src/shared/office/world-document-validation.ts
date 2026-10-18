import { GUEST_DESK_IDS, teamSeatsFor } from '../../office/sim/rooms'
import { WORLD_DOCUMENT_LIMITS as LIMITS } from './world-document-limits'
import {
  contains,
  deskHasClearance,
  deskIsReachable,
  doorway,
  edgeDoor,
  overlaps
} from './world-document-geometry'
import { unreachableFloorTargets } from './world-document-passages'
import type {
  WorldBuilding,
  WorldDocument,
  WorldRoom,
  WorldValidationContext,
  WorldValidationError,
  WorldValidationReason
} from './world-document-types'

export function validateWorldIdentityBindings(
  previous: WorldDocument | null,
  draft: WorldDocument
): WorldValidationError[] {
  if (!previous) return []
  const errors: WorldValidationError[] = []
  for (const building of draft.buildings) {
    const original = previous.buildings.find((candidate) => candidate.id === building.id)
    if (
      original &&
      (original.companyKey !== building.companyKey || original.projectKey !== building.projectKey)
    )
      errors.push({ field: 'buildings.binding', target: building.id, reason: 'identity-binding' })
  }
  for (const room of draft.rooms) {
    const original = previous.rooms.find((candidate) => candidate.id === room.id)
    if (original && original.target !== room.target)
      errors.push({ field: 'rooms.target', target: room.id, reason: 'identity-binding' })
  }
  return errors
}

export function validateWorldGeometry(
  document: WorldDocument,
  context: WorldValidationContext
): WorldValidationError[] {
  const errors: WorldValidationError[] = []
  const report = (field: string, target: string, reason: WorldValidationReason): void => {
    if (errors.length < LIMITS.errors) errors.push({ field, target, reason })
  }
  const buildings = new Map(document.buildings.map((building) => [building.id, building]))
  const themes = context.knownThemeIds ? new Set(context.knownThemeIds) : null
  const checkTheme = (entry: { id: string; themeId?: string }, field: string): void => {
    if (entry.themeId && themes && !themes.has(entry.themeId))
      report(field, entry.id, 'unknown-theme')
  }
  for (const [index, building] of document.buildings.entries()) {
    const field = `buildings[${index}]`
    checkTheme(building, `${field}.themeId`)
    if (!edgeDoor(building.footprint, building.entrance))
      report(`${field}.entrance`, building.id, 'invalid-door')
    if (
      Math.abs(building.footprint.x) + building.footprint.width / 2 > LIMITS.worldMetres ||
      Math.abs(building.footprint.z) + building.footprint.depth / 2 > LIMITS.worldMetres
    )
      report(`${field}.footprint`, building.id, 'limit')
    if (
      building.connector &&
      (!contains(building.footprint, building.connector) ||
        building.connector.width < 1.3 ||
        building.connector.depth < 1.3)
    )
      report(`${field}.connector`, building.id, 'blocked-connector')
    if (building.floors > 1 && !building.connector)
      report(`${field}.connector`, building.id, 'transfer-connector')
    for (const other of document.buildings.slice(index + 1)) {
      if (overlaps(building.footprint, other.footprint, 3))
        report(`${field}.footprint`, building.id, 'overlap')
    }
  }
  for (const [index, room] of document.rooms.entries()) {
    const field = `rooms[${index}]`
    checkTheme(room, `${field}.themeId`)
    const building = buildings.get(room.buildingId)
    if (!building) {
      report(`${field}.buildingId`, room.target, 'unknown-building')
      continue
    }
    if (room.floorNumber > building.floors)
      report(`${field}.floorNumber`, room.target, 'unknown-floor')
    validateRoom({ room, building, field, context, report })
    for (const other of document.rooms.slice(index + 1)) {
      if (room.buildingId !== other.buildingId || room.floorNumber !== other.floorNumber) continue
      if (overlaps({ ...room.position, ...room.size }, { ...other.position, ...other.size }))
        report(field, room.target, 'overlap')
      const entrance = {
        ...doorway(room.size, room.door),
        x: room.position.x + room.door.x,
        z: room.position.z + room.door.z
      }
      const otherEntrance = {
        ...doorway(other.size, other.door),
        x: other.position.x + other.door.x,
        z: other.position.z + other.door.z
      }
      if (
        overlaps(entrance, { ...other.position, ...other.size }) ||
        overlaps(otherEntrance, { ...room.position, ...room.size })
      )
        report(`${field}.door`, room.target, 'blocked-entrance')
    }
  }
  for (const [index, venue] of document.venues.entries()) {
    const field = `venues[${index}]`
    checkTheme(venue, `${field}.themeId`)
    if (!edgeDoor(venue.footprint, venue.entrance))
      report(`${field}.entrance`, venue.id, 'invalid-door')
    if (venue.capacity > venue.slots.length)
      report(`${field}.capacity`, venue.id, 'occupied-capacity')
    const virtualRoom: WorldRoom = {
      id: venue.id,
      target: `session:${venue.id}`,
      buildingId: '',
      floorNumber: 1,
      position: { x: 0, z: 0 },
      size: venue.footprint,
      door: venue.entrance,
      desks: venue.slots
    }
    for (const slot of venue.slots) {
      if (!deskHasClearance(virtualRoom, slot)) report(`${field}.slots`, venue.id, 'desk-clearance')
      else if (!deskIsReachable(virtualRoom, slot))
        report(`${field}.slots`, venue.id, 'desk-unreachable')
    }
    for (const building of document.buildings)
      if (overlaps(venue.footprint, building.footprint, 3))
        report(`${field}.footprint`, venue.id, 'overlap')
    for (const other of document.venues.slice(index + 1))
      if (overlaps(venue.footprint, other.footprint, 3))
        report(`${field}.footprint`, venue.id, 'overlap')
  }
  // A floor's game corner is laid in whatever free space it has, so none is reserved here.
  for (const building of document.buildings) {
    for (let floorNumber = 1; floorNumber <= building.floors; floorNumber++) {
      const rooms = document.rooms.filter(
        (room) => room.buildingId === building.id && room.floorNumber === floorNumber
      )
      if (
        errors.some(
          (error) =>
            error.target === building.id || rooms.some((room) => room.target === error.target)
        )
      )
        continue
      for (const target of unreachableFloorTargets({ building, rooms, floorNumber })) {
        report(
          'rooms.door',
          target,
          target === building.id ? 'blocked-connector' : 'blocked-entrance'
        )
      }
    }
  }
  return errors
}

interface RoomValidation {
  room: WorldRoom
  building: WorldBuilding
  field: string
  context: WorldValidationContext
  report: (field: string, target: string, reason: WorldValidationReason) => void
}
function validateRoom({ room, building, field, context, report }: RoomValidation): void {
  if (!contains(building.footprint, { ...room.position, ...room.size }, 0.65))
    report(`${field}.position`, room.target, 'outside-building')
  if (!edgeDoor(room.size, room.door)) report(`${field}.door`, room.target, 'invalid-door')
  const roomBounds = { ...room.position, ...room.size }
  if (overlaps(roomBounds, doorway(building.footprint, building.entrance)))
    report(`${field}.position`, room.target, 'blocked-entrance')
  if (building.connector && overlaps(roomBounds, building.connector, 0.65))
    report(`${field}.position`, room.target, 'blocked-connector')
  const live = context.sessions.find((session) => room.target === `session:${session.key}`)
  if (
    room.target.startsWith('team:') &&
    room.target !== `team:${building.companyKey}:${building.projectKey}`
  )
    report(`${field}.target`, room.target, 'identity-binding')
  const minimum = live
    ? 1 + Math.min(2, live.subagents.length)
    : room.target.startsWith('team:')
      ? context.sessions
          .filter(
            (session) =>
              session.companyKey === building.companyKey &&
              session.projectKey === building.projectKey
          )
          .reduce((count, session) => count + teamSeatsFor(session.subagents.length), 0)
      : 0
  const requiredIds = live
    ? ['desk_main', ...GUEST_DESK_IDS.slice(0, Math.min(2, live.subagents.length))]
    : Array.from({ length: minimum }, (_, index) => `team_seat_${index}`)
  if (
    room.desks.length < minimum ||
    requiredIds.some((id) => !room.desks.some((desk) => desk.id === id))
  )
    report(`${field}.desks`, room.target, 'occupied-capacity')
  for (const desk of room.desks) {
    if (!deskHasClearance(room, desk))
      report(`${field}.desks.${desk.id}`, room.target, 'desk-clearance')
    else if (!deskIsReachable(room, desk))
      report(`${field}.desks.${desk.id}`, room.target, 'desk-unreachable')
  }
}
