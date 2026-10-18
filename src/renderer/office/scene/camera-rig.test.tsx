import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'react'
import { CameraRig } from './CameraRig'
import { makeAgent, makeFloor, makeRoom, makeZone } from '../__tests__/fixtures'
import { ISO_POLAR, MAX_POLAR, MIN_POLAR, MAX_INSPECTION_ZOOM } from '../logic/camera-bands'
import { WORKSTATIONS } from '../themes/workstations'

type FrameCallback = (state: object, deltaSec: number) => void

const { controls, surface, frames } = vi.hoisted(() => {
  const camera = { zoom: 34 }
  const listeners = new Map<string, Set<() => void>>()
  const root = document.createElement('div')
  root.setAttribute('data-scene-root', '')
  const canvas = document.createElement('canvas')
  const badge = document.createElement('button')
  root.append(canvas, badge)
  document.body.append(root)
  return {
    frames: new Set<{ current: FrameCallback }>(),
    surface: {
      size: { width: 1200, height: 800 },
      gl: { domElement: canvas },
      camera,
      minimumZoom: 3,
      invalidate: vi.fn(),
      badge
    },
    controls: {
      mouseButtons: {} as Record<string, number>,
      touches: {} as Record<string, number>,
      azimuthAngle: 0,
      polarAngle: 0,
      stop: vi.fn(),
      minZoom: 3,
      maxZoom: 240,
      truckSpeed: 2,
      draggingSmoothTime: 0.125,
      moveTo: vi.fn(),
      truck: vi.fn(),
      // Like the library without a transition: the camera has the zoom by the next frame.
      zoomTo: vi.fn((zoom: number) => {
        camera.zoom = zoom
      }),
      rotateTo: vi.fn(),
      getTarget: vi.fn((out: { x: number; y: number; z: number }) => {
        out.x = 100
        out.y = 0.6
        out.z = 50
        return out
      }),
      addEventListener: (type: string, listener: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)?.add(listener)
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners.get(type)?.delete(listener)
      },
      emit: (type: string) => listeners.get(type)?.forEach((listener) => listener())
    }
  }
})
vi.mock('@react-three/fiber', async () => {
  const { useEffect, useRef } = await import('react')
  return {
    useThree: (selector: (state: typeof surface) => object) => selector(surface),
    useFrame: (callback: FrameCallback) => {
      const ref = useRef(callback)
      ref.current = callback
      useEffect(() => {
        frames.add(ref)
        return () => void frames.delete(ref)
      }, [])
    }
  }
})
vi.mock('@react-three/drei', async () => {
  const { useImperativeHandle } = await import('react')
  return {
    CameraControlsImpl: {
      ACTION: {
        TRUCK: 1,
        NONE: 0,
        TOUCH_TRUCK: 2,
        ROTATE: 3,
        TOUCH_ROTATE: 4,
        TOUCH_ZOOM_ROTATE: 5
      }
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
      surface.minimumZoom = minZoom
      controls.maxZoom = maxZoom
      useImperativeHandle(ref, () => controls)
      return null
    }
  }
})

function runFrame(deltaSec = 1 / 60): void {
  for (const frame of frames) frame.current({}, deltaSec)
}

// How far the last immediate camera move shifted the mock target (100, 0.6, 50), in metres along
// screen-right and screen-down at azimuth 0.
function lastShift(): { x: number; y: number } {
  const [x, , z] = controls.moveTo.mock.calls.at(-1) ?? []
  return { x: Number(x) - 100, y: (Number(z) - 50) / Math.cos(ISO_POLAR) }
}

function wheel(target: Element, init: WheelEventInit & { wheelDeltaY?: number }): void {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  if (init.wheelDeltaY !== undefined)
    Object.defineProperty(event, 'wheelDeltaY', { value: init.wheelDeltaY })
  target.dispatchEvent(event)
}

function pointer(target: EventTarget, type: string, at: { x: number; y: number }): void {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: at.x, clientY: at.y })
  Object.defineProperty(event, 'isPrimary', { value: true })
  target.dispatchEvent(event)
}

