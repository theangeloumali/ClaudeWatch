import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentView } from '../../../../shared/office/types'
import { officePoses } from '../../../office-live/pose-store'
import { makeAgent, makeFloor } from '../../__tests__/fixtures'
import { BAND_ZOOM } from '../../logic/camera-bands'
import { hudSafeInsets } from '../../logic/hud-layout'
import { officeView } from '../../logic/office-view'
import { cardSafeArea, projectToScreen } from '../../logic/zone-framing'
import { CameraRig } from '../CameraRig'
import { controls, holdFlights, resetRig, runFrame, surface } from './camera-rig-harness'

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

const WALKER = 'claude:walker'

function walkerAt(x: number, z: number, overrides: Partial<AgentView> = {}): AgentView {
  officePoses.write(WALKER, { x, z, heading: 0, elevation: 0 })
  return makeAgent({ agentKey: WALKER, x, z, ...overrides })
}

// Where the walker is drawn now, from the camera the rig left.
function walkerOnScreen(x: number, z: number) {
  return projectToScreen(
    { x, y: 1, z },
    {
      target: [controls.target.x, controls.target.y, controls.target.z],
      zoom: surface.camera.zoom,
      azimuth: controls.azimuthAngle,
      polar: controls.polarAngle
    },
    surface.size
  )
}

function startFollowing(agent: AgentView) {
  const props = rigProps({ agents: [agent], followedAgentKey: WALKER, onManualMove: vi.fn() })
  const view = render(
    <CameraRig {...props} request={{ kind: 'follow', agentKey: WALKER, nonce: 1 }} />
  )
  runFrame()
  return { props, ...view }
}

describe('Follow', () => {
  it('Follow keeps a roaming agent in the HUD-safe area', () => {
    const { props, rerender } = startFollowing(walkerAt(10, 10))
    // Thirty steps east, 10 m in all: the walker would leave a still camera's view.
    for (let step = 1; step <= 30; step += 1) {
      officePoses.write(WALKER, { x: 10 + step, z: 10, heading: 0, elevation: 0 })
      runFrame()
    }
    rerender(<CameraRig {...props} agents={[walkerAt(40, 10)]} request={null} />)
    runFrame()
    const area = cardSafeArea(surface.size, hudSafeInsets(true))
    const at = walkerOnScreen(40, 10)
    expect(at.x).toBeGreaterThanOrEqual(area.left)
    expect(at.x).toBeLessThanOrEqual(area.right)
    expect(at.y).toBeGreaterThanOrEqual(area.top)
    expect(at.y).toBeLessThanOrEqual(area.bottom)
  })

  it("Follow and the close-up frame by zoom: the camera's distance from its target is unchanged", () => {
    surface.camera.zoom = BAND_ZOOM.building
    startFollowing(walkerAt(10, 10))
    expect(controls.zoomTo).toHaveBeenLastCalledWith(BAND_ZOOM.floor, false)
    for (let step = 1; step <= 10; step += 1) {
      officePoses.write(WALKER, { x: 10 + step * 2, z: 10, heading: 0, elevation: 0 })
      runFrame()
    }
    expect(controls.moveTo).toHaveBeenCalled()
    expect(controls.dolly).not.toHaveBeenCalled()
    expect(controls.dollyTo).not.toHaveBeenCalled()
    expect(controls.setLookAt).not.toHaveBeenCalled()
    expect(controls.distance).toBe(500)
  })

  it('a Follow ride never cuts short the fly-to that started it', () => {
    const flightEnd = holdFlights()
    const agent = walkerAt(60, 60)
    const props = rigProps({ agents: [agent], followedAgentKey: WALKER, isReducedMotion: false })
    render(<CameraRig {...props} request={{ kind: 'follow', agentKey: WALKER, nonce: 1 }} />)
    const flight = { ...flightEnd() }
    for (let frame = 0; frame < 5; frame += 1) runFrame()
    expect(flightEnd()).toEqual(flight)
  })

  it('manual input ends it', () => {
    const { props } = startFollowing(walkerAt(10, 10))
    controls.emit('controlstart')
    expect(props.onManualMove).toHaveBeenCalled()
    controls.moveTo.mockClear()
    officePoses.write(WALKER, { x: 60, z: 60, heading: 0, elevation: 0 })
    runFrame()
    expect(controls.moveTo).not.toHaveBeenCalled()
  })

  it('a departed agent ends it', () => {
    const { props, rerender } = startFollowing(walkerAt(10, 10))
    controls.moveTo.mockClear()
    controls.zoomTo.mockClear()
    rerender(
      <CameraRig {...props} agents={[walkerAt(30, 10, { place: 'leaving' })]} request={null} />
    )
    runFrame()
    rerender(<CameraRig {...props} agents={[]} request={null} />)
    officePoses.write(WALKER, { x: 60, z: 60, heading: 0, elevation: 0 })
    runFrame()
    // It stops where it was: no chase after the empty spot, and no refit of the view.
    expect(controls.moveTo).not.toHaveBeenCalled()
    expect(controls.zoomTo).not.toHaveBeenCalled()
  })
})
