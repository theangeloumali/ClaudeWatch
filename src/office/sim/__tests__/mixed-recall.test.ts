import { describe, expect, it, vi } from 'vitest'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import { singleFloorWorldDocument } from '../../../shared/office/world-document-single-floor'
import type { WorldDocument } from '../../../shared/office/world-document-types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import { subagent } from '../fixtures'
import { CityWorld, observed } from './city-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 120_000 })

const SETTLE_MS = LOUNGE_DELAY_MS + 130_000
const RECALL_WITHIN_MS = 120_000
// A passage yield stands aside 8 s at most.
const LONGEST_STAND_MS = 8_000
const PROGRESS_METRES = 0.5

interface Roster {
  projects: number
  gamers: number
  // Subagents per working lead: two take its guest desks, more take its project's team seats.
  crews: readonly number[]
}

// Every room in the first project's building. A team room may not leave its project's
// building, so only that project's leads have crews of three or more.
function sharedFloor(document: WorldDocument): void {
  const [home] = document.buildings
  for (const room of document.rooms) room.buildingId = home.id
  document.buildings = [home]
  Object.assign(document, singleFloorWorldDocument(document))
}

function sessionsOf({ projects, gamers, crews }: Roster, nowMs: number, isWorking: boolean) {
  const project = (index: number) => `p_${index % projects}`
  const leads = crews.map((size, index) => ({
    ...observed(`claude:lead-${index}`, project(index), nowMs),
    activity: 'thinking' as const,
    subagents: Array.from({ length: size }, (_, member) =>
      subagent(`m${member}`, member % 2 ? 'teammate' : undefined)
    )
  }))
  const players: SessionRef[] = Array.from({ length: gamers }, (_, index) => ({
    ...observed(`claude:gamer-${index}`, project(index + 1), nowMs),
    ...(isWorking && { activity: 'thinking' as const })
  }))
  return [...leads, ...players]
}

const ROSTERS: Roster[] = [2, 3].flatMap((projects) =>
  [3, 6, 9].flatMap((gamers) => [[2], [4], [4, 2, 1]].map((crews) => ({ projects, gamers, crews })))
)

// The longest any agent stood within half a metre of one spot while not at rest.
class Stands {
  longestMs = 0
  private readonly anchors = new Map<string, { x: number; z: number; sinceMs: number }>()

  constructor(private readonly isResting: (view: AgentView) => boolean) {}

  check(frame: readonly AgentView[], atMs: number): void {
    for (const view of frame) {
      const anchor = this.anchors.get(view.agentKey)
      if (
        this.isResting(view) ||
        !anchor ||
        Math.hypot(view.x - anchor.x, view.z - anchor.z) > PROGRESS_METRES
      )
        this.anchors.set(view.agentKey, { x: view.x, z: view.z, sinceMs: atMs })
      else this.longestMs = Math.max(this.longestMs, atMs - anchor.sinceMs)
    }
  }
}

// Settles a roster's gamers in the corner, then calls every one of them home at once.
function recall(roster: Roster) {
  const city = new CityWorld((nowMs) => sessionsOf(roster, nowMs, false), sharedFloor)
  const floors = city.world.layout().floors
  const seats = floors.flatMap((floor) => floor.zones.flatMap((zone) => zone.lounge?.slots ?? []))
  const isGaming = (view: AgentView) =>
    view.place === 'lounge' && seats.some((seat) => seat.x === view.x && seat.z === view.z)
  const corner = Math.min(roster.gamers, seats.length)
  const outbound = new Stands((view) => city.isSeated(view) || isGaming(view))
  let views: AgentView[] = []
  let cornerFullAtMs: number | null = null
  city.run(SETTLE_MS, (frame, elapsedMs) => {
    views = frame
    outbound.check(frame, elapsedMs)
    if (frame.filter(isGaming).length === corner) cornerFullAtMs = elapsedMs
    return cornerFullAtMs !== null
  })
  const floorIds = new Set(views.map((view) => view.physicalFloorId))
  const settled = {
    floors: floorIds.size,
    projects: new Set(
      floors
        .filter((floor) => floorIds.has(floor.id))
        .flatMap((floor) => floor.rooms.map((room) => room.projectKey))
    ).size,
    isCornerFull: cornerFullAtMs !== null
  }
  city.patch(sessionsOf(roster, city.clock, true))
  const homeward = new Stands((view) => city.isSeated(view))
  let seatedAtMs: number | null = null
  city.run(RECALL_WITHIN_MS, (frame, elapsedMs) => {
    homeward.check(frame, elapsedMs)
    if (frame.every((view) => city.isSeated(view))) seatedAtMs = elapsedMs
    return seatedAtMs !== null
  })
  return {
    settled,
    cornerFullAtMs,
    outboundStandMs: outbound.longestMs,
    longestStandMs: homeward.longestMs,
    seatedAtMs
  }
}

describe('mixed rosters: every gamer called home at once is seated, none standing long', () => {
  it.each(ROSTERS)('$projects projects, $gamers gamers, crews $crews', (roster) => {
    const run = recall(roster)
    // Every project shares the one floor, and its corner seated every gamer it had room for.
    expect(run.settled).toEqual({
      floors: 1,
      projects: Math.min(roster.projects, roster.gamers + roster.crews.length),
      isCornerFull: true
    })
    expect({
      outbound: run.outboundStandMs <= LONGEST_STAND_MS,
      homeward: run.longestStandMs <= LONGEST_STAND_MS
    }).toEqual({ outbound: true, homeward: true })
    expect(run.seatedAtMs).not.toBeNull()
  })
})
