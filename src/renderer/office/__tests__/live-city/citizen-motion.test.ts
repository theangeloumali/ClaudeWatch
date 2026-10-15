import { describe, expect, it } from 'vitest'
import { CITIZEN_BODY_RADIUS } from '../../../../shared/office/body-footprints'
import { advanceCitizen, citizenBodyId } from '../../citizens/crowd-movement'
import { moverClock } from '../../citizens/mover-clock'
import {
  routePose,
  turnToward,
  type CitizenPose,
  type CitizenRoute
} from '../../citizens/route-pose'
import type { WalkGround } from '../../player/walk-ground'
import { SceneBodies } from '../../scene/BodySpace'
import type { Trip } from '../../town/town-trips'

const EAST = Math.PI / 2
const street: Trip = {
  kind: 'citizen',
  themeId: 'corporate-city',
  figure: 0,
  route: {
    points: [
      { x: 0, z: 0 },
      { x: 20, z: 0 }
    ],
    length: 20
  },
  speed: 1,
  startSec: 0,
  homeId: null,
  destination: 'park'
}
const square: CitizenRoute = {
  points: [
    { x: 0, z: 0 },
    { x: 5, z: 0 },
    { x: 5, z: 5 },
    { x: 0, z: 5 },
    { x: 0, z: 0 }
  ],
  length: 20,
  isLoop: true,
  stops: [{ at: 5, sec: 2, isIndoors: false }]
}

function replay(options: {
  trip?: Trip
  pose?: CitizenPose
  walked?: number
  seconds: number
  deltaSec?: number
  space?: SceneBodies
  ground?: WalkGround
  isOpen?: WalkGround['isOpen']
}) {
  const trip = options.trip ?? street
  const deltaSec = options.deltaSec ?? 1 / 60
  const space = options.space ?? new SceneBodies()
  let pose = options.pose ?? routePose(trip.route, trip.startSec * trip.speed, trip.speed)
  let walked = options.walked ?? trip.startSec
  const frames: CitizenPose[] = [pose]
  let distance = 0
  for (let frame = 0; frame < Math.round(options.seconds / deltaSec); frame++) {
    const next = advanceCitizen({
      trip,
      index: 0,
      pose,
      walked,
      deltaSec,
      space,
      ground: options.ground,
      isOpen: options.isOpen ?? options.ground?.isOpen ?? (() => true)
    })
    const displacement = Math.hypot(next.pose.x - pose.x, next.pose.z - pose.z)
    expect(displacement).toBeLessThanOrEqual(trip.speed * deltaSec + 1e-6)
    if (displacement > 1e-6) {
      const travelHeading = Math.atan2(next.pose.x - pose.x, next.pose.z - pose.z)
      expect(Math.cos(next.pose.heading - travelHeading)).toBeGreaterThan(0.95)
    }
    distance += displacement
    pose = next.pose
    walked = next.walked
    frames.push(pose)
  }
  return { pose, walked, distance, frames, space }
}

it.each([1 / 60, 1 / 30, 1 / 15, 0.2])(
  'bounds an off-route citizen by speed times elapsed time (%s seconds)',
  (deltaSec) => {
    const pose = { x: 3, z: 1, heading: EAST, isIndoors: false }
    const next = advanceCitizen({
      trip: street,
      index: 0,
      pose,
      walked: 0,
      deltaSec,
      space: new SceneBodies(),
      isOpen: () => true
    })
    expect(Math.hypot(next.pose.x - pose.x, next.pose.z - pose.z)).toBeLessThanOrEqual(
      street.speed * deltaSec + 1e-6
    )
  }
)

