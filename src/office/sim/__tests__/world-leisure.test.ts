import { expect, it } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import { createAgent, LOUNGE_DELAY_MS, type AgentRecord } from '../behaviour'
import { session } from '../fixtures'
import { buildLayout } from '../layout'
import { loungesByRoom } from '../lounge'
import { FloorRoutes } from '../world-floor-routes'
import { reconcileLeisure } from '../world-leisure'

// Long done at its desk: without a fade it would set off for a seat now.
function doneAtDesk(isFading: (key: string) => boolean) {
  const done: SessionRef = { ...session('a'), attention: 'done' }
  const map = buildLayout([done], undefined)
  const floor = map.floors[0]
  const room = floor.rooms.find((candidate) => candidate.sessionKey === 'a')!
  const desk = room.slots.find((slot) => slot.id === 'desk_main')!
  const agent: AgentRecord = {
    ...createAgent(
      done,
      { floorId: floor.id, roomId: room.id, slotId: desk.id, ...desk, physicalFloorId: floor.id },
      false
    ),
    finishedForMs: LOUNGE_DELAY_MS
  }
  const routes = new FloorRoutes()
  routes.update(map)
  return {
    agents: new Map([['a', agent]]),
    sessions: [done],
    sources: [],
    connected: true,
    nowMs: 0,
    hasTrips: true,
    map,
    routes,
    lounges: new Map(map.floors.flatMap((candidate) => [...loungesByRoom(candidate)])),
    clearPassage: () => undefined,
    isFading,
    callHome: (record: AgentRecord) => record
  }
}

it('sends a finished agent at its desk to a lounge seat', () => {
  const context = doneAtDesk(() => false)
  reconcileLeisure(context)
  expect(context.agents.get('a')!.view.place).toBe('lounge')
})

// A fader never walks, so a seat would be a path it never takes (Minor 5).
it('gives no lounge seat to an agent fading out to its desk', () => {
  const context = doneAtDesk((key) => key === 'a')
  reconcileLeisure(context)
  const agent = context.agents.get('a')!
  expect({ place: agent.view.place, path: agent.path }).toEqual({ place: undefined, path: [] })
})