beforeEach(() => {
  surface.camera.zoom = 34
  surface.size = { width: 1440, height: 900 }
  controls.azimuthAngle = 0
  controls.polarAngle = ISO_POLAR
  vi.clearAllMocks()
})
it('permits the shared hardware-inspection zoom limit', () => {
  render(
    <CameraRig
      floor={makeFloor({ floorId: 'one' })}
      floorCount={1}
      scene={{ width: 40, depth: 40 }}
      agents={[]}
      liveSessionKeys={new Set()}
      request={null}
      isReducedMotion
      onBandChange={vi.fn()}
    />
  )
  expect(controls.maxZoom).toBe(MAX_INSPECTION_ZOOM)
})
afterEach(() => vi.restoreAllMocks())

it('preserves desk zoom when the viewport or project count changes', () => {
  const agent = makeAgent({ agentKey: 'a1' })
  const props = {
    floor: makeFloor({ floorId: 'f1' }),
    floorCount: 1,
    scene: { width: 44, depth: 43 },
    agents: [agent],
    liveSessionKeys: new Set<string>(),
    isReducedMotion: true,
    onBandChange: vi.fn()
  }
  const { rerender } = render(
    <CameraRig {...props} request={{ kind: 'fly', agentKey: agent.agentKey, nonce: 1 }} />
  )
  runFrame()
  expect(props.onBandChange).toHaveBeenLastCalledWith('desk')
  const calls = controls.zoomTo.mock.calls.length
  surface.size = { width: 800, height: 600 }
  rerender(<CameraRig {...props} floorCount={2} request={null} />)
  runFrame()
  expect(props.onBandChange).toHaveBeenLastCalledWith('desk')
  expect(controls.zoomTo).toHaveBeenCalledTimes(calls)
})

const cornerFloor = makeFloor({
  floorId: 'one',
  width: 120,
  depth: 90,
  zones: [
    makeZone({
      id: 'c',
      kind: 'company',
      x: 40,
      z: 30,
      width: 30,
      depth: 20,
      children: [
        makeZone({
          id: 'p',
          kind: 'project',
          x: 45,
          z: 32,
          width: 12,
          depth: 8,
          children: [makeZone({ id: 'o', kind: 'office', sessionKey: 'claude:a', x: 45, z: 32 })]
        })
      ]
    })
  ]
})

function rigProps() {
  return {
    floor: cornerFloor,
    floorCount: 1,
    scene: { width: 44, depth: 43 },
    agents: [],
    liveSessionKeys: new Set(['claude:a']),
    isReducedMotion: true,
    onBandChange: vi.fn(),
    request: null
  }
}

it('frames the occupied project office, not the plate centre, at the floor band', () => {
  render(<CameraRig {...rigProps()} />)
  const [x, , z] = controls.moveTo.mock.calls.at(-1) ?? []
  expect(Math.hypot(Number(x) - 45, Number(z) - 32)).toBeLessThan(12)
})

it('City frames the town extent rather than the occupied office, and Fit returns to work', () => {
  const props = { ...rigProps(), scene: { x: 80, z: -30, width: 180, depth: 140, maxY: 24 } }
  const { rerender } = render(<CameraRig {...props} />)
  const officeZoom = surface.camera.zoom
  rerender(<CameraRig {...props} request={{ kind: 'city', nonce: 1 }} />)
  expect(surface.camera.zoom).toBeLessThan(officeZoom)
  expect(surface.camera.zoom).toBeLessThanOrEqual(8)
  expect(surface.minimumZoom).toBeLessThanOrEqual(surface.camera.zoom)
  const cityTarget = controls.moveTo.mock.calls.at(-1)
  expect(cityTarget?.[2]).toBeLessThan(0)
  surface.size = { width: 900, height: 600 }
  rerender(<CameraRig {...props} request={{ kind: 'city', nonce: 2 }} />)
  expect(surface.minimumZoom).toBeLessThanOrEqual(surface.camera.zoom)
  expect(controls.moveTo.mock.calls.at(-1)?.[2]).toBeLessThan(0)
  const withInspectorZoom = surface.camera.zoom
  rerender(<CameraRig {...props} hasInspector={false} request={{ kind: 'city', nonce: 3 }} />)
  expect(surface.camera.zoom).toBeGreaterThan(withInspectorZoom)
  rerender(<CameraRig {...props} request={{ kind: 'fit', nonce: 4 }} />)
  expect(surface.camera.zoom).toBeGreaterThan(8)
})

it('routes keyboard Fit through the same application action as the button', () => {
  const onFit = vi.fn()
  render(<CameraRig {...rigProps()} onFit={onFit} />)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }))
  expect(onFit).toHaveBeenCalledOnce()
})

