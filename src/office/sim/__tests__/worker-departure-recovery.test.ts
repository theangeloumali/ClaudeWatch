import { expect, it } from 'vitest'
import { agentKey } from '../../../shared/office/agent-key'
import {
  bodyFits,
  SUBAGENT_BODY_RADIUS,
  WORKER_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'
import { DEPARTURE_FADE_MS, type AgentView } from '../../../shared/office/types'
import { createAgent } from '../behaviour'
import { session, subagent } from '../fixtures'
import { buildLayout, type RoomLayout } from '../layout'
import type { Point } from '../path'
import { recoverWorkerRoute } from '../worker-navigation'
import { World } from '../world'
import { FloorRoutes } from '../world-floor-routes'

const STEP_MS = 100

// dry-new: the standard fixture lacks fractional wall/door seams and a relocated departure floor.
function departureFixture() {
  const lead = {
    ...session('departing-lead'),
    activity: 'thinking' as const,
    subagents: [subagent('child')]
  }
  const peer = { ...session('retained-peer'), activity: 'thinking' as const }
  const base = buildLayout([lead, peer], undefined)
  const template = base.floors[0]
  const company = template?.zones[0]
  const leadTemplate = template?.rooms.find((room) => room.sessionKey === lead.key)
  const peerTemplate = template?.rooms.find((room) => room.sessionKey === peer.key)
  if (!template || !company || !leadTemplate || !peerTemplate)
    throw new Error('Fixture requires two assigned offices')
  const leadRoom = fractionalOffice(leadTemplate, { x: -30.7, z: -97 })
  const peerRoom = fractionalOffice(peerTemplate, { x: -38.3, z: -89.4 })
  const teamRoom: RoomLayout = {
    ...leadTemplate,
    id: 'departure:team',
    kind: 'team',
    sessionKey: null,
    x: -38,
    z: -96.7,
    width: 4.6,
    depth: 4.6,
    door: { x: -38, z: -99 },
    slots: [
      { id: 'door', x: -38, z: -99, heading: 0 },
      { id: 'team_seat_0', x: -38.3, z: -96.4, heading: 0 }
    ],
    children: []
  }
  const rooms = [leadRoom, peerRoom, teamRoom]
  const entrance = { id: 'entrance', x: -34.5, z: -103, heading: 0 }
  const { lounge: _lounge, ...shell } = company
  const floor = {
    ...template,
    id: 'building:departure:ground',
    buildingId: 'building:departure',
    elevation: 0,
    x: -34.5,
    z: -94.45,
    width: 14.6,
    depth: 17.1,
    entrance,
    elevator: { id: 'connector', x: -39.8, z: -101, heading: 0 },
    rooms,
    zones: [
      {
        ...shell,
        x: -34.5,
        z: -94.45,
        width: 14.6,
        depth: 17.1,
        door: entrance,
        children: rooms
      }
    ]
  }
  const relocatedPeer = fractionalOffice(peerTemplate, { x: 32, z: -90 })
  const relocatedEntrance = { ...entrance, x: 34.5 }
  const relocated = {
    ...floor,
    x: 34.5,
    z: -94.75,
    width: 12,
    depth: 16.5,
    entrance: relocatedEntrance,
    elevator: { ...floor.elevator, x: 30.5 },
    rooms: [relocatedPeer],
    zones: [
      {
        ...shell,
        x: 34.5,
        z: -94.75,
        width: 12,
        depth: 16.5,
        door: relocatedEntrance,
        children: [relocatedPeer]
      }
    ]
  }
  return { base, floor, relocated, lead, peer, leadRoom }
}

function fractionalOffice(template: RoomLayout, center: Point): RoomLayout {
  const door = { x: center.x, z: center.z - 2 }
  return {
    ...template,
    ...center,
    width: 4,
    depth: 4,
    door,
    children: [],
    slots: [
      { ...door, id: 'door', heading: 0 },
      { id: 'desk_main', x: center.x, z: center.z + 0.3, heading: 0 },
      { id: 'desk_guest_0', x: center.x - 1.25, z: center.z - 0.95, heading: 0 },
      { id: 'desk_guest_1', x: center.x + 1.25, z: center.z - 0.95, heading: 0 }
    ]
  }
}

function workerBody(view: AgentView): BodyFootprint {
  return {
    id: view.agentKey,
    x: view.x,
    z: view.z,
    elevation: view.elevation,
    radius: view.isSubagent ? SUBAGENT_BODY_RADIUS : WORKER_BODY_RADIUS
  }
}

it('recovers a crowded indoor route around a body on fractional geometry', () => {
  const { base, floor, lead, leadRoom } = departureFixture()
  const routes = new FloorRoutes()
  routes.update({ ...base, floors: [floor] })
  const paths = routes.paths(floor.id)
  const seat = leadRoom.slots.find((slot) => slot.id === 'desk_main')
  const guest = leadRoom.slots.find((slot) => slot.id === 'desk_guest_0')
  if (!paths || !seat || !guest) throw new Error('Fixture requires floor paths and seats')
  const seated = createAgent(
    lead,
    {
      ...seat,
      slotId: seat.id,
      roomId: leadRoom.id,
      floorId: floor.id,
      physicalFloorId: floor.id,
      elevation: floor.elevation
    },
    false
  )
  const agent = { ...seated, path: routes.toFloor(seated.view, floor, leadRoom.door) }
  const originalPath = structuredClone(agent.path)
  expect(agent.path.length).toBeGreaterThan(0)
  const body = workerBody(agent.view)
  const obstacles = [
    {
      ...guest,
      id: agentKey(lead.key, 'child'),
      radius: SUBAGENT_BODY_RADIUS,
      elevation: floor.elevation
    }
  ]

  const recovered = recoverWorkerRoute({ agent, routes, body, obstacles })

  expect(recovered.at(-1)).toMatchObject({ x: leadRoom.door.x, z: leadRoom.door.z })
  for (const point of recovered) {
    expect(paths.contains(point)).toBe(true)
    expect(paths.isOpen(point)).toBe(true)
    expect(point).toMatchObject({ elevation: floor.elevation, physicalFloorId: floor.id })
    expect(bodyFits({ ...body, ...point }, obstacles)).toBe(true)
  }
  expect(agent.path).toEqual(originalPath)
})

it.each([false, true])(
  'fades crowded parent/child departures where they stand on fractional geometry (relocated: %s)',
  (hasRelocation) => {
    const { base, floor, relocated, lead, peer } = departureFixture()
    let activeFloor = floor
    const world = new World({
      loungeTrips: false,
      resolveLayout: () => ({ ...base, floors: [activeFloor] })
    })
    world.apply({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 0, sessions: [lead, peer], sources: [] }
    })
    const departingKeys = [lead.key, agentKey(lead.key, 'child')]
    const seated = world.step(STEP_MS)
    expect(seated.map((view) => view.agentKey).sort()).toEqual([...departingKeys, peer.key].sort())
    world.apply({ type: 'patch', v: 1, seq: 2, removed: [lead.key], upserts: [] })
    const where = (views: AgentView[]) =>
      views
        .filter((view) => departingKeys.includes(view.agentKey))
        .map((view) => ({ key: view.agentKey, x: view.x, z: view.z }))
    const before = where(world.step(0))
    expect(before).toEqual(where(seated))
    if (hasRelocation) {
      activeFloor = relocated
      world.apply({ type: 'patch', v: 1, seq: 3, removed: [], upserts: [peer] })
      expect(world.layout().floors[0].x).toBe(relocated.x)
    }
    let goneAtMs: number | null = null
    for (let tick = 1; tick <= 10 && goneAtMs === null; tick++) {
      const current = world.step(STEP_MS)
      const departing = where(current)
      for (const view of departing)
        expect(view).toEqual(before.find((prior) => prior.key === view.key))
      if (!departing.length) goneAtMs = tick * STEP_MS
    }
    expect(goneAtMs).toBeLessThanOrEqual(DEPARTURE_FADE_MS + STEP_MS)
    const peerSeat = activeFloor.rooms
      .find((room) => room.sessionKey === peer.key)
      ?.slots.find((slot) => slot.id === 'desk_main')
    if (!peerSeat) throw new Error('Fixture requires the retained peer seat')
    expect(world.step(0)).toEqual([
      expect.objectContaining({
        agentKey: peer.key,
        physicalFloorId: activeFloor.id,
        activity: 'thinking',
        x: peerSeat.x,
        z: peerSeat.z
      })
    ])
  }
)
