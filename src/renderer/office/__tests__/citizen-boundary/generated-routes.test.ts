import { describe, expect, it } from 'vitest'
import { routePhase } from '../../citizens/route-pose'
import { MOVER_FLOORS, townOn } from '../../town/movers.test-utils'
import { townTrips } from '../../town/town-trips'

describe.each(MOVER_FLOORS)('generated citizen boundaries on %s', (_name, floor) => {
  it('keeps every phase moving forward across repeated laps and indoor waits', () => {
    const citizens = townTrips(townOn(floor)).filter((trip) => trip.kind === 'citizen')
    expect(citizens).toHaveLength(48)
    for (const { route, speed } of citizens) {
      const duration =
        route.length / speed + (route.stops ?? []).reduce((sum, stop) => sum + stop.sec, 0)
      for (const cycle of [0, 1, 3, 25, 1000, 100000]) {
        let walked = duration * cycle
        const cycleEnd = duration * (cycle + 1)
        const phaseLimit = route.points.length + (route.stops?.length ?? 0) * 2 + 2
        for (let phaseIndex = 0; phaseIndex < phaseLimit && walked < cycleEnd; phaseIndex++) {
          const phase = routePhase(route, walked, speed)
          expect(phase.untilSec, `${speed} m/s at ${walked}s`).toBeGreaterThan(walked)
          expect(Number.isFinite(phase.target.x) && Number.isFinite(phase.target.z)).toBe(true)
          walked = phase.untilSec
        }
        expect(walked).toBeGreaterThanOrEqual(cycleEnd)
      }
    }
  })
})
