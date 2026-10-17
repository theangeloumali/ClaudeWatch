import { cleanup, render, screen } from '@testing-library/react'
import { createElement, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLayout } from '../../../../office/sim/layout'
import { placements } from '../../../../office/sim/placements'
import { resolveEffectiveWorld } from '../../../../office/sim/effective-world'
import { cityScenerySites } from '../../../../shared/office/city-scenery'
import { cityBlocksFor } from '../../../../shared/office/city-block-layout'
import { createWorldDocument } from '../../../../shared/office/world-document'
import { overlaps } from '../../../../shared/office/world-document-geometry'
import { toFloorGeometry } from '../../../office-live/layout-geometry'
import { PROJECTS } from '../../fixture/fixture-projects'
import { sessionFor } from '../../fixture/fixture-sessions'
import { EMPTY_THEME_ASSIGNMENTS } from '../../logic/office-themes'
import { INITIAL_OFFICE_STATE, officeReducer, type OfficeState } from '../../logic/office-reducer'
import { doorSide, SIDE_NORMAL } from '../../logic/room-layout'
import {
  readViewPreference,
  saveViewPreference,
  VIEW_PREFERENCE_KEY
} from '../../logic/view-preference'
import { CitySceneryCutaway } from '../../scene/CitySceneryCutaway'
import { FloorView } from '../../scene/FloorView'
import { MultiFloorLayer, physicalZoneGroups } from '../../scene/MultiFloorLayer'
import { PhysicalBuildingShell } from '../../scene/PhysicalBuildingShell'
import { RobotCrew } from '../../scene/Robot'
import { BatchedScene } from '../../scene/BatchedScene'
import { groundEnvelope, PHYSICAL_STOREY_HEIGHT } from '../../scene/all-floor-model'
import { windowParts } from '../../scene/building-window-parts'
import { dressCityDistrict } from '../../themes/city-district-parts'
import {
  buildingCrown,
  buildingEntrance,
  buildingExteriorProfile
} from '../../themes/physical-building-parts'
import { getTheme } from '../../themes/registry'
import { LotFill } from '../../themes/LotFill'
import type { PlacedLot } from '../../themes/lot-kit'
import type { PartSpec } from '../../themes/parts'
import { everyElement, mergedDraws, type SceneElement } from '../../themes/scene.test-utils'
import { DRAW_CEILING, TRIANGLE_CEILING } from '../../themes/live-budget.test-utils'
import { distributedTown } from '../../town/distributed-town'
import { townOf } from '../../town/use-town-plan'
import { makeAgent, makeFrame } from '../fixtures'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('../../scene/FloorView', () => ({
  FloorView: ({ floor }: Pick<ComponentProps<typeof FloorView>, 'floor'>) => (
    <div
      data-testid="delivery-floor"
      data-floor-id={floor.floorId}
      data-elevation={floor.elevation}
    />
  )
}))
vi.mock('../../scene/Robot', () => ({
  RobotCrew: ({ agents }: Pick<ComponentProps<typeof RobotCrew>, 'agents'>) => (
    <div data-testid="delivery-crew">
      {agents.map((agent) => (
        <span
          key={agent.agentKey}
          data-testid="delivery-actor"
          data-agent-key={agent.agentKey}
          data-room-id={agent.roomId}
          data-slot-id={agent.slotId}
        />
      ))}
    </div>
  )
}))
vi.mock('../../scene/ZonePickers', async (original) => ({
  ...(await original<typeof import('../../scene/ZonePickers')>()),
  ZonePickers: () => null
}))
vi.mock('../../scene/BuildingWindows', () => ({ BuildingWindows: () => null }))
vi.mock('../../scene/BatchedScene', () => ({
  BatchedScene: ({ children }: { children: ReactNode }) => <>{children}</>
}))
afterEach(cleanup)

