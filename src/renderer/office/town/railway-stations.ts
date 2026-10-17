import type { RoutePoint } from '../citizens/route-pose'
import { RAILWAY, type RailwayPlan } from './railway-plan'

export type RailwayTint =
  | 'deck'
  | 'ballast'
  | 'rail'
  | 'parapet'
  | 'pier'
  | 'platform'
  | 'canopy'
  | 'tower'

// A box of the railway: centred at x, y, z, `width` across the track and `length` along it.
export interface RailwayBox {
  x: number
  y: number
  z: number
  width: number
  height: number
  length: number
  heading: number
  tint: RailwayTint
}

export interface RailwayStation {
  id: 'north' | 'east' | 'south' | 'west'
  // Mid-platform, on the deck's centre line.
  centre: RoutePoint
  // Unit steps: clockwise along the ring, and toward the city.
  along: RoutePoint
  inward: RoutePoint
  length: number
  // Where the lift tower meets the ground, on its city face: a web work trip's destination.
  entrance: RoutePoint
}

const PLATFORM_M = 40
// Cityward of the deck's centre: platform, canopy, posts and the lift tower's far face.
const PLATFORM = { across: 4.225, halfWidth: 0.775, top: 5.75 }
const CANOPY = { across: 3.7, halfWidth: 1.3, bottom: 8.8, top: 9 }
const POST = { across: 4.8, size: 0.2, spacing: 8 }
const TOWER = { across: 4.75, halfWidth: 0.5, length: 2, top: 9.4 }

// One station mid-side, on the city side of the deck, so its tower stands 1.75 m off the extent.
export function railwayStations({ extent }: RailwayPlan): RailwayStation[] {
  const reach = RAILWAY.offset
  const sides = [
    { id: 'north', at: [0, -1], along: [1, 0], span: extent.width },
    { id: 'east', at: [1, 0], along: [0, 1], span: extent.depth },
    { id: 'south', at: [0, 1], along: [-1, 0], span: extent.width },
    { id: 'west', at: [-1, 0], along: [0, -1], span: extent.depth }
  ] as const
  return sides.map(({ id, at, along, span }) => {
    const centre = {
      x: extent.x + at[0] * (extent.width / 2 + reach),
      z: extent.z + at[1] * (extent.depth / 2 + reach)
    }
    const inward = { x: -at[0], z: -at[1] }
    const towerFace = TOWER.across + TOWER.halfWidth
    return {
      id,
      centre,
      along: { x: along[0], z: along[1] },
      inward,
      length: Math.min(PLATFORM_M, span * 0.6),
      entrance: { x: centre.x + inward.x * towerFace, z: centre.z + inward.z * towerFace }
    }
  })
}

// The station's boxes, `across` metres cityward of the deck's centre and `ahead` along it.
export function stationBoxes(station: RailwayStation): RailwayBox[] {
  const { centre, along, inward, length } = station
  const heading = Math.atan2(along.x, along.z)
  const place = (
    across: number,
    ahead: number,
    size: Pick<RailwayBox, 'width' | 'length' | 'tint'>,
    [bottom, top]: readonly [number, number]
  ): RailwayBox => ({
    x: centre.x + inward.x * across + along.x * ahead,
    z: centre.z + inward.z * across + along.z * ahead,
    y: (bottom + top) / 2,
    height: top - bottom,
    heading,
    ...size
  })
  const posts = Math.max(2, Math.floor(length / POST.spacing) + 1)
  return [
    place(PLATFORM.across, 0, { width: PLATFORM.halfWidth * 2, length, tint: 'platform' }, [
      RAILWAY.deckTop,
      PLATFORM.top
    ]),
    place(CANOPY.across, 0, { width: CANOPY.halfWidth * 2, length, tint: 'canopy' }, [
      CANOPY.bottom,
      CANOPY.top
    ]),
    ...Array.from({ length: posts }, (_unused, index) =>
      place(
        POST.across,
        -length / 2 + POST.size + (index * (length - 2 * POST.size)) / (posts - 1),
        { width: POST.size, length: POST.size, tint: 'pier' },
        [PLATFORM.top, CANOPY.bottom]
      )
    ),
    place(TOWER.across, 0, { width: TOWER.halfWidth * 2, length: TOWER.length, tint: 'tower' }, [
      0,
      TOWER.top
    ])
  ]
}
