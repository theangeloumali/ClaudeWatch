import { describe, expect, it } from 'vitest'
import { CITIZEN_BODY_RADIUS } from '../../../../shared/office/body-footprints'
import { SceneBodies } from '../../scene/BodySpace'
import type { Trip } from '../../town/town-trips'
import { advanceNavigation, type CitizenNavigation } from '../citizen-navigation'
import { advanceCitizen, citizenBodyId, type CitizenMotionPose } from '../crowd-movement'
import { routePose } from '../route-pose'

const FRAME_SEC = 1 / 20
// A passage one body wide: nobody can step aside in it.
const isInPassage = (point: { x: number; z: number }): boolean => Math.abs(point.z) < 0.05

const walkAlong = (fromX: number, toX: number): Trip => ({
  kind: 'citizen',
  themeId: 'corporate-city',
  figure: 0,
  route: {
    points: [
      { x: fromX, z: 0 },
      { x: toX, z: 0 }
    ],
    length: Math.abs(toX - fromX)
  },
  speed: 1,
  startSec: 0,
  homeId: null,
  destination: 'park'
})

// The crowd stepped headless for `seconds`, sharing one wait-for graph as MoverLayer does.
function crowdFor(trips: readonly Trip[], seconds: number, space = new SceneBodies()) {
  const poses: CitizenMotionPose[] = trips.map((trip) => routePose(trip.route, 0))
  const clocks = trips.map(() => 0)
  const waitsFor = new Map<string, string>()
  poses.forEach((pose, index) =>
    space.set({ id: citizenBodyId(index), x: pose.x, z: pose.z, radius: CITIZEN_BODY_RADIUS })
  )
  for (let frame = 0; frame < Math.round(seconds / FRAME_SEC); frame++)
    trips.forEach((trip, index) => {
      const next = advanceCitizen({
        trip,
        index,
        pose: poses[index],
        walked: clocks[index],
        deltaSec: FRAME_SEC,
        space,
        isOpen: isInPassage,
        waitsFor
      })
      poses[index] = next.pose
      clocks[index] = next.walked
    })
  return { poses }
}

describe('the jam breaker (citizens-2)', () => {
  it('keeps counting a blocked walker’s stuck time across replans', () => {
    let navigation: CitizenNavigation = {
      untilSec: 10,
      target: { x: 5, z: 0 },
      points: [],
      blockedSec: 0,
      stuckSec: 0
    }
    for (let frame = 0; frame < 40; frame++)
      navigation = advanceNavigation({
        body: { id: 'walker', x: 0, z: 0, radius: CITIZEN_BODY_RADIUS },
        navigation,
        obstacles: [{ id: 'worker', x: 1.1, z: 0, radius: CITIZEN_BODY_RADIUS }],
        isOpen: isInPassage,
        budget: FRAME_SEC,
        deltaSec: FRAME_SEC
      }).navigation
    expect(navigation.stuckSec).toBeCloseTo(40 * FRAME_SEC)
    expect(navigation.blockerId).toBe('worker')
  })

  it('gets a head-on pair past each other in a passage too narrow to step aside', () => {
    const { poses } = crowdFor([walkAlong(0, 30), walkAlong(3, -27)], 12)
    expect(poses[0].x - poses[1].x).toBeGreaterThan(2 * CITIZEN_BODY_RADIUS)
  })

  it('walks through a citizen standing at a stop on a walk too narrow to go round', () => {
    const standing: Trip = {
      ...walkAlong(2, 3),
      route: {
        ...walkAlong(2, 3).route,
        isLoop: true,
        stops: [{ at: 0, sec: 60, isIndoors: false }]
      }
    }
    const { poses } = crowdFor([standing, walkAlong(0, 30)], 10)
    expect(poses[0].x).toBe(2)
    expect(poses[1].x).toBeGreaterThan(2 + 2 * CITIZEN_BODY_RADIUS)
  })

  it('leaves a queue behind a stopped worker standing still, not backing off', () => {
    const space = new SceneBodies()
    space.set({ id: 'worker', x: 4, z: 0, radius: 0.65 })
    const { poses } = crowdFor([walkAlong(1.5, 12), walkAlong(0, 12)], 6, space)
    const settled = poses.map((pose) => pose.x)
    const later = crowdFor([walkAlong(1.5, 12), walkAlong(0, 12)], 9, space).poses
    expect(later.map((pose) => pose.x)).toEqual(settled)
    expect(settled[0]).toBeGreaterThan(settled[1])
  })
})