it('flies to a company zone when asked, at a zoom that keeps the floor level of detail', () => {
  const props = rigProps()
  const { rerender } = render(<CameraRig {...props} />)
  controls.moveTo.mockClear()
  rerender(<CameraRig {...props} request={{ kind: 'zone', zoneId: 'c', nonce: 2 }} />)
  runFrame()
  expect(controls.moveTo).toHaveBeenCalled()
  expect(props.onBandChange).not.toHaveBeenCalledWith('desk')
})

it('pans 1:1 with left-drag and rotates with right-drag or two fingers', () => {
  render(<CameraRig {...rigProps()} />)
  expect(controls.mouseButtons.left).toBe(1)
  expect(controls.mouseButtons.right).toBe(3)
  expect(controls.touches.one).toBe(2)
  expect(controls.touches.two).toBe(5)
  expect(controls.truckSpeed).toBe(1)
})

it('eases a drag for 50 ms, and not at all under reduced motion', () => {
  const { rerender } = render(<CameraRig {...rigProps()} isReducedMotion={false} />)
  expect(controls.draggingSmoothTime).toBe(0.05)
  rerender(<CameraRig {...rigProps()} isReducedMotion />)
  expect(controls.draggingSmoothTime).toBe(0)
})

function deskProps(roomX: number, hasAgent = true) {
  const agent = makeAgent({ agentKey: 'a1', roomId: 'r1', x: roomX + 1, z: 3 })
  return {
    ...rigProps(),
    floor: makeFloor({ floorId: 'one', rooms: [makeRoom({ id: 'r1', x: roomX, z: 4 })] }),
    agents: hasAgent ? [agent] : [],
    liveSessionKeys: new Set<string>(),
    request: { kind: 'fly' as const, agentKey: 'a1', nonce: 7 }
  }
}

it('at desk zoom keeps the office in view when its room is re-packed, shifting from the current target', () => {
  const first = deskProps(10)
  const { rerender } = render(<CameraRig {...first} />)
  runFrame()
  controls.moveTo.mockClear()
  // The app keeps the same request object between feed frames; only the floor and agents change.
  const stable = { onBandChange: first.onBandChange, request: first.request }
  rerender(<CameraRig {...deskProps(10)} {...stable} />)
  expect(controls.moveTo).not.toHaveBeenCalled()
  rerender(<CameraRig {...deskProps(16)} {...stable} />)
  // The room moved +6 m in x; the user's own pan (target 100, 50) is kept and shifted.
  expect(controls.moveTo).toHaveBeenLastCalledWith(106, 0.6, 50, false)
  expect(first.onBandChange).toHaveBeenLastCalledWith('desk')
})

it('reframes a followed agent once when layout and room position change together', () => {
  const first = deskProps(10)
  const layout = {
    width: 320,
    viewportWidth: 1440,
    viewportHeight: 900,
    topInset: 0,
    isExpanded: false
  }
  const { rerender } = render(<CameraRig {...first} inspectorLayout={layout} />)
  runFrame()
  controls.moveTo.mockClear()
  rerender(
    <CameraRig
      {...deskProps(16)}
      request={first.request}
      onBandChange={first.onBandChange}
      inspectorLayout={{ ...layout, width: 480 }}
    />
  )
  expect(controls.moveTo).toHaveBeenCalledOnce()
})

it('returns to the floor band when the followed agent leaves', () => {
  const first = deskProps(10)
  const { rerender } = render(<CameraRig {...first} />)
  runFrame()
  rerender(
    <CameraRig
      {...deskProps(10, false)}
      onBandChange={first.onBandChange}
      request={first.request}
    />
  )
  runFrame()
  expect(first.onBandChange).toHaveBeenLastCalledWith('floor')
})

