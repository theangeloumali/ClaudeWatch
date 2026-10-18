import { describe, expect, it } from 'vitest'
import { crosswalks, type Crosswalk } from '../crosswalks'
import { SIDEWALK_M, type TownRoad } from '../town-roads'
import { OFF_GRID_SITES, liveCitySites, streetsFor } from './live-city-streets.test-utils'

const CITIES: readonly (readonly [string, TownRoad[]])[] = [
  ['the live city', streetsFor(liveCitySites())],
  ['an off-grid city with access lanes', streetsFor(OFF_GRID_SITES)]
]

const isAlongX = (road: TownRoad): boolean => road.from.z === road.to.z
const alongOf = (road: TownRoad, point: { x: number; z: number }): number =>
  isAlongX(road) ? point.x : point.z
const acrossOf = (road: TownRoad, point: { x: number; z: number }): number =>
  isAlongX(road) ? point.z - road.from.z : point.x - road.from.x
const spanOf = (road: TownRoad): [number, number] => {
  const [a, b] = [alongOf(road, road.from), alongOf(road, road.to)]
  return [Math.min(a, b), Math.max(a, b)]
}
const roadOf = (roads: readonly TownRoad[], crossing: Crosswalk): TownRoad => {
  const road = roads.find((each) => each.id === crossing.roadId)
  if (!road) throw new Error(`No road ${crossing.roadId}`)
  return road
}

describe.each(CITIES)('crosswalks on %s', (_name, roads) => {
  const found = crosswalks(roads)

  it('lays every zebra across its own carriageway, kerb to kerb', () => {
    expect(found.length).toBeGreaterThan(0)
    for (const crossing of found) {
      const road = roadOf(roads, crossing)
      expect(road.class).not.toBe('lane')
      expect(acrossOf(road, crossing.centre)).toBeCloseTo(0)
      expect(crossing.axis).toBe(isAlongX(road) ? 'z' : 'x')
      expect(crossing.halfLength).toBeCloseTo(road.width / 2 - SIDEWALK_M[road.class])
    }
    expect(new Set(found.map((crossing) => crossing.id)).size).toBe(found.length)
  })

  it('drops a band that passes a segment end', () => {
    for (const crossing of found) {
      const road = roadOf(roads, crossing)
      const [start, end] = spanOf(road)
      const along = alongOf(road, crossing.centre)
      expect(along - 1.5, crossing.id).toBeGreaterThanOrEqual(start)
      expect(along + 1.5, crossing.id).toBeLessThanOrEqual(end)
    }
  })

  it('holds traffic each way 2.2 m either side of the zebra, each in its own lane', () => {
    for (const crossing of found) {
      const road = roadOf(roads, crossing)
      const halfCarriageway = road.width / 2 - SIDEWALK_M[road.class]
      const [first, second] = crossing.stopLines.map((point) => ({
        along: alongOf(road, point) - alongOf(road, crossing.centre),
        across: acrossOf(road, point)
      }))
      expect(Math.abs(first.along)).toBeCloseTo(2.2)
      expect(second.along).toBeCloseTo(-first.along)
      expect(Math.abs(first.across)).toBeCloseTo(halfCarriageway / 2)
      expect(second.across).toBeCloseTo(-first.across)
    }
  })
})

describe('crosswalk placement', () => {
  it('puts zebras on both sides of an avenue junction, just past the cross street', () => {
    const roads = streetsFor(liveCitySites())
    const centres = crosswalks(roads)
      .filter((crossing) => crossing.roadId === 'city-street:7')
      .map((crossing) => crossing.centre.x)
    // The cross avenue is 18 m wide: zebras sit 2.2 m past its kerb line.
    expect(centres).toEqual(expect.arrayContaining([-11.2, 11.2]))
  })

  it('stops traffic heading for the junction on its keep-left lane, before the zebra', () => {
    const roads = streetsFor(liveCitySites())
    const east = crosswalks(roads).find(
      (crossing) => crossing.roadId === 'city-street:7' && crossing.centre.x === 11.2
    )
    // Westbound traffic keeps left, to the south; eastbound leaves on the north half.
    expect(east?.stopLines).toEqual([
      { x: 13.4, z: 3.75 },
      { x: 9, z: -3.75 }
    ])
  })

  it('marks an access-lane mouth like a junction', () => {
    const roads = streetsFor(OFF_GRID_SITES)
    const lanes = roads.filter((road) => road.class === 'lane')
    expect(lanes.length).toBeGreaterThan(0)
    const found = crosswalks(roads)
    for (const lane of lanes) {
      const mouth = [lane.from, lane.to].find((end) =>
        roads.some(
          (road) =>
            road.class !== 'lane' &&
            isAlongX(road) !== isAlongX(lane) &&
            Math.abs(acrossOf(road, end)) < 1e-6
        )
      )
      expect(mouth, lane.id).toBeDefined()
      const nearMouth = found.filter(
        (crossing) =>
          Math.hypot(crossing.centre.x - (mouth?.x ?? 0), crossing.centre.z - (mouth?.z ?? 0)) <
          lane.width / 2 + 2.2 + 1e-6
      )
      expect(nearMouth.length, lane.id).toBeGreaterThan(0)
    }
  })
})
