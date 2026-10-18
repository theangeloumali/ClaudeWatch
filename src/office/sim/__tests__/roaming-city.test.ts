import { describe, expect, it, vi } from 'vitest'
import type { AgentView } from '../../../shared/office/types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import { ROAMER_CAP } from '../roaming'
import { CityWorld, doorSwap, idle, isOuting, streetsOf } from './roaming-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 240_000 })

// Long enough for a venue trip across town and a loop after it.
const IDLE_MS = 540_000

// Four idle agents with venues open for nine minutes, then all called back to work.
function cityAfternoon() {
  const city = new CityWorld(idle(4), { hasVenues: true })
  const streets = streetsOf(city.world.layout())
  const onAsphalt: string[] = []
  const againstFlow: string[] = []
  // Each outing finished while idle, by whether it sat at a venue; a call back ends the rest.
  const outings = { loops: 0, venues: 0 }
  const sawVenue = new Map<string, boolean>()
  let previous = new Map<string, AgentView>()
  const where = (elapsedMs: number, view: AgentView) =>
    `${elapsedMs} ${view.agentKey} ${view.x.toFixed(2)},${view.z.toFixed(2)}`
  const watch = (views: AgentView[], elapsedMs: number) => {
    for (const view of views) {
      if (view.physicalFloorId !== null) continue
      const before = previous.get(view.agentKey)
      if (streets.isOnAsphalt(view)) onAsphalt.push(where(elapsedMs, view))
      if (before?.physicalFloorId === null && streets.isAgainstFlow(before, view))
        againstFlow.push(where(elapsedMs, view))
    }
    for (const view of views) {
      if (view.place === 'lounge')
        sawVenue.set(view.agentKey, !!view.venueId || !!sawVenue.get(view.agentKey))
      else if (sawVenue.has(view.agentKey)) {
        if (elapsedMs <= IDLE_MS) outings[sawVenue.get(view.agentKey) ? 'venues' : 'loops'] += 1
        sawVenue.delete(view.agentKey)
      }
    }
    previous = new Map(views.map((view) => [view.agentKey, view]))
  }
  city.run(IDLE_MS, watch)
  city.patch(idle(4)(city.clock).map((record) => ({ ...record, activity: 'thinking' as const })))
  city.run(150_000, (views, elapsedMs) => watch(views, IDLE_MS + elapsedMs))
  const unseated = city.world
    .step(0)
    .filter((view) => !city.isSeated(view))
    .map((view) => view.agentKey)
  return { onAsphalt, againstFlow, outings, unseated }
}

describe('roaming: on the same sidewalks as the citizens', () => {
  const afternoon = cityAfternoon()

  it('sends idle agents both round loops and to venues, and all home to work', () => {
    expect({
      roams: afternoon.outings.loops > 0,
      visits: afternoon.outings.venues > 0,
      unseated: afternoon.unseated
    }).toEqual({ roams: true, visits: true, unseated: [] })
  })

  it('puts no roamer, visitor or returner sample on a carriageway outside a crosswalk', () => {
    expect(afternoon.onAsphalt.slice(0, 5)).toEqual([])
  })

  it('walks every roamer with its run’s one-way direction', () => {
    expect(afternoon.againstFlow.slice(0, 5)).toEqual([])
  })
})

describe('roaming: the roamer cap', () => {
  it('never has more than ROAMER_CAP agents round loops at once, and reaches it', () => {
    const city = new CityWorld(idle(ROAMER_CAP + 3), { hasVenues: false })
    let most = 0
    city.run(LOUNGE_DELAY_MS + 120_000, (views) => {
      most = Math.max(most, views.filter(isOuting).length)
    })
    expect(most).toBe(ROAMER_CAP)
  })

  // Review Focus 1 at the cap: every roamer is called back as the crew turns over, while all
  // of them are still near the one door. Returning roamers must neither jam the door nor hold
  // the crew outside while they walk home.
  it('keeps the door clearing when ROAMER_CAP roamers return during a crew swap', () => {
    expect(doorSwap(ROAMER_CAP)).toEqual({
      allOut: true,
      isDoorClearWithin30s: true,
      isDoorNeverBusy30s: true,
      unseated: []
    })
  })
})