describe('the followed agent leaves after the owner moved the camera away', () => {
  function leaveAfter(move: () => void) {
    const first = deskProps(10)
    const { rerender } = render(<CameraRig {...first} />)
    runFrame()
    move()
    controls.moveTo.mockClear()
    controls.zoomTo.mockClear()
    const stable = { onBandChange: first.onBandChange, request: first.request }
    rerender(<CameraRig {...deskProps(10, false)} {...stable} />)
    runFrame()
    return { first, rerender, stable }
  }

  it.each([
    ['a two-finger scroll', () => wheel(surface.gl.domElement, { deltaY: 12, wheelDeltaY: -36 })],
    ['a drag', () => controls.emit('controlstart')]
  ])('leaves the camera where %s put it instead of re-framing the floor', (_name, move) => {
    const { first } = leaveAfter(move)
    expect(controls.zoomTo).not.toHaveBeenCalled()
    expect(controls.moveTo).not.toHaveBeenCalled()
    expect(first.onBandChange).toHaveBeenLastCalledWith('desk')
  })

  it('does not re-arm auto-framing, and stops following the room the agent had', () => {
    const { rerender, stable } = leaveAfter(() => controls.emit('controlstart'))
    surface.size = { width: 1300, height: 900 }
    rerender(<CameraRig {...deskProps(10, false)} {...stable} />)
    expect(controls.moveTo).not.toHaveBeenCalled()
    // The agent is back in a room that has moved: a kept anchor would shift the camera.
    rerender(<CameraRig {...deskProps(16)} {...stable} />)
    expect(controls.moveTo).not.toHaveBeenCalled()
  })
})

describe('continuous zoom', () => {
  it('zooms one notch toward the cursor, even with the cursor over a card badge', () => {
    render(<CameraRig {...rigProps()} />)
    const start = surface.camera.zoom
    controls.zoomTo.mockClear()
    wheel(surface.badge, { deltaY: -100, wheelDeltaY: 120, clientX: 300, clientY: 200 })
    runFrame()
    const next = start * Math.exp(0.18)
    expect(controls.zoomTo).toHaveBeenLastCalledWith(expect.closeTo(next, 6), false)
    // jsdom lays the canvas out at 0×0, so the cursor offset from its centre is the client point.
    const shift = 1 / start - 1 / next
    expect(lastShift().x).toBeCloseTo(300 * shift, 9)
    expect(lastShift().y).toBeCloseTo(200 * shift, 9)
  })

  it('eases toward the goal over several frames unless motion is reduced', () => {
    render(<CameraRig {...rigProps()} isReducedMotion={false} />)
    const start = surface.camera.zoom
    wheel(surface.gl.domElement, { deltaY: -100, wheelDeltaY: 120 })
    runFrame()
    expect(surface.camera.zoom).toBeGreaterThan(start)
    expect(surface.camera.zoom).toBeLessThan(start * Math.exp(0.18))
    for (let index = 0; index < 120; index += 1) runFrame()
    expect(surface.camera.zoom).toBeCloseTo(start * Math.exp(0.18), 9)
  })

  it('zooms a pinch by e^0.01 per pixel and comes back exactly', () => {
    render(<CameraRig {...rigProps()} />)
    const start = surface.camera.zoom
    for (let index = 0; index < 30; index += 1) wheel(surface.badge, { deltaY: -1, ctrlKey: true })
    runFrame()
    expect(surface.camera.zoom).toBeCloseTo(start * Math.exp(0.3), 9)
    for (let index = 0; index < 30; index += 1) wheel(surface.badge, { deltaY: 1, ctrlKey: true })
    runFrame()
    expect(surface.camera.zoom).toBeCloseTo(start, 9)
  })

  it('stops at the zoom limits', () => {
    render(<CameraRig {...rigProps()} />)
    for (let index = 0; index < 40; index += 1)
      wheel(surface.badge, { deltaY: -100, wheelDeltaY: 120 })
    runFrame()
    expect(surface.camera.zoom).toBe(controls.maxZoom)
  })

  it('zooms 1.25 about the screen centre for the zoom keys', () => {
    const props = rigProps()
    const { rerender } = render(<CameraRig {...props} />)
    const start = surface.camera.zoom
    rerender(<CameraRig {...props} request={{ kind: 'zoom', direction: 'in', nonce: 3 }} />)
    runFrame()
    expect(surface.camera.zoom).toBeCloseTo(start * 1.25, 9)
    expect(lastShift().x).toBeCloseTo(0, 9)
    expect(lastShift().y).toBeCloseTo(0, 9)
    rerender(<CameraRig {...props} request={{ kind: 'zoom', direction: 'out', nonce: 4 }} />)
    runFrame()
    expect(surface.camera.zoom).toBeCloseTo(start, 9)
  })

  it('tells the scene when the zoom crosses into the desk and building levels of detail', () => {
    const props = rigProps()
    render(<CameraRig {...props} />)
    surface.camera.zoom = 60
    runFrame()
    expect(props.onBandChange).toHaveBeenLastCalledWith('desk')
    surface.camera.zoom = 4
    runFrame()
    expect(props.onBandChange).toHaveBeenLastCalledWith('building')
  })
})

