import type { Texture } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signTexture } from '../textures'

// jsdom has no 2D canvas; every drawing call is a no-op, since only the cache is under test.
const drawing = new Proxy({} as CanvasRenderingContext2D, {
  get: () => () => undefined,
  set: () => true
})

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => drawing)
})
afterEach(() => {
  vi.restoreAllMocks()
})

function watchedSign(text: string, disposed: Set<Texture>): Texture {
  const texture = signTexture(text)
  texture.addEventListener('dispose', () => disposed.add(texture))
  return texture
}

describe('sign textures', () => {
  it('a hundred distinct sign texts keep at most 64 textures alive, and evicted ones are disposed', () => {
    const disposed = new Set<Texture>()
    const signs = Array.from({ length: 100 }, (_, index) => watchedSign(`Room ${index}`, disposed))
    expect(signs.filter((sign) => !disposed.has(sign)).length).toBeLessThanOrEqual(64)
    expect(signs.slice(0, 36).every((sign) => disposed.has(sign))).toBe(true)
    expect(signs.slice(36).some((sign) => disposed.has(sign))).toBe(false)
    expect(signTexture('Room 99')).toBe(signs[99])
  })

  it('a sign asked for again outlives older ones', () => {
    const disposed = new Set<Texture>()
    const lobby = watchedSign('Lobby', disposed)
    const others = Array.from({ length: 63 }, (_, index) => watchedSign(`Desk ${index}`, disposed))
    expect(signTexture('Lobby')).toBe(lobby)
    watchedSign('Desk 63', disposed)
    expect(disposed.has(lobby)).toBe(false)
    expect(disposed.has(others[0])).toBe(true)
  })
})
