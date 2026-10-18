import { wantsLounge, type AgentRecord } from './behaviour'
import type { FloorLayout, LoungeLayout, Slot } from './layout'

// Each room's lounge, by room id: its company's, or on a building's floor that floor's one
// corner, whoever's room it is. Seats come from the map and nowhere else.
export function loungesByRoom(floor: FloorLayout): Map<string, LoungeLayout> {
  const byCompany = new Map(floor.zones.map((zone) => [zone.companyKey, zone.lounge]))
  const corner = floor.buildingId ? floor.zones[0]?.lounge : undefined
  const lounges = new Map<string, LoungeLayout>()
  for (const room of floor.rooms) {
    const lounge = corner ?? byCompany.get(room.companyKey)
    if (lounge) lounges.set(room.id, lounge)
  }
  return lounges
}

// The seat of every agent that is in the lounge or waiting to go: null means none is free, so
// it belongs at its desk. A sitter keeps its seat while the map still has it.
export function loungeSeats(
  agents: AgentRecord[],
  lounges: ReadonlyMap<string, LoungeLayout>
): Map<string, Slot | null> {
  const seats = new Map<string, Slot | null>()
  // By object: every room of a company points at the same lounge, so at the same seats.
  const taken = new Set<Slot>()
  const displaced: AgentRecord[] = []
  const waiting: AgentRecord[] = []
  const ordered = [...agents].sort((a, b) => a.view.agentKey.localeCompare(b.view.agentKey))
  for (const agent of ordered) {
    if (agent.view.place !== 'lounge') {
      if (wantsLounge(agent)) waiting.push(agent)
      continue
    }
    const seat = lounges.get(agent.view.roomId)?.slots.find((s) => s.id === agent.loungeSeatId)
    if (seat && !taken.has(seat)) {
      taken.add(seat)
      seats.set(agent.view.agentKey, seat)
    } else displaced.push(agent)
  }
  for (const agent of [...displaced, ...waiting]) {
    const seat = lounges.get(agent.view.roomId)?.slots.find((s) => !taken.has(s)) ?? null
    if (seat) taken.add(seat)
    seats.set(agent.view.agentKey, seat)
  }
  return seats
}
