import { beforeEach, describe, expect, it, vi } from 'vitest'
import { advanceCitizen } from '../../citizens/crowd-movement'
import { routePhase, type CitizenRoute } from '../../citizens/route-pose'
import { SceneBodies } from '../../scene/BodySpace'
import type { Trip } from '../../town/town-trips'

vi.mock('../../citizens/route-pose', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../citizens/route-pose')>()
  return { ...original, routePhase: vi.fn(original.routePhase) }
})

const route: CitizenRoute = {
  points: [
    { x: 0, z: 0 },
    { x: 5, z: 0 },
    { x: 5, z: 2 },
    { x: 0, z: 2 },
    { x: 0, z: 0 }
  ],
  length: 14,
  isLoop: true
}
const phaseSpy = vi.mocked(routePhase)

beforeEach(async () => {
  const { routePhase: realPhase } = await vi.importActual<
    typeof import('../../citizens/route-pose')
  >('../../citizens/route-pose')
  phaseSpy.mockReset()
  phaseSpy.mockImplementation((currentRoute, walked, speed) => {
    if (phaseSpy.mock.calls.length > 100)
      throw new Error('Citizen step did not make bounded phase progress')
    return realPhase(currentRoute, walked, speed)
  })
})

function stepAt(walked: number) {
  const trip: Trip = {
    kind: 'citizen',
    themeId: 'cyberpunk-city',
    figure: 0,
    route,
    speed: 0.6,
    startSec: 0,
    homeId: null,
    destination: 'park'
  }
  return advanceCitizen({
    trip,
    index: 0,
    pose: { x: 0, z: 0, heading: 0, isIndoors: false },
    walked,
    deltaSec: 0.1,
    space: new SceneBodies(),
    isOpen: () => true
  })
}

describe('citizen phase boundaries', () => {
  it('returns a future phase at the captured 70-second lap boundary', async () => {
    const { routePhase: realPhase } = await vi.importActual<
      typeof import('../../citizens/route-pose')
    >('../../citizens/route-pose')
    expect(realPhase(route, 70, 0.6).untilSec).toBeGreaterThan(70)
  })

  it('returns from a movement step at the exact reproduced boundary', () => {
    const step = stepAt(70)
    expect(step.walked).toBeGreaterThan(70)
    expect(step.distance).toBeLessThanOrEqual(0.06 + 1e-8)
    expect(step.pose.x).toBeCloseTo(0.06)
  })

  it.each([false, true])(
    'terminates a non-progressing phase without inventing movement (waiting %s)',
    (isWaiting) => {
      phaseSpy.mockImplementation(() => {
        if (phaseSpy.mock.calls.length > 100)
          throw new Error('Citizen step did not terminate on a zero-progress phase')
        return { target: { x: 0, z: 0, heading: 0, isIndoors: false }, untilSec: 70, isWaiting }
      })
      const step = stepAt(70)
      expect(step.walked).toBe(70)
      expect(step.distance).toBe(0)
      expect(step.pose).toMatchObject({ x: 0, z: 0 })
    }
  )

  it.each([1, 3, 25, 1000, 100000])(
    'advances at repeated lap %s with and without indoor waits',
    async (cycle) => {
      const { routePhase: realPhase } = await vi.importActual<
        typeof import('../../citizens/route-pose')
      >('../../citizens/route-pose')
      for (const currentRoute of [
        route,
        { ...route, stops: [{ at: 14, sec: 1.7, isIndoors: true }] }
      ]) {
        const duration = currentRoute.length / 0.6 + (currentRoute.stops?.[0].sec ?? 0)
        const walked = cycle * duration
        expect(realPhase(currentRoute, walked, 0.6).untilSec).toBeGreaterThan(walked)
      }
    }
  )

  it.each([0, 1, 3, 100000])(
    'advances an open route at lap %s and its turnaround',
    async (cycle) => {
      const { routePhase: realPhase } = await vi.importActual<
        typeof import('../../citizens/route-pose')
      >('../../citizens/route-pose')
      const openRoute: CitizenRoute = {
        points: [
          { x: 0, z: 0 },
          { x: 7, z: 0 }
        ],
        length: 7
      }
      const duration = (openRoute.length * 2) / 0.6
      for (const boundary of [duration * cycle, duration * cycle + openRoute.length / 0.6]) {
        for (const offset of [-1e-7, 0, 1e-7]) {
          const walked = boundary + offset
          if (walked < 0) continue
          const phase = realPhase(openRoute, walked, 0.6)
          expect(phase.untilSec).toBeGreaterThan(walked)
          expect(phase.target.z).toBe(0)
          expect([0, 7]).toContain(phase.target.x)
        }
      }
    }
  )

  it.each([-1e-7, -1e-9, 0, 1e-9, 1e-7])(
    'keeps loop-boundary progress at offset %s',
    async (offset) => {
      const { routePhase: realPhase } = await vi.importActual<
        typeof import('../../citizens/route-pose')
      >('../../citizens/route-pose')
      const walked = 70 + offset
      expect(realPhase(route, walked, 0.6).untilSec).toBeGreaterThan(walked)
    }
  )
})
