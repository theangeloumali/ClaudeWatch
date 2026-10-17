import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cityEvents } from '../../../office-live/city-events'
import { themeForTeam } from '../../themes/registry'
import { ConstructionRig } from '../ConstructionRig'

const harness = vi.hoisted(() => ({
  frame: (): void => undefined,
  isPinned: true,
  stillMs: 1_000,
  wallMs: 9_000
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => void (harness.frame = callback)
}))
vi.mock('../../logic/city-clock', () => ({
  cityClock: { now: () => harness.stillMs, isPinned: () => harness.isPinned }
}))

afterEach(() => vi.restoreAllMocks())

describe('construction rig clock', () => {
  it('reads city events on the wall clock while reduced motion stills the city clock', () => {
    // react-dom stands in for the canvas and does not know <primitive>.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(Date, 'now').mockReturnValue(harness.wallMs)
    const active = vi.spyOn(cityEvents, 'active')
    render(<ConstructionRig floors={[]} theme={themeForTeam()} />)
    harness.frame()
    expect(active).toHaveBeenLastCalledWith(harness.wallMs)
    harness.isPinned = false
    harness.frame()
    expect(active).toHaveBeenLastCalledWith(harness.stillMs)
  })
})