const fixtureSessions = PROJECTS.flatMap((project) =>
  project.sessions.map((fixture, index) =>
    sessionFor(project, fixture, index, { tick: 0, nowMs: 1_000_000 })
  )
)
const baseline = buildLayout(fixtureSessions, undefined)
const worldDocument = createWorldDocument(baseline, fixtureSessions)
const effective = resolveEffectiveWorld(baseline, worldDocument, fixtureSessions)
const floors = toFloorGeometry(effective, fixtureSessions)
const fixtureActors = placements(fixtureSessions, effective).map((placement) =>
  makeAgent({
    agentKey: placement.session.key,
    floorId: placement.floorId,
    physicalFloorId: placement.floorId,
    roomId: placement.room.id,
    slotId: placement.slot.id,
    x: placement.slot.x,
    z: placement.slot.z,
    heading: placement.slot.heading,
    provider: placement.session.provider,
    isSubagent: placement.isSubagent
  })
)
const theme = getTheme('corporate-city')
const layerProps: ComponentProps<typeof MultiFloorLayer> = {
  floors,
  agents: fixtureActors,
  floorTheme: theme,
  groups: new Map(
    floors.map((floor) => [
      floor.floorId,
      physicalZoneGroups({ floor, assignments: EMPTY_THEME_ASSIGNMENTS, theme })
    ])
  ),
  wallsMode: 'cutaway',
  viewMode: 'city',
  isReducedMotion: true,
  selectedAgentKey: null,
  speakingAgentKey: null,
  onSelect: vi.fn(),
  onFly: vi.fn(),
  onFlyToZone: vi.fn()
}
const protectedSites = [...floors, ...worldDocument.venues.map((venue) => venue.footprint)]
const town = distributedTown(townOf(groundEnvelope(floors, floors[0]), null), protectedSites)
const AUTHORED_THEME_IDS = [
  'corporate-city',
  'neo-edo-steam',
  'brass-workshop',
  'violet-court',
  'orbital-garrison',
  'quiet-grove',
  'samurai-empire',
  'cyberpunk-city'
]
const MIN_LOT_STRUCTURAL_SHARE = 0.12
const GEOMETRY_EPSILON = 0.001

// dry-new: expanded scene helpers erase component seams and enclosing visibility flags.
function rawElements(node: ReactNode): SceneElement[] {
  if (Array.isArray(node)) return node.flatMap(rawElements)
  if (!isValidElement<SceneElement['props']>(node)) return []
  return [node, ...rawElements(node.props.children)]
}

function interiorVisibility(node: ReactNode, isVisible = true): boolean[] {
  if (Array.isArray(node)) return node.flatMap((child) => interiorVisibility(child, isVisible))
  if (!isValidElement<SceneElement['props']>(node)) return []
  if (node.type === FloorView) return [isVisible]
  return interiorVisibility(node.props.children, isVisible && node.props.visible !== false)
}

// dry-new: audit transformed bounds independently of the fitting helper's containment calculation.
function worldPartBounds({ part, placed }: { part: PartSpec; placed?: PlacedLot }): Box3 {
  const transform = new Matrix4().compose(
    new Vector3(...part.at),
    new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))),
    new Vector3(...part.size)
  )
  if (placed)
    transform.premultiply(
      new Matrix4().compose(
        new Vector3(...placed.at),
        new Quaternion().setFromEuler(new Euler(0, placed.turn, 0)),
        new Vector3(placed.scale, placed.scale, placed.scale)
      )
    )
  return new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)).applyMatrix4(transform)
}

// dry-new: exclude thin pads and props rather than trusting the private design-selection filter.
function structuralShare(placed: PlacedLot): number {
  const mass = placed.parts
    .filter(
      (part) =>
        (part.shape === 'box' || part.shape === 'cylinder') &&
        !part.glow &&
        !part.rotation?.[0] &&
        !part.rotation?.[2] &&
        part.size[1] * placed.scale >= 1 &&
        part.size[0] * placed.scale >= 1 &&
        part.size[2] * placed.scale >= 1 &&
        (part.at[1] - part.size[1] / 2) * placed.scale + placed.at[1] <= 0.75
    )
    .reduce((area, part) => area + part.size[0] * part.size[2] * placed.scale ** 2, 0)
  return mass / (placed.lot.width * placed.lot.depth)
}

