import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { groupZonesByTheme, type ThemedZone } from '../logic/office-themes'
import { BatchedScene } from '../scene/BatchedScene'
import type { FloorGeometry } from '../scene-model'
import { RisingSteam, type SteamStack } from '../themes/ambient-parts'
import type { PlacedLot } from '../themes/lot-kit'
import { LotFill } from '../themes/LotFill'
import { getTheme, registerTheme } from '../themes/registry'
import { mergedDraws } from '../themes/scene.test-utils'
import type { Lot } from '../themes/surroundings'
import type { AmbientProps, OfficeTheme } from '../themes/types'
import { fallbackDress } from './fallback-dress'
import { TownGround } from './TownGround'
import { dressOf, TownAmbient, townLandmark, TownView } from './TownView'
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
// The first company wears `south`; the other, and so the floor, wears `north`.
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

function view(floor: FloorGeometry = PAIR_FLOOR, floorTheme = north, themeFor = themeIdFor) {
  const town = townOf(floor, null, 'full')
  const zoneGroups = groupZonesByTheme(floor, themeFor)
  const batches = elements(TownView({ town, floor, floorTheme, zoneGroups })).filter(
    (node) => node.type === BatchedScene
  )
  expect(batches).toHaveLength(2)
  const placedIn = (batch: Node): readonly PlacedLot[] =>
    elements(batch).flatMap((node) => (node.type === LotFill ? (node.props.placed ?? []) : []))
  const [lots, belt] = batches
  return { town, lots, belt, placedLots: placedIn(lots), placedBelt: placedIn(belt) }
}

describe('TownView', () => {
  it('draws the town’s lots and the belt as two batches that are placed once', () => {
    const { lots, belt } = view()
    expect(lots.props.isStatic).toBe(true)
    expect(belt.props.isStatic).toBe(true)
  })

  it('dresses every lot in its owner’s theme and an unowned lot in the floor’s', () => {
    const { town, placedLots } = view()
    const themeOfCompany = (id: string): string => (id === firstCompany.id ? south.id : north.id)
    const landmark = townLandmark(town.plan)
    expect(placedLots).toHaveLength(town.plan.lots.length - 1)
    const worn = new Set<string>()
    for (const { lot, design } of placedLots) {
      const owner = town.owners.get(lot.id)
      const themeId = owner ? themeOfCompany(owner) : north.id
      expect(design.startsWith(`${themeId}:`), `${lot.id} wears ${design}`).toBe(true)
      worn.add(themeId)
    }
    expect([...worn].sort()).toEqual([north.id, south.id])
    expect(placedLots.some(({ lot }) => lot.id === landmark?.id)).toBe(false)
  })

  it('dresses every garden piece of a role alike, in the theme of the company beside it', () => {
    const { town, placedBelt } = view()
    expect(placedBelt).toHaveLength(town.green.length)
    const designByRole = new Map<string, string>()
    placedBelt.forEach(({ lot, design }, index) => {
      const themeId = lot.zoneId === firstCompany.id ? south.id : north.id
      const { role } = town.green[index]
      // The edging is one shared box, coloured by the theme rather than named by it.
      if (role !== 'hedge')
        expect(design.startsWith(`${themeId}:`), `${lot.id} wears ${design}`).toBe(true)
      const key = `${themeId}:${role}`
      expect(designByRole.get(key) ?? design, lot.id).toBe(design)
      designByRole.set(key, design)
    })
  })

  it('wears the fallback where a theme has drawn no town of its own', () => {
    const bare: OfficeTheme = { ...north, id: 'test-town-bare', town: undefined }
    expect(dressOf(bare)).toBe(fallbackDress(bare.palette))
    expect(dressOf(north)).toBe(north.town)
  })

  it('rebuilds neither batch for a floor that is made again with nothing moved', () => {
    const first = view()
    const again = view(structuredClone(PAIR_FLOOR))
    expect(again.lots.props.revision).toBe(first.lots.props.revision)
    expect(again.belt.props.revision).toBe(first.belt.props.revision)
  })

  it('keeps the town batch when the plate grows short of the claim’s edge', () => {
    const grown = view(widened(PAIR_FLOOR, 1))
    expect(grown.town.plan).toBe(view().town.plan)
    expect(grown.lots.props.revision).toBe(view().lots.props.revision)
  })

  it('rebuilds the town batch when the claim steps', () => {
    const stepped = view(widened(PAIR_FLOOR, 30))
    expect(stepped.town.plan.claim).not.toEqual(view().town.plan.claim)
    expect(stepped.lots.props.revision).not.toBe(view().lots.props.revision)
  })

  it('updates a moved lot even when the claim and lot count stay the same', () => {
    const town = townOf(PAIR_FLOOR, null, 'full')
    const zoneGroups = groupZonesByTheme(PAIR_FLOOR, themeIdFor)
    const initial = elements(TownView({ town, floor: PAIR_FLOOR, floorTheme: north, zoneGroups }))
    const movedLot = town.plan.lots.find((lot) => !lot.isLandmark)!
    const moved = {
      ...town,
      plan: {
        ...town.plan,
        lots: town.plan.lots.map((lot) =>
          lot.id === movedLot.id ? { ...lot, x: lot.x + 12 } : lot
        )
      }
    }
    const updated = elements(
      TownView({ town: moved, floor: PAIR_FLOOR, floorTheme: north, zoneGroups })
    )
    expect(updated.find((node) => node.type === BatchedScene)?.props.revision).not.toBe(
      initial.find((node) => node.type === BatchedScene)?.props.revision
    )
    const placed = updated.flatMap((node) =>
      node.type === LotFill ? (node.props.placed ?? []) : []
    )
    expect(placed.find(({ lot }) => lot.id === movedLot.id)?.lot.x).toBe(movedLot.x + 12)
  })

  it('updates moved garden geometry without changing its identity or theme', () => {
    const town = townOf(PAIR_FLOOR, null, 'full')
    const zoneGroups = groupZonesByTheme(PAIR_FLOOR, themeIdFor)
    const batchesFor = (current: typeof town) =>
      elements(
        TownView({ town: current, floor: PAIR_FLOOR, floorTheme: north, zoneGroups })
      ).filter((node) => node.type === BatchedScene)
    const initial = batchesFor(town)
    const moved = {
      ...town,
      green: town.green.map((plot, index) => (index === 0 ? { ...plot, x: plot.x + 0.01 } : plot))
    }
    expect(batchesFor(moved)[1].props.revision).not.toBe(initial[1].props.revision)
  })

  it('rebuilds both batches when a company or the floor changes theme', () => {
    const first = view()
    const oneTheme = view(PAIR_FLOOR, north, () => north.id)
    expect(oneTheme.lots.props.revision).not.toBe(first.lots.props.revision)
    expect(oneTheme.belt.props.revision).not.toBe(first.belt.props.revision)
    const otherFloor = view(PAIR_FLOOR, south)
    expect(otherFloor.lots.props.revision).not.toBe(first.lots.props.revision)
  })

  it('rebuilds the town batch when the detail level thins the town', () => {
    const zoneGroups = groupZonesByTheme(PAIR_FLOOR, themeIdFor)
    const revisionAt = (level: 'full' | 'light'): string | undefined =>
      elements(
        TownView({
          town: townOf(PAIR_FLOOR, null, level),
          floor: PAIR_FLOOR,
          floorTheme: north,
          zoneGroups
        })
      ).find((node) => node.type === BatchedScene)?.props.revision
    expect(revisionAt('light')).not.toBe(revisionAt('full'))
  })
})

