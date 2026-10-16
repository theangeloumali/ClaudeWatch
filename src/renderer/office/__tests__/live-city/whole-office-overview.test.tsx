import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import type { ComponentProps, Ref } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfficeApp } from '../../OfficeApp'
import { INITIAL_OFFICE_STATE, officeReducer } from '../../logic/office-reducer'
import { MAX_NAME_CARDS } from '../../logic/name-cards'
import { ISO_POLAR, ISO_START_AZIMUTH } from '../../logic/camera-bands'
import { hudSafeInsets } from '../../logic/hud-layout'
import {
  boundsOfZone,
  frameBounds,
  occupiedBounds,
  projectToScreen
} from '../../logic/zone-framing'
import type { OfficeFeed, OfficeFrame } from '../../scene-model'
import type OfficeScene from '../../scene/OfficeScene'
import { CameraRig } from '../../scene/CameraRig'
import {
  floorEnvelope,
  groundEnvelope,
  partitionPhysicalAgents,
  PHYSICAL_STOREY_HEIGHT
} from '../../scene/all-floor-model'
import { useOfficeLists } from '../../use-office-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from '../fixtures'
import { createWorldDocumentStore } from '../../../office-live/world-document-store'
import { buildLayout } from '../../../../office/sim/layout'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

type SceneProps = ComponentProps<typeof OfficeScene>

// dry-new: existing scene mocks cover settings, not physical visibility or overview framing.
const { observeScene, controls, surface } = vi.hoisted(() => {
  const camera = { zoom: 34 }
  const mouseButtons: Record<string, number> = {}
  const touches: Record<string, number> = {}
  return {
    observeScene: vi.fn<(props: SceneProps) => void>(),
    surface: {
      size: { width: 1440, height: 900 },
      camera,
      gl: { domElement: document.createElement('canvas') },
      invalidate: vi.fn()
    },
    controls: {
      mouseButtons,
      touches,
      azimuthAngle: Math.PI / 4,
      polarAngle: 0,
      minZoom: 0.1,
      maxZoom: 240,
      stop: vi.fn(),
      moveTo: vi.fn<(x: number, y: number, z: number, animated: boolean) => void>(),
      truck: vi.fn(),
      zoomTo: vi.fn((zoom: number) => {
        camera.zoom = zoom
      }),
      rotateTo: vi.fn<(azimuth: number, polar: number, animated: boolean) => void>(),
      getTarget: vi.fn((target: { x: number; y: number; z: number }) => target),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
  }
})

vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../../scene/OfficeScene', () => ({
  default: (props: SceneProps) => {
    observeScene(props)
    return <output aria-label="Whole-office scene">Scene mounted</output>
  }
}))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof surface) => unknown) => selector(surface),
  useFrame: () => undefined
}))
vi.mock('@react-three/drei', async () => {
  const { useImperativeHandle } = await import('react')
  return {
    CameraControlsImpl: {
      ACTION: { NONE: 0, TRUCK: 1, TOUCH_TRUCK: 2, ROTATE: 3, TOUCH_ZOOM_ROTATE: 5 }
    },
    CameraControls: ({
      ref,
      minZoom,
      maxZoom
    }: {
      ref: Ref<typeof controls>
      minZoom: number
      maxZoom: number
    }) => {
      controls.minZoom = minZoom
      controls.maxZoom = maxZoom
      useImperativeHandle(ref, () => controls)
      return null
    }
  }
})

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('innerWidth', surface.size.width)
  vi.stubGlobal('innerHeight', surface.size.height)
  vi.clearAllMocks()
  surface.camera.zoom = 34
  controls.azimuthAngle = ISO_START_AZIMUTH
  controls.polarAngle = ISO_POLAR
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function wholeOfficeFrame(counts = [3, 5, 6, 8]): OfficeFrame {
  const floors = counts.map((count, floorIndex) => {
    const rooms = Array.from({ length: count }, (_, workerIndex) =>
      makeRoom({
        id: `room:${floorIndex}:${workerIndex}`,
        sessionKey: `claude:${floorIndex}:${workerIndex}`,
        x: floorIndex * 24 + workerIndex * 2
      })
    )
    return makeFloor({
      floorId: `office:${floorIndex}`,
      buildingId: `building:${floorIndex}`,
      label: `Office ${floorIndex + 1}`,
      x: floorIndex * 24,
      elevation: 0,
      rooms,
      zones: [
        makeZone({
          id: `company:${floorIndex}`,
          kind: 'company',
          companyKey: `company:${floorIndex}`,
          children: [
            makeZone({
              id: `project-zone:${floorIndex}`,
              kind: 'project',
              projectKey: `project:${floorIndex}`,
              x: floorIndex * 24,
              children: rooms.map((room) =>
                makeZone({ id: room.id, kind: 'office', sessionKey: room.sessionKey })
              )
            })
          ]
        })
      ]
    })
  })
  const sessions = floors.flatMap((floor, floorIndex) =>
    floor.rooms.map((_, workerIndex) =>
      makeSession({
        key: `claude:${floorIndex}:${workerIndex}`,
        name: `Worker ${floorIndex}:${workerIndex}`,
        companyKey: `company:${floorIndex}`,
        projectKey: `project:${floorIndex}`
      })
    )
  )
  const agents = floors.flatMap((floor) =>
    floor.rooms.map((room) =>
      makeAgent({
        agentKey: room.sessionKey ?? room.id,
        floorId: floor.floorId,
        physicalFloorId: floor.floorId,
        roomId: room.id,
        slotId: room.seats[0].slotId,
        x: room.x,
        z: room.z,
        label: room.sessionKey ?? room.id,
        elevation: floor.elevation
      })
    )
  )
  return makeFrame({ floors, sessions, agents })
}

