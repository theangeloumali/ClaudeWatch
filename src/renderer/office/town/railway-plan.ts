import {
  routePose,
  type CitizenPose,
  type CitizenRoute,
  type RoutePoint
} from '../citizens/route-pose'
import { rectOf, type Rect } from '../themes/lot-math'
import type { TownPlan } from './town-plan'
import { lengthOf } from './trip-paths'

// The ring's measures, in metres. It runs 7 m out, not ClearSpent's 4.5, so a station's lift
// tower keeps off the edge street's sidewalk (traffic-rail F4, F8).
export const RAILWAY = {
  offset: 7,
  deckTop: 5,
  // Wider than ClearSpent's 3.4: a 9 m car overhangs the outer track's 8.8 m bends.
  deckHalfWidth: 4,
  // Each track's centre from the deck's: the inner one is the city side.
  track: 1.8,
  railTop: 5.3
} as const
const BEND_STEPS = 12
const PIER_SPACING_M = 24

// One straight stretch of a loop; a bend is a chord of a corner arc centred on the extent.
export interface RailwaySpan {
  from: RoutePoint
  to: RoutePoint
  isBend: boolean
}

export interface RailwayPlan {
  extent: Rect
  // Closed loops, clockwise seen from above: the deck's centre line and its two tracks.
  centre: CitizenRoute
  spans: RailwaySpan[]
  lanes: { inner: CitizenRoute; outer: CitizenRoute }
  piers: CitizenPose[]
  // The ground the deck and its stations cover.
  bounds: Rect
}

// The extent grown by `reach` with round corners: every point is exactly `reach` from it.
function offsetLoop(extent: Rect, reach: number): { route: CitizenRoute; spans: RailwaySpan[] } {
  const [halfX, halfZ] = [extent.width / 2, extent.depth / 2]
  // North-east, south-east, south-west, north-west: clockwise from the north side's east end.
  const corners = [
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1]
  ]
  const spans: RailwaySpan[] = []
  const points = corners.flatMap(([eastward, southward], index) => {
    const start = -Math.PI / 2 + (index * Math.PI) / 2
    return Array.from({ length: BEND_STEPS + 1 }, (_unused, step) => {
      const angle = start + (step / BEND_STEPS) * (Math.PI / 2)
      return {
        x: extent.x + eastward * halfX + reach * Math.cos(angle),
        z: extent.z + southward * halfZ + reach * Math.sin(angle)
      }
    })
  })
  const closed = [...points, points[0]]
  for (let index = 1; index < closed.length; index++)
    spans.push({
      from: closed[index - 1],
      to: closed[index],
      isBend: index % (BEND_STEPS + 1) !== 0
    })
  return { route: { points: closed, length: lengthOf(closed), isLoop: true }, spans }
}

function evenPiers(centre: CitizenRoute): CitizenPose[] {
  const count = Math.max(4, Math.round(centre.length / PIER_SPACING_M))
  return Array.from({ length: count }, (_unused, index) =>
    routePose(centre, (index * centre.length) / count)
  )
}

const grown = (rect: Rect, by: number): Rect => ({
  ...rect,
  width: rect.width + 2 * by,
  depth: rect.depth + 2 * by
})

function planFor(plan: TownPlan): RailwayPlan | null {
  if (plan.roads.length === 0) return null
  const { extent } = plan
  const { route: centre, spans } = offsetLoop(extent, RAILWAY.offset)
  return {
    extent,
    centre,
    spans,
    lanes: {
      inner: offsetLoop(extent, RAILWAY.offset - RAILWAY.track).route,
      outer: offsetLoop(extent, RAILWAY.offset + RAILWAY.track).route
    },
    piers: evenPiers(centre),
    bounds: grown(extent, RAILWAY.offset + RAILWAY.deckHalfWidth)
  }
}

const planned = new WeakMap<TownPlan, RailwayPlan | null>()

// The ring round a city, planned once per plan; null while the city has no streets.
export function railwayPlan(plan: TownPlan): RailwayPlan | null {
  if (planned.has(plan)) return planned.get(plan) ?? null
  const railway = planFor(plan)
  planned.set(plan, railway)
  return railway
}

// How far the scene reaches with the ring in it, so Horizon fits its planes round the deck.
export function railwayReach(reach: Rect, plan: TownPlan): Rect {
  const railway = railwayPlan(plan)
  if (!railway) return reach
  const { bounds } = railway
  return rectOf(
    Math.min(reach.x - reach.width / 2, bounds.x - bounds.width / 2),
    Math.max(reach.x + reach.width / 2, bounds.x + bounds.width / 2),
    Math.min(reach.z - reach.depth / 2, bounds.z - bounds.depth / 2),
    Math.max(reach.z + reach.depth / 2, bounds.z + bounds.depth / 2)
  )
}

let shown: RailwayPlan | null = null

// The ring the scene draws now, for the HUD's mini-map: a module store like `officePoses`,
// since the HUD has no town plan of its own.
export const shownRailway = {
  current: (): RailwayPlan | null => shown,
  set(railway: RailwayPlan | null): void {
    shown = railway
  }
}
