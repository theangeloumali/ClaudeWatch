import { describe, expect, it } from 'vitest'
import { OrthographicCamera, Vector3 } from 'three'
import {
  buildingFraming,
  ISO_POLAR,
  ISO_START_AZIMUTH,
  MAX_POLAR,
  MIN_POLAR,
  nearestAzimuth,
  tiltPolar
} from '../../logic/camera-bands'
import { commandForKey } from '../../logic/hotkeys'
import { INITIAL_OFFICE_STATE, officeReducer } from '../../logic/office-reducer'
import { workstationFraming, workstationSeat } from '../../logic/workstation-framing'
import { frameBounds, projectToScreen, screenAxes } from '../../logic/zone-framing'
import { anchorTruck } from '../../logic/zoom-anchor'
import { followStep as playerFollowStep } from '../../player/camera-follow'
import { WORKSTATIONS, workstationPlacement } from '../../themes/workstations'
import { makeAgent, makeFloor, makeFrame, makeRoom } from '../fixtures'

const viewport = { width: 1440, height: 900 }
const insets = { left: 300, right: 480, top: 100, bottom: 120 }
const bounds = { minX: -24, maxX: 18, minZ: -12, maxZ: 30 }

it('frames a readable physical display rather than retaining the distant agent zoom cap', () => {
  const seat = { slotId: 'desk_main', x: 0, z: 0, heading: 0 }
  const screen = workstationPlacement(seat, WORKSTATIONS.corporate)
  const view = workstationFraming(seat, { spec: WORKSTATIONS.corporate, viewport, insets })
  const projectedWidth = screen.width * Math.SQRT1_2 * view.zoom
  expect(projectedWidth).toBeGreaterThan(60)
})

describe('bounded orbit projection', () => {
  it('returns to a reference without unwinding completed orbit turns', () => {
    for (const azimuth of [-20, 0, 17, 50]) {
      const nearest = nearestAzimuth(azimuth, ISO_START_AZIMUTH)
      expect(Math.abs(nearest - azimuth)).toBeLessThanOrEqual(Math.PI)
      expect(Math.cos(nearest - ISO_START_AZIMUTH)).toBeCloseTo(1)
    }
  })
  it('tilts between 20 and 70 degrees of elevation', () => {
    expect(MIN_POLAR).toBeCloseTo((20 * Math.PI) / 180)
    expect(MAX_POLAR).toBeCloseTo((70 * Math.PI) / 180)
    expect(tiltPolar(MIN_POLAR, 1)).toBe(MIN_POLAR)
    expect(tiltPolar(MAX_POLAR, -1)).toBe(MAX_POLAR)
    expect(tiltPolar(ISO_POLAR, 1)).toBeLessThan(ISO_POLAR)
  })

  it.each([MIN_POLAR, ISO_POLAR, MAX_POLAR])(
    'matches Three projection and cursor anchoring at polar %s',
    (polar) => {
      for (const azimuth of [-2.7, 0.31, ISO_START_AZIMUTH, 4.8]) {
        const view = {
          target: [2, 0.8, -3] satisfies [number, number, number],
          zoom: 42,
          azimuth,
          polar
        }
        const camera = new OrthographicCamera(
          -viewport.width / 2,
          viewport.width / 2,
          viewport.height / 2,
          -viewport.height / 2,
          0.1,
          1000
        )
        camera.zoom = view.zoom
        camera.position.set(
          2 + 100 * Math.sin(polar) * Math.sin(azimuth),
          0.8 + 100 * Math.cos(polar),
          -3 + 100 * Math.sin(polar) * Math.cos(azimuth)
        )
        camera.lookAt(...view.target)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
        const point = { x: 7, y: 1.4, z: 4 }
        const projected = new Vector3(point.x, point.y, point.z).project(camera)
        const before = projectToScreen(point, view, viewport)
        expect(before.x).toBeCloseTo(((projected.x + 1) * viewport.width) / 2, 7)
        expect(before.y).toBeCloseTo(((1 - projected.y) * viewport.height) / 2, 7)
        const shift = anchorTruck(
          { x: before.x - viewport.width / 2, y: before.y - viewport.height / 2 },
          view.zoom,
          63
        )
        const axes = screenAxes(azimuth, polar)
        const target: [number, number, number] = [
          view.target[0] + axes.right[0] * shift.x - axes.up[0] * shift.y,
          view.target[1] + axes.right[1] * shift.x - axes.up[1] * shift.y,
          view.target[2] + axes.right[2] * shift.x - axes.up[2] * shift.y
        ]
        const after = projectToScreen(point, { ...view, target, zoom: 63 }, viewport)
        expect(after.x).toBeCloseTo(before.x, 7)
        expect(after.y).toBeCloseTo(before.y, 7)
      }
    }
  )

  it.each([MIN_POLAR, ISO_POLAR, MAX_POLAR])(
    'fits every corner inside the resized Inspector safe area at polar %s',
    (polar) => {
      for (const azimuth of [-1.9, 0.3, 2.9]) {
        const view = {
          ...frameBounds(bounds, viewport, { azimuth, polar, insets, minZoom: 0.1 }),
          azimuth,
          polar
        }
        for (const x of [bounds.minX, bounds.maxX])
          for (const z of [bounds.minZ, bounds.maxZ])
            for (const y of [0, 2.6]) {
              const pixel = projectToScreen({ x, y, z }, view, viewport)
              expect(pixel.x).toBeGreaterThanOrEqual(insets.left - 0.001)
              expect(pixel.x).toBeLessThanOrEqual(viewport.width - insets.right + 0.001)
              expect(pixel.y).toBeGreaterThanOrEqual(insets.top - 0.001)
              expect(pixel.y).toBeLessThanOrEqual(viewport.height - insets.bottom + 0.001)
            }
      }
    }
  )

  it('preserves legacy ISO defaults', () => {
    expect(screenAxes(0.8)).toEqual(screenAxes(0.8, ISO_POLAR))
    expect(frameBounds(bounds, viewport, { azimuth: 0.8 })).toEqual(
      frameBounds(bounds, viewport, { azimuth: 0.8, polar: ISO_POLAR })
    )
    const scene = { width: 44, depth: 30 }
    expect(buildingFraming(scene, 3, viewport)).toEqual(
      buildingFraming(scene, 3, viewport, { azimuth: ISO_START_AZIMUTH, polar: ISO_POLAR })
    )
    expect(
      buildingFraming(scene, 3, viewport, { azimuth: 0, polar: MAX_POLAR }).projectedWidth
    ).toBe(44)
  })
})

