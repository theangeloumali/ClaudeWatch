import { OrthographicCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  BAND_ZOOM,
  clipPlanes,
  groundCover,
  ISO_POLAR,
  ISO_START_AZIMUTH,
  type CameraPose,
  type SceneBox
} from '../logic/camera-bands'
import { GROUND_Y } from '../themes/surroundings'
import { distributedTown } from '../town/distributed-town'
import { townOf } from '../town/use-town-plan'
import type { FloorGeometry } from '../scene-model'
import { makeFloor } from './fixtures'

// What OfficeScene sizes the camera from: the extent of the city round the floor's own site.
const townExtentOf = (floor: FloorGeometry) =>
  distributedTown(townOf(floor, null), [floor]).plan.extent

const VIEWPORT = { width: 1200, height: 800 }
const WIDEST_ZOOM = 0.5
const START_DISTANCE_M = 60

const floor = makeFloor({ floorId: 'vast', width: 300, depth: 300 })
const box: SceneBox = {
  ...townExtentOf(floor),
  minY: GROUND_Y,
  maxY: 30
}
const ROTATIONS = [0, 1, 2, 3].map((turn) => ISO_START_AZIMUTH + (turn * Math.PI) / 2)
const TARGETS: [string, number, number][] = [
  ['the centre', 0, 0],
  ['the north-west corner', -150, -150],
  ['the north-east corner', 150, -150],
  ['the south-west corner', -150, 150],
  ['the south-east corner', 150, 150]
]

function boxCorners(scene: SceneBox = box): Vector3[] {
  return [-1, 1].flatMap((sideX) =>
    [-1, 1].flatMap((sideZ) =>
      [scene.minY, scene.maxY].map(
        (y) =>
          new Vector3(scene.x + (sideX * scene.width) / 2, y, scene.z + (sideZ * scene.depth) / 2)
      )
    )
  )
}

// The rig's camera: looking at a target on the floor from the isometric angle.
function cameraOn(targetX: number, targetZ: number, azimuth: number, zoom: number) {
  const camera = new OrthographicCamera(
    -VIEWPORT.width / 2,
    VIEWPORT.width / 2,
    VIEWPORT.height / 2,
    -VIEWPORT.height / 2,
    1,
    200
  )
  camera.zoom = zoom
  camera.position.set(
    targetX + START_DISTANCE_M * Math.sin(ISO_POLAR) * Math.sin(azimuth),
    START_DISTANCE_M * Math.cos(ISO_POLAR),
    targetZ + START_DISTANCE_M * Math.sin(ISO_POLAR) * Math.cos(azimuth)
  )
  camera.lookAt(targetX, 0, targetZ)
  camera.updateMatrixWorld()
  return camera
}

function poseOf(camera: OrthographicCamera): CameraPose {
  return {
    position: camera.position,
    forward: camera.getWorldDirection(new Vector3()),
    halfWidth: VIEWPORT.width / 2 / camera.zoom,
    halfHeight: VIEWPORT.height / 2 / camera.zoom
  }
}

// What the scene does each frame with the planes it is given.
function fitPlanes(camera: OrthographicCamera, scene: SceneBox = box): CameraPose {
  const pose = poseOf(camera)
  const planes = clipPlanes(scene, pose)
  camera.position.addScaledVector(pose.forward, -planes.pushBack)
  camera.near = planes.near
  camera.far = planes.far
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return poseOf(camera)
}

// Where the ground shows at the four corners of the window.
function groundAtViewCorners(camera: OrthographicCamera, pose: CameraPose): Vector3[] {
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  return [-1, 1].flatMap((sideX) =>
    [-1, 1].map((sideY) => {
      const onPlane = camera.position
        .clone()
        .addScaledVector(right, sideX * pose.halfWidth)
        .addScaledVector(up, sideY * pose.halfHeight)
      return onPlane.addScaledVector(pose.forward, (GROUND_Y - onPlane.y) / pose.forward.y)
    })
  )
}

const depthOf = (point: Vector3, camera: OrthographicCamera): number =>
  point.clone().project(camera).z

