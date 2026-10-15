import { cleanup, render } from '@testing-library/react'
import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { Texture } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLayout } from '../../../../office/sim/layout'
import { createWorldDocument } from '../../../../shared/office/world-document'
import OfficeScene from '../../scene/OfficeScene'
import { VenueLayer } from '../../scene/VenueLayer'
import { getTheme, listThemes } from '../../themes/registry'
import { everyElement, mergedDraws } from '../../themes/scene.test-utils'
import { makeFloor, makeSession } from '../fixtures'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: unknown) => ({ current })
}))

let displayedVenueLayer: ReactNode = null
vi.mock('@react-three/fiber', () => ({
  useFrame: () => undefined,
  useThree: () => undefined,
  Canvas: ({ children }: { children?: ReactNode }) => {
    displayedVenueLayer = Children.toArray(children).find(
      (child) => isValidElement(child) && child.type === VenueLayer
    )
    return null
  }
}))
vi.mock('../../scene/textures', () => ({
  signTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))
afterEach(() => {
  cleanup()
  displayedVenueLayer = null
})

const sessions = [makeSession({ key: 'claude:venue-cutaway' })]
const venues = createWorldDocument(buildLayout(sessions, undefined), sessions).venues
const theme = getTheme('corporate-city')
const floor = makeFloor({ floorId: 'venue-cutaway' })
const sceneProps: ComponentProps<typeof OfficeScene> = {
  theme,
  floor,
  floors: [{ floorId: floor.floorId, label: floor.label, attentionCount: 0 }],
  sessions: [],
  venues,
  agents: [],
  cards: [],
  stacks: [],
  selectedAgentKey: null,
  wallsMode: 'cutaway',
  cameraRequest: null,
  metrics: { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 },
  onSelectAgent: vi.fn(),
  onFlyToAgent: vi.fn(),
  onFlyToZone: vi.fn(),
  reviewableKeys: new Set(),
  onReview: vi.fn(),
  speakingAgentKey: null,
  isLayoutPreview: true,
  previewVenues: venues
}

// dry-new: the shared traversal expands JSX but does not identify venue-specific overhead slabs.
function overheadMeshes(tree: ReactNode) {
  return everyElement(tree).filter(
    (node) =>
      node.type === 'mesh' &&
      isValidElement<{ position?: readonly number[]; scale?: readonly number[] }>(node) &&
      node.props.scale?.[1] === 0.18 &&
      ['[0,2.5,2.8]', '[0,1.7,0]'].includes(JSON.stringify(node.props.position) ?? '')
  )
}

describe('venue roof cutaway geometry', () => {
  it('uses every real venue kind in the regression fixture', () => {
    expect(venues.map((venue) => venue.kind).sort()).toEqual([
      'arcade',
      'garage',
      'lounge',
      'market',
      'transit'
    ])
  })

  it.each(venues)('$kind retains its canopy and awnings by default and with roofs on', (venue) => {
    const props = { venues: [venue], palette: theme.palette, theme }
    const defaultLayer = VenueLayer(props)
    const closed = VenueLayer({ ...props, areRoofsVisible: true })
    const expectedRoofs = 1 + (venue.kind === 'market' ? venue.slots.length : 0)
    expect(overheadMeshes(defaultLayer.props.children)).toHaveLength(expectedRoofs)
    expect(overheadMeshes(closed.props.children)).toHaveLength(expectedRoofs)
    expect(defaultLayer.props.revision).toBe(closed.props.revision)
  })

  it.each(listThemes())(
    '$id removes only overhead venue geometry with roofs hidden',
    (venueTheme) => {
      for (const venue of venues) {
        const props = { venues: [venue], palette: venueTheme.palette, theme: venueTheme }
        const closed = VenueLayer({ ...props, areRoofsVisible: true })
        const opened = VenueLayer({ ...props, areRoofsVisible: false })
        const closedMeshes = everyElement(closed.props.children).filter(
          (node) => node.type === 'mesh'
        )
        const openedMeshes = everyElement(opened.props.children).filter(
          (node) => node.type === 'mesh'
        )
        const roofCount = 1 + (venue.kind === 'market' ? venue.slots.length : 0)
        expect(overheadMeshes(opened.props.children), venue.kind).toHaveLength(0)
        expect(openedMeshes, venue.kind).toHaveLength(closedMeshes.length - roofCount)
        expect(openedMeshes.length, venue.kind).toBeGreaterThan(3)
        expect(openedMeshes[0].props, venue.kind).toMatchObject({
          position: [0, 0.08, 0],
          scale: [venue.footprint.width, 0.16, venue.footprint.depth]
        })
        expect(
          mergedDraws(closed.props.children).triangles -
            mergedDraws(opened.props.children).triangles
        ).toBe(roofCount * 12)
      }
    }
  )

  it('removes every market stall awning without removing stall counters', () => {
    const market = venues.find((venue) => venue.kind === 'market')
    if (!market) throw new Error('The fixture requires a market')
    const opened = VenueLayer({
      venues: [market],
      palette: theme.palette,
      theme,
      areRoofsVisible: false
    })
    const meshes = everyElement(opened.props.children).filter((node) => node.type === 'mesh')
    expect(overheadMeshes(opened.props.children)).toHaveLength(0)
    expect(
      meshes.filter(
        (node) =>
          isValidElement<{ scale?: readonly number[] }>(node) &&
          JSON.stringify(node.props.scale) === '[1.2,0.7,0.7]'
      )
    ).toHaveLength(market.slots.length)
  })

  it('rebuilds mesh batches on both roof transitions without changing venue identity', () => {
    const before = structuredClone(venues)
    const props = { venues, palette: theme.palette, theme, onSelect: vi.fn() }
    const closed = VenueLayer({ ...props, areRoofsVisible: true })
    const opened = VenueLayer({ ...props, areRoofsVisible: false })
    const restored = VenueLayer({ ...props, areRoofsVisible: true })
    expect(opened.props.revision).not.toBe(closed.props.revision)
    expect(restored.props.revision).toBe(closed.props.revision)
    const venueGroups = Children.toArray(opened.props.children)
    const closedGroups = Children.toArray(closed.props.children)
    expect(venueGroups).toHaveLength(venues.length)
    venueGroups.forEach((group, index) => {
      const closedGroup = closedGroups[index]
      expect(isValidElement(group) && group.key).toBe(
        isValidElement(closedGroup) && closedGroup.key
      )
      expect(isValidElement(group) && group.props).toMatchObject({
        position: [venues[index].footprint.x, 0, venues[index].footprint.z],
        onPointerDown: expect.any(Function),
        onClick: expect.any(Function)
      })
    })
    expect(venues).toEqual(before)
  })
})

describe('OfficeScene venue roof preference', () => {
  it.each([false, true])(
    'forwards roofs=%s to real venue geometry in live and preview scenes',
    (areRoofsVisible) => {
      for (const isLayoutPreview of [false, true]) {
        const view = render(
          <OfficeScene
            {...sceneProps}
            areRoofsVisible={areRoofsVisible}
            isLayoutPreview={isLayoutPreview}
          />
        )
        if (!isValidElement<ComponentProps<typeof VenueLayer>>(displayedVenueLayer))
          throw new Error('OfficeScene did not mount VenueLayer')
        expect(displayedVenueLayer.props.areRoofsVisible).toBe(areRoofsVisible)
        const layer = VenueLayer(displayedVenueLayer.props)
        const expectedRoofs = areRoofsVisible
          ? venues.length +
            venues.filter((venue) => venue.kind === 'market').flatMap((venue) => venue.slots).length
          : 0
        expect(overheadMeshes(layer.props.children)).toHaveLength(expectedRoofs)
        view.unmount()
      }
    }
  )
})
