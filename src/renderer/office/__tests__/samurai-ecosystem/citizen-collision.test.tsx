import { createElement } from 'react'
import { expect, it, vi } from 'vitest'
import { BufferGeometry, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three'
import { MoverLayer } from '../../citizens/MoverLayer'
import { everyElement } from '../../themes/scene.test-utils'
import { getTheme } from '../../themes/registry'
import { groupZonesByTheme } from '../../logic/office-themes'
import { MOVER_FLOORS, townOn } from '../../town/movers.test-utils'

const callbacks = vi.hoisted(() => ({
  layouts: [] as (() => void)[],
  frames: [] as ((state: unknown, delta: number) => void)[]
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current }),
  useEffect: () => undefined,
  useLayoutEffect: (callback: () => void) => callbacks.layouts.push(callback)
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => callbacks.frames.push(callback)
}))
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: class {} }))
vi.mock('../../quality-store', () => ({
  useQualityChoice: () => ({ pin: 'full', chosen: 'full' })
}))

it('keeps the actual instanced citizen bodies separated over a minute of motion', () => {
  const floor = MOVER_FLOORS[0][1]
  const town = townOn(floor)
  const theme = getTheme('corporate-city')
  const elements = everyElement(
    createElement(MoverLayer, {
      floor,
      plan: town.plan,
      owners: town.owners,
      floorTheme: theme,
      zoneGroups: groupZonesByTheme(floor, () => theme.id),
      player: null,
      isReducedMotion: false,
      hasVehicles: false
    })
  )
  const meshes = elements
    .filter((element) => element.type === 'instancedMesh')
    .map((element) => {
      const geometry = element.props.args?.[0]
      if (!(geometry instanceof BufferGeometry)) throw new Error('Citizen geometry unavailable')
      const mesh = new InstancedMesh(
        geometry,
        new MeshStandardMaterial(),
        Number(element.props.args?.[2])
      )
      const ref: unknown = Reflect.get(element.props, 'ref')
      if (typeof ref === 'function') ref(mesh)
      return mesh
    })
  callbacks.layouts.forEach((callback) => callback())
  const matrix = new Matrix4()
  let minimum = Infinity
  for (let frame = 0; frame < 240; frame++) {
    callbacks.frames.forEach((callback) => callback({}, 0.25))
    const bodies = meshes.flatMap((mesh) =>
      Array.from({ length: mesh.count }, (_, index) => {
        mesh.getMatrixAt(index, matrix)
        if (!Number.isFinite(matrix.elements[12]) || !Number.isFinite(matrix.elements[14]))
          throw new Error(
            `Non-finite citizen at frame ${frame}, instance ${index}: ${matrix.elements.join(',')}`
          )
        return Math.hypot(matrix.elements[0], matrix.elements[1], matrix.elements[2]) > 0
          ? [{ x: matrix.elements[12], z: matrix.elements[14] }]
          : []
      }).flat()
    )
    bodies.forEach((body, index) =>
      bodies.slice(index + 1).forEach((other) => {
        minimum = Math.min(minimum, Math.hypot(body.x - other.x, body.z - other.z))
      })
    )
  }
  console.info('Minimum rendered citizen body-center spacing over 60s:', minimum)
  expect(minimum).toBeGreaterThanOrEqual(1.1 - 1e-5)
  meshes.forEach((mesh) => {
    mesh.geometry.dispose()
    if (!Array.isArray(mesh.material)) mesh.material.dispose()
  })
})
