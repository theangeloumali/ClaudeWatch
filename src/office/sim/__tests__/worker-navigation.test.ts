import { describe, expect, it } from 'vitest'
import { agentBody } from '../agent-body'
import { createAgent } from '../behaviour'
import { session } from '../fixtures'
import { buildLayout } from '../layout'
import { recoverWorkerRoute, workerNavigation } from '../worker-navigation'
import { FloorRoutes } from '../world-floor-routes'

describe('worker navigation: a walker keeps to its own floor', () => {
  const layout = buildLayout([session('claude:a')], undefined)
  const floor = layout.floors[0]
  const room = floor.rooms.find((candidate) => candidate.sessionKey === 'claude:a')!
  const desk = room.slots.find((slot) => slot.id === 'desk_main')!
  const routes = new FloorRoutes()
  routes.update(layout)
  const atDesk = createAgent(
    session('claude:a'),
    {
      floorId: floor.id,
      roomId: room.id,
      slotId: desk.id,
      x: desk.x,
      z: desk.z,
      heading: desk.heading,
      elevation: 0,
      physicalFloorId: floor.id
    },
    false
  )
  const offFloor = { x: floor.x + floor.width / 2 + 6, z: floor.z }
  const furtherOff = { ...offFloor, z: offFloor.z + 4 }
  const stranded = { ...atDesk, view: { ...atDesk.view, ...offFloor }, path: [furtherOff] }

  it('treats a point off its floor grid as closed, on the ground floor too', () => {
    const { isOpen } = workerNavigation({ routes, from: atDesk.view })
    expect({ desk: isOpen(desk), offFloor: isOpen(offFloor) }).toEqual({
      desk: true,
      offFloor: false
    })
  })

  it('finds no detour between points off its floor', () => {
    const { around } = workerNavigation({ routes, from: stranded.view })
    expect(around(agentBody(stranded.view), furtherOff, [])).toEqual([])
  })

  it('recovers no route for a walker standing off its floor', () => {
    expect(
      recoverWorkerRoute({ agent: stranded, routes, obstacles: [], body: agentBody(stranded.view) })
    ).toEqual([])
  })
})
