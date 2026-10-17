import { act, fireEvent, render, screen } from '@testing-library/react'
import { Profiler, type ComponentProps } from 'react'
import { OrthographicCamera, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { officePoses } from '../../../office-live/pose-store'
import { ISO_POLAR, ISO_START_AZIMUTH } from '../../logic/camera-bands'
import { buildMinimapModel } from '../../logic/minimap-model'
import { officeView, viewFootprint, type OfficeView } from '../../logic/office-view'
import { Minimap } from '../../hud/Minimap'
import { OfficeApp } from '../../OfficeApp'
import type { OfficeFeed } from '../../scene-model'
import type OfficeScene from '../../scene/OfficeScene'
import { LEAD_KEY, makeMinimapFrame } from './minimap-fixtures'

type SceneProps = ComponentProps<typeof OfficeScene>

const { observeScene } = vi.hoisted(() => ({ observeScene: vi.fn<(props: SceneProps) => void>() }))
vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../../scene/OfficeScene', () => ({
  default: (props: SceneProps) => {
    observeScene(props)
    return <p>Scene drawn</p>
  }
}))

const VIEW: OfficeView = {
  x: 110,
  y: 0,
  z: -30,
  zoom: 34,
  azimuth: ISO_START_AZIMUTH,
  polar: ISO_POLAR,
  width: 1280,
  height: 800
}

// The map's world frame, laid on a 200 px square so a client point maps to a known metre.
function stubMapRect(map: HTMLElement): void {
  map.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }) as DOMRect
}

function minimapProps(overrides: Partial<ComponentProps<typeof Minimap>> = {}) {
  return {
    frame: makeMinimapFrame(),
    viewMode: 'city' as const,
    focusedFloorId: null,
    focusedRoomId: null,
    selectedAgentKey: null,
    isPreview: false,
    isNarrow: false,
    onChooseFloor: vi.fn(),
    onChooseRoom: vi.fn(),
    onChooseWorker: vi.fn(),
    onPan: vi.fn(),
    ...overrides
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal('innerHeight', 900)
  observeScene.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the camera footprint', () => {
  it.each([0, 1, 2, 3])(
    'the footprint matches the orthographic view at each quarter turn (%i)',
    (turns) => {
      const view = { ...VIEW, azimuth: ISO_START_AZIMUTH + (turns * Math.PI) / 2 }
      const camera = new OrthographicCamera(
        -view.width / 2,
        view.width / 2,
        view.height / 2,
        -view.height / 2,
        0.1,
        5000
      )
      camera.zoom = view.zoom
      camera.position
        .setFromSphericalCoords(500, view.polar, view.azimuth)
        .add(new Vector3(view.x, view.y, view.z))
      camera.lookAt(view.x, view.y, view.z)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      const corners = viewFootprint(view).map((point) =>
        new Vector3(point.x, view.y, point.z).project(camera)
      )
      const expected = [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1]
      ]
      expect(corners).toHaveLength(4)
      corners.forEach((corner, index) => {
        expect(corner.x).toBeCloseTo(expected[index][0], 3)
        expect(corner.y).toBeCloseTo(expected[index][1], 3)
      })
    }
  )
})

describe('panning from the map', () => {
  it('a tap pans the camera there', async () => {
    const frame = makeMinimapFrame()
    const feed: OfficeFeed = {
      isViewOnly: true,
      subscribe: (listener) => {
        listener(frame)
        return () => undefined
      },
      focus: vi.fn(),
      send: vi.fn(),
      respond: vi.fn(),
      peek: vi.fn(),
      start: vi.fn()
    }
    render(<OfficeApp feed={feed} />)
    await screen.findByText('Scene drawn')
    const map = screen.getByRole('application', { name: /map/i })
    stubMapRect(map)
    fireEvent.click(map, { clientX: 50, clientY: 150 })
    const bounds = buildMinimapModel({
      frame,
      viewMode: 'city',
      focusedFloorId: null,
      focusedRoomId: null,
      selectedAgentKey: null,
      isPreview: false
    }).bounds
    if (!bounds) throw new Error('the fixture draws a map')
    const request = observeScene.mock.calls.at(-1)?.[0].cameraRequest
    expect(request).toMatchObject({
      kind: 'point',
      x: bounds.minX + (bounds.maxX - bounds.minX) * 0.25,
      z: bounds.minZ + (bounds.maxZ - bounds.minZ) * 0.75
    })
  })

  it('arrow keys pan', () => {
    officeView.write(VIEW)
    const onPan = vi.fn<(point: { x: number; z: number }) => void>()
    const props = minimapProps({ onPan })
    render(<Minimap {...props} />)
    const bounds = buildMinimapModel(props).bounds
    if (!bounds) throw new Error('the fixture draws a map')
    const map = screen.getByRole('application', { name: /map/i })
    const eighthX = (bounds.maxX - bounds.minX) / 8
    const eighthZ = (bounds.maxZ - bounds.minZ) / 8
    fireEvent.keyDown(map, { key: 'ArrowRight' })
    // The second press steps on from where the first is headed, not from the camera mid-flight.
    fireEvent.keyDown(map, { key: 'ArrowRight' })
    fireEvent.keyDown(map, { key: 'ArrowDown' })
    expect(onPan.mock.calls.map(([point]) => point)).toEqual([
      { x: VIEW.x + eighthX, z: VIEW.z },
      { x: VIEW.x + eighthX * 2, z: VIEW.z },
      { x: VIEW.x + eighthX * 2, z: VIEW.z + eighthZ }
    ])
  })
})

describe('the live layer', () => {
  it('roamer dots move with 0 React commits', () => {
    vi.useFakeTimers()
    officeView.write(VIEW)
    const commits = vi.fn()
    render(
      <Profiler id="minimap" onRender={commits}>
        <Minimap {...minimapProps()} />
      </Profiler>
    )
    commits.mockClear()
    const dot = document.querySelector(`circle[data-agent-key="${LEAD_KEY}"]`)
    const footprint = document.querySelector('[data-view-footprint]')
    const footprintBefore = footprint?.getAttribute('points')
    officePoses.write(LEAD_KEY, { x: 107, z: -45, heading: 0, elevation: 0 })
    officeView.write({ ...VIEW, x: VIEW.x + 5 })
    act(() => void vi.advanceTimersByTime(300))
    expect(dot?.getAttribute('cx')).toBe('107')
    expect(dot?.getAttribute('cy')).toBe('-45')
    expect(footprint?.getAttribute('points')).not.toBe(footprintBefore)
    expect(commits).not.toHaveBeenCalled()
  })
})
