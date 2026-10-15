import { isJsonObject } from '../json-object'
import { UNSAFE_IN_A_NAME } from '../unsafe-text'
import { WORLD_DOCUMENT_LIMITS as LIMITS } from './world-document-limits'
import type { WorldDocument, WorldValidationError } from './world-document-types'

type ObjectShape = Record<string, unknown>
const isFiniteMetres = (coordinate: unknown): coordinate is number =>
  typeof coordinate === 'number' &&
  Number.isFinite(coordinate) &&
  Math.abs(coordinate) <= LIMITS.worldMetres
const isCount = (count: unknown): count is number =>
  typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
const isText = (text: unknown, limit: number = LIMITS.identity): text is string =>
  typeof text === 'string' &&
  text.length > 0 &&
  Array.from(text).length <= limit &&
  !['__proto__', 'prototype', 'constructor'].includes(text) &&
  !UNSAFE_IN_A_NAME.test(text)

function objectWithKeys(
  candidate: unknown,
  required: string[],
  optional: string[] = []
): candidate is ObjectShape {
  if (!isJsonObject(candidate)) return false
  const prototype: unknown = Object.getPrototypeOf(candidate)
  if (prototype !== null && prototype !== Object.prototype) return false
  const allowed = new Set([...required, ...optional])
  return (
    required.every((key) => Object.hasOwn(candidate, key)) &&
    Object.getOwnPropertyNames(candidate).every((key) => allowed.has(key)) &&
    Object.getOwnPropertySymbols(candidate).length === 0 &&
    Object.values(Object.getOwnPropertyDescriptors(candidate)).every(
      (descriptor) => 'value' in descriptor
    )
  )
}

function point(candidate: unknown): boolean {
  return (
    objectWithKeys(candidate, ['x', 'z']) &&
    isFiniteMetres(candidate.x) &&
    isFiniteMetres(candidate.z)
  )
}
function size(candidate: unknown): boolean {
  return (
    objectWithKeys(candidate, ['width', 'depth']) &&
    dimension(candidate.width) &&
    dimension(candidate.depth)
  )
}
function dimension(length: unknown): boolean {
  return (
    typeof length === 'number' &&
    Number.isFinite(length) &&
    length >= 1 &&
    length <= LIMITS.buildingMetres
  )
}
function footprint(candidate: unknown): boolean {
  return (
    objectWithKeys(candidate, ['x', 'z', 'width', 'depth']) &&
    isFiniteMetres(candidate.x) &&
    isFiniteMetres(candidate.z) &&
    dimension(candidate.width) &&
    dimension(candidate.depth)
  )
}
function presentation(candidate: ObjectShape): boolean {
  return (
    (candidate.displayName === undefined || isText(candidate.displayName, LIMITS.labels)) &&
    (candidate.themeId === undefined || isText(candidate.themeId, LIMITS.labels))
  )
}
function desks(candidate: unknown): boolean {
  return boundedArray(
    candidate,
    LIMITS.desks,
    (desk: unknown) =>
      objectWithKeys(desk, ['id', 'x', 'z', 'heading']) &&
      isText(desk.id) &&
      isFiniteMetres(desk.x) &&
      isFiniteMetres(desk.z) &&
      typeof desk.heading === 'number' &&
      Number.isFinite(desk.heading) &&
      Math.abs(desk.heading) <= Math.PI * 2
  )
}
function building(candidate: unknown): boolean {
  return (
    objectWithKeys(
      candidate,
      ['id', 'companyKey', 'projectKey', 'displayName', 'footprint', 'floors', 'entrance'],
      ['themeId', 'connector']
    ) &&
    isText(candidate.id) &&
    isText(candidate.companyKey) &&
    isText(candidate.projectKey) &&
    presentation(candidate) &&
    footprint(candidate.footprint) &&
    point(candidate.entrance) &&
    isCount(candidate.floors) &&
    candidate.floors >= 1 &&
    candidate.floors <= LIMITS.floors &&
    (candidate.connector === undefined || footprint(candidate.connector))
  )
}
function room(candidate: unknown): boolean {
  return (
    objectWithKeys(
      candidate,
      ['id', 'target', 'buildingId', 'floorNumber', 'position', 'size', 'door', 'desks'],
      ['displayName', 'themeId']
    ) &&
    isText(candidate.id) &&
    isText(candidate.target) &&
    /^(session:.+|team:.+:.+)$/u.test(candidate.target) &&
    isText(candidate.buildingId) &&
    isCount(candidate.floorNumber) &&
    candidate.floorNumber >= 1 &&
    candidate.floorNumber <= LIMITS.floors &&
    point(candidate.position) &&
    size(candidate.size) &&
    point(candidate.door) &&
    desks(candidate.desks) &&
    presentation(candidate)
  )
}
function venue(candidate: unknown): boolean {
  return (
    objectWithKeys(
      candidate,
      ['id', 'kind', 'footprint', 'entrance', 'slots', 'capacity'],
      ['displayName', 'themeId']
    ) &&
    isText(candidate.id) &&
    typeof candidate.kind === 'string' &&
    ['arcade', 'lounge', 'market', 'garage', 'transit'].includes(candidate.kind) &&
    footprint(candidate.footprint) &&
    point(candidate.entrance) &&
    desks(candidate.slots) &&
    isCount(candidate.capacity) &&
    candidate.capacity <= LIMITS.desks &&
    presentation(candidate)
  )
}
function allocation(candidate: unknown): boolean {
  if (!objectWithKeys(candidate, ['reservations', 'order'])) return false
  return (
    boundedArray(
      candidate.reservations,
      LIMITS.allocation,
      (reservation) =>
        objectWithKeys(reservation, [
          'sessionKey',
          'floorId',
          'plate',
          'bay',
          'companyKey',
          'projectKey'
        ]) &&
        ['sessionKey', 'floorId', 'companyKey', 'projectKey'].every((key) =>
          isText(reservation[key])
        ) &&
        isCount(reservation.plate) &&
        reservation.plate <= LIMITS.allocation &&
        isCount(reservation.bay) &&
        reservation.bay < LIMITS.rooms
    ) &&
    boundedArray(
      candidate.order,
      LIMITS.allocation,
      (order) =>
        objectWithKeys(order, ['companyKey', 'index'], ['projectKey']) &&
        isText(order.companyKey) &&
        (order.projectKey === undefined || isText(order.projectKey)) &&
        isCount(order.index) &&
        order.index < LIMITS.allocation
    )
  )
}
function boundedArray(
  candidate: unknown,
  maximum: number,
  check: (entry: unknown) => boolean
): boolean {
  return (
    Array.isArray(candidate) &&
    candidate.length <= maximum &&
    Object.getPrototypeOf(candidate) === Array.prototype &&
    Object.getOwnPropertySymbols(candidate).length === 0 &&
    Object.getOwnPropertyNames(candidate).every(
      (key) => key === 'length' || (/^(0|[1-9]\d*)$/u.test(key) && Number(key) < candidate.length)
    ) &&
    Object.values(Object.getOwnPropertyDescriptors(candidate)).every(
      (descriptor) => 'value' in descriptor
    ) &&
    Array.from(candidate).every(check)
  )
}

