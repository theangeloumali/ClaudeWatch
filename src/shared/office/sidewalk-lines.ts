import type { Crosswalk } from './crosswalks'
import { SIDEWALK_M, type TownRoad } from './town-roads'

export const EPSILON_M = 1e-6
// Each way across a zebra keeps this far off its centre line: two bodies of 1.25–1.45 m pass (A3).
const CROSSING_SPLIT_M = 0.75
// How far past a dead end the walk turns round, clear of the carriageway's end.
const DEAD_END_M = 0.5

export type WalkKind = 'run' | 'cap' | 'crossing' | 'lane'

// A straight walk: along x at a fixed z, or along z at a fixed x, between `low` and `high`.
export interface WalkLine {
  alongX: boolean
  fixed: number
  low: number
  high: number
  // The one way it is walked, along the line; 0 for both ways.
  direction: -1 | 0 | 1
  kind: WalkKind
}

// The ground between a street's two sidewalk centres, where no run or lane may go.
interface StreetCore {
  roadId: string
  alongX: boolean
  fixed: number
  low: number
  high: number
  half: number
}

const isAlongX = (road: TownRoad): boolean => road.from.z === road.to.z
const fixedOf = (road: TownRoad): number => (isAlongX(road) ? road.from.z : road.from.x)
// The middle of a road's sidewalk, from its centre line: its width includes the sidewalks (P3).
const walkCentreOf = (road: TownRoad): number => road.width / 2 - SIDEWALK_M[road.class] / 2

function spanOf(road: TownRoad): { low: number; high: number } {
  const [a, b] = isAlongX(road) ? [road.from.x, road.to.x] : [road.from.z, road.to.z]
  return { low: Math.min(a, b), high: Math.max(a, b) }
}

const coreOf = (road: TownRoad): StreetCore => ({
  roadId: road.id,
  alongX: isAlongX(road),
  fixed: fixedOf(road),
  ...spanOf(road),
  half: walkCentreOf(road)
})

// `line` less every part inside a street core other than its own street's.
function clip(line: WalkLine, cores: readonly StreetCore[], ownId: string | null): WalkLine[] {
  let pieces = [{ low: line.low, high: line.high }]
  for (const core of cores) {
    if (core.roadId === ownId) continue
    const isAcross = core.alongX !== line.alongX
    const isInside = isAcross
      ? line.fixed > core.low + EPSILON_M && line.fixed < core.high - EPSILON_M
      : Math.abs(line.fixed - core.fixed) < core.half - EPSILON_M
    if (!isInside) continue
    const [cutLow, cutHigh] = isAcross
      ? [core.fixed - core.half, core.fixed + core.half]
      : [core.low, core.high]
    pieces = pieces.flatMap((piece) =>
      [
        { low: piece.low, high: Math.min(piece.high, cutLow) },
        { low: Math.max(piece.low, cutHigh), high: piece.high }
      ].filter((part) => part.high - part.low > EPSILON_M)
    )
  }
  return pieces.map((piece) => ({ ...line, ...piece }))
}

// The cross streets whose centre line `road` ends on at `end`, each spanning its centre line.
export function crossStreetsAt(
  road: TownRoad,
  end: number,
  streets: readonly TownRoad[]
): TownRoad[] {
  const centre = fixedOf(road)
  return streets.filter(
    (other) =>
      isAlongX(other) !== isAlongX(road) &&
      Math.abs(fixedOf(other) - end) < EPSILON_M &&
      centre >= spanOf(other).low - EPSILON_M &&
      centre <= spanOf(other).high + EPSILON_M
  )
}

// How far a sidewalk runs past its street's end. Meeting a cross street's centre line, an outer
// sidewalk carries on to the cross street's outer sidewalk; with no cross street, the end is dead.
function endReach(road: TownRoad, end: number, fixed: number, streets: readonly TownRoad[]) {
  const across = crossStreetsAt(road, end, streets)
  if (across.length === 0) return { reach: DEAD_END_M, isDead: true }
  const covering = across.filter(
    (other) => fixed > spanOf(other).low + EPSILON_M && fixed < spanOf(other).high - EPSILON_M
  )
  return {
    reach: covering.length ? 0 : Math.max(...across.map(walkCentreOf)),
    isDead: false
  }
}

