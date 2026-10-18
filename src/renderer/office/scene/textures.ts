import { useLayoutEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { STEAM } from '../office-palette'

// Canvas-drawn textures: no font or image fetches, so they work under the app CSP and offline.
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
const MAX_SIGN_CHARS = 24
// Each sign is about 213 kB on the GPU, and a count line makes a new text per value.
const MAX_SIGNS = 64

interface SignEntry {
  texture: CanvasTexture
  // Mounted signs drawing it: a held texture is never freed, or three would upload a copy no one frees.
  holders: number
}

// Least recently asked for first: a Map keeps insertion order, and a hit re-inserts.
const signCache = new Map<string, SignEntry>()
let isTrimQueued = false
let blobShadow: CanvasTexture | null = null

type Canvas2D = [HTMLCanvasElement, CanvasRenderingContext2D]

// Null without a 2D context, as in a test or a headless page.
export function canvas2D(width: number, height: number): Canvas2D | null {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  return context ? [canvas, context] : null
}

function makeCanvas(width: number, height: number): Canvas2D {
  const made = canvas2D(width, height)
  if (!made) throw new Error('2D canvas context unavailable')
  return made
}

export function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = canvasTexture(canvas)
  texture.anisotropy = 4
  return texture
}

// A brass plaque with a rivet in each corner.
function signTexture(text: string): CanvasTexture {
  const cached = signCache.get(text)
  if (cached) {
    signCache.delete(text)
    signCache.set(text, cached)
    return cached.texture
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
  signCache.set(text, { texture, holders: 0 })
  return texture
}

// Frees the oldest unheld signs over the cap. A release queues it, so it runs once the commit is
// done and every sign drawn in it is held.
function trimSigns(): void {
  isTrimQueued = false
  for (const [text, entry] of signCache) {
    if (signCache.size <= MAX_SIGNS) return
    if (entry.holders > 0) continue
    signCache.delete(text)
    entry.texture.dispose()
  }
}

function releaseSign(entry: SignEntry): void {
  entry.holders -= 1
  if (isTrimQueued) return
  isTrimQueued = true
  queueMicrotask(trimSigns)
}

// The sign's texture, held while the calling sign is mounted.
export function useSignTexture(text: string): CanvasTexture {
  const texture = useMemo(() => signTexture(text), [text])
  useLayoutEffect(() => {
    // A trim before this commit may have freed it; held again, three uploads it on its next draw.
    const entry = signCache.get(text) ?? { texture, holders: 0 }
    signCache.set(text, entry)
    entry.holders += 1
    return () => releaseSign(entry)
  }, [text, texture])
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