describe('physical citizen progress', () => {
  it('rejoins from a displaced seed without chasing a frozen point behind it', () => {
    const motion = replay({
      pose: { x: 3, z: 1, heading: EAST, isIndoors: false },
      seconds: 6
    })
    expect(motion.pose.x).toBeGreaterThan(8)
    expect(motion.pose.z).toBeLessThan(1)
    expect(motion.walked).toBeGreaterThan(5)
    expect(motion.distance).toBeLessThanOrEqual(6 + 1e-6)
  })

  it.each(['worker', 'player'])('passes a ground-level %s using stable waypoints', (id) => {
    const space = new SceneBodies()
    space.set({ id, x: 3, z: 0, radius: 0.65 })
    const motion = replay({ space, seconds: 12 })
    expect(motion.pose.x).toBeGreaterThan(8)
    expect(motion.walked).toBeGreaterThan(6)
    for (const pose of motion.frames)
      expect(Math.hypot(pose.x - 3, pose.z)).toBeGreaterThanOrEqual(
        CITIZEN_BODY_RADIUS + 0.65 - 1e-6
      )
    const reversals = motion.frames.slice(1).filter((pose, index) => {
      return pose.x < motion.frames[index].x - 1e-6
    })
    expect(reversals).toHaveLength(0)
  })

  it('yields in a narrow passage and resumes after the blocker leaves', () => {
    const space = new SceneBodies()
    space.set({ id: 'worker', x: 3, z: 0, radius: 0.65 })
    const isOpen = (point: { x: number; z: number }): boolean => Math.abs(point.z) < 0.05
    const waiting = replay({ space, isOpen, seconds: 5 })
    expect(waiting.pose.x).toBeLessThan(2)
    expect(waiting.pose.heading).toBe(EAST)
    const earlier = waiting.frames.at(-30)
    expect(waiting.pose.x).toBe(earlier?.x)
    expect(waiting.pose.z).toBe(earlier?.z)
    expect(waiting.pose.heading).toBe(earlier?.heading)
    space.remove('worker')
    const resumed = replay({
      space,
      isOpen,
      pose: waiting.pose,
      walked: waiting.walked,
      seconds: 5
    })
    expect(resumed.walked).toBeGreaterThan(waiting.walked + 4)
    expect(resumed.pose.x).toBeGreaterThan(6)
  })

  it('does not treat workers on another elevation as ground obstacles', () => {
    const space = new SceneBodies()
    space.set({ id: 'upstairs-worker', x: 3, z: 0, radius: 0.65, elevation: 4 })
    const motion = replay({ space, seconds: 5 })
    expect(motion.pose.x).toBeCloseTo(5)
    expect(motion.pose.z).toBe(0)
    expect(motion.walked).toBeCloseTo(5)
  })

  it('lets opposing citizens pass rather than deadlock in open ground', () => {
    const space = new SceneBodies()
    const trips = [
      street,
      { ...street, route: { ...street.route, points: [...street.route.points].reverse() } }
    ]
    const poses = trips.map((trip) => routePose(trip.route, 0))
    const clocks = [0, 0]
    poses.forEach((pose, index) => {
      space.set({ id: citizenBodyId(index), ...pose, radius: CITIZEN_BODY_RADIUS })
    })
    for (let frame = 0; frame < 60 * 15; frame++)
      trips.forEach((trip, index) => {
        const next = advanceCitizen({
          trip,
          index,
          pose: poses[index],
          walked: clocks[index],
          deltaSec: 1 / 60,
          space,
          isOpen: () => true
        })
        expect(
          Math.hypot(next.pose.x - poses[index].x, next.pose.z - poses[index].z)
        ).toBeLessThanOrEqual(1 / 60 + 1e-6)
        poses[index] = next.pose
        clocks[index] = next.walked
        const other = poses[1 - index]
        expect(Math.hypot(next.pose.x - other.x, next.pose.z - other.z)).toBeGreaterThanOrEqual(
          CITIZEN_BODY_RADIUS * 2 - 1e-6
        )
      })
    expect(poses[0].x).toBeGreaterThan(11)
    expect(poses[1].x).toBeLessThan(9)
    expect(clocks.every((clock) => clock > 10)).toBe(true)
  })

  it('reuses the ground pathfinder around a static obstruction', () => {
    const origin = { x: -2, z: -4 }
    const cellSize = 0.5
    const width = 50
    const height = 17
    const blocked: string[] = []
    for (let row = 0; row < height; row++)
      for (let column = 0; column < width; column++) {
        const x = origin.x + column * cellSize
        const z = origin.z + row * cellSize
        if (x >= 3 && x <= 4 && Math.abs(z) <= 1) blocked.push(`${column},${row}`)
      }
    const closed = new Set(blocked)
    const ground: WalkGround = {
      grid: { origin, cellSize, width, height, blocked },
      isOpen: (point) => {
        const column = Math.round((point.x - origin.x) / cellSize)
        const row = Math.round((point.z - origin.z) / cellSize)
        return !closed.has(`${column},${row}`)
      }
    }
    const motion = replay({ ground, seconds: 12 })
    expect(motion.pose.x).toBeGreaterThan(7)
    expect(motion.walked).toBeGreaterThan(6)
    expect(motion.frames.every(ground.isOpen)).toBe(true)
  })
})