const dressedByTheme = new Map<string, PlacedLot[]>()
function dressedCity(themeId: string): PlacedLot[] {
  const cached = dressedByTheme.get(themeId)
  if (cached) return cached
  const dress = getTheme(themeId).town
  if (!dress) throw new Error(`Missing authored town for ${themeId}`)
  const placed = town.plan.lots.map((lot) => dressCityDistrict(lot, dress))
  dressedByTheme.set(themeId, placed)
  return placed
}

describe('local roof preference', () => {
  it('toggles only roof visibility without taking the camera, selection or live frame', () => {
    const state: OfficeState = {
      ...INITIAL_OFFICE_STATE,
      frame: makeFrame({ floors, agents: fixtureActors, sessions: fixtureSessions }),
      focusedFloorId: floors[0].floorId,
      selectedAgentKey: fixtureActors[0].agentKey,
      isCameraManuallyOwned: true,
      cameraRequest: { kind: 'zoom', direction: 'in', nonce: 17 }
    }
    const opened = officeReducer(state, { type: 'roofs-toggled' })
    expect(INITIAL_OFFICE_STATE.areRoofsVisible).toBe(true)
    expect(opened).toEqual({ ...state, areRoofsVisible: false })
    expect(opened.frame).toBe(state.frame)
    expect(officeReducer(opened, { type: 'roofs-toggled' })).toEqual(state)
    expect(state.areRoofsVisible).toBe(true)
  })
  it.each([null, '{broken', 'null', '[]', 'true', '"hidden"', '{"areRoofsVisible":"false"}'])(
    'defaults roofs on for absent or malformed storage: %s',
    (serialized) => {
      expect(readViewPreference({ getItem: () => serialized })).toEqual({
        viewMode: 'city',
        isListView: false,
        areRoofsVisible: true
      })
    }
  )
  it('retains legacy view preferences while defaulting the new roof preference on', () => {
    expect(
      readViewPreference({ getItem: () => '{"viewMode":"office","isListView":true}' })
    ).toEqual({ viewMode: 'office', isListView: true, areRoofsVisible: true })
  })
  it('rejects malformed roof fields without discarding valid view and list preferences', () => {
    expect(
      readViewPreference({
        getItem: () => '{"viewMode":"office","isListView":true,"areRoofsVisible":0}'
      })
    ).toEqual({ viewMode: 'office', isListView: true, areRoofsVisible: true })
  })
  it('round-trips false without treating it as an absent preference', () => {
    const bytes = new Map<string, string>()
    const storage = {
      getItem: (key: string) => bytes.get(key) ?? null,
      setItem: (key: string, content: string) => {
        bytes.set(key, content)
      }
    }
    const preference = {
      viewMode: 'city',
      isListView: false,
      areRoofsVisible: false
    } satisfies Pick<OfficeState, 'viewMode' | 'isListView' | 'areRoofsVisible'>
    expect(saveViewPreference(storage, preference)).toBe(true)
    expect(readViewPreference(storage)).toEqual(preference)
    expect(bytes.has(VIEW_PREFERENCE_KEY)).toBe(true)
  })
  it('survives blocked or unavailable storage without falsely reporting a saved choice', () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error('Storage access denied')
      },
      setItem: (): void => {
        throw new Error('Storage access denied')
      }
    }
    expect(readViewPreference(blocked)).toEqual(readViewPreference(null))
    expect(
      saveViewPreference(blocked, { viewMode: 'office', isListView: false, areRoofsVisible: false })
    ).toBe(false)
    expect(saveViewPreference(null, { viewMode: 'city', isListView: false })).toBe(false)
  })
})

