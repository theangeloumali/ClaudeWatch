import { createElement, isValidElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { Group } from 'three'
import { makeSession } from '../__tests__/fixtures'
import { layoutFloor } from '../fixture/fixture-layout'
import type { WorldVenue } from '../../../shared/office/world-document'
import type { FloorGeometry, LoungeGeometry } from '../scene-model'
import { VenueLayer } from '../scene/VenueLayer'
import { everyElement, mergedDraws, type SceneElement } from './scene.test-utils'
import type { OfficeTheme } from './types'
import { frameCallbacks } from './frame-capture.test-utils'
import { drawnTown } from '../town/drawn-town.test-utils'
import type { LotKit } from './lot-kit'

// What one theme may add across its lounge and ambient parts.
const FILL_DRAW_BUDGET = 9
const SEAT_CLEAR_M = 0.5
const AISLE_HALF_M = 2.4
const EPSILON = 1e-6

function crowdedFloor(): FloorGeometry {
  const sessions = Array.from({ length: 60 }, (_, index) =>
    makeSession({
      key: `claude:${index}`,
      provider: index % 2 ? 'codex' : 'claude',
      companyKey: `c_${index % 10}`,
      companyLabel: `Company ${index % 10}`,
      projectKey: `p_${index % 10}`,
      projectLabel: `Project ${index % 10}`
    })
  )
  return layoutFloor({ sessions })
}

function named(elements: readonly SceneElement[], name: string): SceneElement[] {
  return elements.filter((element) => element.props.name === name)
}

interface Placement {
  position?: [number, number, number]
  scale?: [number, number, number]
  ref?: (node: Group | null) => void
}
const placement = (element: SceneElement): Placement => element.props as Placement

function expectLoungeIsClear(theme: OfficeTheme, lounge: LoungeGeometry): void {
  const Lounge = theme.kit.zone.Lounge
  if (!Lounge) throw new Error(`${theme.id} has no lounge`)
  const elements = everyElement(createElement(Lounge, { lounge }))
  const seats = named(elements, 'lounge-seat')
  expect(seats.map((seat) => placement(seat).position?.[0])).toEqual(
    lounge.seats.map((seat) => seat.x)
  )
  expect(seats.map((seat) => placement(seat).position?.[2])).toEqual(
    lounge.seats.map((seat) => seat.z)
  )
  for (const seat of seats)
    expect(everyElement(seat.props.children).some((part) => part.type === 'mesh')).toBe(true)

  const decor = named(elements, 'lounge-decor').flatMap((group) =>
    everyElement(group.props.children).filter((part) => part.type === 'mesh')
  )
  expect(decor.length).toBeGreaterThan(8)
  const lastRow = Math.max(...lounge.seats.map((seat) => seat.z))
  for (const part of decor) {
    const [x, , z] = placement(part).position ?? [0, 0, 0]
    const [sizeX, , sizeZ] = placement(part).scale ?? [0, 0, 0]
    const reachX = sizeX / 2
    const reachZ = sizeZ / 2
    expect(Math.abs(x - lounge.x) + reachX, 'decor leaves the lounge').toBeLessThanOrEqual(
      lounge.width / 2 + EPSILON
    )
    expect(Math.abs(z - lounge.z) + reachZ, 'decor leaves the lounge').toBeLessThanOrEqual(
      lounge.depth / 2 + EPSILON
    )
    // The seats and the way in from the door: from the door wall to past the last row.
    const isBesideSeats = Math.abs(x - lounge.x) - reachX >= AISLE_HALF_M
    const isPastSeats = z - reachZ >= lastRow + SEAT_CLEAR_M
    expect(isBesideSeats || isPastSeats, `decor at ${x}, ${z} stands in the way`).toBe(true)
  }
}

// The theme's Ambient part, handed what the zoned town draws, as TownAmbient hands it.
function ambientOn(theme: OfficeTheme, floor: FloorGeometry, isReducedMotion: boolean) {
  const Ambient = theme.kit.zone.Ambient
  if (!Ambient) throw new Error(`${theme.id} has no ambient part`)
  const placed = drawnTown(theme.id, floor)
  const lots = placed.map((each) => each.lot)
  return createElement(Ambient, { floor, lots, placed, isReducedMotion })
}

function moverPoses(
  theme: OfficeTheme,
  floor: FloorGeometry,
  moverNames: readonly string[],
  isReducedMotion: boolean
) {
  frameCallbacks.length = 0
  const elements = everyElement(ambientOn(theme, floor, isReducedMotion))
  const invalidate = vi.fn()
  const movers = moverNames.map((name) => {
    const found = named(elements, name)
    expect(found.length, `${name} movers`).toBeGreaterThan(0)
    return found.map((element) => {
      const node = new Group()
      placement(element).ref?.(node)
      return node
    })
  })
  const poseAt = (elapsedTime: number): number[][] => {
    for (const callback of frameCallbacks) callback({ clock: { elapsedTime }, invalidate }, 0.016)
    return movers.map((group) =>
      group.flatMap((node) => [...node.position.toArray(), node.rotation.y, node.rotation.z])
    )
  }
  return { first: poseAt(0.7), second: poseAt(2.3), invalidate }
}

// A floor lounge handed to the city as a lounge venue, which is where theme lounges draw now.
function venueOf(lounge: LoungeGeometry): WorldVenue {
  return {
    id: lounge.id,
    kind: 'lounge',
    footprint: { x: lounge.x, z: lounge.z, width: lounge.width, depth: lounge.depth },
    entrance: { x: lounge.door.x - lounge.x, z: lounge.door.z - lounge.z },
    slots: lounge.seats.map((seat) => ({
      id: seat.slotId,
      x: seat.x - lounge.x,
      z: seat.z - lounge.z,
      heading: seat.heading
    })),
    capacity: lounge.seats.length
  }
}

function fillDraws(theme: OfficeTheme, floor: FloorGeometry) {
  const bare: OfficeTheme = {
    ...theme,
    id: `test-bare-${theme.id}`,
    kit: { ...theme.kit, zone: { ...theme.kit.zone, Lounge: undefined } }
  }
  const venues = floor.zones.flatMap((zone) => (zone.lounge ? [venueOf(zone.lounge)] : []))
  expect(venues.length).toBeGreaterThan(0)
  // VenueLayer is one BatchedScene; its children merge as that batch does.
  const batchOf = (drawn: OfficeTheme): ReactNode => {
    const layer = VenueLayer({ venues, palette: drawn.palette, theme: drawn })
    if (!isValidElement<{ children?: ReactNode }>(layer)) throw new Error('No venue batch')
    return layer.props.children
  }
  expect(named(everyElement(batchOf(theme)), 'lounge-seat').length).toBeGreaterThan(0)
  const kitDraws = (drawn: OfficeTheme): number => mergedDraws(batchOf(drawn)).untextured
  const ambient = mergedDraws(ambientOn(theme, floor, true)).draws
  return { ambient, lounge: kitDraws(theme) - kitDraws(bare) }
}

// The lounge and ambient checks a theme with both must pass; each theme's own test calls this.
export function describeLoungeAndAmbient(
  theme: OfficeTheme,
  kit: LotKit,
  moverNames: readonly [string, string]
): void {
  const floor = crowdedFloor()

  it('offers at least four buildings and six props, each under its own name', () => {
    const names = [...kit.buildings, ...kit.props].map((design) => design.name)
    expect(kit.buildings.length).toBeGreaterThanOrEqual(4)
    expect(kit.props.length).toBeGreaterThanOrEqual(6)
    expect(new Set(names).size).toBe(names.length)
  })

  it('registers a lounge and an ambient part on its zone kit', () => {
    const { Lounge, Ambient } = theme.kit.zone
    expect([Lounge, Ambient].every((part) => part !== undefined)).toBe(true)
  })

  it('puts a seat at every lounge slot and leaves the seats and the way in clear', () => {
    const lounges = floor.zones.flatMap((zone) => (zone.lounge ? [zone.lounge] : []))
    expect(lounges.length).toBeGreaterThan(0)
    for (const lounge of lounges) expectLoungeIsClear(theme, lounge)
  })

  it('moves two kinds of things without ever asking for a frame', () => {
    const { first, second, invalidate } = moverPoses(theme, floor, moverNames, false)
    expect(first[0]).not.toEqual(second[0])
    expect(first[1]).not.toEqual(second[1])
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('holds its moving things still under reduced motion', () => {
    const { first, second } = moverPoses(theme, floor, moverNames, true)
    expect(first).toEqual(second)
  })

  it('adds at most nine draws across its lounge and ambient parts', () => {
    const { ambient, lounge } = fillDraws(theme, floor)
    expect(ambient).toBeGreaterThan(0)
    expect(ambient + lounge).toBeLessThanOrEqual(FILL_DRAW_BUDGET)
  }, 30_000)
}
