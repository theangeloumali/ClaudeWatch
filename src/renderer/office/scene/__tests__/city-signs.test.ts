import { Color, InstancedMesh, Matrix4, OrthographicCamera, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../themes/contrast'
import { BAND_ZOOM, ISO_POLAR, ISO_START_AZIMUTH } from '../../logic/camera-bands'
import { MARK_RISE_M } from '../city-marks'
import { SIGN_BOARD, SIGN_ICONS, signInk, type SignState } from '../../logic/project-signs'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { listThemes } from '../../themes/registry'
import {
  createCitySignsLayer,
  SIGN_DISC_DEPTH,
  type SignHost,
  VENUE_BOARD
} from '../city-signs-layer'
import { cellOffset, createSignAtlas } from '../sign-atlas'

const VIEW = { width: 1280, height: 800 }
// From zoom 2 in: the city overview, the building and floor bands, to the desk threshold.
const BAND_ZOOMS = [2, 4, BAND_ZOOM.building, 20, BAND_ZOOM.floor, 54]
// Below 18 px ÷ 11.4 m (zoom ≈ 1.58) an 18 px board would clear MARK_RISE_M, so metres cap it.
const CAPPED_ZOOMS = [0.1, 0.25, 0.5, 1, 1.5]

function cameraAt(azimuth: number, zoom: number): OrthographicCamera {
  const camera = new OrthographicCamera(
    -VIEW.width / 2,
    VIEW.width / 2,
    VIEW.height / 2,
    -VIEW.height / 2,
    1,
    200
  )
  camera.zoom = zoom
  camera.position.set(
    60 * Math.sin(ISO_POLAR) * Math.sin(azimuth),
    60 * Math.cos(ISO_POLAR),
    60 * Math.sin(ISO_POLAR) * Math.cos(azimuth)
  )
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

const working: SignState = { icon: 'edit', tint: 'working' }
function hosts(count: number, state: SignState | null = working): SignHost[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `b${index}`,
    top: () => ({ x: index * 30, y: 8, z: 0 }),
    look: state && { icon: state.icon, board: SIGN_BOARD[state.tint] }
  }))
}

function meshesOf(layer: ReturnType<typeof createCitySignsLayer>): [InstancedMesh, InstancedMesh] {
  const [disc, face] = layer.group.children
  if (!(disc instanceof InstancedMesh) || !(face instanceof InstancedMesh))
    throw new Error('a disc and a face')
  return [disc, face]
}

const posed = (mesh: InstancedMesh, index: number) => {
  const matrix = new Matrix4()
  mesh.getMatrixAt(index, matrix)
  const position = new Vector3()
  const rotation = new Quaternion()
  const scale = new Vector3()
  matrix.decompose(position, rotation, scale)
  return { position, rotation, scale }
}

// A zero-scale matrix: decompose reads a degenerate matrix as unit scale, so check the columns.
const isHidden = (mesh: InstancedMesh, index: number): boolean => {
  const matrix = new Matrix4()
  mesh.getMatrixAt(index, matrix)
  return matrix.elements.slice(0, 12).every((value) => value === 0)
}

// The board's width on screen, edge to edge along the camera's right.
function spanPxOf(camera: OrthographicCamera, board: ReturnType<typeof posed>): number {
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  const edges = [-0.5, 0.5].map((side) =>
    board.position
      .clone()
      .addScaledVector(right, side * board.scale.x)
      .project(camera)
  )
  return (Math.abs(edges[1].x - edges[0].x) / 2) * VIEW.width
}

const frame = (
  camera: OrthographicCamera,
  signHosts: readonly SignHost[],
  isCameraMoved = true
) => ({
  hosts: signHosts,
  camera,
  nowMs: 0,
  isPinned: false,
  isCameraMoved
})

