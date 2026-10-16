import { describe, expect, it } from 'vitest'
import type { WorldFootprint } from '../../../../shared/office/world-document-types'
import { SceneBodies } from '../../scene/BodySpace'
import { makeAgent } from '../../__tests__/fixtures'
import { liveCity, type Scenario } from '../../town/__tests__/pedestrian.test-utils'
import type { Trip } from '../../town/town-trips'
import { lengthOf } from '../../town/trip-paths'
import { citizenGround, citySidewalks } from '../city-sidewalks'
import { moverClock } from '../mover-clock'
import { stepMovers } from '../mover-step'
import { routePose, type RoutePoint } from '../route-pose'
import { zebraTraffic } from '../zebra-traffic'

const FRAME_SEC = 1 / 20
const EPSILON_M = 1e-6

const isInside = (rect: WorldFootprint, point: RoutePoint, margin = 0): boolean =>
  Math.abs(point.x - rect.x) < rect.width / 2 + margin &&
  Math.abs(point.z - rect.z) < rect.depth / 2 + margin

// Metres along `from`→`to` where it first enters `rect`, or null.
function entryAlong(from: RoutePoint, to: RoutePoint, rect: WorldFootprint): number | null {
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  for (let at = 0; at <= length; at += 0.05) {
    const share = at / length
    const point = { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share }
    if (isInside(rect, point)) return at
  }
  return null
}

// A transit or runabout loop that turns a corner onto a road and meets that road's zebra
// within a few metres: where the vehicle drives over it, and where it enters it.
function turnOut(scenario: Scenario) {
  const sidewalks = citySidewalks(scenario.plan)
  if (!sidewalks) throw new Error('The live city has no sidewalks')
  for (const trip of scenario.trips) {
    if (trip.kind !== 'transit' && trip.kind !== 'runabout') continue
    const { points } = trip.route
    for (let corner = 1; corner + 1 < points.length; corner++) {
      const [before, at, after] = [points[corner - 1], points[corner], points[corner + 1]]
      const isTurn =
        Math.abs((at.x - before.x) * (after.x - at.x) + (at.z - before.z) * (after.z - at.z)) <
        EPSILON_M
      if (!isTurn) continue
      for (const zebra of sidewalks.network.zebras) {
        const entry = entryAlong(at, after, zebra)
        if (entry !== null && entry > 0 && entry < 8)
          return { trip, zebra, entryAt: lengthOf(points.slice(0, corner + 1)) + entry }
      }
    }
  }
  throw new Error('No vehicle turns onto a zebra in the live city')
}

function moversOn(scenario: Scenario, trips: Trip[], space: SceneBodies) {
  const ground = citizenGround(scenario.floor, scenario.plan)
  const clock = moverClock({ trips, space, isOpen: ground.isOpen })
  const traffic = zebraTraffic(trips, citySidewalks(scenario.plan))
  const step = () =>
    stepMovers({ trips, clock, space, ground, player: null, traffic, deltaSec: FRAME_SEC })
  return { clock, step }
}

describe('zebra right-of-way (citizens-6, P6b)', () => {
  it('holds a turning vehicle at the stop line while a worker stands on the exit zebra', () => {
    const scenario = liveCity()
    const { trip, zebra, entryAt } = turnOut(scenario)
    const space = new SceneBodies()
    space.setWorkers([makeAgent({ agentKey: 'roamer', x: zebra.x, z: zebra.z })])
    const { clock, step } = moversOn(scenario, [{ ...trip, startSec: 0 }], space)
    clock.moved[0] = (entryAt - 15) / trip.speed
    let nearest = Infinity
    for (let frame = 0; frame < 10 / FRAME_SEC; frame++) {
      step()
      const body = routePose(trip.route, clock.moved[0] * trip.speed, trip.speed)
      expect(isInside(zebra, body, 0.7), `frame ${frame}`).toBe(false)
      nearest = Math.min(nearest, entryAt - clock.moved[0] * trip.speed)
    }
    // It came up to the stop line, not to a halt somewhere short of it.
    expect(nearest).toBeLessThan(4)
    space.setWorkers([])
    for (let frame = 0; frame < 10 / FRAME_SEC; frame++) step()
    expect(clock.moved[0] * trip.speed).toBeGreaterThan(entryAt + 5)
  })

  it('keeps a walker off a zebra while a vehicle drives over it', () => {
    const scenario = liveCity()
    const { trip, zebra, entryAt } = turnOut(scenario)
    const sidewalks = citySidewalks(scenario.plan)
    const crossing = sidewalks?.network.edges.find((edge) => {
      if (edge.kind !== 'crossing') return false
      const [from, to] = [sidewalks.network.nodes[edge.from], sidewalks.network.nodes[edge.to]]
      return isInside(zebra, { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 })
    })
    if (!sidewalks || !crossing) throw new Error('The exit zebra has no crossing walk')
    const [kerb, farKerb] = [crossing.from, crossing.to].map((id) => sidewalks.network.nodes[id])
    const walker: Trip = {
      kind: 'citizen',
      themeId: 'corporate-city',
      figure: 0,
      route: {
        points: [kerb, farKerb, kerb],
        length: lengthOf([kerb, farKerb, kerb]),
        isLoop: true,
        stops: [{ at: lengthOf([kerb, farKerb]), sec: 60, isIndoors: false }]
      },
      speed: 1.2,
      startSec: 0,
      homeId: null,
      destination: 'park'
    }
    const space = new SceneBodies()
    const vehicle = { ...trip, startSec: 0 }
    const { clock, step } = moversOn(scenario, [walker, vehicle], space)
    // Its body reaches the zebra as the walker steps off the kerb.
    clock.moved[1] = (entryAt - 2) / trip.speed
    for (let frame = 0; frame < 25 / FRAME_SEC; frame++) {
      step()
      const body = routePose(trip.route, clock.moved[1] * trip.speed, trip.speed)
      if (isInside(zebra, body, 1))
        expect(isInside(zebra, clock.positions[0]), `frame ${frame}`).toBe(false)
    }
    const across = clock.positions[0]
    expect(Math.hypot(across.x - farKerb.x, across.z - farKerb.z)).toBeLessThan(0.05)
  })
})
