import { describe, expect, it, vi } from 'vitest'
import { crosswalks } from '../../../shared/office/crosswalks'
import { entranceApproach } from '../../../shared/office/entrance-approach'
import { sidewalkNetwork } from '../../../shared/office/sidewalks'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import type { WorldPoint } from '../../../shared/office/world-document-types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import { subagent } from '../fixtures'
import { FloorRoutes, floorEntrance, type FloorWaypoint } from '../world-floor-routes'
import { CityWorld, idle, isOuting, observed, streetsOf } from './roaming-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 240_000 })

// Finer than any carriageway is wide.
const LINE_SAMPLE_METRES = 0.25
// Long enough for a called-back roamer to have turned for home.
const RETURN_SET_OFF_MS = 1_000
// A body at its doorstep steps in; it is never sent round the block (P5b).
const DOORSTEP_WALK_METRES = 3

type Streets = ReturnType<typeof streetsOf>

function doorstepOf(city: CityWorld, view: AgentView): WorldPoint | undefined {
  const floor = city.world.layout().floors.find((candidate) => candidate.id === view.floorId)
  return floor && entranceApproach(floor, floorEntrance(floor))
}

// Whether the straight line between two points steps onto a carriageway outside a zebra.
function crossesAsphalt(streets: Streets, from: WorldPoint, to: WorldPoint): boolean {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / LINE_SAMPLE_METRES)
  )
  return Array.from({ length: steps + 1 }, (_, step) => ({
    x: from.x + ((to.x - from.x) * step) / steps,
    z: from.z + ((to.z - from.z) * step) / steps
  })).some(streets.isOnAsphalt)
}

// The outdoor legs of a route, from the body's own position, that cross a carriageway.
function asphaltLegs(streets: Streets, from: WorldPoint, route: readonly FloorWaypoint[]) {
  const outdoors = [from, ...route.filter((point) => point.physicalFloorId === null)]
  return outdoors
    .slice(1)
    .flatMap((point, index) =>
      crossesAsphalt(streets, outdoors[index], point)
        ? [`${outdoors[index].x.toFixed(2)},${outdoors[index].z.toFixed(2)}`]
        : []
    )
}

const walkedMetres = (from: WorldPoint, route: readonly FloorWaypoint[]) =>
  [from, ...route.filter((point) => point.physicalFloorId === null)].reduce(
    (metres, point, index, points) =>
      index ? metres + Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z) : 0,
    0
  )

// The live 08:23 capture (CW-ROAM): idle peers roam while a lead works; once one is across a
// street from its door all are called back, and as they walk home the lead's crew grows, so
// the offices shift and their desks move.
function deskMovesMidWalk(peerCount = 3) {
  let crewSize = 1
  const lead = (nowMs: number): SessionRef => ({
    ...observed('claude:lead', 'p_roam', nowMs),
    activity: 'running',
    subagents: Array.from({ length: crewSize }, (_, index) => ({
      ...subagent(`c${index}`),
      activity: 'running' as const
    }))
  })
  const peers = idle(peerCount)
  const city = new CityWorld((nowMs) => [lead(nowMs), ...peers(nowMs)], { hasVenues: false })
  const streets = streetsOf(city.world.layout())
  const peerKeys = new Set(peers(0).map((peer) => peer.key))
  const isAcrossStreet = (view: AgentView) => {
    const doorstep = doorstepOf(city, view)
    return !!doorstep && isOuting(view) && crossesAsphalt(streets, view, doorstep)
  }
  let across: AgentView | undefined
  city.run(LOUNGE_DELAY_MS + 400_000, (frame) => {
    across = frame.find((view) => peerKeys.has(view.agentKey) && isAcrossStreet(view))
    return !!across
  })
  const working = () => [
    lead(city.clock),
    ...peers(city.clock).map((peer) => ({ ...peer, activity: 'thinking' as const }))
  ]
  city.patch(working())
  city.run(RETURN_SET_OFF_MS, () => {})
  const returning = city.world.step(0).find((view) => view.agentKey === across?.agentKey)
  const deskBefore = returning && city.deskOf(returning)
  crewSize = 3
  city.patch(working())
  const deskAfter = returning && city.deskOf(returning)
  const onAsphalt: string[] = []
  let views: AgentView[] = []
  city.run(150_000, (frame, elapsedMs) => {
    views = frame
    for (const view of frame)
      if (view.physicalFloorId === null && view.place !== 'leaving' && streets.isOnAsphalt(view))
        onAsphalt.push(`${elapsedMs} ${view.agentKey} ${view.x.toFixed(2)},${view.z.toFixed(2)}`)
  })
  return {
    wasAcrossStreet: !!across,
    isWalkingHome: returning?.physicalFloorId === null && returning.place === undefined,
    hasDeskMoved: !!deskBefore && !!deskAfter && deskBefore.x !== deskAfter.x,
    onAsphalt: onAsphalt.slice(0, 3),
    unseated: views.filter((view) => !city.isSeated(view)).map((view) => view.agentKey)
  }
}

describe('roaming: a desk that moves while its agent walks home', () => {
  it('keeps the returner on the sidewalks and crosswalks', () => {
    expect(deskMovesMidWalk()).toEqual({
      wasAcrossStreet: true,
      isWalkingHome: true,
      hasDeskMoved: true,
      onAsphalt: [],
      unseated: []
    })
  })
})

describe('FloorRoutes.toFloor from outside the building', () => {
  const city = new CityWorld(idle(1), { hasVenues: false })
  const layout = city.world.layout()
  const streets = streetsOf(layout)
  const routes = new FloorRoutes()
  routes.update(layout)
  const [home] = city.world.step(0)
  const floor = layout.floors.find((candidate) => candidate.id === home.floorId)!
  const desk = city.deskOf(home)!
  const doorstep = entranceApproach(floor, floorEntrance(floor))
  const outside = (point: WorldPoint): AgentView => ({
    ...home,
    ...point,
    elevation: 0,
    physicalFloorId: null
  })
  // The sidewalk point nearest its door whose straight line there crosses a street.
  const roads = layout.streets ?? []
  const [acrossStreet] = sidewalkNetwork(roads, crosswalks(roads))
    .nodes.filter((node) => crossesAsphalt(streets, node, doorstep))
    .sort(
      (first, second) =>
        Math.hypot(first.x - doorstep.x, first.z - doorstep.z) -
        Math.hypot(second.x - doorstep.x, second.z - doorstep.z)
    )

  it('walks a body across the street from its door along the sidewalks', () => {
    const route = routes.toFloor(outside(acrossStreet), floor, desk)
    expect({
      hasRoute: route.length > 0,
      asphaltLegs: asphaltLegs(streets, acrossStreet, route)
    }).toEqual({ hasRoute: true, asphaltLegs: [] })
  })

  it('steps a body at its own doorstep straight in', () => {
    const route = routes.toFloor(outside(doorstep), floor, desk)
    expect({
      hasRoute: route.length > 0,
      isShortStep: walkedMetres(doorstep, route) < DOORSTEP_WALK_METRES
    }).toEqual({ hasRoute: true, isShortStep: true })
  })
})