function feedFor(frame: OfficeFrame): OfficeFeed {
  return {
    subscribe: (listener) => {
      listener(frame)
      return () => undefined
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn(),
    isViewOnly: true
  }
}

function sceneProps(): SceneProps {
  const latest = observeScene.mock.calls.at(-1)?.[0]
  if (!latest) throw new Error('OfficeApp has not mounted its scene')
  return latest
}

describe('whole-office visibility', () => {
  it('frames a network-selected floor after manual City movement while keeping every crew', async () => {
    const frame = wholeOfficeFrame()
    render(<OfficeApp feed={feedFor(frame)} />)
    await screen.findByLabelText('Whole-office scene')
    fireEvent.click(screen.getByRole('button', { name: 'City' }))
    act(() => sceneProps().onManualCameraMove?.())
    const previous = sceneProps().cameraRequest
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Office network' })).getByRole('button', {
        name: /^Office 2\b/
      })
    )
    expect(sceneProps()).toMatchObject({
      viewMode: 'office',
      focusedFloorId: frame.floors[1].floorId,
      isCameraManuallyOwned: false,
      cameraRequest: { kind: 'office' }
    })
    expect(sceneProps().cameraRequest).not.toBe(previous)
    expect(sceneProps().cameraRequest?.nonce).toBeGreaterThan(previous?.nonce ?? 0)
    expect(sceneProps().visibleFloors).toEqual(frame.floors)
    expect(sceneProps().agents).toEqual(frame.agents)
  })

  it('frames the project office rather than its zone and ends player-follow mode', async () => {
    const frame = wholeOfficeFrame()
    render(<OfficeApp feed={feedFor(frame)} />)
    await screen.findByLabelText('Whole-office scene')
    fireEvent.click(screen.getByRole('button', { name: /^Control player/ }))
    expect(sceneProps().isWalking).toBe(true)
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Offices' })).getByRole('button', {
        name: /^project-zone:1,/
      })
    )
    expect(sceneProps()).toMatchObject({
      focusedFloorId: frame.floors[1].floorId,
      viewMode: 'office',
      isWalking: false,
      isCameraManuallyOwned: false,
      cameraRequest: { kind: 'office' }
    })
    expect(sceneProps().visibleFloors).toEqual(frame.floors)
    expect(sceneProps().agents).toEqual(frame.agents)
  })

  it('opens a clicked building after manual City movement without issuing a new camera request', async () => {
    const frame = wholeOfficeFrame()
    render(<OfficeApp feed={feedFor(frame)} />)
    await screen.findByLabelText('Whole-office scene')
    fireEvent.click(screen.getByRole('button', { name: 'City' }))
    act(() => sceneProps().onManualCameraMove?.())
    const request = sceneProps().cameraRequest
    act(() => sceneProps().onFocusFloor?.(frame.floors[1].floorId))
    expect(sceneProps().viewMode).toBe('office')
    expect(sceneProps().focusedFloorId).toBe(frame.floors[1].floorId)
    expect(sceneProps().cameraRequest).toBe(request)
    expect(sceneProps().isCameraManuallyOwned).toBe(true)
  })
  it('supplies relocated venues to Preview without replacing live venue positions', async () => {
    const frame = wholeOfficeFrame()
    const layout = buildLayout(frame.sessions, undefined)
    const store = createWorldDocumentStore({
      storage: null,
      getLayout: () => layout,
      getSessions: () => frame.sessions
    })
    frame.venues = store.get().document.venues
    frame.venues[0].footprint.x -= 300
    const feed = { ...feedFor(frame), getWorldDocumentStore: () => store }
    render(<OfficeApp feed={feed} />)
    await screen.findByLabelText('Whole-office scene')
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }))
    const saved = structuredClone(store.get().document)
    expect(screen.getByRole('button', { name: 'Save locally' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild city layout' }))
    expect(store.get().document).toEqual(saved)
    expect(store.get().draft).toBeNull()
    expect(sceneProps().isLayoutPreview).not.toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(store.get().draft).not.toBeNull()
    expect(sceneProps().isLayoutPreview).toBe(true)
    expect(sceneProps()).toMatchObject({ previewVenues: store.get().draft?.venues })
    expect(sceneProps().venues).toBe(frame.venues)
    // Scene presentation suppresses bodies; the live input must remain truthful and unchanged.
    expect(sceneProps().agents).toEqual(frame.agents)
    expect(store.get().document).toEqual(saved)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel preview' }))
    expect(sceneProps().isLayoutPreview).not.toBe(true)
    expect(sceneProps().agents).toEqual(frame.agents)
    expect(store.get().document).toEqual(saved)
    store.dispose()
  })

  it('mounts every physical floor initially, including an empty upper storey', async () => {
    const frame = wholeOfficeFrame()
    frame.floors.push(
      makeFloor({
        floorId: 'office:0:upper',
        buildingId: 'building:0',
        elevation: PHYSICAL_STOREY_HEIGHT
      })
    )
    render(<OfficeApp feed={feedFor(frame)} />)
    await screen.findByLabelText('Whole-office scene')
    expect(sceneProps().visibleFloors).toEqual(frame.floors)
    expect(sceneProps().agents).toEqual(frame.agents)
  })

  it('keeps all 22 workers when header navigation reframes a floor and ends player-follow', async () => {
    const frame = wholeOfficeFrame()
    const original = JSON.stringify(frame)
    render(<OfficeApp feed={feedFor(frame)} />)
    await screen.findByLabelText('Whole-office scene')
    fireEvent.click(screen.getByRole('button', { name: /^Control player/ }))
    expect(sceneProps().isWalking).toBe(true)
    const choices = screen.getByRole('combobox', { name: 'Choose office or physical floor' })
    for (const floor of frame.floors) {
      expect(
        within(choices).getByRole('option', { name: new RegExp(`^${floor.label}\\b`) })
      ).toHaveValue(floor.floorId)
      act(() => sceneProps().onManualCameraMove?.())
      expect(sceneProps().isCameraManuallyOwned).toBe(true)
      const previous = sceneProps().cameraRequest
      fireEvent.change(choices, { target: { value: floor.floorId } })
      const props = sceneProps()
      expect(props.floor.floorId).toBe(floor.floorId)
      expect(choices).toHaveValue(floor.floorId)
      expect(props).toMatchObject({
        viewMode: 'office',
        focusedFloorId: floor.floorId,
        isWalking: false,
        isCameraManuallyOwned: false,
        cameraRequest: { kind: 'office' }
      })
      expect(props.cameraRequest?.nonce).toBeGreaterThan(previous?.nonce ?? 0)
      expect(props.visibleFloors).toEqual(frame.floors)
      const crews = partitionPhysicalAgents(props.visibleFloors ?? [], props.agents)
      const workers = [...crews.byFloor.values()].flat()
      expect(workers).toHaveLength(22)
      expect(new Set(workers.map((agent) => agent.agentKey)).size).toBe(22)
      expect(crews.transit).toEqual([])
    }
    expect(JSON.stringify(frame)).toBe(original)
  })

  it('inspects another office without unmounting crews or requesting a close-up', async () => {
    const frame = wholeOfficeFrame()
    render(<OfficeApp feed={feedFor(frame)} />)
    await screen.findByLabelText('Whole-office scene')
    const initialFloors = sceneProps().visibleFloors
    const initialRequest = sceneProps().cameraRequest
    act(() => sceneProps().onSelectAgent('claude:3:7'))
    expect(sceneProps().selectedAgentKey).toBe('claude:3:7')
    expect(sceneProps().floor.floorId).toBe('office:3')
    expect(sceneProps().visibleFloors).toBe(initialFloors)
    expect(sceneProps().visibleFloors).toEqual(frame.floors)
    expect(sceneProps().cameraRequest).toBe(initialRequest)
  })

  it('keeps physical visitors and connector transit independent of their home assignment', () => {
    const frame = wholeOfficeFrame()
    const visitor = { ...frame.agents[0], physicalFloorId: 'office:3', elevation: 0 }
    const transit = { ...frame.agents[1], physicalFloorId: null, elevation: 2.75 }
    const crews = partitionPhysicalAgents(frame.floors, [visitor, transit, visitor])
    expect(crews.byFloor.get('office:0')).toEqual([])
    expect(crews.byFloor.get('office:3')).toEqual([visitor])
    expect(crews.transit).toEqual([transit])
  })
})

