import { describe, expect, it } from 'vitest'
import type { CityEvent } from '../../../office-live/city-events'
import { createCourierStore, createWorkTripStore } from '../../../office-live/work-trip-store'
import {
  COURIER_CAP,
  COURIER_TRIP_MS,
  courierPose,
  createCourierCrew,
  type CourierPose
} from '../../logic/campus-couriers'
import type { CampusSpoke } from '../../logic/campus-geometry'

const T0 = 1_760_000_000_000

const spoke = (buildingId: string, x = 20): CampusSpoke => ({
  buildingId,
  projectKey: buildingId,
  from: { x, z: 0 },
  to: { x: 9, z: 0 }
})

const dispatch = (
  atMs: number,
  buildingId = 'b-1',
  category: CityEvent['category'] = 'read'
): CityEvent => ({
  id: `${buildingId}:dispatch:${atMs}`,
  kind: 'dispatch',
  buildingId,
  sessionKey: 'claude:a',
  category,
  atMs
})

const newPose = (): CourierPose => ({ x: 0, z: 0, heading: 0 })

describe('courier store', () => {
  it('sends a courier for a read call, which the City ignores', () => {
    expect(createCourierStore().take([dispatch(T0)])).toHaveLength(1)
    expect(createWorkTripStore().take([dispatch(T0)])).toEqual([])
  })

  it('samples a burst: one courier per room every 2 s, each room on its own clock', () => {
    const store = createCourierStore()
    const burst = Array.from({ length: 20 }, (_, index) => dispatch(T0 + index * 50))
    expect(store.take([...burst, dispatch(T0 + 10, 'b-2')])).toHaveLength(2)
    expect(store.take([dispatch(T0 + 2_000)])).toHaveLength(1)
  })
})

describe('courier crew', () => {
  it('walks out to the hub rim at half time and is home at the end', () => {
    const crew = createCourierCrew()
    crew.dispatch({ id: 'c1', buildingId: 'b-1', atMs: T0 }, spoke('b-1'), T0)
    const [courier] = crew.step(T0)
    const pose = newPose()
    expect(courierPose(courier, T0, pose)).toBe(true)
    expect(pose.x).toBeCloseTo(20)
    expect(courierPose(courier, T0 + COURIER_TRIP_MS / 2, pose)).toBe(true)
    expect(pose.x).toBeCloseTo(9)
    expect(courierPose(courier, T0 + COURIER_TRIP_MS, pose)).toBe(false)
    expect(crew.step(T0 + COURIER_TRIP_MS)).toEqual([])
  })

  it('faces the hub going out and home coming back', () => {
    const crew = createCourierCrew()
    crew.dispatch({ id: 'c1', buildingId: 'b-1', atMs: T0 }, spoke('b-1'), T0)
    const [courier] = crew.step(T0)
    const out = newPose()
    const back = newPose()
    courierPose(courier, T0 + 500, out)
    courierPose(courier, T0 + 3_500, back)
    // The model faces +z: heading -pi/2 walks toward -x, the hub.
    expect(Math.sin(out.heading)).toBeCloseTo(-1)
    expect(Math.sin(back.heading)).toBeCloseTo(1)
  })

  it('holds at most the cap and drops the rest rather than queueing', () => {
    const crew = createCourierCrew()
    for (let index = 0; index < COURIER_CAP + 4; index += 1)
      crew.dispatch({ id: `c${index}`, buildingId: 'b-1', atMs: T0 }, spoke('b-1'), T0)
    expect(crew.step(T0)).toHaveLength(COURIER_CAP)
  })

  it('ignores a call from a room with no spoke', () => {
    const crew = createCourierCrew()
    expect(crew.dispatch({ id: 'c1', buildingId: 'gone', atMs: T0 }, undefined, T0)).toBe(false)
    expect(crew.step(T0)).toEqual([])
  })

  it('keeps its own path when the ring is laid out again mid-walk', () => {
    const crew = createCourierCrew()
    const before = spoke('b-1')
    crew.dispatch({ id: 'c1', buildingId: 'b-1', atMs: T0 }, before, T0)
    before.from.x = 40
    const [courier] = crew.step(T0 + 100)
    const pose = newPose()
    courierPose(courier, T0, pose)
    expect(pose.x).toBeCloseTo(20)
  })

  it('times a walk from when it was sent, not from when its call was made', () => {
    const crew = createCourierCrew()
    crew.dispatch({ id: 'c1', buildingId: 'b-1', atMs: T0 - 60_000 }, spoke('b-1'), T0)
    expect(crew.step(T0 + 1_000)).toHaveLength(1)
  })
})
