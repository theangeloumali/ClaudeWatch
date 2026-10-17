import { describe, expect, it } from 'vitest'
import { attachDoor, sidewalkPath } from '../../../../shared/office/sidewalks'
import { citySidewalks } from '../../citizens/city-sidewalks'
import { routePose, type RoutePoint } from '../../citizens/route-pose'
import { streetFootprint } from '../distributed-town'
import type { TownLot } from '../town-lots'
import type { TownPlan } from '../town-plan'
import { workStops } from '../work-trips'
import { liveCity, twoOfficeCity, type Scenario } from './pedestrian.test-utils'

const CITIES: readonly (readonly [string, () => Scenario])[] = [
  ['two-office', twoOfficeCity],
  ['live', liveCity]
]

const isSame = (a: RoutePoint, b: RoutePoint): boolean => Math.hypot(a.x - b.x, a.z - b.z) < 1e-6

// A street reaches a door that lies inside its footprint, kerb to kerb.
function reachedLots(plan: TownPlan): TownLot[] {
  const streets = plan.roads.map(streetFootprint)
  return plan.lots.filter(
    ({ door }) =>
      door &&
      streets.some(
        (street) =>
          Math.abs(door.x - street.x) <= street.width / 2 &&
          Math.abs(door.z - street.z) <= street.depth / 2
      )
  )
}

// Offices cut two of its streets short, leaving lots behind them with no street in front.
it('the two-office city has lots no street reaches', () => {
  const { plan } = twoOfficeCity()
  expect(plan.lots.length - reachedLots(plan).length).toBe(2)
})

describe.each(CITIES)('lot doors in the %s city', (_name, cityOf) => {
  it('no trip of any kind targets a lot whose door no street reaches', () => {
    const { plan, trips } = cityOf()
    const reached = reachedLots(plan)
    const reachedIds = new Set(reached.map((lot) => lot.id))
    const isReachedDoor = (point: RoutePoint): boolean =>
      reached.some((lot) => lot.door && isSame(lot.door, point))
    // A citizen's home and a freight loop's workshop.
    const homeIds = trips.flatMap((trip) => (trip.homeId === null ? [] : [trip.homeId]))
    expect(homeIds.length).toBeGreaterThan(0)
    expect(homeIds.filter((id) => !reachedIds.has(id))).toEqual([])
    // Where a citizen goes: a lot's door, or a plaza stand at one.
    const goals = trips
      .filter((trip) => trip.kind === 'citizen' && trip.destination !== null)
      .map((trip) => routePose({ ...trip.route, stops: [] }, trip.route.stops?.[0].at ?? 0))
    expect(goals.filter((goal) => !isReachedDoor(goal))).toEqual([])
    // The workshop an edit call sends freight to from each office.
    const workshops = plan.officeSites.flatMap(
      (office) => workStops(plan, 'freight', { x: office.x, z: office.z })?.[1].point ?? []
    )
    expect(workshops.length).toBeGreaterThan(0)
    expect(workshops.filter((point) => !isReachedDoor(point))).toEqual([])
  })

  it('every lot door a trip may target sits on a sidewalk', () => {
    const { plan } = cityOf()
    const { network } = citySidewalks(plan)
    // A door on a sidewalk lands on it; one off every kerb is joined by a hop.
    expect(network.edges.filter((edge) => edge.kind === 'hop')).toEqual([])
    const ids = plan.lots.flatMap((lot) => (lot.door ? [attachDoor(network, lot.door)] : []))
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.filter((id) => !sidewalkPath(network, ids[0], id))).toEqual([])
  })
})
