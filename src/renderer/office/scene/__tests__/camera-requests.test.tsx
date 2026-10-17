import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import { officeView } from '../../logic/office-view'
import { CameraRig } from '../CameraRig'
import { controls, resetRig, runFrame } from './camera-rig-harness'

vi.mock('@react-three/fiber', async () => (await import('./camera-rig-harness')).fiberMock())
vi.mock('@react-three/drei', async () => (await import('./camera-rig-harness')).dreiMock())

type RigProps = ComponentProps<typeof CameraRig>

function rigProps(overrides: Partial<RigProps> = {}): RigProps {
  const floor = makeFloor({ floorId: 'f1', width: 60, depth: 60 })
  return {
    floorCount: 1,
    scene: { width: 60, depth: 60 },
    floor,
    visibleFloors: [floor],
    agents: [],
    liveSessionKeys: new Set(),
    request: null,
    isReducedMotion: true,
    onBandChange: vi.fn(),
    ...overrides
  }
}

beforeEach(resetRig)

describe('the camera view channel', () => {
  it('publishes where the camera looks, and only on a visible change', () => {
    render(<CameraRig {...rigProps()} />)
    runFrame()
    const first = officeView.version()
    const { x, z } = controls.target
    expect(officeView.read()).toMatchObject({ x, z, width: 1440, height: 900 })
    controls.target = { ...controls.target, x: x + 0.05 }
    runFrame()
    expect(officeView.version()).toBe(first)
    controls.target = { ...controls.target, x: x + 0.3 }
    runFrame()
    expect(officeView.version()).toBe(first + 1)
  })
})

describe('a point request', () => {
  it('a point request pans the camera there, keeping zoom and heading', () => {
    const props = rigProps()
    const { rerender } = render(<CameraRig {...props} />)
    runFrame()
    const { y } = controls.target
    controls.moveTo.mockClear()
    controls.zoomTo.mockClear()
    controls.rotateTo.mockClear()
    rerender(<CameraRig {...props} request={{ kind: 'point', x: 12, z: -8, nonce: 1 }} />)
    expect(controls.moveTo).toHaveBeenLastCalledWith(12, y, -8, false)
    expect(controls.zoomTo).not.toHaveBeenCalled()
    expect(controls.rotateTo).not.toHaveBeenCalled()
  })
})