// Both sidewalks of a street, one way each and keeping the city's keep-left sign (A3), and a
// U-turn past each dead end.
function streetWalks(road: TownRoad, streets: readonly TownRoad[]): WalkLine[] {
  const alongX = isAlongX(road)
  const centre = fixedOf(road)
  const half = walkCentreOf(road)
  const { low, high } = spanOf(road)
  const walks: WalkLine[] = ([-1, 1] as const).map((side) => {
    const fixed = centre + side * half
    return {
      alongX,
      fixed,
      low: low - endReach(road, low, fixed, streets).reach,
      high: high + endReach(road, high, fixed, streets).reach,
      direction: alongX ? (side === 1 ? -1 : 1) : side,
      kind: 'run'
    }
  })
  for (const [end, outward] of [
    [low, -1],
    [high, 1]
  ] as const) {
    if (!endReach(road, end, centre, streets).isDead) continue
    // The side walked towards the end crosses to the other side.
    const arriving = alongX ? -outward : outward
    walks.push({
      alongX: !alongX,
      fixed: end + outward * DEAD_END_M,
      low: centre - half,
      high: centre + half,
      direction: arriving === 1 ? -1 : 1,
      kind: 'cap'
    })
  }
  return walks
}

// Two one-way walks over each zebra, keeping left: the only two-way crossing of a street.
function zebraWalks(crossing: Crosswalk, road: TownRoad): WalkLine[] {
  const alongX = isAlongX(road)
  const centre = alongX ? crossing.centre.x : crossing.centre.z
  const half = walkCentreOf(road)
  return ([-1, 1] as const).map((heading) => ({
    alongX: !alongX,
    fixed: centre + (alongX ? 1 : -1) * heading * CROSSING_SPLIT_M,
    low: fixedOf(road) - half,
    high: fixedOf(road) + half,
    direction: heading,
    kind: 'crossing'
  }))
}

const covers = (run: WalkLine, alongX: boolean, fixed: number, along: number): boolean =>
  run.alongX === alongX &&
  Math.abs(run.fixed - fixed) < EPSILON_M &&
  along >= run.low - EPSILON_M &&
  along <= run.high + EPSILON_M

// Every walk of the city: sidewalk runs and dead-end U-turns trimmed out of every street core,
// access lanes walked both ways down their middle, and the zebras that land on a sidewalk.
export function walkLines(roads: readonly TownRoad[], crossings: readonly Crosswalk[]): WalkLine[] {
  const streets = roads.filter((road) => road.class !== 'lane')
  const cores = streets.map(coreOf)
  const walks = streets.flatMap((road) =>
    streetWalks(road, streets).flatMap((line) =>
      clip(line, cores, line.kind === 'run' ? road.id : null)
    )
  )
  const lanes = roads
    .filter((road) => road.class === 'lane')
    .flatMap((road) => {
      const { low, high } = spanOf(road)
      if (high - low < EPSILON_M) return []
      const lane: WalkLine = {
        alongX: isAlongX(road),
        fixed: fixedOf(road),
        low,
        high,
        direction: 0,
        kind: 'lane'
      }
      return clip(lane, cores, null)
    })
  const byId = new Map(streets.map((road) => [road.id, road]))
  const zebras = crossings.flatMap((crossing) => {
    const road = byId.get(crossing.roadId)
    if (!road) return []
    return zebraWalks(crossing, road).filter((zebra) =>
      [zebra.low, zebra.high].every((end) =>
        walks.some((run) => run.kind === 'run' && covers(run, !zebra.alongX, end, zebra.fixed))
      )
    )
  })
  return [...walks, ...lanes, ...zebras]
}
