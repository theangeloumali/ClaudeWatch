import { createElement } from 'react'
import { expect, it, vi } from 'vitest'
import { BufferGeometry, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three'
import { MoverLayer } from '../../citizens/MoverLayer'
import { everyElement } from '../../themes/scene.test-utils'
import { getTheme } from '../../themes/registry'
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

it('preserves every visible citizen rotation during 200 zero-motion commit uploads', () => {
  const floor = MOVER_FLOORS[0][1]
  const town = townOn(floor)
  const theme = getTheme('corporate-city')
  const meshes = everyElement(
    createElement(MoverLayer, {
      floor,
      plan: town.plan,
      floorTheme: theme,
      player: null,
      isReducedMotion: false,
      hasVehicles: false
    })
  )
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
  const before = new Matrix4()
  const after = new Matrix4()
  let largestSnap = 0
  try {
    for (let snapshot = 0; snapshot < 200; snapshot++) {
      callbacks.frames.forEach((callback) => callback({}, 0.04))
      const matrices = meshes.map((mesh) =>
        Array.from({ length: mesh.count }, (_, index) => {
          mesh.getMatrixAt(index, before)
          return before.clone()
        })
      )
      callbacks.layouts.forEach((callback) => callback())
      meshes.forEach((mesh, meshIndex) => {
        for (let index = 0; index < mesh.count; index++) {
          const previous = matrices[meshIndex][index]
          mesh.getMatrixAt(index, after)
          if (Math.hypot(previous.elements[8], previous.elements[10]) === 0) continue
          expect(after.elements[12]).toBe(previous.elements[12])
          expect(after.elements[14]).toBe(previous.elements[14])
          const previousHeading = Math.atan2(previous.elements[8], previous.elements[10])
          const nextHeading = Math.atan2(after.elements[8], after.elements[10])
          const turn = Math.atan2(
            Math.sin(nextHeading - previousHeading),
            Math.cos(nextHeading - previousHeading)
          )
          largestSnap = Math.max(largestSnap, Math.abs(turn))
        }
      })
    }
    expect(largestSnap).toBeLessThan(0.00001)
  } finally {
    meshes.forEach((mesh) => {
      mesh.geometry.dispose()
      if (!Array.isArray(mesh.material)) mesh.material.dispose()
    })
  }
})
