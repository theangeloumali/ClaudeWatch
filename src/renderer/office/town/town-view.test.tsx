import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { groupZonesByTheme, type ThemedZone } from '../logic/office-themes'
import { BatchedScene } from '../scene/BatchedScene'
import { CitySceneryCutaway } from '../scene/CitySceneryCutaway'
import type { FloorGeometry } from '../scene-model'
import { RisingSteam, type SteamStack } from '../themes/ambient-parts'
import type { PlacedLot } from '../themes/lot-kit'
import { getTheme, registerTheme } from '../themes/registry'
import { mergedDraws } from '../themes/scene.test-utils'
import type { Lot } from '../themes/surroundings'
import type { AmbientProps, OfficeTheme } from '../themes/types'
import { fallbackDress } from './fallback-dress'
import { TownGround } from './TownGround'
import { distributedTown } from './distributed-town'
import { dressOf, TownAmbient, TownView } from './TownView'
import { LARGE_FLOOR, PAIR_FLOOR, widened } from './town.test-utils'
import { townOf } from './use-town-plan'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useEffect: () => undefined
}))

// A theme with a town of its own: the fallback's, with every design under the theme's name.
function withTown(base: OfficeTheme, id: string): OfficeTheme {
  const dress = fallbackDress(base.palette)
  const named = <Design extends { name: string }>(designs: readonly Design[]): Design[] =>
    designs.map((design) => ({ ...design, name: `${id}:${design.name}` }))
  const Ambient = (_props: AmbientProps) => null
  return {
    ...base,
    id,
    kit: { ...base.kit, zone: { ...base.kit.zone, Ambient } },
    town: { ...dress, designs: named(dress.designs), props: named(dress.props) }
  }
}
const north = withTown(getTheme('neo-edo-steam'), 'test-town-north')
const south = withTown(getTheme('brass-workshop'), 'test-town-south')
registerTheme(north)
registerTheme(south)

const [firstCompany] = PAIR_FLOOR.zones
// The first company wears `south`; the other wears `north`, and so does the floor.
const themeIdFor = (zone: ThemedZone): string =>
  zone.companyKey === firstCompany.companyKey ? south.id : north.id

type Node = ReactElement<{
  children?: ReactNode
  placed?: readonly PlacedLot[]
  lots?: readonly Lot[]
  stacks?: readonly SteamStack[]
  color?: string
  revision?: string
  isStatic?: boolean
}>

function elements(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Node['props']>(node)) return []
  return [node, ...elements(node.props.children)]
}

// The city a floor stands in, on its own site.
const cityOf = (floor: FloorGeometry) => distributedTown(townOf(floor, null), [floor])

function view(floor: FloorGeometry = PAIR_FLOOR, floorTheme = north, themeFor = themeIdFor) {
  const town = cityOf(floor)
  const zoneGroups = groupZonesByTheme(floor, themeFor)
  const nodes = elements(TownView({ town, floor, floorTheme, zoneGroups }))
  const [lots] = nodes.filter((node) => node.type === CitySceneryCutaway)
  return { town, lots, placedLots: lots.props.placed ?? [] }
}

describe('TownView', () => {
  it('hands the city’s lots to the scenery cutaway', () => {
    const { lots } = view()
    expect(lots.props.placed?.length).toBeGreaterThan(0)
  })

  it('dresses every city lot in the floor’s theme', () => {
    const { town, placedLots } = view()
    expect(placedLots).toHaveLength(town.plan.lots.length)
    for (const { lot, design } of placedLots)
      expect(design.startsWith(`${north.id}:`), `${lot.id} wears ${design}`).toBe(true)
  })

  it('wears the fallback where a theme has drawn no town of its own', () => {
    const bare: OfficeTheme = { ...north, id: 'test-town-bare', town: undefined }
    expect(dressOf(bare)).toBe(fallbackDress(bare.palette))
    expect(dressOf(north)).toBe(north.town)
  })

  it('keeps the town batch for a floor that is made again with nothing moved', () => {
    const first = view()
    const again = view(structuredClone(PAIR_FLOOR))
    expect(again.lots.props.revision).toBe(first.lots.props.revision)
  })

  it('rebuilds the town batch when the office’s site grows', () => {
    const grown = view(widened(PAIR_FLOOR, 30))
    expect(grown.lots.props.revision).not.toBe(view().lots.props.revision)
  })

  it('updates a moved lot even when the claim and lot count stay the same', () => {
    const town = cityOf(PAIR_FLOOR)
    const zoneGroups = groupZonesByTheme(PAIR_FLOOR, themeIdFor)
    const cutaway = (current: typeof town) =>
      elements(TownView({ town: current, floor: PAIR_FLOOR, floorTheme: north, zoneGroups })).find(
        (node) => node.type === CitySceneryCutaway
      )
    const [movedLot] = town.plan.lots
    const moved = {
      ...town,
      plan: {
        ...town.plan,
        lots: town.plan.lots.map((lot) =>
          lot.id === movedLot.id ? { ...lot, x: lot.x + 12 } : lot
        )
      }
    }
    const updated = cutaway(moved)
    expect(updated?.props.revision).not.toBe(cutaway(town)?.props.revision)
    const placed = updated?.props.placed ?? []
    expect(placed.find(({ lot }) => lot.id === movedLot.id)?.lot.x).toBe(movedLot.x + 12)
  })

  it('rebuilds the town batch when the floor changes theme', () => {
    const otherFloor = view(PAIR_FLOOR, south)
    expect(otherFloor.lots.props.revision).not.toBe(view().lots.props.revision)
  })
})

