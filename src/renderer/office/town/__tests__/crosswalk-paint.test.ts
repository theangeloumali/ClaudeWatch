import { describe, expect, it } from 'vitest'
import { crosswalks } from '../../../../shared/office/crosswalks'
import { OFF_GRID_SITES } from '../../../../shared/office/__tests__/live-city-streets.test-utils'
import { EDO } from '../../themes/palettes'
import { makeFloor } from '../../__tests__/fixtures'
import { distributedTown } from '../distributed-town'
import { fallbackDress } from '../fallback-dress'
import { groundQuads, type GroundQuad } from '../town-ground'
import type { TownPlan } from '../town-plan'
import { townOf } from '../use-town-plan'
import { liveCity } from './pedestrian.test-utils'

const offGridCity = (): TownPlan =>
  distributedTown(
    townOf(makeFloor({ floorId: 'off-grid', x: 180, z: 0, width: 420, depth: 120 }), null, 'full'),
    OFF_GRID_SITES
  ).plan

const PLANS: readonly (readonly [string, () => TownPlan])[] = [
  ['the live city', () => liveCity().plan],
  ['an off-grid city with access lanes', offGridCity]
]

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
const isStripe = (quad: GroundQuad): boolean =>
  (close(quad.width, 3) && close(quad.depth, 0.42)) ||
  (close(quad.depth, 3) && close(quad.width, 0.42))
const isStopLine = (quad: GroundQuad): boolean => close(Math.min(quad.width, quad.depth), 0.24)

describe.each(PLANS)('crosswalk paint on %s', (_name, build) => {
  const plan = build()
  const marks = groundQuads(plan, fallbackDress(EDO)).filter((quad) => quad.layer === 'marking')
  const found = crosswalks(plan.roads)
  // Along the crossing's road and across it, from the zebra's centre.
  const offsetOf = (crossing: (typeof found)[number], point: { x: number; z: number }) =>
    crossing.axis === 'z'
      ? { along: point.x - crossing.centre.x, across: point.z - crossing.centre.z }
      : { along: point.z - crossing.centre.z, across: point.x - crossing.centre.x }
  const inBand = (crossing: (typeof found)[number], stripe: GroundQuad): boolean => {
    const { along, across } = offsetOf(crossing, stripe)
    return Math.abs(along) < 1e-6 && Math.abs(across) <= crossing.halfLength
  }

  it('paints every zebra stripe inside a crosswalk, and every crosswalk', () => {
    const stripes = marks.filter(isStripe)
    expect(stripes.length).toBeGreaterThan(0)
    for (const stripe of stripes)
      expect(
        found.some((crossing) => inBand(crossing, stripe)),
        `${stripe.x}:${stripe.z}`
      ).toBe(true)
    for (const crossing of found)
      expect(
        stripes.some((stripe) => inBand(crossing, stripe)),
        crossing.id
      ).toBe(true)
  })

  it('paints every stop line where a crosswalk holds the traffic heading for it', () => {
    const stops = marks.filter(isStopLine)
    expect(stops.length).toBeGreaterThan(0)
    for (const stop of stops)
      expect(
        found.some(
          ({ stopLines: [approach] }) => close(approach.x, stop.x) && close(approach.z, stop.z)
        ),
        `${stop.x}:${stop.z}`
      ).toBe(true)
  })
})