describe('TownAmbient', () => {
  const town = townOf(PAIR_FLOOR, null, 'full')
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

  it('hands each theme the lots it dresses, in a batch that is followed every frame', () => {
    const nodes = elements(ambient(1))
    const [batch] = nodes.filter((node) => node.type === BatchedScene)
    expect(batch.props.isStatic).toBeUndefined()
    const handed = [north, south].map(
      (theme) => nodes.find((node) => node.type === theme.kit.zone.Ambient)?.props.lots ?? []
    )
    const [northLots, southLots] = handed
    expect(southLots.length).toBeGreaterThan(0)
    for (const lot of southLots) expect(town.owners.get(lot.id)).toBe(firstCompany.id)
    // Not the landmark's lot: the world layer's tower stands there.
    expect(northLots.length + southLots.length).toBe(town.plan.lots.length - 1)
  })

  it('hands each theme what the town drew on its lots, the very placements TownView drew', () => {
    const drawn = new Set(
      elements(TownView({ town, floor: PAIR_FLOOR, floorTheme: north, zoneGroups })).flatMap(
        (node) => (node.type === LotFill ? (node.props.placed ?? []) : [])
      )
    )
    for (const theme of [north, south]) {
      const handed = elements(ambient(1)).find((node) => node.type === theme.kit.zone.Ambient)
      const { lots = [], placed = [] } = handed?.props ?? {}
      expect(placed.map((each) => each.lot)).toEqual(lots)
      for (const each of placed) expect(drawn.has(each)).toBe(true)
    }
  })

  it('draws each theme’s steam once for the town, in the theme’s steam colour', () => {
    const edo = getTheme('neo-edo-steam')
    const brass = getTheme('brass-workshop')
    const groups = groupZonesByTheme(PAIR_FLOOR, (zone) =>
      zone.companyKey === firstCompany.companyKey ? brass.id : edo.id
    )
    const steamAt = (share: number) =>
      elements(ambient(share, edo, groups)).filter((node) => node.type === RisingSteam)
    const steam = steamAt(1)
    expect(steam.map((node) => node.props.color).sort()).toEqual(
      [edo.palette.steam, brass.palette.steam].sort()
    )
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
  const { plan } = townOf(LARGE_FLOOR, null, 'full')

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
