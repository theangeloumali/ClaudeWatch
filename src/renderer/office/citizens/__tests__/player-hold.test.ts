import { describe, expect, it } from 'vitest'
import { liveCity } from '../../town/__tests__/pedestrian.test-utils'
import { routePose } from '../route-pose'
import { isHeldByPlayer, NOSE_M } from '../zebra-traffic'

// The owner's character walks anywhere, so a vehicle stops short of it mid-block too.
describe('a vehicle and the player', () => {
  const scenario = liveCity()
  const trip = scenario.trips.find((candidate) => candidate.kind === 'transit')
  if (!trip || trip.kind === 'citizen') throw new Error('The live city has no transit loop')
  const walked = 3
  const ahead = routePose(trip.route, (walked + 0.05) * trip.speed + NOSE_M[trip.kind], trip.speed)

  it('holds when the player stands just ahead of its front, away from any zebra', () => {
    expect(isHeldByPlayer(trip, walked, 0.05, { x: ahead.x, z: ahead.z })).toBe(true)
  })

  it('drives on when the player stands well clear of its path', () => {
    expect(isHeldByPlayer(trip, walked, 0.05, { x: ahead.x + 10, z: ahead.z + 10 })).toBe(false)
  })
})
