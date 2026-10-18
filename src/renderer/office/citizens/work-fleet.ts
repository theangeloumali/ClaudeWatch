import type { WorkTripRequest } from '../../office-live/work-trip-store'
import { roadNet } from '../town/road-net'
import type { VehicleRole } from '../town/town-dress'
import type { TownPlan } from '../town/town-plan'
import type { Trip } from '../town/town-trips'
import { officeDoor, workRoute, workStops, type WorkStop } from '../town/work-trips'
import { citySidewalks } from './city-sidewalks'
import type { MoverClock } from './mover-clock'
import { loopMetres, routePose, type RoutePoint } from './route-pose'
import { tripPasses, zebraTraffic, type ZebraTraffic } from './zebra-traffic'

// A trip still under way when the town is laid out again: carried to the next fleet.
export interface WorkCarry {
  slot: number
  role: VehicleRole
  from: RoutePoint
  stops: readonly WorkStop[]
}

interface Flight {
  role: VehicleRole
  ambientMoved: number
  stops: readonly WorkStop[]
  lapSec: number
}

export interface WorkFleet {
  // The town's trips with each borrowed slot's work trip in place: what the movers step and draw.
  trips: readonly Trip[]
  traffic: ZebraTraffic
  dispatch(request: WorkTripRequest): number | null
  // After a step: slots back from their round trip rejoin their loops where they left them.
  settle(): void
  inFlight(): readonly number[]
  // Before a relayout: every loop handed back, and what was under way, from where it stands.
  release(): WorkCarry[]
}

interface WorkFleetOptions {
  plan: TownPlan
  trips: readonly Trip[]
  clock: MoverClock
  carried: readonly WorkCarry[]
}

// Read every drawn frame: an idle fleet hands back this one list.
const NOT_IN_FLIGHT: readonly number[] = []

const lapOf = (trip: Trip): number =>
  trip.route.length / trip.speed + (trip.route.stops ?? []).reduce((sum, stop) => sum + stop.sec, 0)

// dry-new: vehicle-trips plans ambient loops once; a work trip swaps one slot's route at runtime.
export function createWorkFleet({ plan, trips, clock, carried }: WorkFleetOptions): WorkFleet {
  const live = [...trips]
  const sidewalks = citySidewalks(plan)
  const ambient = zebraTraffic(trips, sidewalks)
  const passes = [...ambient.passes]
  const traffic = { ...ambient, passes }
  const flights = new Map<number, Flight>()

  const poseOf = (slot: number): RoutePoint => {
    const { route, speed } = live[slot]
    return routePose(route, clock.moved[slot] * speed, speed)
  }
  const freeSlot = (role: VehicleRole, near: RoutePoint, preferred?: number): number | null => {
    const free = trips.flatMap((trip, slot) =>
      trip.kind === role && !flights.has(slot) ? [slot] : []
    )
    if (preferred !== undefined && free.includes(preferred)) return preferred
    const gap = (slot: number) => Math.hypot(poseOf(slot).x - near.x, poseOf(slot).z - near.z)
    return free.reduce<number | null>(
      (best, slot) => (best === null || gap(slot) < gap(best) ? slot : best),
      null
    )
  }
  const borrow = (
    slot: number,
    role: VehicleRole,
    from: RoutePoint,
    stops: readonly WorkStop[],
    home: RoutePoint
  ) => {
    const route = workRoute(roadNet(plan), from, stops, home)
    if (!route) return false
    const trip = { ...trips[slot], route, startSec: 0 }
    flights.set(slot, { role, ambientMoved: clock.moved[slot], stops, lapSec: lapOf(trip) })
    live[slot] = trip
    passes[slot] = tripPasses(trip, sidewalks)
    clock.moved[slot] = 0
    return true
  }
  const giveBack = (slot: number, flight: Flight): void => {
    live[slot] = trips[slot]
    passes[slot] = ambient.passes[slot]
    clock.moved[slot] = flight.ambientMoved
    flights.delete(slot)
  }

  for (const carry of carried) {
    const slot = freeSlot(carry.role, carry.from, carry.slot)
    if (slot !== null) borrow(slot, carry.role, carry.from, carry.stops, poseOf(slot))
  }

  return {
    trips: live,
    traffic,
    dispatch(request) {
      const door = officeDoor(plan, request.buildingId)
      const stops = door && workStops(plan, request.role, door)
      const slot = stops && door ? freeSlot(request.role, door) : null
      if (slot === null || !stops) return null
      const from = poseOf(slot)
      return borrow(slot, request.role, from, stops, from) ? slot : null
    },
    settle() {
      for (const [slot, flight] of flights)
        if (clock.moved[slot] >= flight.lapSec) giveBack(slot, flight)
    },
    inFlight: () => (flights.size === 0 ? NOT_IN_FLIGHT : [...flights.keys()]),
    release() {
      const carries = [...flights].map(([slot, flight]): WorkCarry => {
        const { route, speed } = live[slot]
        const metres = loopMetres(route, clock.moved[slot] * speed, speed)
        const ahead = flight.stops.filter((_stop, index) => (route.stops?.[index].at ?? 0) > metres)
        const carry = { slot, role: flight.role, from: poseOf(slot), stops: ahead }
        giveBack(slot, flight)
        return carry
      })
      return carries
    }
  }
}