describe('global roof cutaway', () => {
  it('opens all four real floors without replacing their mounted interiors or actors', () => {
    const before = structuredClone(floors)
    const view = render(<MultiFloorLayer {...layerProps} areRoofsVisible />)
    const floorMounts = screen.getAllByTestId('delivery-floor')
    const actorMounts = screen.getAllByTestId('delivery-actor')
    expect(floorMounts).toHaveLength(4)
    expect(interiorVisibility(MultiFloorLayer({ ...layerProps, areRoofsVisible: true }))).toEqual([
      false,
      false,
      false,
      false
    ])
    view.rerender(<MultiFloorLayer {...layerProps} areRoofsVisible={false} />)
    expect(screen.getAllByTestId('delivery-floor')).toHaveLength(4)
    expect(screen.getAllByTestId('delivery-actor')).toHaveLength(fixtureActors.length)
    screen
      .getAllByTestId('delivery-floor')
      .forEach((mount, index) => expect(mount).toBe(floorMounts[index]))
    screen
      .getAllByTestId('delivery-actor')
      .forEach((mount, index) => expect(mount).toBe(actorMounts[index]))
    expect(interiorVisibility(MultiFloorLayer({ ...layerProps, areRoofsVisible: false }))).toEqual([
      true,
      true,
      true,
      true
    ])
    expect(floors).toEqual(before)
    view.rerender(<MultiFloorLayer {...layerProps} areRoofsVisible />)
    expect(screen.getAllByTestId('delivery-actor')).toHaveLength(fixtureActors.length)
    screen
      .getAllByTestId('delivery-floor')
      .forEach((mount, index) => expect(mount).toBe(floorMounts[index]))
    screen
      .getAllByTestId('delivery-actor')
      .forEach((mount, index) => expect(mount).toBe(actorMounts[index]))
  })
  it('keeps visiting and in-transit fixture actors in their actual physical crews exactly once', () => {
    const destination = floors.find((floor) => floor.floorId !== fixtureActors[0].floorId)
    if (!destination) throw new Error('Fixture requires a second physical office')
    const visiting = { ...fixtureActors[0], physicalFloorId: destination.floorId }
    const transit = { ...fixtureActors[fixtureActors.length - 1], physicalFloorId: null }
    const actors = [visiting, ...fixtureActors.slice(1, -1), transit]
    const props = { ...layerProps, agents: [...actors, visiting] }
    const view = render(<MultiFloorLayer {...props} areRoofsVisible />)
    view.rerender(<MultiFloorLayer {...props} areRoofsVisible={false} />)
    expect(
      screen
        .getAllByTestId('delivery-actor')
        .map((actor) => actor.dataset.agentKey)
        .sort()
    ).toEqual(actors.map((actor) => actor.agentKey).sort())
    for (const mount of screen.getAllByTestId('delivery-floor')) {
      // Crews batch apart from their floors (perf-11), in a group named for the storey.
      const crew = view.container.querySelector(`[name="crew:${mount.dataset.floorId}"]`)
      if (!crew) throw new Error('Floor crew group is missing')
      expect(
        [...crew.querySelectorAll<HTMLElement>('[data-agent-key]')]
          .map((actor) => actor.dataset.agentKey)
          .sort()
      ).toEqual(
        actors
          .filter((actor) => actor.physicalFloorId === mount.dataset.floorId)
          .map((actor) => actor.agentKey)
          .sort()
      )
    }
    for (const mount of screen.getAllByTestId('delivery-actor')) {
      const actor = actors.find((candidate) => candidate.agentKey === mount.dataset.agentKey)
      expect({ roomId: mount.dataset.roomId, slotId: mount.dataset.slotId }).toEqual({
        roomId: actor?.roomId,
        slotId: actor?.slotId
      })
    }
  })
  it('owns entrance canopies inside the roof group and removes them with crowns, not facades', () => {
    const floor = floors[0]
    const profile = buildingExteriorProfile({ floor, theme })
    const entrance = buildingEntrance({ theme, profile })
    const closed = PhysicalBuildingShell({ floors: [floor], theme, areRoofsVisible: true })
    const roof = everyElement(closed).find((node) => node.props.name?.startsWith('physical-roof:'))
    expect(roof).toBeDefined()
    const roofMeshes = everyElement(roof).filter((node) => node.type === 'mesh')
    for (const canopy of entrance.roof)
      expect(
        roofMeshes.some(
          (node) =>
            isValidElement<{ position: number[]; scale: number[] }>(node) &&
            JSON.stringify(node.props.position) === JSON.stringify(canopy.at) &&
            JSON.stringify(node.props.scale) === JSON.stringify(canopy.size)
        )
      ).toBe(true)
    const opened = PhysicalBuildingShell({ floors: [floor], theme, areRoofsVisible: false })
    expect(everyElement(opened).some((node) => node.props.name?.startsWith('physical-roof:'))).toBe(
      false
    )
    const facade = everyElement(opened).find((node) =>
      node.props.name?.startsWith('physical-entrance-facade:')
    )
    expect(facade).toBeDefined()
    expect(everyElement(facade).filter((node) => node.type === 'mesh')).toHaveLength(
      entrance.facade.length
    )
  })
})

