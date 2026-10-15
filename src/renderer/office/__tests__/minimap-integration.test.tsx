import { act, fireEvent, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import type OfficeScene from '../scene/OfficeScene'
import {
  createOfficeHarness,
  installInspectorTestEnvironment
} from './inspector-panel/office-harness'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from './fixtures'

type SceneProps = ComponentProps<typeof OfficeScene>
const { observeScene } = vi.hoisted(() => ({ observeScene: vi.fn<(props: SceneProps) => void>() }))

vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../scene/OfficeScene', () => ({
  default: (props: SceneProps) => {
    observeScene(props)
    return <output aria-label="Map integration scene">Scene mounted</output>
  }
}))

installInspectorTestEnvironment()
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

function navigationFrame() {
  const floors = ['West', 'East'].map((label, index) => {
    const room = makeRoom({
      id: `room-${label}`,
      label: `${label} work area`,
      sessionKey: `opencode:${label}`,
      x: index * 40
    })
    return makeFloor({
      floorId: `floor-${label}`,
      label: `${label} Office`,
      x: index * 40,
      rooms: [room],
      zones: [makeZone({ ...room, kind: 'office', children: [] })]
    })
  })
  return makeFrame({
    floors,
    sessions: floors.map((floor, index) =>
      makeSession({
        key: `opencode:${index === 0 ? 'West' : 'East'}`,
        provider: 'opencode',
        name: floor.label
      })
    ),
    agents: floors.map((floor) =>
      makeAgent({
        agentKey: floor.rooms[0].sessionKey ?? '',
        provider: 'opencode',
        floorId: floor.floorId,
        physicalFloorId: floor.floorId,
        roomId: floor.rooms[0].id,
        x: floor.x
      })
    )
  })
}

function currentScene(): SceneProps {
  const latest = observeScene.mock.calls.at(-1)?.[0]
  if (!latest) throw new Error('Office scene has not rendered')
  return latest
}

function chooseEastOffice(map: HTMLElement): void {
  const office = map.querySelector('button[data-floor-id="floor-East"]')
  if (!office) throw new Error('East Office needs a native minimap footprint')
  expect(office).toHaveAccessibleName('Open office East Office on minimap')
  fireEvent.click(office)
}

it('navigates from the minimap explicitly and preserves manual camera ownership on new frames', async () => {
  const frame = navigationFrame()
  const harness = createOfficeHarness(frame)
  await screen.findByLabelText('Map integration scene')
  fireEvent.click(screen.getByRole('button', { name: 'City' }))
  const map = screen.getByRole('region', { name: 'Minimap' })
  chooseEastOffice(map)
  expect(currentScene()).toMatchObject({ focusedFloorId: 'floor-East', viewMode: 'office' })
  fireEvent.click(within(map).getByRole('button', { name: /East work area/ }))
  expect(currentScene().cameraRequest).toMatchObject({ kind: 'zone', zoneId: 'room-East' })
  act(() => currentScene().onManualCameraMove?.())
  const ownedRequest = currentScene().cameraRequest
  harness.push({ ...frame, agents: frame.agents.map((agent) => ({ ...agent, x: agent.x + 1 })) })
  expect(currentScene().isCameraManuallyOwned).toBe(true)
  expect(currentScene().cameraRequest).toBe(ownedRequest)
})

it('keeps List fallback active when the minimap selects another office', async () => {
  createOfficeHarness(navigationFrame())
  await screen.findByLabelText('Map integration scene')
  fireEvent.click(screen.getByRole('button', { name: 'City' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'List' })[0])
  expect(screen.getByRole('table')).toBeInTheDocument()
  chooseEastOffice(screen.getByRole('region', { name: 'Minimap' }))
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(screen.queryByLabelText('Map integration scene')).not.toBeInTheDocument()
})

it('does not globally disable camera shortcuts when the minimap is open', async () => {
  createOfficeHarness(navigationFrame())
  await screen.findByLabelText('Map integration scene')
  expect(screen.getByRole('region', { name: 'Minimap' })).toBeInTheDocument()
  fireEvent.keyDown(document.body, { key: 'q' })
  expect(currentScene().cameraRequest).toMatchObject({ kind: 'rotate', direction: -1 })
})