describe('city signs', () => {
  it('signs cost 2 draws however many buildings carry one', () => {
    for (const count of [1, 40, 133]) {
      const layer = createCitySignsLayer(null)
      layer.update(frame(cameraAt(ISO_START_AZIMUTH, 8), hosts(count)))
      expect(measureLayer(layer.group).draws).toBe(2)
    }
    expect(CITY_LAYER_BUDGET.signs.draws.full).toBe(2)
  })

  it('a still camera uploads 0 sign bytes', () => {
    const layer = createCitySignsLayer(null)
    const camera = cameraAt(ISO_START_AZIMUTH, 8)
    const signHosts = hosts(12)
    layer.update(frame(camera, signHosts))
    expect(measureLayer(layer.group).uploadBytes).toBeGreaterThan(0)
    layer.update(frame(camera, signHosts, false))
    expect(measureLayer(layer.group).uploadBytes).toBe(0)
    layer.update(frame(camera, signHosts, true))
    expect(measureLayer(layer.group).uploadBytes).toBe(0)
    const turned = cameraAt(ISO_START_AZIMUTH + Math.PI / 2, 8)
    layer.update(frame(turned, signHosts))
    expect(measureLayer(layer.group).uploadBytes).toBe(2 * 12 * 16 * 4)
  })

  it('signs face the camera at all four quarter turns', () => {
    for (let turn = 0; turn < 4; turn += 1) {
      const camera = cameraAt(ISO_START_AZIMUTH + (turn * Math.PI) / 2, BAND_ZOOM.building)
      const layer = createCitySignsLayer(null)
      layer.update(frame(camera, hosts(3)))
      const towardCamera = new Vector3(0, 0, 1).applyQuaternion(camera.quaternion)
      const [disc, face] = meshesOf(layer)
      for (let index = 0; index < 3; index += 1) {
        const board = posed(disc, index)
        const icon = posed(face, index)
        expect(new Vector3(0, 0, 1).applyQuaternion(board.rotation).dot(towardCamera)).toBeCloseTo(
          1
        )
        expect(new Vector3(0, 0, 1).applyQuaternion(icon.rotation).dot(towardCamera)).toBeCloseTo(1)
        // In front of the board's face at every size, not inside it.
        const ahead = icon.position.clone().sub(board.position).dot(towardCamera)
        expect(ahead).toBeGreaterThan((board.scale.z * SIGN_DISC_DEPTH) / 2)
      }
    }
  })

  it('every icon meets 3:1 contrast on its disc', () => {
    for (const board of Object.values(SIGN_BOARD)) {
      expect(signInk(board)).toBe('#121629')
      expect(contrastRatio(signInk(board), board)).toBeGreaterThanOrEqual(3)
    }
    // White fails four of the five state boards, so the face is ink-tinted.
    expect(
      Object.values(SIGN_BOARD).filter((board) => contrastRatio('#FFFFFF', board) < 3).length
    ).toBeGreaterThanOrEqual(3)
    for (const theme of listThemes()) {
      const board = VENUE_BOARD(theme.palette)
      expect(contrastRatio(signInk(board), board)).toBeGreaterThanOrEqual(3)
    }
    const layer = createCitySignsLayer(null)
    layer.update(frame(cameraAt(ISO_START_AZIMUTH, 8), hosts(2)))
    const [disc, face] = meshesOf(layer)
    const boardColor = new Color()
    const inkColor = new Color()
    disc.getColorAt(0, boardColor)
    face.getColorAt(0, inkColor)
    expect(boardColor.getHexString()).toBe(new Color(SIGN_BOARD.working).getHexString())
    expect(
      contrastRatio(`#${inkColor.getHexString()}`, `#${boardColor.getHexString()}`)
    ).toBeGreaterThanOrEqual(3)
  })

  it('a sign spans 18–40 px on screen at the city, building and floor bands', () => {
    for (const zoom of BAND_ZOOMS) {
      const camera = cameraAt(ISO_START_AZIMUTH, zoom)
      const layer = createCitySignsLayer(null)
      layer.update(frame(camera, hosts(1)))
      const [disc] = meshesOf(layer)
      const spanPx = spanPxOf(camera, posed(disc, 0))
      expect(spanPx).toBeGreaterThanOrEqual(18 - 1e-3)
      // Projection rounds a hair either side of the bound.
      expect(spanPx).toBeLessThanOrEqual(40 + 1e-3)
    }
  })

  it('a sign never rises more than MARK_RISE_M over its roof, however far out the camera is', () => {
    for (const zoom of [...CAPPED_ZOOMS, ...BAND_ZOOMS]) {
      const camera = cameraAt(ISO_START_AZIMUTH, zoom)
      const layer = createCitySignsLayer(null)
      layer.update(frame(camera, hosts(1)))
      const [disc] = meshesOf(layer)
      const board = posed(disc, 0)
      expect(board.position.y + board.scale.y / 2).toBeLessThanOrEqual(8 + MARK_RISE_M + 1e-4)
      expect(board.position.y - board.scale.y / 2).toBeGreaterThan(8)
      // The cap binds out here: the board is held under the 18 px it would otherwise span.
      if (CAPPED_ZOOMS.includes(zoom)) expect(spanPxOf(camera, board)).toBeLessThan(18)
    }
  })

  it('a dark sign or a building with no roof shows nothing, and cells change with the state', () => {
    const layer = createCitySignsLayer(null)
    const camera = cameraAt(ISO_START_AZIMUTH, 8)
    const signHosts: SignHost[] = [
      ...hosts(1, null),
      { key: 'gone', top: () => null, look: { icon: 'hand', board: SIGN_BOARD['needs-you'] } },
      ...hosts(1, { icon: 'hand', tint: 'needs-you' })
    ]
    layer.update(frame(camera, signHosts))
    const [disc, face] = meshesOf(layer)
    expect(isHidden(disc, 0)).toBe(true)
    expect(isHidden(face, 1)).toBe(true)
    expect(isHidden(face, 2)).toBe(false)
    const cells = face.geometry.getAttribute('signCell')
    const [u, v] = cellOffset('hand')
    expect(cells.getX(2)).toBeCloseTo(u)
    expect(cells.getY(2)).toBeCloseTo(v)
  })
})

describe('sign atlas', () => {
  it('each sign icon has its own atlas cell, v from the bottom', () => {
    const cells = SIGN_ICONS.map((icon) => cellOffset(icon).join(','))
    expect(new Set(cells).size).toBe(SIGN_ICONS.length)
    expect(cellOffset(SIGN_ICONS[0])).toEqual([0, 0.8])
    expect(cellOffset(SIGN_ICONS[5])).toEqual([0.25, 0.6])
  })

  it('is null without a canvas or Path2D, so a test or a headless page draws no icons', () => {
    expect(createSignAtlas()).toBeNull()
  })
})
