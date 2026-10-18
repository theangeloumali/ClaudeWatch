import { describe, expect, it } from 'vitest'
import { followShift, followSweep } from './camera-follow'

const VIEWPORT = { width: 1200, height: 800 }

describe('followShift', () => {
  const area = { left: 280, right: 904, top: 0, bottom: 704 }

  it('leaves the camera alone while the player is well inside the view', () => {
    expect(followShift({ x: 600, y: 350 }, area, 100)).toEqual({ x: 0, y: 0 })
  })

  it('moves the camera by exactly what the player overshoots', () => {
    expect(followShift({ x: 850, y: 350 }, area, 100)).toEqual({ x: 46, y: 0 })
    expect(followShift({ x: 600, y: 60 }, area, 100)).toEqual({ x: 0, y: -40 })
    expect(followShift({ x: 300, y: 690 }, area, 100)).toEqual({ x: -80, y: 86 })
  })

  it('centres the player when the margins leave no room', () => {
    expect(followShift({ x: 600, y: 352 }, area, 2000)).toEqual({ x: 8, y: 0 })
  })
})

describe('followSweep', () => {
  // The 296/320px panel columns leave a safe span from x 320 to 856.
  const inView = { x: 600, y: 400 }
  const offScreen = { x: 3000, y: 400 }
  const frame = { viewport: VIEWPORT, zoom: 30, deltaSec: 1 / 60, isReducedMotion: false }

  it('asks for nothing while the player is in view', () => {
    expect(followSweep({ ...frame, onScreen: inView })).toEqual({
      right: 0,
      down: 0,
      isSettled: true
    })
  })

  it('sweeps toward a player far out of view a frame at a time, and says it is not done', () => {
    const step = followSweep({ ...frame, onScreen: offScreen })
    expect(step.isSettled).toBe(false)
    expect(step.right).toBeGreaterThan(0)
    expect(step.right * frame.zoom).toBeLessThan(100)
    expect(step.down).toBe(0)
  })

  it('takes the last of a sweep in one frame and is then done', () => {
    const last = followSweep({ ...frame, onScreen: { x: 802, y: 400 } })
    expect(last.isSettled).toBe(true)
    expect(last.right * frame.zoom).toBeCloseTo(802 - (856 - 75))
  })

  it('cuts straight to the player under reduced motion', () => {
    const step = followSweep({ ...frame, onScreen: offScreen, isReducedMotion: true })
    expect(step.isSettled).toBe(true)
    expect(step.right * frame.zoom).toBeCloseTo(3000 - (856 - 75))
  })
})
