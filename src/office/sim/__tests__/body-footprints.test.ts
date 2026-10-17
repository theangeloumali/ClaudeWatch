import { expect, it } from 'vitest'
import { BodyPassages } from '../../../shared/office/body-passages'
import {
  bodyFits,
  bodyStep,
  placeBody,
  WORKER_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'

const isOpen = () => true
const body = (id: string, x: number, z = 0): BodyFootprint => ({
  id,
  x,
  z,
  radius: WORKER_BODY_RADIUS
})

it('ignores its own id and accepts touching footprints', () => {
  expect(bodyFits(body('a', 0), [body('a', 0)])).toBe(true)
  expect(bodyFits(body('a', 0), [body('b', WORKER_BODY_RADIUS * 2)])).toBe(true)
  expect(bodyFits(body('a', 0), [body('b', 0)])).toBe(false)
})

it('sweeps the entire move rather than tunnelling through another body', () => {
  const moving = body('a', -2)
  const obstacle = body('b', 0)
  const next = bodyStep({ body: moving, to: { x: 2, z: 0 }, obstacles: [obstacle], isOpen })
  expect(bodyFits({ ...moving, ...next }, [obstacle])).toBe(true)
  expect(Math.hypot(next.x - moving.x, next.z - moving.z)).toBeLessThanOrEqual(0.350001)
  const small = { ...body('small', -0.15), radius: 0.02 }
  const swept = bodyStep({
    body: small,
    to: { x: 0.15, z: 0 },
    obstacles: [{ ...body('blocker', 0), radius: 0.02 }],
    isOpen
  })
  expect(swept.x).toBeLessThanOrEqual(0)
})

it('escapes an exact-center overlap without teleporting and does so deterministically', () => {
  let moving = body('a', 0)
  const obstacles = [body('b', 0)]
  const options = { body: moving, to: { x: 0.14, z: 0 }, obstacles, isOpen }
  expect(bodyStep(options)).toEqual(bodyStep(options))
  for (let tick = 0; tick < 30; tick++) {
    const next = bodyStep({
      body: moving,
      to: { x: moving.x + 0.14, z: moving.z },
      obstacles,
      isOpen
    })
    expect(Math.hypot(next.x - moving.x, next.z - moving.z)).toBeLessThanOrEqual(0.140001)
    moving = { ...moving, ...next }
  }
  expect(bodyFits(moving, obstacles)).toBe(true)
})

it('finds separated initial positions or honestly reports no open position', () => {
  const moving = body('a', 0)
  const obstacles = [body('b', 0)]
  const placed = placeBody({ body: moving, obstacles, isOpen })
  expect(placed).not.toBeNull()
  if (placed) expect(bodyFits({ ...moving, ...placed }, obstacles)).toBe(true)
  expect(placeBody({ body: moving, obstacles, isOpen: () => false })).toBeNull()
})

it('passes head-on bodies on open ground rather than stopping both forever', () => {
  let first = body('a', -2)
  let second = body('b', 2)
  for (let tick = 0; tick < 120; tick++) {
    first = {
      ...first,
      ...bodyStep({ body: first, to: { x: first.x + 0.14, z: 0 }, obstacles: [second], isOpen })
    }
    second = {
      ...second,
      ...bodyStep({ body: second, to: { x: second.x - 0.14, z: 0 }, obstacles: [first], isOpen })
    }
    expect(bodyFits(first, [second])).toBe(true)
  }
  expect(first.x).toBeGreaterThan(second.x)
})

it('does not side-step through a closed wall when a body blocks a narrow corridor', () => {
  const moving = body('a', -1.3)
  const next = bodyStep({
    body: moving,
    to: { x: -1.16, z: 0 },
    obstacles: [body('b', 0)],
    isOpen: (point) => Math.abs(point.z) < 0.01
  })
  expect(next).toEqual({ x: moving.x, z: moving.z })
})

it('keeps a deterministic head-on yield active rather than stepping straight back into the leader', () => {
  const passages = new BodyPassages()
  const leader = body('a', 0, -0.65)
  const yielding = body('b', 0, 0.65)
  const options = {
    body: yielding,
    to: { x: 0, z: 0.51 },
    obstacles: [leader],
    walkers: [{ body: leader, to: { x: 0, z: -0.51 } }],
    isOpen,
    tick: 0,
    routeTo: (target: { x: number; z: number }) => [yielding, target]
  }
  const first = passages.guide(options)
  expect(first.x).not.toBe(0)
  const held = passages.guide({ ...options, body: { ...yielding, ...first }, tick: 1 })
  expect(Math.sign(held.x)).toBe(Math.sign(first.x))
  expect(passages.guide({ ...options, obstacles: [], walkers: [], tick: 2 })).toEqual(options.to)
})

it('keeps connector capacity one even when its occupants are vertically separated', () => {
  const body = { id: 'lower', x: 0, z: 0, radius: 0.65, elevation: 1, connectorId: 'lift' }
  expect(bodyFits(body, [{ ...body, id: 'upper', elevation: 9 }])).toBe(false)
  expect(bodyFits(body, [{ ...body, id: 'upper', elevation: 9, connectorId: 'other-lift' }])).toBe(
    true
  )
})