export function worldDocumentShapeErrors(candidate: unknown): WorldValidationError[] {
  if (!isJsonObject(candidate)) return [{ field: 'document', target: '', reason: 'invalid-shape' }]
  const errors: WorldValidationError[] = []
  if (!isCount(candidate.revision))
    errors.push({ field: 'revision', target: '', reason: 'invalid-shape' })
  for (const [field, check] of [
    ['buildings', building],
    ['rooms', room],
    ['venues', venue]
  ] as const) {
    const entries: unknown = candidate[field]
    if (!Array.isArray(entries)) {
      errors.push({ field, target: '', reason: 'invalid-shape' })
      continue
    }
    for (const [index, entry] of entries.entries())
      if (!check(entry)) {
        errors.push({
          field: `${field}[${index}]`,
          target: isJsonObject(entry) && typeof entry.id === 'string' ? entry.id : '',
          reason: 'invalid-shape'
        })
        if (errors.length >= LIMITS.errors) return errors
      }
  }
  if (candidate.allocation !== undefined && !allocation(candidate.allocation))
    errors.push({ field: 'allocation', target: '', reason: 'invalid-shape' })
  return errors.length ? errors : [{ field: 'document', target: '', reason: 'invalid-shape' }]
}

export function isWorldDocument(candidate: unknown): candidate is WorldDocument {
  return (
    objectWithKeys(
      candidate,
      ['version', 'revision', 'buildings', 'rooms', 'venues'],
      ['allocation']
    ) &&
    candidate.version === 2 &&
    isCount(candidate.revision) &&
    candidate.revision < Number.MAX_SAFE_INTEGER &&
    boundedArray(candidate.buildings, LIMITS.buildings, building) &&
    boundedArray(candidate.rooms, LIMITS.rooms, room) &&
    boundedArray(candidate.venues, LIMITS.buildings, venue) &&
    (candidate.allocation === undefined || allocation(candidate.allocation))
  )
}

export function documentDuplicates(document: WorldDocument): WorldValidationError[] {
  const errors: WorldValidationError[] = []
  const addDuplicates = (identities: string[], field: string): void => {
    const seen = new Set<string>()
    for (const identity of identities) {
      if (seen.has(identity)) errors.push({ field, target: identity, reason: 'duplicate' })
      seen.add(identity)
    }
  }
  addDuplicates(
    [...document.buildings, ...document.rooms, ...document.venues].map((entry) => entry.id),
    'id'
  )
  addDuplicates(
    document.rooms.map((entry) => entry.target),
    'rooms.target'
  )
  addDuplicates(
    document.buildings.map((entry) => JSON.stringify([entry.companyKey, entry.projectKey])),
    'buildings.binding'
  )
  for (const entry of document.rooms)
    addDuplicates(
      entry.desks.map((desk) => desk.id),
      `rooms.${entry.id}.desks`
    )
  for (const entry of document.venues)
    addDuplicates(
      entry.slots.map((slot) => slot.id),
      `venues.${entry.id}.slots`
    )
  addDuplicates(
    document.allocation?.reservations.map((held) => held.sessionKey) ?? [],
    'allocation.reservations'
  )
  addDuplicates(
    document.allocation?.order.map((order) =>
      JSON.stringify([order.companyKey, order.projectKey])
    ) ?? [],
    'allocation.order'
  )
  const deskCount =
    document.rooms.reduce((count, entry) => count + entry.desks.length, 0) +
    document.venues.reduce((count, entry) => count + entry.slots.length, 0)
  if (deskCount > LIMITS.desks) errors.push({ field: 'desks', target: '', reason: 'limit' })
  return errors.slice(0, LIMITS.errors)
}