it.each([1 / 60, 1 / 30, 1 / 15, 0.2])(
  'turns smoothly across the angle seam with frame-invariant easing (%s seconds)',
  (deltaSec) => {
    const from = Math.PI - 0.02
    const to = -Math.PI + 0.02
    let heading = from
    for (let frame = 0; frame < Math.round(1 / deltaSec); frame++)
      heading = turnToward(heading, to, 1 - Math.exp(-7 * deltaSec))
    expect(heading).toBeGreaterThan(from)
    expect(heading - from).toBeCloseTo(0.04 * (1 - Math.exp(-7)), 8)
  }
)

describe('route waits', () => {
  it.each([false, true])('holds the heading at an outdoor/indoor stop (%s)', (isIndoors) => {
    const trip = {
      ...street,
      route: { ...square, stops: [{ at: 5, sec: 2, isIndoors }] }
    }
    const pose = { x: 5, z: 0, heading: 0.7, isIndoors }
    const next = advanceCitizen({
      trip,
      pose,
      walked: 5.5,
      index: 0,
      deltaSec: 0.2,
      space: new SceneBodies(),
      isOpen: () => true
    })
    expect(next.pose).toMatchObject(pose)
    expect(next.distance).toBe(0)
    expect(next.walked).toBeCloseTo(5.7)
  })

  it('enters an indoor stop only after physical arrival and then emerges', () => {
    const trip = {
      ...street,
      route: { ...square, stops: [{ at: 5, sec: 2, isIndoors: true }] }
    }
    const arrived = replay({ trip, seconds: 6 })
    expect(arrived.pose.x).toBeCloseTo(5, 8)
    expect(arrived.pose).toMatchObject({ z: 0, isIndoors: true })
    expect(arrived.space.all().some((body) => body.id === citizenBodyId(0))).toBe(false)
    const emerged = replay({ trip, pose: arrived.pose, walked: arrived.walked, seconds: 2 })
    expect(emerged.pose.isIndoors).toBe(false)
    expect(emerged.pose.z).toBeCloseTo(1)
  })

  it.each([1 / 60, 1 / 30, 1 / 15, 0.2])(
    'keeps unobstructed route/wait timing invariant at %s seconds per frame',
    (deltaSec) => {
      const trip = { ...street, route: square }
      const motion = replay({ trip, seconds: 12, deltaSec })
      expect(motion.walked).toBeCloseTo(12, 5)
      expect(motion.pose.x).toBeCloseTo(5, 5)
      expect(motion.pose.z).toBeCloseTo(5, 5)
    }
  )
})

it('retains route clocks and poses across equivalent plans and presentation changes', () => {
  const space = new SceneBodies()
  const initial = moverClock({ trips: [street], space, isOpen: () => true })
  initial.moved[0] = 6
  initial.headings[0] = 0.4
  initial.strides[0] = 7
  initial.positions[0] = { x: 6, z: 1, heading: 0.4, isIndoors: false }
  const redressed = {
    ...street,
    themeId: 'brass-workshop',
    figure: 3,
    homeId: 'redressed-home',
    route: {
      ...street.route,
      points: street.route.points.map((point) => ({ z: point.z, x: point.x }))
    }
  }
  const changed = moverClock({
    trips: [redressed, { ...street, startSec: 10 }],
    space,
    isOpen: () => true,
    previous: initial
  })
  expect(changed.moved[0]).toBe(6)
  expect(changed.headings[0]).toBe(0.4)
  expect(changed.strides[0]).toBe(7)
  expect(changed.positions[0]).toBe(initial.positions[0])
})
