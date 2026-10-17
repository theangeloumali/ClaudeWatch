import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, type InstancedMesh } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { makeFloor, makeFrame, makeZone } from '../../__tests__/fixtures'
import { createCitySignalStore } from '../../logic/city-signal-store'
import { buildingIdOf } from '../../logic/city-signals'
import { companyHues } from '../../logic/company-lens'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { getTheme } from '../../themes/registry'
import { buildingCompanies, buildingIdOfGroup, createLensDriver, LENS_MIX } from '../CompanyLens'
import { batchesOf, createMeshBatches, type MeshBatch } from '../mesh-batches'
import { PhysicalBuildingShell } from '../PhysicalBuildingShell'
import { NOW } from './city-marks.test-utils'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))

const { palette } = getTheme('corporate-city')
const WALL = '#8A8A8A'
const OFFICES = [
  { company: '/Work/ZKidz', project: 'app' },
  { company: '/Work/ZKidz', project: 'site' },
  { company: '/Work/ZKidy', project: 'tools' }
]

const floorOf = ({ company, project }: (typeof OFFICES)[number], index: number) =>
  makeFloor({
    floorId: `f${index}`,
    buildingId: buildingIdOf(company, project),
    zones: [
      makeZone({
        id: `company-${index}`,
        kind: 'company',
        companyKey: company,
        children: [
          makeZone({
            id: `project-${index}`,
            kind: 'project',
            companyKey: company,
            projectKey: project
          })
        ]
      })
    ]
  })

// Each office is a wall and a roof that batch with every other office's, beside a street lamp.
function cityOf() {
  const floors = OFFICES.map(floorOf)
  const scene = new Group()
  const shape = new BoxGeometry(1, 1, 1)
  const paint = new MeshStandardMaterial({ color: WALL })
  const parts = new Map<string, Mesh[]>()
  floors.forEach((floor, index) => {
    const office = new Group()
    office.name = `physical-building:${floor.buildingId}`
    const storey = new Group()
    const wall = new Mesh(shape, paint)
    const roof = new Mesh(shape, paint)
    wall.position.x = roof.position.x = index * 40
    roof.position.y = 4
    storey.add(wall, roof)
    office.add(storey)
    scene.add(office)
    const company = OFFICES[index].company
    parts.set(company, [...(parts.get(company) ?? []), wall, roof])
  })
  const lamp = new Mesh(shape, paint)
  lamp.position.z = 20
  scene.add(lamp)
  const signals = createCitySignalStore()
  signals.update(makeFrame({ floors }), NOW)
  return { scene, floors, parts, lamp, signals, buildings: buildingCompanies(floors) }
}

// The colour the batch draws a source part in.
function drawnColor(batches: readonly MeshBatch[], part: Mesh): Color {
  for (const batch of batches) {
    let index = 0
    for (const source of batch.sources) {
      if (source.mesh === part) return colorAt(batch.mesh, index)
      index += source.count
    }
  }
  throw new Error('part is not batched')
}

function colorAt(mesh: InstancedMesh, index: number): Color {
  const color = new Color()
  mesh.getColorAt(index, color)
  return color
}

const expectColor = (actual: Color, expected: Color): void => {
  expect(actual.r).toBeCloseTo(expected.r, 5)
  expect(actual.g).toBeCloseTo(expected.g, 5)
  expect(actual.b).toBeCloseTo(expected.b, 5)
}

const lensOn = (city: ReturnType<typeof cityOf>, isOn = true) => ({
  batches: batchesOf(city.scene),
  buildings: city.buildings,
  isOn,
  palette,
  signals: city.signals
})

describe('company lens', () => {
  it('turning the lens on re-tints every office of a company to one hue and rebuilds no batch', () => {
    const city = cityOf()
    measureLayer(city.scene)
    const batches = batchesOf(city.scene)
    const meshes = batches.map((batch) => batch.mesh)
    const driver = createLensDriver()
    expect(driver.sync(lensOn(city))).toBe(true)
    const hues = companyHues(['/Work/ZKidz', '/Work/ZKidy'], palette)
    for (const [company, parts] of city.parts) {
      const tinted = new Color(WALL).lerp(new Color(hues.get(company)), LENS_MIX)
      for (const part of parts) expectColor(drawnColor(batches, part), tinted)
    }
    expect(hues.get('/Work/ZKidz')).not.toBe(hues.get('/Work/ZKidy'))
    expectColor(drawnColor(batches, city.lamp), new Color(WALL))
    expect(batchesOf(city.scene)).toBe(batches)
    expect(batchesOf(city.scene).map((batch) => batch.mesh)).toEqual(meshes)
  })

  it('the lens adds no draw', () => {
    const city = cityOf()
    const before = measureLayer(city.scene)
    expect(measureLayer(city.scene).uploadBytes).toBe(0)
    const driver = createLensDriver()
    driver.sync(lensOn(city))
    const on = measureLayer(city.scene)
    expect(on.draws - before.draws).toBe(CITY_LAYER_BUDGET['company-lens'].draws.full)
    // A toggle uploads one burst of colours, at 12 B a part, then nothing.
    expect(on.uploadBytes).toBeGreaterThan(0)
    expect(on.uploadBytes).toBeLessThanOrEqual(OFFICES.length * 2 * 12)
    expect(driver.sync(lensOn(city))).toBe(false)
    expect(measureLayer(city.scene).uploadBytes).toBe(CITY_LAYER_BUDGET['company-lens'].uploadBytes)
    driver.sync(lensOn(city, false))
    expect(measureLayer(city.scene).draws).toBe(before.draws)
  })

  it('turning the lens off restores the original colours exactly', () => {
    const city = cityOf()
    measureLayer(city.scene)
    const original = batchesOf(city.scene).map((batch) =>
      Array.from(batch.mesh.instanceColor?.array ?? [])
    )
    const driver = createLensDriver()
    driver.sync(lensOn(city))
    driver.sync(lensOn(city, false))
    expect(
      batchesOf(city.scene).map((batch) => Array.from(batch.mesh.instanceColor?.array ?? []))
    ).toEqual(original)
  })

  it('a rebuilt batch takes the lens again; with the lens off it is left alone', () => {
    const city = cityOf()
    measureLayer(city.scene)
    const driver = createLensDriver()
    driver.sync(lensOn(city))
    const rebuilt = createMeshBatches(city.scene)
    expect(driver.sync({ ...lensOn(city), batches: rebuilt })).toBe(true)
    const off = createLensDriver()
    expect(off.sync({ ...lensOn(city, false), batches: createMeshBatches(cityOf().scene) })).toBe(
      false
    )
  })

  it('a shared headquarters keeps its colours: it is no one company', () => {
    const shared = makeFloor({
      floorId: 'hq',
      zones: [
        makeZone({ id: 'a', kind: 'company', companyKey: '/Work/A' }),
        makeZone({ id: 'b', kind: 'company', companyKey: '/Work/B' })
      ]
    })
    expect(buildingCompanies([shared, ...OFFICES.map(floorOf)])).toEqual(
      new Map(
        OFFICES.map((office) => [buildingIdOf(office.company, office.project), office.company])
      )
    )
  })

  it("finds each office by its shell's group name", () => {
    const floor = floorOf(OFFICES[0], 0)
    const shell = PhysicalBuildingShell({ floors: [floor], theme: getTheme('corporate-city') })
    expect(buildingIdOfGroup(shell?.props.name)).toBe(floor.buildingId)
    expect(buildingIdOfGroup('physical-roof:x')).toBeNull()
  })
})
