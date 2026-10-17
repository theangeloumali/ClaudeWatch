import { CanvasTexture, SRGBColorSpace } from 'three'
import { STEAM } from '../office-palette'

// Canvas-drawn textures: no font or image fetches, so they work under the app CSP and offline.
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
const MAX_SIGN_CHARS = 24
// Each sign is about 213 kB on the GPU, and a count line makes a new text per value.
const MAX_SIGNS = 64

// Least recently asked for first: a Map keeps insertion order, and a hit re-inserts.
const signCache = new Map<string, CanvasTexture>()
let blobShadow: CanvasTexture | null = null

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable')
  return [canvas, context]
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// A brass plaque with a rivet in each corner.
export function signTexture(text: string): CanvasTexture {
  const cached = signCache.get(text)
  if (cached) {
    signCache.delete(text)
    signCache.set(text, cached)
    return cached
  }
  const [canvas, context] = makeCanvas(512, 104)
  context.fillStyle = STEAM.brass
  context.beginPath()
  context.roundRect(0, 0, 512, 104, 22)
  context.fill()
  context.strokeStyle = STEAM.copper
  context.lineWidth = 8
  context.stroke()
  context.fillStyle = STEAM.signText
  for (const [x, y] of [
    [22, 22],
    [490, 22],
    [22, 82],
    [490, 82]
  ]) {
    context.beginPath()
    context.arc(x, y, 6, 0, Math.PI * 2)
    context.fill()
  }
  context.font = `700 46px ${FONT_STACK}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const label = text.length > MAX_SIGN_CHARS ? `${text.slice(0, MAX_SIGN_CHARS - 1)}…` : text
  context.fillText(label, 256, 54, 440)
  const texture = toTexture(canvas)
  signCache.set(text, texture)
  // A sign still on screen is not lost: its material uploads it again on its next draw.
  for (const [oldest, evicted] of signCache) {
    if (signCache.size <= MAX_SIGNS) break
    signCache.delete(oldest)
    evicted.dispose()
  }
  return texture
}

export function blobShadowTexture(): CanvasTexture {
  if (blobShadow) return blobShadow
  const [canvas, context] = makeCanvas(64, 64)
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(0,0,0,0.5)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  blobShadow = toTexture(canvas)
  return blobShadow
}
