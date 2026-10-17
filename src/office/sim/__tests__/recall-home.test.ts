import { describe, expect, it, vi } from 'vitest'
import { WORKER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import { WALK_METRES_PER_SECOND, createAgent } from '../behaviour'
import { session } from '../fixtures'
import { buildLayout } from '../layout'
import { seatAtDesk } from '../world-recall'
import { DoorInvariants } from './door-invariants'
import { CityWorld, idle, isOuting } from './roaming-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 240_000 })

// FOUND 7: an agent called back to work sits at its desk within this long of the call.
const SEATED_WITHIN_MS = 20_000
// Farther than a walk can cover in time, straight-line, so its route home is too.
const FAR_METRES = (SEATED_WITHIN_MS / 1000) * WALK_METRES_PER_SECOND
const SEARCH_MS = 400_000
const thinking = (records: SessionRef[]): SessionRef[] =>
  records.map((record) => ({ ...record, activity: 'thinking' as const }))

// One idle agent out in town until `isWanted` holds, then called back to work.
function recall(isWanted: (view: AgentView, deskMetres: number) => boolean) {
  const peers = idle(1)
  const city = new CityWorld(peers, { hasVenues: true })
  let found: AgentView | undefined
  city.run(SEARCH_MS, ([view]) => {
    const desk = city.deskOf(view)
    if (desk && isWanted(view, Math.hypot(view.x - desk.x, view.z - desk.z))) found = view
    return found !== undefined
  })
  city.patch(thinking(peers(city.clock)))
  let seatedAtMs: number | null = null
  let hasFaded = false
  let last: AgentView | undefined
  city.run(SEARCH_MS, ([view], elapsedMs) => {
    hasFaded ||= view.fade !== undefined
    last = view
    if (city.isSeated(view) && view.fade === undefined) seatedAtMs ??= elapsedMs
    return seatedAtMs !== null && elapsedMs - seatedAtMs >= 2_000
  })
  return { found, seatedAtMs, hasFaded, last }
}

describe('recall: an agent called back to work is at its desk within 20 s', () => {
  it('seats an agent called back from far out in town', () => {
    const result = recall((view, metres) => isOuting(view) && metres > FAR_METRES)
    expect({
      wasFarOut: result.found !== undefined,
      isSeatedInTime: (result.seatedAtMs ?? Infinity) <= SEATED_WITHIN_MS,
      // The card reads the work it was called to, and it stays put at its desk.
      activity: result.last?.activity,
      isAtDesk: result.last?.place === undefined
    }).toEqual({ wasFarOut: true, isSeatedInTime: true, activity: 'thinking', isAtDesk: true })
  })

  it('seats an agent called to work while it is already walking home from town', () => {
    const result = recall(
      (view, metres) =>
        view.place === undefined && view.physicalFloorId === null && metres > FAR_METRES
    )
    expect({
      wasWalkingHome: result.found !== undefined,
      isSeatedInTime: (result.seatedAtMs ?? Infinity) <= SEATED_WITHIN_MS
    }).toEqual({ wasWalkingHome: true, isSeatedInTime: true })
  })

  it('walks an agent called back from just outside, with no fade', () => {
    const result = recall((view, metres) => isOuting(view) && metres < FAR_METRES / 2)
    expect({
      wasJustOutside: result.found !== undefined,
      isSeatedInTime: (result.seatedAtMs ?? Infinity) <= SEATED_WITHIN_MS,
      hasFaded: result.hasFaded
    }).toEqual({ wasJustOutside: true, isSeatedInTime: true, hasFaded: false })
  })

  // A fade back to a desk must not land inside another body, beside a working crew.
  it('brings a whole crowd home without one body inside another', () => {
    const lead: SessionRef = { ...session('claude:lead', 'p_roam'), activity: 'running' }
    const peers = idle(8)
    const city = new CityWorld((nowMs) => [lead, ...peers(nowMs)], { hasVenues: true })
    const peerKeys = new Set(peers(0).map((peer) => peer.key))
    const isFarOut = (views: AgentView[]) =>
      views.filter((view) => {
        const desk = peerKeys.has(view.agentKey) && city.deskOf(view)
        return desk && isOuting(view) && Math.hypot(view.x - desk.x, view.z - desk.z) > FAR_METRES
      }).length >= 3
    let views: AgentView[] = []
    city.run(SEARCH_MS, (frame) => {
      views = frame
      return isFarOut(frame)
    })
    const wasFarOut = isFarOut(views)
    city.patch(thinking(peers(city.clock)))
    const invariants = new DoorInvariants(
      (view) => view.venueId !== undefined || city.isSeated(view)
    )
    city.run(SEATED_WITHIN_MS, (frame, elapsedMs) => {
      views = frame
      invariants.check(frame, elapsedMs)
    })
    expect({
      wasFarOut,
      unseated: views.filter((view) => !city.isSeated(view)).map((view) => view.agentKey),
      ...invariants.report()
    }).toEqual({ wasFarOut: true, unseated: [], overlap: null, jump: null, blocked: null })
  })
})

describe('recall: reappearing at its desk', () => {
  const layout = buildLayout([{ ...session('claude:a'), activity: 'thinking' }], undefined)
  const floor = layout.floors[0]
  const room = floor.rooms.find((candidate) => candidate.sessionKey === 'claude:a')!
  const desk = room.slots.find((slot) => slot.id !== 'door')!
  const inTown = createAgent(
    { ...session('claude:a'), activity: 'thinking' },
    { floorId: floor.id, roomId: room.id, slotId: desk.id, x: desk.x, z: desk.z, heading: 0 },
    [{ x: 300, z: 300, elevation: 0, physicalFloorId: null }]
  )
  const body = (x: number) => ({
    id: 'other',
    x,
    z: desk.z,
    elevation: 0,
    radius: WORKER_BODY_RADIUS
  })

  it('waits while another body stands on its desk', () => {
    expect(seatAtDesk(inTown, layout.floors, [body(desk.x)])).toBeNull()
  })

  it('sits down working at its desk once the desk is clear', () => {
    const seated = seatAtDesk(inTown, layout.floors, [body(desk.x + 2)])
    expect(seated && { x: seated.view.x, z: seated.view.z, state: seated.state }).toEqual({
      x: desk.x,
      z: desk.z,
      state: 'working'
    })
  })
})
