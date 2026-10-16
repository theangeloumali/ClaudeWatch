import { expect, it } from 'vitest'
import { BodyPassages } from '../body-passages'
import { bodyFits, bodyStep, WORKER_BODY_RADIUS, type BodyFootprint } from '../body-footprints'
import { waitsForMovingBody } from '../../../office/sim/worker-navigation'

const yielding: BodyFootprint = {
  id: 's3',
  x: 0,
  z: 0,
  radius: WORKER_BODY_RADIUS
}
const leader: BodyFootprint = {
  id: 's13',
  x: 0.95,
  z: 0.95,
  radius: WORKER_BODY_RADIUS
}
const STEP_METRES = 0.14
const requested = {
  x: STEP_METRES,
  z: 0
}

it('holds a collision-safe yielding route for blocked converging traffic', () => {
  const passages = new BodyPassages()
  const options = {
    isExiting: true,
    body: yielding,
    to: requested,
    obstacles: [leader],
    walkers: [{ body: leader, to: { x: 0, z: 0 } }],
    isOpen: () => true,
    tick: 0,
    routeTo: (target: { x: number; z: number }) => [yielding, target]
  }
  expect(waitsForMovingBody(options)).toBeNull()
  const guided = passages.guide(options)
  expect(guided).not.toEqual(requested)
  const moved = bodyStep({ ...options, to: guided })
  expect(bodyFits({ ...yielding, ...moved }, [leader])).toBe(true)
  expect(Math.hypot(moved.x - yielding.x, moved.z - yielding.z)).toBeLessThanOrEqual(
    STEP_METRES + 1e-8
  )
  expect(Math.hypot(moved.x - leader.x, moved.z - leader.z)).toBeGreaterThanOrEqual(
    WORKER_BODY_RADIUS * 2 - 1e-8
  )
  const current = { ...yielding, ...moved }
  const remaining = Math.hypot(current.x, current.z)
  const nextRequest = {
    x: current.x - (current.x / remaining) * STEP_METRES,
    z: current.z - (current.z / remaining) * STEP_METRES
  }
  expect(passages.guide({ ...options, body: current, to: nextRequest, tick: 1 })).not.toEqual(
    nextRequest
  )
  expect(
    passages.guide({
      ...options,
      body: current,
      to: nextRequest,
      obstacles: [],
      walkers: [],
      tick: 2
    })
  ).toEqual(nextRequest)
})

it('does not divert converging arrivals while the requested step is collision-free', () => {
  const body = { ...yielding, x: 0.25, z: -0.36163625457957704 }
  const other = { ...leader, x: 1.0847196057344868, z: 0.6928412810043731 }
  const distance = Math.hypot(body.x, body.z)
  const to = {
    x: body.x - (body.x / distance) * STEP_METRES,
    z: body.z - (body.z / distance) * STEP_METRES
  }
  expect(
    new BodyPassages().guide({
      body,
      to,
      obstacles: [other],
      walkers: [{ body: other, to: { x: 0, z: 0 } }],
      isOpen: () => true,
      tick: 0,
      routeTo: (target) => [body, target]
    })
  ).toEqual(to)
})

it('keeps the lower identity on its requested route when two exit paths converge', () => {
  const distance = Math.hypot(leader.x, leader.z)
  const to = {
    x: leader.x - (leader.x / distance) * STEP_METRES,
    z: leader.z - (leader.z / distance) * STEP_METRES
  }
  expect(
    new BodyPassages().guide({
      body: leader,
      to,
      obstacles: [yielding],
      walkers: [{ body: yielding, to: { x: 0, z: 0 } }],
      isOpen: () => true,
      tick: 0,
      routeTo: (target) => [leader, target]
    })
  ).toEqual(to)
})

it.each([
  { when: 'parallel', leaderX: 1.3, leaderZ: 0, targetX: 2.3, targetZ: 0, shouldWait: true },
  { when: 'diverging', leaderX: 0.1, leaderZ: 1.3, targetX: 0.1, targetZ: 2.3, shouldWait: false }
])(
  'does not start a sideways yield for $when traffic',
  ({ leaderX, leaderZ, targetX, targetZ, shouldWait }) => {
    const body = { ...yielding, id: 'b', x: 0, z: 0 }
    const other = { ...leader, id: 'a', x: leaderX, z: leaderZ }
    const to = { x: STEP_METRES, z: 0 }
    const options = {
      body,
      to,
      obstacles: [other],
      walkers: [{ body: other, to: { x: targetX, z: targetZ } }],
      isOpen: () => true,
      tick: 0,
      routeTo: (target: { x: number; z: number }) => [body, target]
    }
    expect(waitsForMovingBody(options)).toBe(shouldWait ? 'a' : null)
    expect(new BodyPassages().guide(options)).toEqual(to)
  }
)

it('does not yield to a converging body on another physical elevation', () => {
  const upper = { ...leader, elevation: 5.5 }
  expect(
    new BodyPassages().guide({
      body: yielding,
      to: requested,
      obstacles: [upper],
      walkers: [{ body: upper, to: { x: 0, z: 0 } }],
      isOpen: () => true,
      tick: 0,
      routeTo: (target) => [yielding, target]
    })
  ).toEqual(requested)
})
