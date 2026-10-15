import type { AgentRecord } from './behaviour'
import { wantsLounge } from './behaviour'
import type { Slot } from './layout'
import type { Point } from './path'

// dry-new: company lounges have no global venue identity or shared capacity booking.
export interface WorldVenue {
  id: string
  kind: 'arcade' | 'lounge' | 'market' | 'garage' | 'transit'
  entrance: Point
  slots: readonly Slot[]
  capacity: number
}

export interface VenueSeat {
  venue: WorldVenue
  seat: Slot
}

export class VenueBookings {
  private readonly bookings = new Map<string, { venueId: string; slotId: string }>()
  private nextVenue = 0

  release(key: string): void {
    this.bookings.delete(key)
  }

  reconcile(options: {
    agents: readonly AgentRecord[]
    venues: readonly WorldVenue[]
    canVisit: (agent: AgentRecord) => boolean
  }): Map<string, VenueSeat | null> {
    const assignments = new Map<string, VenueSeat | null>()
    const taken = new Set<string>()
    const venues = options.venues.filter(
      (venue) =>
        Number.isFinite(venue.capacity) &&
        venue.capacity > 0 &&
        Number.isFinite(venue.entrance.x) &&
        Number.isFinite(venue.entrance.z)
    )
    const slotsOf = (venue: WorldVenue) =>
      venue.slots
        .filter(
          (seat) =>
            Number.isFinite(seat.x) && Number.isFinite(seat.z) && Number.isFinite(seat.heading)
        )
        .slice(0, Math.floor(venue.capacity))
    const agents = [...options.agents].sort((first, second) =>
      first.view.agentKey.localeCompare(second.view.agentKey)
    )
    const active = new Set(agents.map((agent) => agent.view.agentKey))
    for (const key of this.bookings.keys()) if (!active.has(key)) this.release(key)
    for (const agent of agents) {
      const key = agent.view.agentKey
      const booking = this.bookings.get(key)
      const venue = venues.find((candidate) => candidate.id === booking?.venueId)
      const seat = venue && slotsOf(venue).find((candidate) => candidate.id === booking?.slotId)
      if (!options.canVisit(agent) || !seat || !venue || taken.has(`${venue.id}:${seat.id}`)) {
        this.release(key)
        if (agent.view.venueId || agent.destinationVenueId) assignments.set(key, null)
        continue
      }
      taken.add(`${venue.id}:${seat.id}`)
      assignments.set(key, { venue, seat })
    }
    for (const agent of agents) {
      const key = agent.view.agentKey
      if (this.bookings.has(key) || !options.canVisit(agent) || !wantsLounge(agent)) continue
      for (let offset = 0; offset < venues.length; offset++) {
        const venueIndex = (this.nextVenue + offset) % venues.length
        const venue = venues[venueIndex]
        const seat = slotsOf(venue).find((candidate) => !taken.has(`${venue.id}:${candidate.id}`))
        if (!seat) continue
        this.bookings.set(key, { venueId: venue.id, slotId: seat.id })
        assignments.set(key, { venue, seat })
        taken.add(`${venue.id}:${seat.id}`)
        this.nextVenue = (venueIndex + 1) % venues.length
        break
      }
    }
    return assignments
  }
}
