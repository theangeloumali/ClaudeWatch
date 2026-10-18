import { expect, it } from 'vitest'
import { createAgent, goToLounge, LOUNGE_DELAY_MS, setFinished, tickAgent } from './behaviour'
import { session } from './fixtures'
import { loungesByRoom, loungeSeats } from './lounge'
import { buildLayout } from './layout'
import { resolveEffectiveWorld } from './effective-world'
import { createWorldDocument } from '../../shared/office/world-document'
import { lounge } from './rooms'

const desk = { floorId: 'hq', roomId: 'room', slotId: 'desk_main', x: 0, z: 0, heading: 0 }
const waiting = (key: string) =>
  tickAgent(setFinished(createAgent(session(key), desk, false), true), LOUNGE_DELAY_MS)
const loungeWith = (seats: number) => new Map([['room', lounge('company:c', 0, 0, seats, false)]])

it('leaves an agent at its desk while the lounge is full', () => {
  const lounges = loungeWith(1)
  const [a, b] = ['a', 'b'].map(waiting)
  const seats = loungeSeats([b, a], lounges)
  expect(seats.get('a')?.id).toBe('lounge_seat_0')
  expect(seats.get('b')).toBeNull()

  const seated = goToLounge(a, seats.get('a')!, [])
  expect(loungeSeats([b, seated], lounges).get('b')).toBeNull()
  expect(loungeSeats([b], lounges).get('b')?.id).toBe('lounge_seat_0')
})

it('never gives one seat to two agents that set off together', () => {
  const seats = loungeSeats(['c', 'a', 'b'].map(waiting), loungeWith(4))
  expect(['a', 'b', 'c'].map((key) => seats.get(key)?.id)).toEqual([
    'lounge_seat_0',
    'lounge_seat_1',
    'lounge_seat_2'
  ])
})

it('keeps a sitter in its seat while a newcomer takes the lowest free one', () => {
  const lounges = loungeWith(4)
  const sitter = goToLounge(waiting('z'), lounges.get('room')!.slots[1], [])
  const seats = loungeSeats([waiting('a'), sitter], lounges)
  expect(seats.get('z')?.id).toBe('lounge_seat_1')
  expect(seats.get('a')?.id).toBe('lounge_seat_0')
})

it('moves a sitter whose seat is gone before it seats a newcomer', () => {
  const sitter = goToLounge(waiting('z'), { id: 'lounge_seat_7', heading: 0 }, [])
  const seats = loungeSeats([waiting('a'), sitter], loungeWith(1))
  expect(seats.get('z')?.id).toBe('lounge_seat_0')
  expect(seats.get('a')).toBeNull()
})

it('says nothing about agents that are working at their desks', () => {
  const working = tickAgent(createAgent(session('a'), desk, false), LOUNGE_DELAY_MS)
  expect(loungeSeats([working], loungeWith(4)).size).toBe(0)
})

// A room moved into another company's building sits on that building's floor and plays there.
it("gives a room moved into another company's building that floor's corner", () => {
  const sessions = [
    session('claude:work', 'p_a'),
    { ...session('claude:side', 'p_x'), companyKey: 'c_side', companyLabel: 'Side' }
  ]
  const base = buildLayout(sessions, undefined)
  const document = createWorldDocument(base, sessions)
  const host = document.buildings.find((building) => building.companyKey === 'c_work')!
  const moved = document.rooms.find((room) => room.target === 'session:claude:side')!
  // Grown so the corner still fits east of both offices.
  host.footprint.width += 16
  moved.buildingId = host.id
  moved.position = { x: 2.2, z: 0 }
  const floor = resolveEffectiveWorld(base, document, sessions).floors.find((candidate) =>
    candidate.rooms.some((room) => room.sessionKey === 'claude:side')
  )!
  const room = floor.rooms.find((candidate) => candidate.sessionKey === 'claude:side')!
  expect({
    company: room.companyKey,
    floor: floor.buildingId,
    corner: floor.zones[0].lounge?.id
  }).toEqual({ company: 'c_side', floor: host.id, corner: `${floor.id}:games` })
  expect(loungesByRoom(floor).get(room.id)?.id).toBe(`${floor.id}:games`)
})
