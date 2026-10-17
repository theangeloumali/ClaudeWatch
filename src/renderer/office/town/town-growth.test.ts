import { describe, expect, it } from 'vitest'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import type { Rect } from '../themes/lot-math'
import { campusClaim, neededClaim } from './town-claim'
import type { TownLot } from './town-lots'
import { townBlocks, type CampusPlan } from './town-plan'
import { BUILDING_CAP, LOT_PITCH_M } from './town-grid'
import { LARGE_FLOOR, LONE_FLOOR, PAIR_FLOOR, edges, widened } from './town.test-utils'

const DESK_COLUMN_M = 5
const OLD_TOWN_EAST_M = -24
// A 24 m building hides 34 m of ground: past that, a lot's limit cannot depend on the claim.
const HEIGHT_REACH_M = 36

const byId = (plan: CampusPlan) => new Map(plan.lots.map((lot) => [lot.id, lot]))
const oldTown = (plan: CampusPlan): TownLot[] => plan.lots.filter((lot) => lot.x < OLD_TOWN_EAST_M)
const spareEast = (floor: Rect, claim: Rect): number =>
  edges(claim).east - edges(neededClaim(floor)).east

// Section 2.2 of the design, on a floor under the building cap before and after a step: over
// it, the cap thins far lots too, which is a different rule.
describe('the town as the campus grows east', () => {
  const first = campusClaim(neededClaim(LONE_FLOOR), null)
  const before = townBlocks(first, 'full')
  const spare = spareEast(LONE_FLOOR, first)
  const stepped = campusClaim(neededClaim(widened(LONE_FLOOR, spare + 1)), first)
  const after = townBlocks(stepped, 'full')
  const takenColumn = edges(first).east / LOT_PITCH_M

  it('stays under the building cap on both sides of the step, as the rules below assume', () => {
    expect(after.lots.length).toBeLessThan(BUILDING_CAP.full)
    expect(before.lots.length).toBeLessThan(BUILDING_CAP.full)
  })

  it('changes no lot while a desk column stops short of the claim edge', () => {
    expect(spare).toBeGreaterThanOrEqual(DESK_COLUMN_M)
    const grown = campusClaim(neededClaim(widened(LONE_FLOOR, DESK_COLUMN_M)), first)
    expect(townBlocks(grown, 'full').lots).toEqual(before.lots)
  })

  it('takes exactly the cells the claim steps over when a column passes the edge', () => {
    expect(edges(stepped).east).toBe(edges(first).east + LOT_PITCH_M)
    const lost = before.lots.filter((lot) => !byId(after).has(lot.id))
    expect(lost.length).toBeGreaterThan(0)
    for (const lot of lost) {
      expect(lot.column).toBe(takenColumn)
      expect(lot.z).toBeGreaterThan(edges(first).north)
      expect(lot.z).toBeLessThan(edges(first).south)
    }
    const claimedRows = (edges(first).south - edges(first).north) / LOT_PITCH_M
    expect(lost).toHaveLength(claimedRows)
  })

  it('adds only the new outer column of the ring', () => {
    const gained = after.lots.filter((lot) => !byId(before).has(lot.id))
    const outerColumn = edges(before.extent).east / LOT_PITCH_M
    expect(gained.length).toBeGreaterThan(0)
    for (const lot of gained) expect(lot.column).toBe(outerColumn)
  })

  it('leaves every lot west of the old edge in its place, facing the way it did', () => {
    const was = byId(before)
    const placed = (lot: TownLot) => ({ ...lot, maxHeight: 0, kind: 'building', isLandmark: false })
    const west = after.lots.filter((lot) => lot.column < takenColumn)
    expect(west.length).toBeGreaterThan(after.lots.length / 2)
    for (const lot of west) expect(placed(lot)).toEqual(placed(was.get(lot.id) ?? lot))
    for (const lot of west) expect(was.has(lot.id)).toBe(true)
  })

  it('changes no height limit more than 36 m from the side that stepped', () => {
    const was = byId(before)
    const beyond = after.lots.filter((lot) => lot.x < edges(first).east - HEIGHT_REACH_M)
    expect(beyond.length).toBeGreaterThan(after.lots.length / 3)
    // A landmark may pass to a new lot of its zone; nothing else about the lot may change.
    for (const lot of beyond)
      expect({ ...lot, isLandmark: was.get(lot.id)?.isLandmark }).toEqual(was.get(lot.id))
  })

  it('changes nothing when the same column leaves again', () => {
    const back = campusClaim(neededClaim(widened(LONE_FLOOR, spare + 1 - DESK_COLUMN_M)), stepped)
    expect(back).toEqual(stepped)
    expect(townBlocks(back, 'full')).toEqual(after)
  })
})

describe.each(LIVE_FLOORS)(
  'walking the plate east 40 m and back in 1 m steps: %s',
  (_name, floor) => {
    const first = campusClaim(neededClaim(floor), null)
    const start = townBlocks(first, 'full')
    const plans: CampusPlan[] = []
    let claim = first
    for (const metres of [
      ...Array.from({ length: 40 }, (_, step) => step + 1),
      ...Array.from({ length: 40 }, (_, step) => 39 - step)
    ]) {
      claim = campusClaim(neededClaim(widened(floor, metres)), claim)
      plans.push(townBlocks(claim, 'full'))
    }

    it('ends on the first claim, with the same lot ids', () => {
      const last = plans[plans.length - 1]
      expect(last.claim).toEqual(first)
      expect(last.lots.map((lot) => lot.id)).toEqual(start.lots.map((lot) => lot.id))
      expect(last).toEqual(start)
    })

    it('steps the town a few times on the way, never once a metre', () => {
      const steps = plans.filter((plan, index) => plan !== (plans[index - 1] ?? start)).length
      expect(steps).toBeGreaterThan(1)
      expect(steps).toBeLessThanOrEqual(8)
    })

    it('never changes anything west of x = -24', () => {
      for (const plan of plans) expect(oldTown(plan)).toEqual(oldTown(start))
    })
  }
)

describe('the old town', () => {
  it('is the same, lot for lot, on two floors that differ only to the east', () => {
    const pair = townBlocks(campusClaim(neededClaim(PAIR_FLOOR), null), 'full')
    const large = townBlocks(campusClaim(neededClaim(LARGE_FLOOR), null), 'full')
    expect(edges(large.claim).east).toBeGreaterThan(edges(pair.claim).east)
    expect(oldTown(pair).length).toBeGreaterThan(0)
    expect(oldTown(large)).toEqual(oldTown(pair))
  })

  it('keeps every lot when the largest floor is over the building cap', () => {
    const plan = townBlocks(campusClaim(neededClaim(LARGE_FLOOR), null), 'full')
    const extent = edges(plan.extent)
    const cells =
      ((OLD_TOWN_EAST_M - extent.west) * (extent.south - extent.north)) / LOT_PITCH_M ** 2
    expect(oldTown(plan)).toHaveLength(cells)
  })
})