describe('all-floor worker labels', () => {
  it.each([null, 'office:0', 'office:3'])(
    'includes all cards and project stacks with focus %s',
    (focus) => {
      const frame = wholeOfficeFrame()
      const { result } = renderHook(() => useOfficeLists(frame, focus, null))
      expect(new Set(result.current.cards.map((card) => card.agentKey))).toEqual(
        new Set(frame.agents.map((agent) => agent.agentKey))
      )
      expect(new Set(result.current.stacks.map((stack) => stack.zoneId))).toEqual(
        new Set(frame.floors.map((floor) => floor.zones[0].children[0].id))
      )
    }
  )

  it('applies one global card cap after selected and attention priority, even off the focused floor', () => {
    const frame = wholeOfficeFrame([12, 12, 12, 12])
    frame.agents = frame.agents.map((agent) => {
      if (agent.agentKey === 'claude:3:10') return { ...agent, attention: 'permission' }
      if (agent.agentKey === 'claude:3:9') return { ...agent, attention: 'error' }
      return agent
    })
    const { result, rerender } = renderHook(
      ({ focus }) => useOfficeLists(frame, focus, 'claude:3:11'),
      { initialProps: { focus: 'office:0' } }
    )
    expect(result.current.cards).toHaveLength(MAX_NAME_CARDS)
    expect(result.current.cards.slice(0, 3).map((card) => card.agentKey)).toEqual([
      'claude:3:11',
      'claude:3:10',
      'claude:3:9'
    ])
    expect(new Set(result.current.cards.map((card) => card.agentKey)).size).toBe(MAX_NAME_CARDS)
    const cards = result.current.cards
    rerender({ focus: 'office:3' })
    expect(result.current.cards).toEqual(cards)
  })
})