describe.each([
  ['the widest zoom', WIDEST_ZOOM],
  ['desk zoom', BAND_ZOOM.desk]
])('clip planes on a 300 x 300 m floor at %s', (_name, zoom) => {
  describe.each(TARGETS)('looking at %s', (_target, targetX, targetZ) => {
    it.each(ROTATIONS)('holds every corner of the scene at rotation %f', (azimuth) => {
      const camera = cameraOn(targetX, targetZ, azimuth, zoom)
      fitPlanes(camera)
      for (const corner of boxCorners()) {
        expect(depthOf(corner, camera)).toBeGreaterThanOrEqual(-1)
        expect(depthOf(corner, camera)).toBeLessThanOrEqual(1)
      }
    })

    it.each(ROTATIONS)('holds the ground at every corner of the window at %f', (azimuth) => {
      const camera = cameraOn(targetX, targetZ, azimuth, zoom)
      const pose = fitPlanes(camera)
      for (const point of groundAtViewCorners(camera, pose)) {
        expect(depthOf(point, camera)).toBeGreaterThanOrEqual(-1)
        expect(depthOf(point, camera)).toBeLessThanOrEqual(1)
      }
    })

    it.each(ROTATIONS)('lays the ground under every corner of the window at %f', (azimuth) => {
      const camera = cameraOn(targetX, targetZ, azimuth, zoom)
      const pose = fitPlanes(camera)
      const cover = groundCover(GROUND_Y, pose)
      for (const point of groundAtViewCorners(camera, pose)) {
        expect(Math.abs(point.x - cover.x)).toBeLessThanOrEqual(cover.size / 2)
        expect(Math.abs(point.z - cover.z)).toBeLessThanOrEqual(cover.size / 2)
      }
    })
  })
})

describe('clip planes around a plate that is not centred on the gate', () => {
  const strip = makeFloor({ floorId: 'strip', width: 71, depth: 17, x: 31, z: 7 })
  const scene: SceneBox = {
    ...townExtentOf(strip),
    minY: GROUND_Y,
    maxY: 30
  }

  it('reaches past both ends of the plate', () => {
    expect(scene.x - scene.width / 2).toBeLessThan(-4.5)
    expect(scene.x + scene.width / 2).toBeGreaterThan(66.5)
  })

  describe.each([
    ['the gate', 0, 0],
    ['the plate centre', 31, 7],
    ['the far corner of the plate', 66.5, 15.5]
  ])('looking at %s', (_target, targetX, targetZ) => {
    it.each(ROTATIONS)('holds every corner of the scene at rotation %f', (azimuth) => {
      for (const zoom of [WIDEST_ZOOM, BAND_ZOOM.desk]) {
        const camera = cameraOn(targetX, targetZ, azimuth, zoom)
        fitPlanes(camera, scene)
        for (const corner of boxCorners(scene)) {
          expect(depthOf(corner, camera)).toBeGreaterThanOrEqual(-1)
          expect(depthOf(corner, camera)).toBeLessThanOrEqual(1)
        }
      }
    })
  })
})

describe('clip planes and the camera itself', () => {
  it('reproduces the cut-off: the fixed 1 to 200 m planes lose most of this floor', () => {
    const camera = cameraOn(0, 0, ISO_START_AZIMUTH, WIDEST_ZOOM)
    const clipped = boxCorners().filter((corner) => Math.abs(depthOf(corner, camera)) > 1)
    expect(clipped.length).toBeGreaterThan(0)
  })

  it('moves the camera back until the whole scene is in front of it, where it can be picked', () => {
    const camera = cameraOn(150, 150, ISO_START_AZIMUTH, WIDEST_ZOOM)
    const before = clipPlanes(box, poseOf(camera))
    expect(before.pushBack).toBeGreaterThan(0)
    expect(before.near).toBeGreaterThan(0)
    const after = clipPlanes(box, fitPlanes(camera))
    expect(after.pushBack).toBe(0)
    expect(after.near).toBeCloseTo(before.near)
    expect(after.far).toBeCloseTo(before.far)
  })

  it('does not change the planes while the camera pans across the screen', () => {
    const camera = cameraOn(0, 0, ISO_START_AZIMUTH, BAND_ZOOM.floor)
    const still = clipPlanes(box, fitPlanes(camera))
    camera.position.add(new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(40))
    camera.updateMatrixWorld()
    const panned = clipPlanes(box, poseOf(camera))
    expect(panned.near).toBeCloseTo(still.near)
    expect(panned.far).toBeCloseTo(still.far)
  })
})
