import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cityEvents } from '../../../office-live/city-events'
import { themeForTeam } from '../../themes/registry'
import { ConstructionRig } from '../ConstructionRig'

const harness = vi.hoisted(() => ({
  frame: (): void => undefined,
  isPinned: true,
  stillMs: 1_000
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => void (harness.frame = callback)
}))
vi.mock('../../logic/city-clock', () => ({
  cityClock: { now: () => harness.stillMs, isPinned: () => harness.isPinned }
}))

afterEach(() => vi.restoreAllMocks())

describe('construction rig clock', () => {
  // The event log ages on the wall by default; the rig never hands it the stilled city clock.
  it('reads city events on the wall clock while reduced motion stills the city clock', () => {
    // react-dom stands in for the canvas and does not know <primitive>.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const active = vi.spyOn(cityEvents, 'active')
    render(<ConstructionRig floors={[]} theme={themeForTeam()} />)
    harness.frame()
    expect(active).toHaveBeenLastCalledWith()
    harness.isPinned = false
    harness.frame()
    expect(active).toHaveBeenLastCalledWith()
  })
})