it('floor highlighting can reset the overview while explicit Fly and Workstation remain opt-in', () => {
  const frame = wholeOfficeFrame()
  const received = officeReducer(INITIAL_OFFICE_STATE, { type: 'frame-received', frame })
  const selected = officeReducer(received, { type: 'agent-selected', agentKey: 'claude:3:7' })
  expect(selected.cameraRequest).toBeNull()
  expect(selected.focusedFloorId).toBe('office:3')
  expect(officeReducer(selected, { type: 'fly-to-selected' }).cameraRequest).toMatchObject({
    kind: 'fly',
    agentKey: 'claude:3:7'
  })
  expect(officeReducer(selected, { type: 'camera-workstation' }).cameraRequest).toMatchObject({
    kind: 'workstation',
    agentKey: 'claude:3:7'
  })
  const focused = officeReducer(selected, { type: 'floor-focused', floorId: 'office:1' })
  expect(focused.focusedFloorId).toBe('office:1')
  expect(['reset', 'fit', 'office']).toContain(focused.cameraRequest?.kind)
  expect(focused.frame).toBe(frame)
})

function overviewRigProps(padding: number) {
  const floors = [20, 32].map((x, index) =>
    makeFloor({
      floorId: `physical:${index}`,
      buildingId: `building:${index}`,
      x,
      width: padding,
      depth: padding,
      elevation: index * PHYSICAL_STOREY_HEIGHT,
      rooms: [makeRoom({ id: `room:${index}`, sessionKey: `claude:${index}`, x: x + 2, z: -6 })]
    })
  )
  return {
    floor: floors[0],
    visibleFloors: floors,
    floorCount: floors.length,
    agents: [],
    liveSessionKeys: new Set(['claude:0', 'claude:1']),
    scene: { x: 80, z: -30, width: 240, depth: 216, maxY: 24 },
    request: null,
    hasInspector: false,
    isReducedMotion: true,
    onBandChange: vi.fn()
  }
}

