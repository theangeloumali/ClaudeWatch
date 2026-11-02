import type { BuildingId } from '../office/logic/city-signals'
import type { VehicleRole } from '../office/town/town-dress'
import { workRole } from '../office/town/work-trips'
import type { CityEvent } from './city-events'

export interface WorkTripRequest {
  id: string
  buildingId: BuildingId
  role: VehicleRole
  atMs: number
}

// Every tool call, reads too: on the Campus a courier stands for any call.
export type CourierRequest = Omit<WorkTripRequest, 'role'>

// Units are samples: one per lane every 2 s, the rest dropped rather than queued.
const DISPATCH_GAP_MS = 2_000
// Handed back on every frame that sends nothing, so an idle city allocates nothing.
const NOTHING_SENT: readonly never[] = []
const CITY_LANE = 'city'

interface DispatchStore<Request> {
  // The live events' new dispatches that send something, read once per drawn frame.
  take(events: readonly CityEvent[]): readonly Request[]
}

export type WorkTripStore = DispatchStore<WorkTripRequest>
export type CourierStore = DispatchStore<CourierRequest>

function createDispatchStore<Request>(
  requestOf: (event: CityEvent) => Request | null,
  laneOf: (event: CityEvent) => string
): DispatchStore<Request> {
  const seen = new Set<string>()
  const lastSentMs = new Map<string, number>()
  return {
    take(events) {
      let sent: Request[] | null = null
      for (const event of events) {
        if (event.kind !== 'dispatch' || seen.has(event.id)) continue
        seen.add(event.id)
        const request = requestOf(event)
        const lane = laneOf(event)
        if (!request || event.atMs - (lastSentMs.get(lane) ?? -Infinity) < DISPATCH_GAP_MS) continue
        lastSentMs.set(lane, event.atMs)
        sent ??= []
        sent.push(request)
      }
      // An event that has ended never comes back: the log dedupes its ids.
      for (const id of seen) if (!events.some((event) => event.id === id)) seen.delete(id)
      return sent ?? NOTHING_SENT
    }
  }
}

// One vehicle city-wide every 2 s, for the calls that ship or fetch something.
export function createWorkTripStore(): WorkTripStore {
  return createDispatchStore(
    (event) => {
      const role = event.category ? workRole(event.category) : null
      return role && { id: event.id, buildingId: event.buildingId, role, atMs: event.atMs }
    },
    () => CITY_LANE
  )
}

// Each room samples on its own 2 s clock, so a busy room cannot starve a quiet one.
export function createCourierStore(): CourierStore {
  return createDispatchStore(
    (event) => ({ id: event.id, buildingId: event.buildingId, atMs: event.atMs }),
    (event) => event.buildingId
  )
}

// The page's stores, read by the movers in their frame loop: no React state, no commits.
export const workTripStore = createWorkTripStore()
export const courierStore = createCourierStore()
