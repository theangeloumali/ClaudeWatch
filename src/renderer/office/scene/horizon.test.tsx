import { Mesh, OrthographicCamera, Vector3 } from 'three'
import { beforeEach, expect, it, vi } from 'vitest'
import { ISO_POLAR, ISO_START_AZIMUTH, type SceneBox } from '../logic/camera-bands'
import { markHeadroomM } from './city-marks'
import { Horizon } from './Horizon'

interface FrameState {
  camera: OrthographicCamera
  size: { width: number; height: number }
  controls: object | null
}

const { frame, ground, FakeControls } = vi.hoisted(() => {
  class FakeControls {
    distance = 60
    dollyTo = vi.fn((distance: number) => {
      this.distance = distance
    })
  }
  return {
    FakeControls,
    frame: { run: null as ((state: FrameState) => void) | null },
    ground: { current: null as Mesh | null }
  }
})
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useRef: () => ground
}))
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: FakeControls }))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: FrameState) => void) => {
    frame.run = callback
  }
}))

const SIZE = { width: 1200, height: 800 }
const BOX: SceneBox = { x: 0, z: -5, width: 380, depth: 390, minY: -0.5, maxY: 26 }

function cameraOverCorner(): OrthographicCamera {
  const camera = new OrthographicCamera(-600, 600, 400, -400, 1, 200)
  camera.zoom = 2
  const reach = 60 * Math.sin(ISO_POLAR)
  camera.position.set(
    150 + reach * Math.sin(ISO_START_AZIMUTH),
    60 * Math.cos(ISO_POLAR),
    150 + reach * Math.cos(ISO_START_AZIMUTH)
  )
  camera.lookAt(150, 0, 150)
  camera.updateMatrixWorld()
  return camera
}

function runFrame(camera: OrthographicCamera, controls: object | null): void {
  frame.run?.({ camera, size: SIZE, controls })
  camera.updateMatrixWorld()
}

beforeEach(() => {
  ground.current = new Mesh()
  Horizon({ box: BOX, color: '#8C8A85' })
})

it('fits the planes to the scene and retreats through the controls, so they keep the distance', () => {
  const camera = cameraOverCorner()
  const controls = new FakeControls()
  const start = camera.position.clone()
  runFrame(camera, controls)
  const retreat = camera.position.distanceTo(start)
  expect(retreat).toBeGreaterThan(0)
  expect(controls.dollyTo.mock.calls[0][0]).toBeCloseTo(60 + retreat)
  const farCorner = new Vector3(-190, BOX.maxY, -200).project(camera)
  const nearCorner = new Vector3(190, BOX.maxY, 190).project(camera)
  expect(Math.abs(farCorner.z)).toBeLessThanOrEqual(1)
  expect(Math.abs(nearCorner.z)).toBeLessThanOrEqual(1)
})

it('settles: a second frame neither retreats again nor rebuilds the projection', () => {
  const camera = cameraOverCorner()
  const controls = new FakeControls()
  runFrame(camera, controls)
  const rebuild = vi.spyOn(camera, 'updateProjectionMatrix')
  runFrame(camera, controls)
  expect(controls.dollyTo).toHaveBeenCalledTimes(1)
  expect(rebuild).not.toHaveBeenCalled()
})

it('lays the ground under the middle of the view, wider than the window', () => {
  const camera = cameraOverCorner()
  runFrame(camera, null)
  const plane = ground.current
  if (!plane) throw new Error('Missing ground')
  // The ground lies half a metre under the point the camera looks at, so its centre is a touch off.
  expect(Math.abs(plane.position.x - 150)).toBeLessThan(1)
  expect(plane.position.y).toBe(BOX.minY)
  expect(Math.abs(plane.position.z - 150)).toBeLessThan(1)
  expect(plane.scale.x).toBeGreaterThan(SIZE.width / camera.zoom)
})

it('keeps room over its box for marks sized on screen, more as the camera pulls out', () => {
  for (const zoom of [34, 8, 2, 0.5, 0.1]) {
    const camera = cameraOverCorner()
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    runFrame(camera, null)
    const upY = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion).y
    // Over the box's nearest corner, the first to cross the near plane.
    const mark = new Vector3(190, BOX.maxY + markHeadroomM(zoom, upY), 190).project(camera)
    expect(Math.abs(mark.z)).toBeLessThanOrEqual(1)
  }
})
