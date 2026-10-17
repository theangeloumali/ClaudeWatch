import { act } from '@react-three/fiber'
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { Box3, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import { BAND_ZOOM, ISO_POLAR, ISO_START_AZIMUTH } from '../../logic/camera-bands'
import { QUALITY_LEVELS } from '../../logic/quality'
import { pinQuality } from '../../quality-store'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { getTheme } from '../../themes/registry'
import { distributedTown } from '../../town/distributed-town'
import { RAILWAY, railwayPlan } from '../../town/railway-plan'
import { townOf } from '../../town/use-town-plan'
import { TRAIN_SPEEDS } from '../../town/railway-runs'
import { trainSet } from '../RailwayTrains'
import { RailwayLayer, RailwayStructures } from '../RailwayStructures'
import { mountInFiber } from './fiber-root.test-utils'

const floors = [0, 1, 2, 3].map((index) =>
  makeFloor({ floorId: `f${index}`, x: (index % 2) * 64 + 32, z: Math.floor(index / 2) * 56 + 28 })
)
const plan = distributedTown(townOf(floors[0], null), floors).plan
const found = railwayPlan(plan)
if (!found) throw new Error('no railway')
const railway = found
const { palette } = getTheme('corporate-city')
const T0 = 1_760_000_000_000

afterEach(() => {
  pinQuality('auto')
  vi.unstubAllGlobals()
})

// The layer's own children, unexpanded: the hooks inside them only run under a renderer.
function layerParts(): ReactElement<Record<string, unknown>>[] {
  const layer = RailwayLayer({ plan, palette, hasTrains: true })
  if (!isValidElement<{ children?: ReactNode }>(layer)) return []
  return Children.toArray(layer.props.children).filter(isValidElement<Record<string, unknown>>)
}

const carCount = (trains: Object3D | undefined): number =>
  (trains?.children ?? []).reduce(
    (cars, mesh) => cars + (mesh instanceof InstancedMesh ? mesh.count : 0),
    0
  )

interface CarPose {
  position: Vector3
  heading: number
}

function carPoses(mesh: InstancedMesh): CarPose[] {
  return Array.from({ length: mesh.count }, (_unused, index) => {
    const matrix = new Matrix4()
    mesh.getMatrixAt(index, matrix)
    const [position, turn] = [new Vector3(), new Quaternion()]
    matrix.decompose(position, turn, new Vector3())
    const ahead = new Vector3(0, 0, 1).applyQuaternion(turn)
    return { position, heading: Math.atan2(ahead.x, ahead.z) }
  })
}

const gapToExtent = (x: number, z: number): number =>
  Math.hypot(
    Math.max(0, Math.abs(x - plan.extent.x) - plan.extent.width / 2),
    Math.max(0, Math.abs(z - plan.extent.z) - plan.extent.depth / 2)
  )

describe('RailwayTrains', () => {
  it('trains upload at most 2 kB a frame', () => {
    const trains = trainSet(railway, 'full', palette)
    trains.pose(T0)
    measureLayer(trains.group)
    trains.pose(T0 + 250)
    const moving = measureLayer(trains.group).uploadBytes
    expect(moving).toBeGreaterThan(0)
    expect(moving).toBeLessThanOrEqual(CITY_LAYER_BUDGET.trains.uploadBytes)
    // A pinned clock moves nothing, so nothing goes up.
    trains.pose(T0 + 250)
    expect(measureLayer(trains.group).uploadBytes).toBe(0)
  })

  it('freight runs at full only', () => {
    const kinds = (level: (typeof QUALITY_LEVELS)[number]) =>
      trainSet(railway, level, palette).group.children.map((child) => child.name)
    expect(kinds('full')).toEqual(['commuter', 'locomotive', 'wagon'])
    expect(kinds('balanced')).toEqual(['commuter'])
  })

  it('light shows the viaduct with no trains', () => {
    expect(trainSet(railway, 'light', palette).group.children).toEqual([])
    pinQuality('light')
    expect(layerParts().some((element) => element.type === RailwayStructures)).toBe(true)
  })

  it('stepping to light mid-run rebuilds no static batch', async () => {
    pinQuality('full')
    const { scene, unmount } = await mountInFiber(
      createElement(RailwayLayer, { plan, palette, hasTrains: true })
    )
    const at = () => {
      const [viaduct, trains] = scene.children
      if (!(viaduct instanceof InstancedMesh)) throw new Error('no viaduct')
      return { viaduct: viaduct.geometry.uuid, cars: carCount(trains) }
    }
    const full = at()
    expect(full.cars).toBeGreaterThan(0)
    await act(async () => pinQuality('light'))
    expect(at()).toEqual({ viaduct: full.viaduct, cars: 0 })
    await unmount()
  })

  it('trains run at 12–18 m/s, so they read at the idle pace', () => {
    for (const speed of Object.values(TRAIN_SPEEDS)) {
      expect(speed).toBeGreaterThanOrEqual(12)
      expect(speed).toBeLessThanOrEqual(18)
    }
  })

  it("a train's projected size at the city band stays above 6 px", () => {
    const trains = trainSet(railway, 'full', palette)
    for (const mesh of trains.group.children)
      for (const quarter of [0, 1, 2, 3]) {
        if (!(mesh instanceof InstancedMesh)) throw new Error('not instanced')
        mesh.geometry.computeBoundingBox()
        const box = mesh.geometry.boundingBox ?? new Box3()
        const azimuth = ISO_START_AZIMUTH + (quarter * Math.PI) / 2
        const back = new Vector3().setFromSphericalCoords(1, ISO_POLAR, azimuth)
        const right = new Vector3().crossVectors(new Vector3(0, 1, 0), back).normalize()
        const up = new Vector3().crossVectors(back, right)
        const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
          (bits) =>
            new Vector3(
              bits & 1 ? box.max.x : box.min.x,
              bits & 2 ? box.max.y : box.min.y,
              bits & 4 ? box.max.z : box.min.z
            )
        )
        const span = (axis: Vector3) => {
          const along = corners.map((corner) => corner.dot(axis) * BAND_ZOOM.building)
          return Math.max(...along) - Math.min(...along)
        }
        expect(Math.min(span(right), span(up))).toBeGreaterThan(6)
      }
  })

  it('trains stay on the deck at all four rotations', () => {
    const trains = trainSet(railway, 'full', palette)
    const quarters = new Set<number>()
    for (let second = 0; second < 240; second += 0.5) {
      trains.pose(T0 + second * 1000)
      for (const mesh of trains.group.children) {
        if (!(mesh instanceof InstancedMesh)) continue
        for (const { position, heading } of carPoses(mesh)) {
          expect(position.y).toBeCloseTo(RAILWAY.railTop, 6)
          const turn = Math.round(heading / (Math.PI / 2))
          if (Math.abs(heading - (turn * Math.PI) / 2) < 0.05) quarters.add((turn + 4) % 4)
          const along = { x: Math.sin(heading), z: Math.cos(heading) }
          for (const [side, end] of [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1]
          ]) {
            const gap = gapToExtent(
              position.x + along.z * side * 1.25 + along.x * end * 4.5,
              position.z - along.x * side * 1.25 + along.z * end * 4.5
            )
            expect(gap).toBeGreaterThanOrEqual(RAILWAY.offset - RAILWAY.deckHalfWidth - 1e-6)
            expect(gap).toBeLessThanOrEqual(RAILWAY.offset + RAILWAY.deckHalfWidth + 1e-6)
          }
        }
      }
    }
    expect([...quarters].sort()).toEqual([0, 1, 2, 3])
  })
})
