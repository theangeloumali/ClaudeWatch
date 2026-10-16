import { cityVenueSite } from '../city-access'
import { cityScenerySites } from '../city-scenery'
import { districtStreets, type DistrictSite } from '../district-streets'
import type { TownRoad } from '../town-roads'

// The live City view on 2026-10-16: x, z, width, depth, entrance z (entrance x = x).
export const LIVE_OFFICES = [
  [35.80769230769231, 20.173076923076923, 21.615384615384613, 12.346153846153847, 14],
  [-35.80769230769231, 26.3, 30.015384615384612, 24.6, 14],
  [-35.80769230769231, 77.17307692307692, 21.615384615384613, 12.346153846153847, 71],
  [-35.80769230769231, -96, 42.61538461538461, 38, -115],
  [-35.80769230769231, -46.82692307692308, 21.615384615384613, 12.346153846153847, -53],
  [35.80769230769231, -47, 12, 12, -53],
  [35.80769230769231, -109, 12, 12, -115],
  [35.80769230769231, 77, 12, 12, 71]
] as const
// Venue centres; each is 12 x 10 with its entrance 5 m north.
const LIVE_VENUES = [
  [-99.92307692307692, -48],
  [99.92307692307692, -48],
  [-99.92307692307692, 19],
  [99.92307692307692, 19],
  [-99.92307692307692, -110]
] as const

export const liveVenueSites = (): DistrictSite[] =>
  LIVE_VENUES.map(([x, z]) =>
    cityVenueSite({ footprint: { x, z, width: 12, depth: 10 }, entrance: { x: 0, z: -5 } })
  )

export const liveCitySites = (): DistrictSite[] => [
  ...LIVE_OFFICES.map(([x, z, width, depth, entranceZ]) => ({
    x,
    z,
    width,
    depth,
    entrance: { x, z: entranceZ }
  })),
  ...liveVenueSites()
]

// The streets resolveEffectiveWorld derives for a set of ground sites.
export function streetsFor(sites: readonly DistrictSite[]): TownRoad[] {
  return districtStreets({ sites, obstacles: [...sites, ...cityScenerySites(sites)] })
}

// An office set back from every grid line, so it is reached by an access lane.
export const OFF_GRID_SITES: readonly DistrictSite[] = [
  { x: 0, z: -48, width: 30, depth: 25, entrance: { x: 0, z: -60.5 } },
  { x: 360, z: 0, width: 30, depth: 25, entrance: { x: 360, z: -12.5 } }
]