function currentView() {
  const move = controls.moveTo.mock.calls.at(-1)
  if (!move) throw new Error('CameraRig has not framed the overview')
  return {
    target: [move[0], move[1], move[2]] satisfies [number, number, number],
    zoom: surface.camera.zoom,
    azimuth: ISO_START_AZIMUTH,
    polar: ISO_POLAR
  }
}

describe('physical overview framing', () => {
  it('refits City after footprint-only changes inside the same held town claim', () => {
    const props = overviewRigProps(20)
    const request = { kind: 'city', nonce: 1 } satisfies NonNullable<SceneProps['cameraRequest']>
    const { rerender } = render(<CameraRig {...props} request={request} />)
    const before = currentView().zoom
    const expanded = props.visibleFloors.map((floor) => ({ ...floor, width: 200, depth: 200 }))
    rerender(<CameraRig {...props} visibleFloors={expanded} request={request} />)
    expect(currentView().zoom).toBeLessThan(before)
  })

  it('does not refit changed footprints after the owner takes over the camera', () => {
    const props = overviewRigProps(20)
    const { rerender } = render(<CameraRig {...props} request={{ kind: 'city', nonce: 1 }} />)
    const request = { kind: 'rotate', direction: 1, nonce: 2 } satisfies NonNullable<
      SceneProps['cameraRequest']
    >
    rerender(<CameraRig {...props} request={request} />)
    controls.zoomTo.mockClear()
    controls.moveTo.mockClear()
    const expanded = props.visibleFloors.map((floor) => ({ ...floor, width: 200, depth: 200 }))
    rerender(<CameraRig {...props} visibleFloors={expanded} request={request} />)
    expect(controls.zoomTo).not.toHaveBeenCalled()
    expect(controls.moveTo).not.toHaveBeenCalled()
  })

  it.each(['reset', 'fit', 'office'] as const)(
    'ignores slab padding initially and on %s',
    (kind) => {
      const compact = overviewRigProps(20)
      const { rerender } = render(<CameraRig {...compact} />)
      const initial = currentView()
      const padded = overviewRigProps(120)
      rerender(<CameraRig {...padded} />)
      expect(currentView().zoom).toBeCloseTo(initial.zoom)
      expect(currentView().target).toEqual(initial.target)
      rerender(
        <CameraRig {...padded} floor={padded.visibleFloors[1]} request={{ kind, nonce: 1 }} />
      )
      expect(currentView().zoom).toBeCloseTo(initial.zoom)
      expect(currentView().target).toEqual(initial.target)
    }
  )

  it('fits occupied rooms across offices with storey and card headroom, not just the focused room', () => {
    const props = overviewRigProps(120)
    render(<CameraRig {...props} />)
    const occupied = occupiedBounds(
      groundEnvelope(props.visibleFloors, props.floor),
      props.liveSessionKeys
    )
    const view = currentView()
    const insets = hudSafeInsets(false)
    const envelope = floorEnvelope(props.visibleFloors)
    for (const x of [occupied.minX, occupied.maxX]) {
      for (const z of [occupied.minZ, occupied.maxZ]) {
        for (const y of [0, envelope?.maxY ?? PHYSICAL_STOREY_HEIGHT]) {
          const point = projectToScreen({ x, y, z }, view, surface.size)
          expect(point.x).toBeGreaterThanOrEqual(insets.left - 0.01)
          expect(point.x).toBeLessThanOrEqual(surface.size.width - insets.right + 0.01)
          expect(point.y).toBeGreaterThanOrEqual(insets.top - 0.01)
          expect(point.y).toBeLessThanOrEqual(surface.size.height - insets.bottom + 0.01)
        }
      }
    }
    const occupiedFit = frameBounds(occupied, surface.size, {
      azimuth: ISO_START_AZIMUTH,
      polar: ISO_POLAR,
      height: envelope?.maxY,
      maxZoom: 60,
      minZoom: 0.1,
      insets
    })
    expect(view.zoom).toBeGreaterThanOrEqual(occupiedFit.zoom * 0.9)
  })

  it('City fits all physical footprints independently of town decoration, retaining manual town zoom-out', () => {
    const props = overviewRigProps(20)
    const { rerender } = render(<CameraRig {...props} request={{ kind: 'city', nonce: 1 }} />)
    const city = currentView()
    const townFit = frameBounds(boundsOfZone(props.scene), surface.size, {
      azimuth: ISO_START_AZIMUTH,
      polar: ISO_POLAR,
      height: props.scene.maxY,
      maxZoom: 8,
      minZoom: 0.1,
      insets: hudSafeInsets(false)
    })
    expect(city.zoom).toBeGreaterThan(townFit.zoom * 1.5)
    expect(controls.minZoom).toBeLessThanOrEqual(townFit.zoom)
    const envelope = floorEnvelope(props.visibleFloors)
    if (!envelope) throw new Error('Physical footprints are required for City')
    const physicalFit = frameBounds(boundsOfZone(envelope), surface.size, {
      azimuth: ISO_START_AZIMUTH,
      polar: ISO_POLAR,
      height: envelope.maxY,
      maxZoom: 8,
      minZoom: 0.1,
      insets: hudSafeInsets(false)
    })
    expect(city.zoom).toBeLessThanOrEqual(physicalFit.zoom)
    const footprints = boundsOfZone(envelope)
    const insets = hudSafeInsets(false)
    for (const x of [footprints.minX, footprints.maxX]) {
      for (const z of [footprints.minZ, footprints.maxZ]) {
        for (const y of [envelope.minY, envelope.maxY]) {
          const point = projectToScreen({ x, y, z }, city, surface.size)
          expect(point.x).toBeGreaterThanOrEqual(insets.left - 0.01)
          expect(point.x).toBeLessThanOrEqual(surface.size.width - insets.right + 0.01)
          expect(point.y).toBeGreaterThanOrEqual(insets.top - 0.01)
          expect(point.y).toBeLessThanOrEqual(surface.size.height - insets.bottom + 0.01)
        }
      }
    }
    rerender(
      <CameraRig
        {...props}
        scene={{ ...props.scene, width: 480, depth: 432 }}
        request={{ kind: 'city', nonce: 2 }}
      />
    )
    expect(currentView()).toEqual(city)
  })
})
