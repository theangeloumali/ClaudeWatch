import { expect, it } from 'vitest'
import {
  createAgent,
  goToLounge,
  leaveAgent,
  LOUNGE_DELAY_MS,
  returnToDesk,
  setFinished,
  tickAgent,
  updateAgent,
  wantsLounge
} from './behaviour'
import { session } from './fixtures'

it('starts the done dwell at arrival and does not restart it on duplicate updates', () => {
  let agent = createAgent(
    { ...session('a'), attention: 'done' },
    { floorId: 'p_a', roomId: 'a', slotId: 'desk_main', x: 1, z: 0, heading: 0 },
    [
      { x: 0, z: 0 },
      { x: 1, z: 0 }
    ]
  )
  agent = tickAgent(agent, 2000)
  expect(agent.state).toBe('done')
  agent = tickAgent(agent, 1000)
  agent = updateAgent(agent, 'idle', 'done')
  expect(tickAgent(agent, 500).state).toBe('working')
})

it('finishes arriving when attention changes while walking', () => {
  let agent = createAgent(
    session('a'),
    { floorId: 'p_a', roomId: 'a', slotId: 'desk_main', x: 1, z: 0, heading: 0.5 },
    [
      { x: 0, z: 0 },
      { x: 1, z: 0 }
    ]
  )
  agent = updateAgent(agent, 'reading', 'question')
  expect(agent.view.attention).toBe('question')
  agent = tickAgent(agent, 1000)
  expect(agent.view.x).toBe(1)
  expect(agent.state).toBe('needs_you')
  expect(agent.view.heading).toBe(0.5)
})

it('shows done briefly, then resumes working', () => {
  let agent = createAgent(
    session('a'),
    { floorId: 'p_a', roomId: 'a', slotId: 'desk_main', x: 0, z: 0, heading: 0 },
    []
  )
  agent = updateAgent(tickAgent(agent, 0), 'idle', 'done')
  expect(tickAgent(agent, 1400).state).toBe('done')
  expect(tickAgent(agent, 1500).state).toBe('working')
})

it('coalesces activities until the 1.5 second dwell ends', () => {
  let agent = createAgent(
    session('a'),
    { floorId: 'p_a', roomId: 'a', slotId: 'desk_main', x: 0, z: 0, heading: 0 },
    [{ x: 0, z: 0 }]
  )
  agent = tickAgent(agent, 0)
  agent = updateAgent(agent, 'reading', 'none')
  agent = tickAgent(agent, 500)
  agent = updateAgent(agent, 'editing', 'none')
  agent = tickAgent(agent, 500)
  agent = updateAgent(agent, 'running', 'none')
  expect(agent.view.activity).toBe('idle')
  expect(tickAgent(agent, 500).view.activity).toBe('running')
})
it('applies attention immediately and keeps facing the camera, as its seat does', () => {
  const agent = createAgent(
    session('a'),
    { floorId: 'p_a', roomId: 'a', slotId: 'desk_main', x: 0, z: 0, heading: 0.5 },
    []
  )
  const next = updateAgent(agent, 'editing', 'permission')
  expect(next.state).toBe('needs_you')
  expect(next.view.heading).toBe(0.5)
  expect(next.view.attention).toBe('permission')
})

const desk = { floorId: 'hq', roomId: 'a', slotId: 'desk_main', x: 0, z: 0, heading: 0.5 }
const loungeSeat = { id: 'lounge_seat_0', x: 2, z: 0, heading: 0 }

it('wants the lounge only once a finished agent has waited the whole delay', () => {
  let agent = setFinished(createAgent(session('a'), desk, []), true)
  agent = tickAgent(agent, LOUNGE_DELAY_MS - 100)
  expect(wantsLounge(agent)).toBe(false)
  // A repeated update does not restart the wait.
  agent = tickAgent(setFinished(agent, true), 100)
  expect(wantsLounge(agent)).toBe(true)
  expect(wantsLounge(setFinished(agent, false))).toBe(false)
  expect(wantsLounge(tickAgent(setFinished(setFinished(agent, false), true), 100))).toBe(false)
})

it('never wants the lounge while working, however long it runs', () => {
  const agent = tickAgent(createAgent(session('a'), desk, []), LOUNGE_DELAY_MS * 3)
  expect(wantsLounge(agent)).toBe(false)
})

it('is in the lounge from setting off until setting off back, and keeps its desk', () => {
  let agent = setFinished(createAgent({ ...session('a'), attention: 'done' }, desk, []), true)
  agent = goToLounge(tickAgent(agent, LOUNGE_DELAY_MS), loungeSeat, [
    { x: 0, z: 0 },
    { x: 2, z: 0 }
  ])
  expect(agent.view).toMatchObject({ place: 'lounge', roomId: 'a', slotId: 'desk_main', x: 0 })
  expect(wantsLounge(agent)).toBe(false)
  agent = tickAgent(agent, 2000)
  expect(agent.view).toMatchObject({ place: 'lounge', x: 2, heading: loungeSeat.heading })

  agent = returnToDesk(agent, desk.heading, [
    { x: 2, z: 0 },
    { x: 0, z: 0 }
  ])
  expect('place' in agent.view).toBe(false)
  expect(agent.view.x).toBe(2)
  agent = tickAgent(agent, 2000)
  expect(agent.view).toMatchObject({ x: 0, heading: desk.heading })
})

it('gives up its lounge seat and stops walking when its session ends', () => {
  const lounging = goToLounge(createAgent(session('a'), desk, []), loungeSeat, [{ x: 2, z: 0 }])
  const leaving = leaveAgent(lounging)
  expect('place' in leaving.view).toBe(false)
  expect({ seat: leaving.loungeSeatId, path: leaving.path }).toEqual({ seat: null, path: [] })
})
