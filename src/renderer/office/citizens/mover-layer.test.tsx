import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { QUALITY_LEVELS, type QualityLevel } from '../logic/quality'
import type { FloorGeometry } from '../scene-model'
import { getTheme } from '../themes/registry'
import { everyElement, mergedDraws } from '../themes/scene.test-utils'
import type { OfficeTheme } from '../themes/types'
import { fallbackVehicle } from '../town/fallback-vehicles'
import { MOVER_FLOORS, townOn } from '../town/movers.test-utils'
import { MOVER_COUNTS, townTrips } from '../town/town-trips'
import { citizenFigures } from './figures'
import { moverFigure, moverKinds } from './mover-kinds'
import { MoverLayer } from './MoverLayer'

const level = vi.hoisted((): { inUse: QualityLevel } => ({ inUse: 'full' }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useRef: (current: unknown) => ({ current }),
  useEffect: () => {},
  useLayoutEffect: () => {}
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => {} }))
vi.mock('../quality-store', () => ({
  useQualityChoice: () => ({ pin: level.inUse, chosen: level.inUse })
}))

const edo = getTheme('neo-edo-steam')

function layerOn(floor: FloorGeometry, props: { hasVehicles?: boolean }) {
  const { plan } = townOn(floor, level.inUse)
  return (
    <MoverLayer
      floor={floor}
      plan={plan}
      floorTheme={edo}
      player={null}
      isReducedMotion={false}
      hasVehicles={props.hasVehicles ?? true}
    />
  )
}

const instancesOf = (layer: ReactNode): number =>
  everyElement(layer)
    .filter((element) => element.type === 'instancedMesh')
    .reduce((sum, mesh) => sum + Number(mesh.props.args?.[2] ?? 0), 0)

describe.each(MOVER_FLOORS)('MoverLayer on %s', (_name, floor) => {
  it.each(QUALITY_LEVELS)('adds no more draws than the %s level’s table allows', (detail) => {
    level.inUse = detail
    const { citizens, vehicles, citizenKinds, vehicleKinds } = MOVER_COUNTS[detail]
    const layer = layerOn(floor, {})
    // The layer reads the level when it is expanded, so both counts are taken before it is reset.
    const { draws } = mergedDraws(layer)
    const instances = instancesOf(layer)
    level.inUse = 'full'
    expect(draws).toBeGreaterThan(0)
    expect(draws).toBeLessThanOrEqual(citizenKinds + vehicleKinds)
    expect(instances).toBe(citizens + vehicles)
  })

  it('draws them instanced, with nothing to click and nothing that marks a worker', () => {
    const drawn = everyElement(layerOn(floor, {}))
    const meshes = drawn.filter((element) => element.type === 'instancedMesh')
    for (const mesh of meshes)
      expect(Object.keys(mesh.props).filter((prop) => prop.startsWith('on'))).toEqual([])
    const others = drawn
      .map((element) => element.type)
      .filter((type) => typeof type === 'string' && type !== 'instancedMesh')
    expect(new Set(others)).toEqual(new Set(['meshStandardMaterial']))
  })

  it('sends out no vehicle when they are switched off', () => {
    expect(instancesOf(layerOn(floor, { hasVehicles: false }))).toBe(MOVER_COUNTS.full.citizens)
  })
})

describe('moverKinds', () => {
  const trips = townTrips(townOn(MOVER_FLOORS[1][1]))
  const kinds = moverKinds(trips)

  it('gives every mover one instance of the draw its kind, theme and figure share', () => {
    const members = kinds.flatMap((kind) => kind.members)
    expect([...members].sort((a, b) => a - b)).toEqual(trips.map((_trip, index) => index))
    for (const kind of kinds)
      for (const member of kind.members)
        expect(trips[member]).toMatchObject({
          kind: kind.kind,
          themeId: kind.themeId,
          figure: kind.figure
        })
  })
})

describe('moverFigure', () => {
  const citizen = { kind: 'citizen', figure: 1 } as const
  const tram = { kind: 'transit', figure: 0 } as const
  const bare: OfficeTheme = { ...edo, town: undefined }

  it('falls back to the registry’s townsfolk and a plain vehicle until a theme has a town', () => {
    expect(moverFigure(citizen, bare)).toBe(citizenFigures(edo.id)[1])
    expect(moverFigure(tram, bare).name).toBe(fallbackVehicle('transit', edo.palette).name)
  })

  it('takes a theme’s own citizens and its vehicle for the role once it has them', () => {
    const [walker] = citizenFigures('brass-workshop')
    const coach = { ...fallbackVehicle('transit', edo.palette), name: 'Test Tram' }
    const wain = { ...fallbackVehicle('freight', edo.palette), name: 'Test Wain' }
    const dressed: OfficeTheme = {
      ...edo,
      town: {
        designs: [],
        props: [],
        looks: {
          civic: { accent: '', ground: '' },
          market: { accent: '', ground: '' },
          entertainment: { accent: '', ground: '' },
          residential: { accent: '', ground: '' },
          workshop: { accent: '', ground: '' },
          park: { accent: '', ground: '' }
        },
        roads: { carriageway: '', sidewalk: '', promenade: '' },
        citizens: [walker],
        vehicles: [wain, coach]
      }
    }
    expect(moverFigure(citizen, dressed)).toBe(walker)
    expect(moverFigure(tram, dressed)).toBe(coach)
    // No runabout of its own yet: the plain one.
    expect(moverFigure({ kind: 'runabout', figure: 0 }, dressed).name).toBe(
      fallbackVehicle('runabout', edo.palette).name
    )
  })
})