describe('stable physical exterior identity', () => {
  it('gives four real fixture IDs distinct silhouettes, independent of labels and positions', () => {
    const profiles = floors.map((floor) => buildingExteriorProfile({ floor, theme }))
    expect(floors).toHaveLength(4)
    expect(new Set(profiles.map((profile) => profile.silhouette))).toEqual(
      new Set(['stepped', 'split-lantern', 'offset-canopy', 'service-ribs'])
    )
    for (const [index, floor] of floors.entries())
      expect(
        buildingExteriorProfile({
          floor: { ...floor, label: 'Renamed office', x: floor.x + 500, z: floor.z - 500 },
          theme
        })
      ).toEqual(profiles[index])
    expect(
      new Set(
        floors.map((floor, index) =>
          JSON.stringify(
            windowParts(floor, undefined, profiles[index]).map(({ kind, side, size }) => ({
              kind,
              side,
              size
            }))
          )
        )
      ).size
    ).toBe(4)
  })
  it.each(AUTHORED_THEME_IDS)(
    '%s leaves real entrance corridors clear on all four profiles',
    (themeId) => {
      const exteriorTheme = getTheme(themeId)
      for (const floor of floors) {
        const profile = buildingExteriorProfile({ floor, theme: exteriorTheme })
        const entrance = floor.entrance
        if (!entrance) throw new Error('Physical fixture office requires a real entrance')
        const isAlongX = SIDE_NORMAL[doorSide({ ...floor, door: entrance })].z !== 0
        const corridor = {
          ...entrance,
          width: isAlongX ? profile.entranceWidth : 0.5,
          depth: isAlongX ? 0.5 : profile.entranceWidth
        }
        const glazing = windowParts(floor, undefined, profile).filter(
          (part) => part.side !== 'connector' && part.position[1] - part.size[1] / 2 < 3.3
        )
        expect(glazing.length).toBeGreaterThan(0)
        for (const part of glazing)
          expect(
            overlaps(
              {
                x: part.position[0],
                z: part.position[2],
                width: part.size[0],
                depth: part.size[2]
              },
              corridor
            )
          ).toBe(false)
        const entranceParts = buildingEntrance({ theme: exteriorTheme, profile })
        for (const part of entranceParts.facade.filter(
          (part) => part.at[1] - part.size[1] / 2 < 3.3
        ))
          expect(
            overlaps(
              { x: part.at[0], z: part.at[2], width: part.size[0], depth: part.size[2] },
              { x: 0, z: 0, width: profile.entranceWidth, depth: 6 }
            )
          ).toBe(false)
        for (const part of entranceParts.roof)
          expect(worldPartBounds({ part }).max.z).toBeLessThanOrEqual(3)
      }
    }
  )
  it.each(AUTHORED_THEME_IDS)(
    '%s contains roof ornaments without inventing a storey',
    (themeId) => {
      const exteriorTheme = getTheme(themeId)
      for (const floor of floors)
        for (const part of buildingCrown({ floor, theme: exteriorTheme })) {
          const bounds = worldPartBounds({ part })
          expect(bounds.min.x).toBeGreaterThanOrEqual(floor.x - floor.width / 2 - 3)
          expect(bounds.max.x).toBeLessThanOrEqual(floor.x + floor.width / 2 + 3)
          expect(bounds.min.z).toBeGreaterThanOrEqual(floor.z - floor.depth / 2 - 3)
          expect(bounds.max.z).toBeLessThanOrEqual(floor.z + floor.depth / 2 + 3)
          expect(bounds.min.y).toBeGreaterThanOrEqual(
            (floor.elevation ?? 0) + PHYSICAL_STOREY_HEIGHT - GEOMETRY_EPSILON
          )
          expect(bounds.max.y).toBeLessThan((floor.elevation ?? 0) + PHYSICAL_STOREY_HEIGHT * 2)
        }
    }
  )
})

