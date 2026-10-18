import { describe, expect, it } from 'vitest'
import { resolveEffectiveWorld } from '../../../office/sim/effective-world'
import { buildLayout } from '../../../office/sim/layout'
import { createWorldDocument } from '../../../shared/office/world-document'
import { toFloorGeometry } from '../../office-live/layout-geometry'
import { makeSession } from '../__tests__/fixtures'
import { ISO_START_AZIMUTH } from '../logic/camera-bands'
import type { FloorGeometry } from '../scene-model'
import { floorElevation, groundEnvelope, PHYSICAL_STOREY_HEIGHT } from '../scene/all-floor-model'
import { buildingCrown } from '../themes/physical-building-parts'
import { getTheme } from '../themes/registry'
import { distributedTown } from './distributed-town'
import { MAP_ROTATIONS, isHidden, plainSightShare, type SightBox } from './sightline.test-utils'
import { townOf } from './use-town-plan'

const HERE = { x: 0, z: 0 }
const boxAt = (x: number, z: number, height: number): SightBox => ({
  x,
  z,
  width: 2,
  depth: 2,
  height
})

describe('isHidden', () => {
  it('looks from the four map rotations, a quarter turn apart', () => {
    expect(MAP_ROTATIONS).toHaveLength(4)
    expect(MAP_ROTATIONS[0]).toBe(ISO_START_AZIMUTH)
    expect(MAP_ROTATIONS[1] - MAP_ROTATIONS[0]).toBeCloseTo(Math.PI / 2)
  })

  it('hides a ground point behind a box tall enough to cover the sightline', () => {
    // The camera stands toward +x +z; the box's near corner is 2.83 m away, where the line of
    // sight has risen 1.98 m.
    expect(isHidden(HERE, [boxAt(3, 3, 2)], ISO_START_AZIMUTH)).toBe(true)
    expect(isHidden(HERE, [boxAt(3, 3, 1.9)], ISO_START_AZIMUTH)).toBe(false)
  })

  it('leaves a point in sight when the box stands behind it or to one side', () => {
    expect(isHidden(HERE, [boxAt(-3, -3, 20)], ISO_START_AZIMUTH)).toBe(false)
    expect(isHidden(HERE, [boxAt(3, -3, 20)], ISO_START_AZIMUTH)).toBe(false)
  })

  it('hides the same point from the opposite rotation only', () => {
    const behind = [boxAt(-3, -3, 20)]
    expect(isHidden(HERE, behind, MAP_ROTATIONS[2])).toBe(true)
    expect(isHidden(HERE, behind, MAP_ROTATIONS[1])).toBe(false)
  })

  it('sees over a box from a raised point whose sightline clears the box top', () => {
    // At the ground the sightline is 1.98 m up at the box; 0.1 m higher it clears 2 m.
    expect(isHidden({ ...HERE, height: 0 }, [boxAt(3, 3, 2)], ISO_START_AZIMUTH)).toBe(true)
    expect(isHidden({ ...HERE, height: 0.1 }, [boxAt(3, 3, 2)], ISO_START_AZIMUTH)).toBe(false)
  })

  it('hides a point that stands inside a box', () => {
    expect(isHidden(HERE, [boxAt(0, 0, 0.5)], ISO_START_AZIMUTH)).toBe(true)
  })
})

describe('plainSightShare', () => {
  it('is the part of the points no box hides', () => {
    const points = [HERE, { x: 20, z: 20 }]
    expect(plainSightShare(points, [boxAt(3, 3, 5)], ISO_START_AZIMUTH)).toBe(0.5)
    expect(plainSightShare([], [], ISO_START_AZIMUTH)).toBe(1)
  })
})

// Venues keep 3 m from offices, so the Heights rule caps their landmarks at 0.7 × 3 + 4 m.
const VENUE_CAP_M = 0.7 * 3 + 4

function topFloors(floors: readonly FloorGeometry[]): FloorGeometry[] {
  const tops = new Map<string, FloorGeometry>()
  for (const floor of floors) {
    const key = floor.buildingId ?? floor.floorId
    const top = tops.get(key)
    if (!top || floorElevation(floor) > floorElevation(top)) tops.set(key, floor)
  }
  return [...tops.values()]
}

const footprintOf = (floor: FloorGeometry, height: number): SightBox => ({
  x: floor.x,
  z: floor.z,
  width: floor.width,
  depth: floor.depth,
  height
})

describe('the skyline keeps offices in sight (A4)', () => {
  it("an office's crown sign and spire base stay in sight over their neighbours at all four rotations", () => {
    const sessions = Array.from({ length: 24 }, (_, index) =>
      makeSession({
        key: `claude:${index}`,
        companyKey: `company:${index % 6}`,
        projectKey: `project:${index % 12}`
      })
    )
    const base = buildLayout(sessions, undefined)
    const document = createWorldDocument(base, sessions)
    const floors = toFloorGeometry(resolveEffectiveWorld(base, document, sessions), sessions)
    const ground = floors.filter((floor) => floorElevation(floor) === 0)
    const venues = document.venues.map((venue) => venue.footprint)
    const town = distributedTown(townOf(groundEnvelope(ground, floors[0]), null), [
      ...ground,
      ...venues
    ])
    const theme = getTheme('corporate-city')
    const offices = topFloors(floors).map((top) => ({
      top,
      roof: floorElevation(top) + PHYSICAL_STOREY_HEIGHT,
      // The sign's anchor (Task 2.2) is the crown's top.
      crown: Math.max(
        ...buildingCrown({ floor: top, theme }).map((part) => part.at[1] + part.size[1] / 2)
      )
    }))
    // Upper bounds: every lot at its height limit, every venue at the landmark cap.
    const filler: SightBox[] = [
      ...town.plan.lots.map((lot) => ({ ...lot, height: lot.maxHeight })),
      ...venues.map((venue) => ({ ...venue, height: VENUE_CAP_M }))
    ]
    expect(offices.length).toBeGreaterThan(1)
    expect(town.plan.lots.length).toBeGreaterThan(0)
    const hidden: string[] = []
    for (const { top, roof, crown } of offices) {
      const others = offices.filter((other) => other.top !== top)
      const neighbours = [...filler, ...others.map((other) => footprintOf(other.top, other.crown))]
      for (const [turn, azimuth] of MAP_ROTATIONS.entries())
        for (const [mark, height] of [
          ['crown sign', crown],
          ['spire base', roof]
        ] as const)
          if (isHidden({ x: top.x, z: top.z, height }, neighbours, azimuth))
            hidden.push(`${top.buildingId} ${mark} at turn ${turn}`)
    }
    expect(hidden).toEqual([])
  })
})
