import type { CanvasTexture } from 'three'
import { SIGN_ICONS, type SignIcon } from '../logic/project-signs'
import { SIGN_ICON_PATHS } from './sign-icons'
import { canvas2D, canvasTexture } from './textures'

const COLUMNS = 4
const ROWS = Math.ceil(SIGN_ICONS.length / COLUMNS)
const CELL_PX = 128
const ICON_UNITS = 24
const ICON_PX = 84
const STROKE_UNITS = 2.4

// The uv offset of an icon's cell; v counts from the bottom, as textures do.
export function cellOffset(icon: SignIcon): [number, number] {
  const index = SIGN_ICONS.indexOf(icon)
  return [(index % COLUMNS) / COLUMNS, 1 - (Math.floor(index / COLUMNS) + 1) / ROWS]
}

// White strokes, tinted per sign by its face's instance colour. Null in a test or headless page.
export function createSignAtlas(): CanvasTexture | null {
  if (typeof Path2D === 'undefined' || typeof document === 'undefined') return null
  const made = canvas2D(COLUMNS * CELL_PX, ROWS * CELL_PX)
  if (!made) return null
  const [canvas, context] = made
  const scale = ICON_PX / ICON_UNITS
  const inset = (CELL_PX - ICON_PX) / 2
  context.strokeStyle = '#FFFFFF'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  SIGN_ICONS.forEach((icon, index) => {
    context.setTransform(
      scale,
      0,
      0,
      scale,
      (index % COLUMNS) * CELL_PX + inset,
      Math.floor(index / COLUMNS) * CELL_PX + inset
    )
    context.lineWidth = STROKE_UNITS
    for (const path of SIGN_ICON_PATHS[icon]) context.stroke(new Path2D(path))
  })
  const texture = canvasTexture(canvas)
  texture.repeat.set(1 / COLUMNS, 1 / ROWS)
  return texture
}