describe('authored recovered streetscape', () => {
  it.each(AUTHORED_THEME_IDS)('%s fills every usable quadrant of each street block', (themeId) => {
    const solids = dressedCity(themeId).flatMap((placed) =>
      placed.parts
        .filter(
          (part) =>
            !part.glow &&
            part.size[0] * placed.scale >= 1 &&
            part.size[1] * placed.scale >= 1 &&
            part.size[2] * placed.scale >= 1
        )
        .map((part) => worldPartBounds({ part, placed }))
        .filter((bounds) => bounds.min.y <= 0.75)
    )
    let usableQuadrants = 0
    for (const block of cityBlocksFor(protectedSites))
      for (const sideX of [-1, 1])
        for (const sideZ of [-1, 1]) {
          const quadrant = {
            x: block.x + sideX * (block.width / 4 - 0.75),
            z: block.z + sideZ * (block.depth / 4 - 0.75),
            width: block.width / 2 - 1.5,
            depth: block.depth / 2 - 1.5
          }
          const isUsable = [
            [4, 12],
            [12, 4]
          ].some(([width, depth]) => {
            const west = quadrant.x - quadrant.width / 2 + width / 2
            const east = quadrant.x + quadrant.width / 2 - width / 2
            const north = quadrant.z - quadrant.depth / 2 + depth / 2
            const south = quadrant.z + quadrant.depth / 2 - depth / 2
            if (east < west || south < north) return false
            const across = [
              west,
              east,
              ...protectedSites.flatMap((site) => [
                site.x - site.width / 2 - 3 - width / 2,
                site.x + site.width / 2 + 3 + width / 2
              ])
            ].filter((x) => x >= west && x <= east)
            const along = [
              north,
              south,
              ...protectedSites.flatMap((site) => [
                site.z - site.depth / 2 - 3 - depth / 2,
                site.z + site.depth / 2 + 3 + depth / 2
              ])
            ].filter((z) => z >= north && z <= south)
            return across.some((x) =>
              along.some((z) =>
                protectedSites.every((site) => !overlaps({ x, z, width, depth }, site, 3))
              )
            )
          })
          if (!isUsable) continue
          usableQuadrants++
          const raisedArea = solids.reduce(
            (area, bounds) =>
              area +
              Math.max(
                0,
                Math.min(bounds.max.x, quadrant.x + quadrant.width / 2) -
                  Math.max(bounds.min.x, quadrant.x - quadrant.width / 2)
              ) *
                Math.max(
                  0,
                  Math.min(bounds.max.z, quadrant.z + quadrant.depth / 2) -
                    Math.max(bounds.min.z, quadrant.z - quadrant.depth / 2)
                ),
            0
          )
          expect(
            raisedArea,
            `${themeId}: ${block.id} quadrant ${sideX},${sideZ}`
          ).toBeGreaterThanOrEqual(1)
        }
    expect(usableQuadrants).toBeGreaterThanOrEqual(24)
  })
  it('uses exact shared and simulation parcels deterministically in the renderer', () => {
    const shared = cityScenerySites(protectedSites)
    const projected = town.plan.lots.map(({ id, column, row, facing, x, z, width, depth }) => ({
      id,
      column,
      row,
      facing,
      x,
      z,
      width,
      depth
    }))
    expect(projected).toEqual(shared)
    expect(projected).toEqual(effective.streetBlocks)
    // Generated buildings keep room for a game corner, so the offices leave 44 lots, not 47.
    expect(projected).toHaveLength(44)
    expect(distributedTown(town.plan, protectedSites).plan.lots).toEqual(town.plan.lots)
  })
  it.each(AUTHORED_THEME_IDS)(
    '%s fits actual rotated parts inside recovered parcels',
    (themeId) => {
      const placed = dressedCity(themeId)
      expect(placed).toHaveLength(44)
      for (const building of placed) {
        expect(building.parts.length).toBeGreaterThan(0)
        for (const part of building.parts) {
          expect(part.size.every((size) => Number.isFinite(size) && size > 0)).toBe(true)
          const bounds = worldPartBounds({ part, placed: building })
          expect(bounds.min.x).toBeGreaterThanOrEqual(
            building.lot.x - building.lot.width / 2 - GEOMETRY_EPSILON
          )
          expect(bounds.max.x).toBeLessThanOrEqual(
            building.lot.x + building.lot.width / 2 + GEOMETRY_EPSILON
          )
          expect(bounds.min.z).toBeGreaterThanOrEqual(
            building.lot.z - building.lot.depth / 2 - GEOMETRY_EPSILON
          )
          expect(bounds.max.z).toBeLessThanOrEqual(
            building.lot.z + building.lot.depth / 2 + GEOMETRY_EPSILON
          )
          expect(bounds.min.y).toBeGreaterThanOrEqual(-GEOMETRY_EPSILON)
          expect(bounds.max.y).toBeLessThanOrEqual(building.lot.maxHeight + GEOMETRY_EPSILON)
        }
      }
    }
  )
  it.each(AUTHORED_THEME_IDS)(
    '%s supplies substantial architecture in every city quadrant, not prop-only lots',
    (themeId) => {
      const placed = dressedCity(themeId)
      const quadrants = Map.groupBy(
        placed,
        (building) =>
          `${building.lot.x >= town.plan.extent.x}:${building.lot.z >= town.plan.extent.z}`
      )
      expect(quadrants.size).toBe(4)
      for (const building of placed) {
        expect(building.design).not.toBe('')
        expect(
          structuralShare(building),
          `${themeId}: ${building.lot.id} (${building.design})`
        ).toBeGreaterThanOrEqual(MIN_LOT_STRUCTURAL_SHARE)
      }
      for (const quadrant of quadrants.values())
        expect(
          quadrant.some((building) => structuralShare(building) >= MIN_LOT_STRUCTURAL_SHARE)
        ).toBe(true)
    }
  )
  it.each([false, true])(
    'keeps all street-level architecture while inspection is %s',
    (isInspecting) => {
      const placed = dressedCity('corporate-city')
      const scene = CitySceneryCutaway({
        placed,
        floor: floors[0],
        revision: 'fixture',
        isInspecting
      })
      const lower: PlacedLot[] = []
      for (const batch of rawElements(scene)) {
        if (
          batch.type !== BatchedScene ||
          !isValidElement<ComponentProps<typeof BatchedScene>>(batch) ||
          !batch.props.revision.endsWith(':lower')
        )
          continue
        for (const fill of rawElements(batch.props.children))
          if (fill.type === LotFill && isValidElement<{ placed: readonly PlacedLot[] }>(fill))
            lower.push(...fill.props.placed)
      }
      expect(lower.map((building) => building.key).sort()).toEqual(
        placed.map((building) => building.key).sort()
      )
      for (const building of lower)
        expect(structuralShare(building), building.key).toBeGreaterThanOrEqual(
          MIN_LOT_STRUCTURAL_SHARE
        )
    }
  )
  it('measures recovered frontage against unchanged live scene ceilings', () => {
    const actual = mergedDraws(createElement(LotFill, { placed: dressedCity('corporate-city') }))
    expect(actual.draws).toBeGreaterThan(0)
    expect(actual.triangles).toBeGreaterThan(0)
    expect(actual.draws).toBeLessThanOrEqual(DRAW_CEILING)
    expect(actual.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  })
})
