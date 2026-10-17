import { describe, expect, it } from 'vitest'
import type { AgentObservation, SessionRef } from '../../../../shared/office/types'
import { createCityEventLog, type CityEvent } from '../../../office-live/city-events'
import { createWorkTripStore } from '../../../office-live/work-trip-store'
import { makeSession } from '../../__tests__/fixtures'
import { moverClock } from '../../citizens/mover-clock'
import { moverKinds } from '../../citizens/mover-kinds'
import { routePose, type RoutePoint } from '../../citizens/route-pose'
import { createWorkFleet } from '../../citizens/work-fleet'
import { citizenGround } from '../../citizens/city-sidewalks'
import { buildingIdOf } from '../../logic/city-signals'
import { SceneBodies } from '../../scene/BodySpace'
import { workCity } from '../movers.test-utils'
import { roadNet, roadPath } from '../road-net'
import { lotsWithDoors } from '../town-lots'
import { officeDoor } from '../work-trips'

const T0 = 1_760_000_000_000
const HOME = buildingIdOf('c_test', 'p_0')
const apart = (a: RoutePoint, b: RoutePoint): number => Math.hypot(a.x - b.x, a.z - b.z)

const dispatch = (category: CityEvent['category'], atMs = T0): CityEvent => ({
  id: `claude:a:dispatch:${atMs}`,
  kind: 'dispatch',
  buildingId: HOME,
  sessionKey: 'claude:a',
  category,
  atMs
})

const seenAt = (atMs: number): AgentObservation => ({
  sourceId: 'claude',
  observedAtMs: atMs,
  staleAfterMs: 60_000,
  coverage: 'own'
})
const session = (atMs: number, overrides: Partial<SessionRef> = {}): SessionRef =>
  makeSession({ key: 'claude:a', projectKey: 'p_0', observation: seenAt(atMs), ...overrides })
const edit = (callId: string) => ({ name: 'Edit', category: 'edit' as const, callId })

// A vehicle stops in its lane beside the kerb: never further than an avenue's half carriageway.
const LANE_REACH_M = 9

describe('work trips', () => {
  it('an edit call sends a freight slot from the office kerb to a workshop and back', () => {
    const city = workCity()
    const fleet = createWorkFleet({ ...city, carried: [] })
    const [request] = createWorkTripStore().take([dispatch('edit')])
    expect(request.role).toBe('freight')
    const slot = fleet.dispatch(request)
    if (slot === null) throw new Error('no slot sent')
    const trip = fleet.trips[slot]
    expect(trip.kind).toBe('freight')
    const before = routePose(
      city.trips[slot].route,
      city.trips[slot].startSec * trip.speed,
      trip.speed
    )
    // It sets out from where its slot was, and comes back there to rejoin its loop.
    expect(apart(trip.route.points[0], before)).toBeLessThan(1e-6)
    expect(apart(trip.route.points.at(-1) ?? before, before)).toBeLessThan(1e-6)
    const door = officeDoor(city.plan, HOME)
    if (!door) throw new Error('no office door')
    const workshop = lotsWithDoors(city.plan.lots)
      .filter((lot) => lot.zone === 'workshop')
      .sort((a, b) => apart(a.door, door) - apart(b.door, door))[0]
    // Where the road net meets each door: the office kerb and the workshop's.
    const net = roadNet(city.plan)
    const kerbOf = (point: RoutePoint, toward: RoutePoint) =>
      roadPath(net, point, toward)?.[0]?.from ?? point
    const ground = { ...trip.route, stops: [] }
    const stopAt = (index: number) => routePose(ground, trip.route.stops?.[index].at ?? 0)
    expect(trip.route.stops).toHaveLength(3)
    expect(apart(stopAt(0), kerbOf(door, workshop.door))).toBeLessThanOrEqual(LANE_REACH_M)
    expect(apart(stopAt(1), kerbOf(workshop.door, door))).toBeLessThanOrEqual(LANE_REACH_M)
    expect(apart(stopAt(2), kerbOf(door, workshop.door))).toBeLessThanOrEqual(LANE_REACH_M)
    // The workshop is the office's nearest.
    expect(apart(stopAt(1), workshop.door)).toBeLessThan(apart(stopAt(1), door))
  })

  it('a read call sends nothing', () => {
    const store = createWorkTripStore()
    expect(store.take([dispatch('read'), dispatch('other', T0 + 5_000)])).toEqual([])
    const city = workCity()
    expect(createWorkFleet({ ...city, carried: [] }).trips).toEqual(city.trips)
  })

  it('a stale observation dispatches nothing', () => {
    const log = createCityEventLog()
    const store = createWorkTripStore()
    log.observe('hello', [session(T0, { currentTool: edit('c1') })], T0)
    const stale = session(T0 - 2 * 60_000, { currentTool: edit('c2') })
    log.observe('patch', [stale], T0 + 1_000)
    expect(store.take(log.active(T0 + 1_000))).toEqual([])
    log.observe('patch', [session(T0 + 2_000, { currentTool: edit('c3') })], T0 + 2_000)
    expect(store.take(log.active(T0 + 2_000))).toHaveLength(1)
  })

  it('two calls with different callIds dispatch twice, rate-capped', () => {
    const store = createWorkTripStore()
    const first = dispatch('edit', T0)
    expect(store.take([first])).toHaveLength(1)
    // Half a second later the city is still inside its 2 s gap: a sample, not a queue.
    expect(store.take([first, dispatch('run', T0 + 500)])).toEqual([])
    expect(store.take([dispatch('edit', T0 + 2_000)])).toHaveLength(1)
  })

  it('work trips never add a mover kind', () => {
    const city = workCity()
    const fleet = createWorkFleet({ ...city, carried: [] })
    const store = createWorkTripStore()
    const kinds = moverKinds(city.trips).map((kind) => kind.key)
    for (const [index, category] of (['edit', 'web', 'agent'] as const).entries())
      for (const request of store.take([dispatch(category, T0 + index * 2_000)]))
        expect(fleet.dispatch(request)).not.toBeNull()
    expect(moverKinds(fleet.trips).map((kind) => kind.key)).toEqual(kinds)
  })

  it('a trip in flight during a relayout re-routes from where it is', () => {
    const before = workCity(4)
    const fleet = createWorkFleet({ ...before, carried: [] })
    const [request] = createWorkTripStore().take([dispatch('edit')])
    const slot = fleet.dispatch(request)
    if (slot === null) throw new Error('no slot sent')
    const ambientMoved = before.trips[slot].startSec
    before.clock.moved[slot] = 20
    const { route, speed } = fleet.trips[slot]
    const here = routePose(route, 20 * speed, speed)
    const carried = fleet.release()
    // The old clock gets its loop back, so the new one retains the slot where it left it.
    expect(before.clock.moved[slot]).toBe(ambientMoved)
    const after = workCity(5)
    const clock = moverClock({
      trips: after.trips,
      space: new SceneBodies(),
      isOpen: citizenGround(after.plan).isOpen,
      previous: before.clock
    })
    const resumed = createWorkFleet({ plan: after.plan, trips: after.trips, clock, carried })
    const [flying] = resumed.inFlight()
    expect(resumed.trips[flying].kind).toBe('freight')
    expect(apart(resumed.trips[flying].route.points[0], here)).toBeLessThan(1e-6)
    expect(clock.moved[flying]).toBe(0)
  })
})
