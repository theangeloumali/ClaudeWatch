import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DEPARTURE_FADE_MS, type AgentView } from '../../../shared/office/types'
import { session } from '../fixtures'
import { floorElevation, floorEntrance } from '../world-floor-routes'
import { DoorWorld } from './door-churn-harness'
import { DoorInvariants, TICK_MS } from './door-invariants'

// Full sim churn: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 120_000 })

const RUN_MS = 60_000
const SWAP_EVERY_MS = 10_000
const SETTLED_WITHIN_MS = DEPARTURE_FADE_MS + TICK_MS
const ENTRANCE_METRES = 1.6
const LATE = 'claude:late'

interface Departure {
  x: number
  z: number
  removedAtMs: number
}

// Crew swaps every 10 s to 50 s, a session joins at 15 s, a peer goes at 35 s, the newcomer at 45 s.
function runRetention() {
  const door = new DoorWorld({ hasLoungingPeers: true })
  const invariants = new DoorInvariants((view) => door.isSeated(view))
  const report = {
    outside: null as string | null,
    atEntrance: null as string | null,
    arrivals: [] as string[],
    leavers: [] as string[],
    arrivalCount: 0,
    departureCount: 0,
    peersAway: new Set<string>()
  }
  const late = { ...session(LATE, 'p_app'), activity: 'running' as const }
  const departing = new Map<string, Departure>()
  const materialising = new Map<string, number>()
  let views = door.step()
  const known = new Set(views.map((view) => view.agentKey))
  const depart = (keys: readonly string[], atMs: number) => {
    for (const key of keys) {
      const view = views.find((candidate) => candidate.agentKey === key)
      if (view) departing.set(key, { x: view.x, z: view.z, removedAtMs: atMs })
    }
  }
  for (let elapsed = TICK_MS; elapsed <= RUN_MS; elapsed += TICK_MS) {
    const patchedAtMs = elapsed - TICK_MS
    if (elapsed % SWAP_EVERY_MS === 0 && elapsed < RUN_MS) {
      depart(door.crewKeys(), patchedAtMs)
      door.lead = { ...door.lead, subagents: door.crew(elapsed / SWAP_EVERY_MS) }
      door.patch([door.lead])
    }
    if (elapsed === 15_000) door.patch([late])
    if (elapsed === 35_000) {
      depart([door.peers[1].key], patchedAtMs)
      door.patch([], [door.peers[1].key])
    }
    if (elapsed === 45_000) {
      depart([LATE], patchedAtMs)
      door.patch([], [LATE])
    }
    views = door.step()
    invariants.check(views, elapsed)
    checkIndoors(door, views, elapsed, report)
    for (const view of views) {
      if (view.place === 'lounge') report.peersAway.add(view.agentKey)
      if (!known.has(view.agentKey)) {
        known.add(view.agentKey)
        report.arrivalCount++
        const isAtDesk = view.physicalFloorId === view.floorId && door.isSeated(view)
        if (!isAtDesk || view.fade === undefined)
          report.arrivals.push(`${view.agentKey} first seen off its desk or unfaded`)
        materialising.set(view.agentKey, patchedAtMs)
      }
      const startedAtMs = materialising.get(view.agentKey)
      if (startedAtMs === undefined) continue
      if (view.fade === undefined) materialising.delete(view.agentKey)
      else if (elapsed - startedAtMs > SETTLED_WITHIN_MS) {
        report.arrivals.push(`${view.agentKey} still faded ${elapsed - startedAtMs} ms in`)
        materialising.delete(view.agentKey)
      }
    }
    for (const [key, departure] of departing) {
      const view = views.find((candidate) => candidate.agentKey === key)
      if (!view) {
        report.departureCount++
        departing.delete(key)
      } else if (view.x !== departure.x || view.z !== departure.z) {
        report.leavers.push(`${key} moved after its session ended`)
        departing.delete(key)
      } else if (elapsed - departure.removedAtMs > SETTLED_WITHIN_MS) {
        report.leavers.push(`${key} still here ${elapsed - departure.removedAtMs} ms on`)
        departing.delete(key)
      }
    }
  }
  return { ...report, ...invariants.report() }
}

function checkIndoors(
  door: DoorWorld,
  views: readonly AgentView[],
  atMs: number,
  report: { outside: string | null; atEntrance: string | null }
): void {
  const floors = door.world.layout().floors
  for (const view of views) {
    if (view.physicalFloorId === null)
      report.outside ??= `${view.agentKey} outside its building at ${atMs} ms`
    const floor = floors.find((candidate) => candidate.id === view.physicalFloorId)
    if (!floor || floorElevation(floor) !== 0) continue
    const entrance = floorEntrance(floor)
    if (Math.hypot(view.x - entrance.x, view.z - entrance.z) < ENTRANCE_METRES)
      report.atEntrance ??= `${view.agentKey} at the entrance at ${atMs} ms`
  }
}

describe('office retention: agents stay inside their office', () => {
  let run: ReturnType<typeof runRetention>

  beforeAll(() => {
    run = runRetention()
  })

  it('materialises every later arrival at its desk, faded, and settles it within one fade', () => {
    // Five crews of six and the newcomer: the run must have exercised arrivals at all.
    expect(run.arrivalCount).toBe(31)
    expect(run.arrivals).toEqual([])
  })

  it('fades every leaver where it stands and drops it within one fade', () => {
    expect(run.departureCount).toBe(32)
    expect(run.leavers).toEqual([])
  })

  it('never puts an agent outside its building or in its entrance', () => {
    // Both idle peers must have set off for leisure, or nothing here tested outings.
    expect(run.peersAway.size).toBe(2)
    expect({ outside: run.outside, atEntrance: run.atEntrance }).toEqual({
      outside: null,
      atEntrance: null
    })
  })

  // A relayout carries a seated agent with its desk, so steps are the crew churn's check.
  it('keeps every body clear of the others and moving while it does', () => {
    expect({ overlap: run.overlap, blocked: run.blocked }).toEqual({
      overlap: null,
      blocked: null
    })
  })
})
