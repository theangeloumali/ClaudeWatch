import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createFixtureFeed } from '../../fixture/fixture-feed'
import type { OfficeFrame } from '../../scene-model'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(10000)
  localStorage.clear()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('clearly attributes preview evidence and manual captures to the fixture target', async () => {
  const feed = createFixtureFeed()
  const frames: OfficeFrame[] = []
  const unsubscribe = feed.subscribe((frame) => frames.push(frame))
  vi.advanceTimersByTime(100)
  const frame = frames.at(-1)
  expect(frame?.sessions[0].observation).toMatchObject({
    sourceId: 'preview-fixture',
    observedAtMs: 10000
  })
  expect(frame?.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'preview-fixture',
        ok: true,
        detail: 'Sample data',
        checkedAtMs: 10000
      })
    ])
  )
  const capture = await feed.peek('claude:fixture-example')
  expect(capture).toMatchObject({ targetAgentKey: 'claude:fixture-example', capturedAtMs: 10100 })
  unsubscribe()
})