describe('Workstation is a command, not a lock', () => {
  const seat = { slotId: 'desk_main', x: 20, z: -12, heading: 0.7 }
  const agent = makeAgent({ agentKey: 'selected', slotId: seat.slotId, x: 100, z: 100 })
  const floor = makeFloor({ floorId: 'f1', rooms: [makeRoom({ id: agent.roomId, seats: [seat] })] })

  it('uses the room seat even while the agent walks or lounges', () => {
    expect(workstationSeat(agent, floor)).toBe(seat)
    expect(workstationSeat({ ...agent, place: 'lounge' }, floor)).toBe(seat)
    expect(workstationSeat({ ...agent, slotId: 'missing' }, floor)).toBeNull()
  })

  it.each(Object.values(WORKSTATIONS))(
    'views the authored screen front at a three-quarter yaw',
    (spec) => {
      const view = workstationFraming(seat, { spec, viewport, insets })
      const screen = workstationPlacement(seat, spec)
      expect(Math.cos(view.azimuth - screen.rotationY)).toBeCloseTo(Math.SQRT1_2)
      expect(view.polar).toBe(ISO_POLAR)
      const pixel = projectToScreen(screen, view, viewport)
      expect(pixel.x).toBeGreaterThan(insets.left)
      expect(pixel.x).toBeLessThan(viewport.width - insets.right)
      expect(pixel.y).toBeGreaterThan(insets.top)
      expect(pixel.y).toBeLessThan(viewport.height - insets.bottom)
    }
  )

  it('safely no-ops without a selected seat and issues repeatable commands with one', () => {
    expect(officeReducer(INITIAL_OFFICE_STATE, { type: 'camera-workstation' })).toBe(
      INITIAL_OFFICE_STATE
    )
    const initial = {
      ...INITIAL_OFFICE_STATE,
      frame: makeFrame({ floors: [floor], agents: [agent] }),
      selectedAgentKey: agent.agentKey,
      isCameraManuallyOwned: true
    }
    const preset = officeReducer(initial, { type: 'camera-workstation' })
    expect(preset.cameraRequest).toMatchObject({ kind: 'workstation', agentKey: agent.agentKey })
    expect(preset.isCameraManuallyOwned).toBe(false)
    expect(
      officeReducer(preset, { type: 'camera-workstation' }).cameraRequest?.nonce
    ).toBeGreaterThan(preset.cameraRequest?.nonce ?? 0)
    const manual = officeReducer(preset, { type: 'camera-manually-moved' })
    const received = officeReducer(manual, { type: 'frame-received', frame: initial.frame })
    expect(received.isCameraManuallyOwned).toBe(true)
    expect(received.cameraRequest).toBe(manual.cameraRequest)
    expect(officeReducer(received, { type: 'camera-fit' }).isCameraManuallyOwned).toBe(false)
  })

  it('gives PageUp/Down tilt commands without taking editable, modal or scroller keys', () => {
    const input = {
      key: 'PageUp',
      hasModifier: false,
      isTargetEditable: false,
      isTargetInteractive: false
    }
    expect(commandForKey(input)).toEqual({ type: 'tilt', direction: 1 })
    expect(commandForKey({ ...input, key: 'PageDown' })).toEqual({ type: 'tilt', direction: -1 })
    expect(commandForKey({ ...input, isTargetEditable: true })).toBeNull()
    expect(commandForKey({ ...input, isCameraBlocked: true })).toBeNull()
  })

  it('never brings a walking player back into a manually owned camera', () => {
    expect(
      playerFollowStep({
        onScreen: { x: 5000, y: 5000 },
        viewport,
        zoom: 90,
        deltaSec: 1 / 60,
        isReducedMotion: false,
        isCameraManuallyOwned: true,
        insets
      })
    ).toEqual({ right: 0, down: 0, isSettled: true })
  })
})
