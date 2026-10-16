import { createElement } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { BufferGeometry, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three'
import { CITIZEN_BODY_RADIUS } from '../../../../shared/office/body-footprints'
import { MoverLayer } from '../../citizens/MoverLayer'
import { citizenBodyId } from '../../citizens/crowd-movement'
import type { MoverClock } from '../../citizens/mover-clock'
import type { Trip } from '../../town/town-trips'
import { distributedTown } from '../../town/distributed-town'
import { townOf } from '../../town/use-town-plan'
import { everyElement } from '../../themes/scene.test-utils'
import { getTheme } from '../../themes/registry'
import { groupZonesByTheme } from '../../logic/office-themes'
import { MOVER_FLOORS, townOn } from '../../town/movers.test-utils'

const callbacks = vi.hoisted(() => ({
  layouts: [] as (() => void)[],
  frames: [] as ((state: unknown, delta: number) => void)[],
  clock: null as MoverClock | null,
  trips: [] as readonly Trip[]
}))
vi.mock('../../citizens/mover-clock', async (original) => {
  const actual = await original<typeof import('../../citizens/mover-clock')>()
  return {
    ...actual,
    moverClock: (options: Parameters<typeof actual.moverClock>[0]) => {
      callbacks.clock = actual.moverClock(options)
      callbacks.trips = options.trips
      return callbacks.clock
    }
  }
})
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

beforeEach(() => {
  callbacks.layouts.length = 0
  callbacks.frames.length = 0
})

// A walker the jam breaker sends through another (citizens-2) may overlap that body until the
// two are apart; the pass outlives the route corner it began on, so it is tracked here too.
function givingWayPairs(clock: MoverClock, outdoors: readonly number[], held: Set<string>) {
  const spacing = 2 * CITIZEN_BODY_RADIUS
  const pairKey = (first: number, second: number) => `${first}:${second}`
  const passing = (index: number) => clock.positions[index].navigation?.passingId
  outdoors.forEach((first, at) =>
    outdoors.slice(at + 1).forEach((second) => {
      const [a, b] = [clock.positions[first], clock.positions[second]]
      const isApart = Math.hypot(a.x - b.x, a.z - b.z) >= spacing
      const isPassing =
        passing(first) === citizenBodyId(second) || passing(second) === citizenBodyId(first)
      if (isApart) held.delete(pairKey(first, second))
      else if (isPassing) held.add(pairKey(first, second))
    })
  )
  return (first: number, second: number) => held.has(pairKey(first, second))
}

it('keeps city citizens apart over a minute of motion, but for a pair giving way', () => {
  const floor = MOVER_FLOORS[0][1]
  const { plan } = distributedTown(townOf(floor, null, 'full'), [floor])
  const theme = getTheme('corporate-city')
  everyElement(
    createElement(MoverLayer, {
      floor,
      plan,
      owners: new Map(),
      floorTheme: theme,
      zoneGroups: groupZonesByTheme(floor, () => theme.id),
      player: null,
      isReducedMotion: false,
      hasVehicles: false
    })
  )
  callbacks.layouts.forEach((callback) => callback())
  const clock = callbacks.clock
  if (!clock) throw new Error('Mover clock unavailable')
  const held = new Set<string>()
  let minimum = Infinity
  for (let frame = 0; frame < 240; frame++) {
    callbacks.frames.forEach((callback) => callback({}, 0.25))
    const outdoors = callbacks.trips.flatMap((trip, index) =>
      trip.kind === 'citizen' && !clock.positions[index].isIndoors ? [index] : []
    )
    const isGivingWay = givingWayPairs(clock, outdoors, held)
    outdoors.forEach((first, at) =>
      outdoors.slice(at + 1).forEach((second) => {
        if (isGivingWay(first, second)) return
        const [a, b] = [clock.positions[first], clock.positions[second]]
        minimum = Math.min(minimum, Math.hypot(a.x - b.x, a.z - b.z))
      })
    )
  }
  console.info('City citizen body-center spacing over 60s, give-ways aside:', minimum)
  expect(callbacks.trips.some((trip) => trip.kind === 'citizen')).toBe(true)
  expect(minimum).toBeGreaterThanOrEqual(2 * CITIZEN_BODY_RADIUS - 1e-5)
})

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
