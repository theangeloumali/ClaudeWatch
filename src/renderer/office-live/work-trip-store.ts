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

// Units are samples: one city-wide every 2 s, the rest dropped rather than queued.
const DISPATCH_GAP_MS = 2_000
// Handed back on every frame that sends nothing, so an idle city allocates nothing.
const NOTHING_SENT: readonly WorkTripRequest[] = []

export interface WorkTripStore {
  // The live events' new dispatches that send a vehicle, read once per drawn frame.
  take(events: readonly CityEvent[]): readonly WorkTripRequest[]
}

export function createWorkTripStore(): WorkTripStore {
  const seen = new Set<string>()
  let lastSentMs = -Infinity
  return {
    take(events) {
      let sent: WorkTripRequest[] | null = null
      for (const event of events) {
        if (event.kind !== 'dispatch' || seen.has(event.id)) continue
        seen.add(event.id)
        const role = event.category ? workRole(event.category) : null
        if (!role || event.atMs - lastSentMs < DISPATCH_GAP_MS) continue
        lastSentMs = event.atMs
        sent ??= []
        sent.push({ id: event.id, buildingId: event.buildingId, role, atMs: event.atMs })
      }
      // An event that has ended never comes back: the log dedupes its ids.
      for (const id of seen) if (!events.some((event) => event.id === id)) seen.delete(id)
      return sent ?? NOTHING_SENT
    }
  }
}

// The page's store, read by the town's movers in their frame loop: no React state, no commits.
export const workTripStore = createWorkTripStore()