describe('TownAmbient', () => {
  const town = cityOf(PAIR_FLOOR)
  const zoneGroups = groupZonesByTheme(PAIR_FLOOR, themeIdFor)
  const ambient = (share: number, floorTheme = north, groups = zoneGroups) =>
    TownAmbient({
      town,
      floor: PAIR_FLOOR,
      floorTheme,
      zoneGroups: groups,
      share,
      isReducedMotion: false
    })

  it('hands the floor’s theme every lot, in a batch that is followed every frame', () => {
    const nodes = elements(ambient(1))
    const [batch] = nodes.filter((node) => node.type === BatchedScene)
    expect(batch.props.isStatic).toBeUndefined()
    const handed = nodes.find((node) => node.type === north.kit.zone.Ambient)?.props.lots ?? []
    expect(handed).toHaveLength(town.plan.lots.length)
    expect(nodes.some((node) => node.type === south.kit.zone.Ambient)).toBe(false)
  })

  it('hands the theme what the town drew on its lots, the very placements TownView drew', () => {
    const drawn = new Set(
      elements(TownView({ town, floor: PAIR_FLOOR, floorTheme: north, zoneGroups }))
        .filter((node) => node.type === CitySceneryCutaway)
        .flatMap((node) => node.props.placed ?? [])
    )
    const handed = elements(ambient(1)).find((node) => node.type === north.kit.zone.Ambient)
    const { lots = [], placed = [] } = handed?.props ?? {}
    expect(placed.map((each) => each.lot)).toEqual(lots)
    for (const each of placed) expect(drawn.has(each)).toBe(true)
  })

  it('draws the floor theme’s steam once for the town, in the theme’s steam colour', () => {
    const edo = getTheme('neo-edo-steam')
    const groups = groupZonesByTheme(PAIR_FLOOR, () => edo.id)
    const steamAt = (share: number) =>
      elements(ambient(share, edo, groups)).filter((node) => node.type === RisingSteam)
    const steam = steamAt(1)
    expect(steam.map((node) => node.props.color)).toEqual([edo.palette.steam])
    for (const node of steam) expect(node.props.stacks?.length).toBeGreaterThan(0)
    const stacksAt = (share: number): number =>
      steamAt(share).reduce((sum, node) => sum + (node.props.stacks?.length ?? 0), 0)
    expect(stacksAt(0.2)).toBeLessThanOrEqual(stacksAt(1))
  })

  it('hands over the share of the lots the detail level allows', () => {
    const count = (share: number): number =>
      elements(ambient(share))
        .filter((node) => node.props.lots)
        .reduce((sum, node) => sum + (node.props.lots?.length ?? 0), 0)
    expect(count(0.5)).toBeLessThan(count(1))
    expect(count(0.5)).toBeGreaterThan(0)
  })

  it('mounts nothing at no share, or where no theme has anything that moves', () => {
    expect(ambient(0)).toBeNull()
    const { Ambient: _ambient, ...still } = north.kit.zone
    const quiet: OfficeTheme = {
      ...north,
      id: 'test-town-quiet',
      kit: { ...north.kit, zone: still }
    }
    registerTheme(quiet)
    expect(
      ambient(
        1,
        quiet,
        groupZonesByTheme(PAIR_FLOOR, () => quiet.id)
      )
    ).toBeNull()
  })
})

describe('TownGround', () => {
  const { plan } = cityOf(LARGE_FLOOR)

  it('is one draw however many roads and blocks there are', () => {
    const ground = mergedDraws(createElement(TownGround, { plan, dress: dressOf(north) }))
    expect(ground.draws).toBe(1)
    expect(ground.triangles).toBeGreaterThan(plan.blocks.length * 2)
  })

  it('is coloured per vertex and never culled', () => {
    const mesh = TownGround({ plan, dress: dressOf(north) })
    expect(mesh.props.frustumCulled).toBe(false)
    expect(mesh.props.geometry.getAttribute('color').count).toBe(
      mesh.props.geometry.getAttribute('position').count
    )
    expect(mesh.props.children.props.vertexColors).toBe(true)
  })
})
