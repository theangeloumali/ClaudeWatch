import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageVisibility, VisibilityEnv } from '../logic/frame-governor'
import { OFFICE_BLURRED_TICK_MS, useOfficeNow } from '../use-office-now'

function fakeVisibility(initial: PageVisibility) {
  let state = initial
  const callbacks = new Set<() => void>()
  const env: VisibilityEnv = {
    read: () => state,
    onChange: (callback) => {
      callbacks.add(callback)
      return () => callbacks.delete(callback)
    }
  }
  const set = (next: PageVisibility): void => {
    state = next
    act(() => callbacks.forEach((callback) => callback()))
  }
  return { env, set }
}

function rendersOver(env: VisibilityEnv, ms: number, blurredMs?: number): number {
  let renders = 0
  renderHook(() => {
    renders += 1
    return useOfficeNow(blurredMs, env)
  })
  const before = renders
  // A second at a time: one act() would batch every tick into a single render.
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) act(() => vi.advanceTimersByTime(1000))
  return renders - before
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the Office clock (perf-2)', () => {
  it('ticks every second while the Office has focus', () => {
    const { env } = fakeVisibility({ isHidden: false, isFocused: true })
    expect(rendersOver(env, 10_000)).toBe(10)
  })

  it('slows the whole Office to every five seconds out of focus', () => {
    const { env } = fakeVisibility({ isHidden: false, isFocused: false })
    expect(rendersOver(env, 10_000, OFFICE_BLURRED_TICK_MS)).toBe(2)
  })

  it('keeps a panel’s own clock on the second out of focus, for a window watched from aside', () => {
    const { env } = fakeVisibility({ isHidden: false, isFocused: false })
    expect(rendersOver(env, 10_000)).toBe(10)
  })

  it('stops while the Office is hidden', () => {
    const { env } = fakeVisibility({ isHidden: true, isFocused: false })
    expect(rendersOver(env, 60_000, OFFICE_BLURRED_TICK_MS)).toBe(0)
    expect(rendersOver(env, 60_000)).toBe(0)
  })

  it('shows the current time the moment the Office comes back', () => {
    const visibility = fakeVisibility({ isHidden: true, isFocused: false })
    const { result } = renderHook(() => useOfficeNow(OFFICE_BLURRED_TICK_MS, visibility.env))
    const hiddenAt = result.current
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current).toBe(hiddenAt)
    visibility.set({ isHidden: false, isFocused: true })
    expect(result.current).toBe(hiddenAt + 30_000)
  })
})
