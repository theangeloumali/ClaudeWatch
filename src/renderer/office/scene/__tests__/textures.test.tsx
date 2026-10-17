import { act, render } from '@testing-library/react'
import { memo } from 'react'
import type { Texture } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSignTexture } from '../textures'

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

interface Watch {
  textures: Map<string, Texture>
  disposed: Set<Texture>
}

const watch = (): Watch => ({ textures: new Map(), disposed: new Set() })

// Memoised like the room signs, so a mounted sign asks for its text once, not every render.
const Sign = memo(function Sign({ text, seen }: { text: string; seen: Watch }) {
  const texture = useSignTexture(text)
  if (!seen.textures.has(text))
    texture.addEventListener('dispose', () => seen.disposed.add(texture))
  seen.textures.set(text, texture)
  return null
})

const Signs = ({ texts, seen }: { texts: readonly string[]; seen: Watch }) =>
  texts.map((text) => <Sign key={text} text={text} seen={seen} />)

const texts = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix} ${index}`)

// Unheld signs are trimmed once the commit's effects have all run.
const settle = () => act(async () => undefined)

describe('sign textures', () => {
  it('a sign still mounted is never freed, however many newer texts come and go', async () => {
    const seen = watch()
    const { rerender } = render(<Signs texts={['Lobby']} seen={seen} />)
    for (const batch of [0, 1, 2]) {
      rerender(<Signs texts={['Lobby', ...texts(`Count ${batch}`, 40)]} seen={seen} />)
      await settle()
    }
    rerender(<Signs texts={['Lobby']} seen={seen} />)
    await settle()
    expect(seen.disposed.has(seen.textures.get('Lobby') ?? ({} as Texture))).toBe(false)
    expect(seen.disposed.size).toBeGreaterThan(0)
  })

  it('a hundred released sign texts keep at most 64 textures alive, oldest freed first', async () => {
    const seen = watch()
    const rooms = texts('Room', 100)
    const { rerender } = render(<Signs texts={rooms} seen={seen} />)
    await settle()
    expect(seen.disposed.size).toBe(0)
    rerender(<Signs texts={[]} seen={seen} />)
    await settle()
    const signs = rooms.map((text) => seen.textures.get(text))
    expect(signs.filter((sign) => sign && !seen.disposed.has(sign)).length).toBeLessThanOrEqual(64)
    expect(signs.slice(0, 36).every((sign) => sign && seen.disposed.has(sign))).toBe(true)
    expect(signs.slice(36).some((sign) => sign && seen.disposed.has(sign))).toBe(false)
  })

  it('one text is one texture, kept while any sign shows it', async () => {
    const seen = watch()
    const other = watch()
    const { rerender } = render(
      <>
        <Signs texts={['Shared']} seen={seen} />
        <Signs texts={['Shared']} seen={other} />
      </>
    )
    expect(seen.textures.get('Shared')).toBe(other.textures.get('Shared'))
    rerender(<Signs texts={['Shared']} seen={other} />)
    rerender(<Signs texts={['Shared', ...texts('Churn', 80)]} seen={other} />)
    rerender(<Signs texts={['Shared']} seen={other} />)
    await settle()
    expect(other.disposed.has(other.textures.get('Shared') ?? ({} as Texture))).toBe(false)
  })
})