describe('pan', () => {
  it('pans 1:1 on a trackpad two-finger scroll and leaves the zoom alone', () => {
    render(<CameraRig {...rigProps()} />)
    const zoom = surface.camera.zoom
    controls.zoomTo.mockClear()
    wheel(surface.gl.domElement, { deltaX: 30, deltaY: 60, wheelDeltaY: -180 })
    expect(lastShift().x).toBeCloseTo(30 / zoom, 9)
    expect(lastShift().y).toBeCloseTo(60 / zoom, 9)
    runFrame()
    expect(controls.zoomTo).not.toHaveBeenCalled()
  })

  it('pans 120 px with the arrow keys, but not while typing in a field', () => {
    render(<CameraRig {...rigProps()} />)
    const zoom = surface.camera.zoom
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(lastShift().x).toBeCloseTo(120 / zoom, 9)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(lastShift().y).toBeCloseTo(-120 / zoom, 9)

    controls.moveTo.mockClear()
    const field = document.createElement('input')
    document.body.append(field)
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    field.remove()
    expect(controls.moveTo).not.toHaveBeenCalled()
  })

  it('leaves the arrow keys to a panel that scrolls when focus is inside it', () => {
    render(<CameraRig {...rigProps()} />)
    const panel = document.createElement('div')
    panel.style.overflowY = 'auto'
    Object.defineProperty(panel, 'scrollHeight', { value: 900 })
    Object.defineProperty(panel, 'clientHeight', { value: 300 })
    const row = document.createElement('button')
    panel.append(row)
    document.body.append(panel)
    controls.moveTo.mockClear()
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true
    })
    row.dispatchEvent(event)
    panel.remove()
    expect(controls.moveTo).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('glides an arrow-key pan when motion is allowed', () => {
    render(<CameraRig {...rigProps()} isReducedMotion={false} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(controls.truck).toHaveBeenLastCalledWith(0, 120 / surface.camera.zoom, true)
  })

  function flick(pixelsPerFrame: number): void {
    const canvas = surface.gl.domElement
    let nowMs = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
    pointer(canvas, 'pointerdown', { x: 400, y: 300 })
    for (let step = 1; step <= 8; step += 1) {
      nowMs += 16
      pointer(window, 'pointermove', { x: 400 + step * pixelsPerFrame, y: 300 })
    }
    nowMs += 8
    pointer(window, 'pointerup', { x: 400 + 8 * pixelsPerFrame, y: 300 })
  }

  function coasts(): boolean {
    controls.moveTo.mockClear()
    runFrame()
    return controls.moveTo.mock.calls.length > 0
  }

  it('coasts after a fast release, in the direction of the hand', () => {
    render(<CameraRig {...rigProps()} isReducedMotion={false} />)
    flick(16)
    expect(coasts()).toBe(true)
    // The scene follows the hand to the right, so the camera moves left.
    expect(lastShift().x).toBeLessThan(0)
    expect(lastShift().y).toBeCloseTo(0, 9)
  })

  it('does not coast after a slow release, under reduced motion, or once a key is pressed', () => {
    const props = { ...rigProps(), isReducedMotion: false }
    const { rerender } = render(<CameraRig {...props} />)
    flick(2)
    expect(coasts()).toBe(false)

    flick(16)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
    expect(coasts()).toBe(false)

    rerender(<CameraRig {...props} isReducedMotion />)
    flick(16)
    expect(coasts()).toBe(false)
  })
})

describe('auto-framing', () => {
  it("interrupts an animated preset at the live pose, not stop()'s end pose", () => {
    const props = { ...rigProps(), isReducedMotion: false }
    const { rerender } = render(<CameraRig {...props} />)
    const zoom = surface.camera.zoom
    controls.polarAngle = MIN_POLAR
    controls.stop.mockImplementationOnce(() => {
      surface.camera.zoom = 7
      controls.polarAngle = MAX_POLAR
    })
    rerender(<CameraRig {...props} request={{ kind: 'rotate', direction: 1, nonce: 1 }} />)
    expect(surface.camera.zoom).toBe(zoom)
    expect(controls.rotateTo).toHaveBeenLastCalledWith(expect.any(Number), MIN_POLAR, true)
  })

  it('frames a reserved workstation and translates a room repack exactly once until manual input', () => {
    const first = deskProps(10)
    const seat = { slotId: 'desk_main', x: 11, z: 3, heading: 0.4 }
    const agent = { ...first.agents[0], slotId: seat.slotId, x: 200, z: 200 }
    const floor = makeFloor({
      floorId: 'one',
      rooms: [makeRoom({ id: agent.roomId, x: 10, seats: [seat] })]
    })
    const request = { kind: 'workstation' as const, agentKey: agent.agentKey, nonce: 1 }
    const props = { ...first, floor, agents: [agent], workstation: WORKSTATIONS.samurai, request }
    const { rerender } = render(<CameraRig {...props} />)
    runFrame()
    expect(controls.rotateTo).toHaveBeenLastCalledWith(
      expect.closeTo(seat.heading - Math.PI + Math.PI / 4),
      ISO_POLAR,
      false
    )
    expect(Number(controls.moveTo.mock.calls.at(-1)?.[0])).toBeLessThan(40)
    controls.moveTo.mockClear()
    const movedFloor = {
      ...floor,
      rooms: [makeRoom({ id: agent.roomId, x: 16, seats: [{ ...seat, x: 17 }] })]
    }
    rerender(<CameraRig {...props} floor={movedFloor} />)
    expect(controls.moveTo).toHaveBeenCalledOnce()
    expect(controls.moveTo).toHaveBeenLastCalledWith(106, 0.6, 50, false)
    controls.emit('controlstart')
    controls.moveTo.mockClear()
    surface.size = { width: 1100, height: 700 }
    rerender(<CameraRig {...props} floor={movedFloor} />)
    expect(controls.moveTo).not.toHaveBeenCalled()
  })

  it('releases desk follow and stops the transition on manual yaw, preserving pitch through resize and repack', () => {
    const first = deskProps(10)
    const { rerender } = render(<CameraRig {...first} />)
    runFrame()
    controls.polarAngle = MIN_POLAR
    const request = { kind: 'rotate' as const, direction: 1 as const, nonce: 8 }
    rerender(<CameraRig {...first} request={request} />)
    expect(controls.stop).toHaveBeenCalled()
    expect(controls.rotateTo).toHaveBeenLastCalledWith(expect.any(Number), MIN_POLAR, false)
    controls.moveTo.mockClear()
    controls.zoomTo.mockClear()
    surface.size = { width: 1000, height: 700 }
    rerender(<CameraRig {...deskProps(16)} request={request} />)
    expect(controls.moveTo).not.toHaveBeenCalled()
    expect(controls.zoomTo).not.toHaveBeenCalled()
  })

  it('bounds PageDown tilt and restores Office reference only on command', () => {
    const props = rigProps()
    const { rerender } = render(<CameraRig {...props} />)
    controls.polarAngle = MAX_POLAR
    rerender(<CameraRig {...props} request={{ kind: 'tilt', direction: -1, nonce: 1 }} />)
    expect(controls.rotateTo).toHaveBeenLastCalledWith(0, MAX_POLAR, false)
    rerender(<CameraRig {...props} request={{ kind: 'office', nonce: 2 }} />)
    expect(controls.rotateTo).toHaveBeenLastCalledWith(Math.PI / 4, ISO_POLAR, false)
  })

  it('re-frames on a resize until the owner moves the camera, and again after Fit (0)', () => {
    const props = rigProps()
    const { rerender } = render(<CameraRig {...props} />)
    const resize = (width: number): void => {
      controls.moveTo.mockClear()
      surface.size = { width, height: 900 }
      rerender(<CameraRig {...props} />)
    }
    resize(1400)
    expect(controls.moveTo).toHaveBeenCalled()

    wheel(surface.gl.domElement, { deltaX: 0, deltaY: 12, wheelDeltaY: -36 })
    resize(1380)
    expect(controls.moveTo).not.toHaveBeenCalled()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }))
    expect(controls.moveTo).toHaveBeenCalled()
    resize(1360)
    expect(controls.moveTo).toHaveBeenCalled()
  })

  it('stops re-framing once the owner drags the map', () => {
    const props = rigProps()
    const { rerender } = render(<CameraRig {...props} />)
    controls.emit('controlstart')
    controls.moveTo.mockClear()
    surface.size = { width: 1300, height: 900 }
    rerender(<CameraRig {...props} liveSessionKeys={new Set<string>()} />)
    expect(controls.moveTo).not.toHaveBeenCalled()
  })
})
