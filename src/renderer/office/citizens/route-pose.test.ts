import { describe, expect, it } from 'vitest'
import { loopMetres, routePose, type CitizenRoute } from './route-pose'

// A 10 m square walked clockwise on the map: east, south, west, north.
const SQUARE: CitizenRoute = {
  points: [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
    { x: 0, z: 0 }
  ],
  length: 40,
  isLoop: true
}
const EAST = Math.PI / 2

describe('routePose on a loop', () => {
  it('goes round and round, never back on itself', () => {
    expect(routePose(SQUARE, 5)).toMatchObject({ x: 5, z: 0, heading: EAST })
    expect(routePose(SQUARE, 15)).toMatchObject({ x: 10, z: 5, heading: 0 })
    expect(routePose(SQUARE, 45)).toMatchObject({ x: 5, z: 0, heading: EAST })
    expect(routePose(SQUARE, 39)).toMatchObject({ x: 0, z: 1 })
  })

  it('waits at a stop for its seconds, then carries on from there', () => {
    const route: CitizenRoute = { ...SQUARE, stops: [{ at: 10, sec: 4, isIndoors: false }] }
    const speed = 2
    // Four seconds at 2 m/s is 8 m of walking not done.
    expect(routePose(route, 9, speed)).toMatchObject({ x: 9, z: 0 })
    expect(routePose(route, 10, speed)).toMatchObject({ x: 10, z: 0, heading: EAST })
    expect(routePose(route, 17.9, speed)).toMatchObject({ x: 10, z: 0, heading: EAST })
    expect(routePose(route, 20, speed)).toMatchObject({ x: 10, z: 2 })
    // A lap is the 40 m and the wait.
    expect(routePose(route, 48 + 5, speed)).toMatchObject({ x: 5, z: 0 })
  })

  it('says when the walker has gone indoors, and only then', () => {
    const route: CitizenRoute = {
      ...SQUARE,
      stops: [
        { at: 10, sec: 4, isIndoors: false },
        { at: 40, sec: 3, isIndoors: true }
      ]
    }
    expect(routePose(route, 5, 1).isIndoors).toBe(false)
    expect(routePose(route, 12, 1).isIndoors).toBe(false)
    // After the first wait (4 m at 1 m/s) the lap's end is at 44.
    expect(routePose(route, 45, 1)).toMatchObject({ x: 0, z: 0, isIndoors: true })
    expect(routePose(route, 47.5, 1)).toMatchObject({ x: 0.5, z: 0, isIndoors: false })
  })

  it('still walks an open route out and back', () => {
    const street: CitizenRoute = { points: SQUARE.points.slice(0, 2), length: 10 }
    expect(routePose(street, 12)).toMatchObject({ x: 8, z: 0, heading: -EAST })
  })
})

describe('loopMetres', () => {
  it('takes a loop’s waits out of how far round it is', () => {
    const route: CitizenRoute = { ...SQUARE, stops: [{ at: 10, sec: 4, isIndoors: false }] }
    expect(loopMetres(route, 9, 2)).toBe(9)
    expect(loopMetres(route, 17.9, 2)).toBe(10)
    expect(loopMetres(route, 20, 2)).toBe(12)
    expect(loopMetres(route, 48 + 5, 2)).toBe(5)
  })
})
