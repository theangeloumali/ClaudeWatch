import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { officePoses } from '../../../office-live/pose-store'
import { Minimap, type MinimapProps } from '../../hud/Minimap'
import { makeFrame } from '../fixtures'
import {
  LEAD_KEY,
  makeMinimapFrame,
  NORTH_FLOOR_ID,
  ROOM_ID,
  UPPER_FLOOR_ID
} from './minimap-fixtures'

function renderMinimap(overrides: Partial<MinimapProps> = {}) {
  const props = {
    frame: makeMinimapFrame(),
    focusedFloorId: NORTH_FLOOR_ID,
    focusedRoomId: null,
    selectedAgentKey: null,
    viewMode: 'city',
    isNarrow: false,
    isPreview: false,
    onChooseFloor: vi.fn<(floorId: string | null) => void>(),
    onChooseRoom: vi.fn<(roomId: string) => void>(),
    onChooseWorker: vi.fn<(agentKey: string) => void>(),
    ...overrides
  } satisfies MinimapProps
  return { ...render(<Minimap {...props} />), props }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Minimap navigation', () => {
  it('starts expanded on desktop and describes a north-up focus, not a camera viewport', () => {
    renderMinimap()
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    const toggle = within(minimap).getByRole('button', { name: /collapse minimap/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls')
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toBeInTheDocument()
    const map = within(minimap).getByRole('img', { name: /north-up/i })
    expect(map.tagName.toLowerCase()).toBe('svg')
    expect(map).toHaveAccessibleDescription(/focus.*not.*(camera|viewport)/i)
    // World x/z map directly to SVG x/y; negative z stays north/up.
    expect(map).toHaveAttribute('viewBox', '90 -50 60 80')
  })

  it('starts collapsed on narrow screens and exposes a native, focusable disclosure', () => {
    const { container } = renderMinimap({ isNarrow: true })
    const toggle = screen.getByRole('button', { name: /expand minimap/i })
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('img', { name: /north-up/i })).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
    toggle.focus()
    expect(toggle).toHaveFocus()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('img', { name: /north-up/i })).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('routes overlapping footprints and associated native floor buttons to exact floor IDs', () => {
    const { props } = renderMinimap({ focusedFloorId: UPPER_FLOOR_ID })
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    const upper = within(minimap).getByRole('button', { name: /North studio · Floor 2/i })
    const lower = within(minimap).getByRole('button', { name: /North studio · Floor 1/i })
    expect(upper.tagName).toBe('BUTTON')
    expect(lower.tagName).toBe('BUTTON')
    expect(upper).toHaveAttribute('aria-current', 'true')
    upper.focus()
    expect(upper).toHaveFocus()
    fireEvent.click(upper)
    fireEvent.click(lower)
    const footprint = minimap.querySelector(`button[data-floor-id="${UPPER_FLOOR_ID}"]`)
    if (!footprint) throw new Error('The city map needs a footprint for each physical floor')
    expect(footprint).toHaveStyle({ position: 'absolute' })
    expect(footprint).toHaveAttribute('type', 'button')
    fireEvent.click(footprint)
    expect(props.onChooseFloor).toHaveBeenCalledTimes(3)
    expect(props.onChooseFloor).toHaveBeenNthCalledWith(1, UPPER_FLOOR_ID)
    expect(props.onChooseFloor).toHaveBeenNthCalledWith(2, NORTH_FLOOR_ID)
    expect(props.onChooseFloor).toHaveBeenNthCalledWith(3, UPPER_FLOOR_ID)
    expect(props.onChooseRoom).not.toHaveBeenCalled()
    expect(props.onChooseWorker).not.toHaveBeenCalled()
    fireEvent.change(within(minimap).getByRole('combobox', { name: /minimap floor/i }), {
      target: { value: NORTH_FLOOR_ID }
    })
    expect(props.onChooseFloor).toHaveBeenNthCalledWith(4, NORTH_FLOOR_ID)
  })

  it('returns to City using the nullable floor callback only', () => {
    const { props } = renderMinimap({ viewMode: 'office' })
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    fireEvent.click(within(minimap).getByRole('button', { name: /^all offices$/i }))
    expect(props.onChooseFloor).toHaveBeenCalledTimes(1)
    expect(props.onChooseFloor).toHaveBeenCalledWith(null)
    expect(props.onChooseRoom).not.toHaveBeenCalled()
    expect(props.onChooseWorker).not.toHaveBeenCalled()
  })

  it('routes a room footprint and its native control to the existing zone ID', () => {
    const { props } = renderMinimap({ viewMode: 'office', focusedRoomId: ROOM_ID })
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    const room = within(minimap).getByRole('button', { name: /Research bay/i })
    expect(room.tagName).toBe('BUTTON')
    expect(room).toHaveAttribute('aria-current', 'true')
    fireEvent.click(room)
    const footprint = minimap.querySelector(`button[data-room-id="${ROOM_ID}"]`)
    if (!footprint) throw new Error('The office map needs an exact room footprint')
    expect(footprint).toHaveStyle({ position: 'absolute', left: '70%', top: '30%' })
    expect(footprint).toHaveAttribute('type', 'button')
    fireEvent.click(footprint)
    expect(props.onChooseRoom).toHaveBeenCalledTimes(2)
    expect(props.onChooseRoom).toHaveBeenNthCalledWith(1, ROOM_ID)
    expect(props.onChooseRoom).toHaveBeenNthCalledWith(2, ROOM_ID)
    expect(props.onChooseFloor).not.toHaveBeenCalled()
    expect(props.onChooseWorker).not.toHaveBeenCalled()
  })

  it('provides a full-size work-area chooser when dense map hit targets overlap', () => {
    const { props } = renderMinimap({ viewMode: 'office' })
    const chooser = screen.getByRole('combobox', { name: 'Minimap work area' })
    fireEvent.change(chooser, { target: { value: ROOM_ID } })
    expect(props.onChooseRoom).toHaveBeenCalledExactlyOnceWith(ROOM_ID)
    expect(props.onChooseWorker).not.toHaveBeenCalled()
  })

  it('provides an equivalent full-size worker chooser for small spatial markers', () => {
    const { props } = renderMinimap({ viewMode: 'office' })
    const chooser = screen.getByRole('combobox', { name: 'Minimap worker' })
    fireEvent.change(chooser, { target: { value: LEAD_KEY } })
    expect(props.onChooseWorker).toHaveBeenCalledExactlyOnceWith(LEAD_KEY)
    expect(props.onChooseRoom).not.toHaveBeenCalled()
  })

  it('renders a current worker at actual world x/z and provides native selection', () => {
    const { props } = renderMinimap({ viewMode: 'office', selectedAgentKey: LEAD_KEY })
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    const worker = within(minimap).getByRole('button', { name: /Maya/i })
    expect(worker.tagName).toBe('BUTTON')
    expect(worker).toHaveAttribute('aria-current', 'true')
    const map = within(minimap).getByRole('img', { name: /north-up/i })
    const dot = map.querySelector(`circle[data-agent-key="${LEAD_KEY}"]`)
    expect(dot).toHaveAttribute('cx', '102')
    expect(dot).toHaveAttribute('cy', '-42')
    expect(map.querySelectorAll('circle[data-agent-key]')).toHaveLength(1)
    fireEvent.click(worker)
    const target = minimap.querySelector(`button[data-worker-key="${LEAD_KEY}"]`)
    if (!target) throw new Error('The worker dot needs a native map target')
    expect(target).toHaveStyle({ position: 'absolute', left: '60%', top: '40%' })
    fireEvent.click(target)
    expect(props.onChooseWorker).toHaveBeenCalledTimes(2)
    expect(props.onChooseWorker).toHaveBeenNthCalledWith(1, LEAD_KEY)
    expect(props.onChooseWorker).toHaveBeenNthCalledWith(2, LEAD_KEY)
    expect(props.onChooseFloor).not.toHaveBeenCalled()
    expect(props.onChooseRoom).not.toHaveBeenCalled()
  })

  it('suppresses all live actor controls and dots during a supplied layout preview', () => {
    const { container } = renderMinimap({
      viewMode: 'office',
      isPreview: true,
      player: { x: 101, z: -40, physicalFloorId: NORTH_FLOOR_ID }
    })
    expect(screen.getByRole('button', { name: /Research bay/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Maya/i })).not.toBeInTheDocument()
    expect(container.querySelectorAll('circle[data-agent-key], circle[data-player]')).toHaveLength(
      0
    )
    expect(screen.getByRole('region', { name: 'Minimap' })).toHaveTextContent(/preview/i)
  })

  it('updates an owner dot only from supplied snapshot rerenders without starting loops', () => {
    const requestFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    const scheduleInterval = vi.spyOn(globalThis, 'setInterval')
    const scheduleTimeout = vi.spyOn(globalThis, 'setTimeout')
    const { container, props, rerender } = renderMinimap({
      viewMode: 'office',
      player: { x: 101, z: -40, physicalFloorId: NORTH_FLOOR_ID }
    })
    expect(container.querySelector('circle[data-player]')).toHaveAttribute('cx', '101')
    rerender(<Minimap {...props} player={{ x: 107, z: -45, physicalFloorId: NORTH_FLOOR_ID }} />)
    expect(container.querySelector('circle[data-player]')).toHaveAttribute('cx', '107')
    expect(container.querySelector('circle[data-player]')).toHaveAttribute('cy', '-45')
    expect(requestFrame).not.toHaveBeenCalled()
    expect(scheduleInterval).not.toHaveBeenCalled()
    expect(scheduleTimeout).not.toHaveBeenCalled()
  })

  it('a re-render with nothing new reuses the map model', () => {
    const { props, rerender } = renderMinimap()
    const reads = vi.spyOn(officePoses, 'read')
    rerender(<Minimap {...props} onChooseRoom={vi.fn()} />)
    expect(reads).not.toHaveBeenCalled()
    officePoses.write(LEAD_KEY, { x: 107, z: -45, heading: 0, elevation: 0 })
    rerender(<Minimap {...props} />)
    expect(reads).toHaveBeenCalled()
  })

  it('handles empty geometry without serializing non-finite SVG coordinates', () => {
    const { container } = renderMinimap({ frame: makeFrame() })
    expect(screen.getByRole('region', { name: 'Minimap' })).toHaveTextContent(/no.*(map|geometry)/i)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })

  it('retains full accessible long labels and does not introduce inline hex paints', () => {
    const frame = makeMinimapFrame()
    const label = `研究室 ${'UnbrokenOfficeName'.repeat(20)} 🧭`
    frame.floors[0].label = label
    const { container } = renderMinimap({ frame })
    expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    for (const painted of container.querySelectorAll('svg [fill], svg [stroke]')) {
      expect(painted.getAttribute('fill') ?? '').not.toMatch(/^#[\da-f]{3,8}$/i)
      expect(painted.getAttribute('stroke') ?? '').not.toMatch(/^#[\da-f]{3,8}$/i)
    }
  })

  it('preserves map aspect and labels disconnected positions as last-known, never fresh activity', () => {
    const frame = { ...makeMinimapFrame(), connected: false }
    renderMinimap({ frame })
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    expect(minimap).toHaveTextContent(/disconnected.*last-known/i)
    expect(minimap).not.toHaveTextContent(/confirmed working|fresh activity/i)
    expect(within(minimap).getByRole('img', { name: /north-up/i })).toHaveAttribute(
      'preserveAspectRatio',
      'xMidYMid meet'
    )
    expect(minimap.querySelectorAll('button[data-worker-key]')).toHaveLength(3)
    expect(within(minimap).queryByRole('list')).not.toBeInTheDocument()
  })

  it('uses truthful IDs as accessible labels when supplied display names are empty', () => {
    const frame = makeMinimapFrame()
    frame.floors[0].label = ' '
    frame.sessions[0].name = ' '
    renderMinimap({ frame })
    expect(
      screen.getByRole('button', { name: `Open office ${NORTH_FLOOR_ID} on minimap` })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `Inspect worker ${LEAD_KEY} on minimap` })
    ).toBeInTheDocument()
  })

  it('uses the narrow collapsed default when crossing the supplied responsive breakpoint', () => {
    const { container, props, rerender } = renderMinimap()
    expect(container.querySelector('svg')).not.toBeNull()
    rerender(<Minimap {...props} isNarrow />)
    expect(screen.getByRole('button', { name: /expand minimap/i })).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })
})
