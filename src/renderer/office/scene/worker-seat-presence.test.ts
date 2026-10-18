import { describe, expect, it } from 'vitest'
import { makeAgent, makeFloor, makeZone } from '../__tests__/fixtures'
import { gameCornerFixture } from '../themes/game-corner.test-utils'
import { workerSeatPresence, workerSeats } from './worker-seat-presence'

const corner = gameCornerFixture(Math.PI, 4, { x: 10, z: 10 })
const upstairs = makeFloor({
  floorId: 'f2',
  elevation: 5.5,
  zones: [makeZone({ id: 'c', kind: 'company', lounge: corner })]
})
const [seat] = corner.seats
const gamer = makeAgent({
  agentKey: 'a',
  floorId: 'f2',
  place: 'lounge',
  x: seat.x,
  z: seat.z,
  elevation: 5.5
})

describe('a gamer on its game corner seat', () => {
  const seats = workerSeats({ agent: gamer, floors: [upstairs], zoneGroups: [] })
  const presenceAt = (agent = gamer, isMoving = false) =>
    workerSeatPresence({ agent, position: { x: seat.x, y: 5.5, z: seat.z }, seats, isMoving })

  it('finds every seat of the corners on its own floor, at that floor height', () => {
    expect(seats.lounge.map(({ x, y, z }) => ({ x, y, z }))).toEqual(
      corner.seats.map(({ x, z }) => ({ x, y: 5.5, z }))
    )
  })

  it('sits once it has arrived, and stands while it walks or is called to work', () => {
    expect(presenceAt()).toBe('lounge')
    expect(presenceAt(gamer, true)).toBe('none')
    expect(presenceAt({ ...gamer, activity: 'editing' })).toBe('none')
  })

  // The sim seats any agent at rest, so a turn that ended mid-activity still plays.
  it.each([
    ['editing', 'done'],
    ['thinking', 'done']
  ] as const)('sits a gamer whose %s turn is %s', (activity, attention) => {
    expect(presenceAt({ ...gamer, activity, attention })).toBe('lounge')
  })
})
