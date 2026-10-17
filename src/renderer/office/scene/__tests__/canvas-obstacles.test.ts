import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createObstacleReader } from '../canvas-obstacles'

// jsdom has no ResizeObserver; this one reports when a test says a box resized.
class FakeResizeObserver {
  static latest: FakeResizeObserver | null = null
  readonly watched = new Set<Element>()
  constructor(private readonly report: ResizeObserverCallback) {
    FakeResizeObserver.latest = this
  }
  observe(element: Element): void {
    this.watched.add(element)
    this.resize(element, 10)
  }
  unobserve(element: Element): void {
    this.watched.delete(element)
  }
  disconnect(): void {
    this.watched.clear()
  }
  resize(element: Element, width: number): void {
    const contentRect = { width, height: 10 } as DOMRectReadOnly
    this.report([{ target: element, contentRect } as ResizeObserverEntry], this as never)
  }
}

const box = (left: number, top: number, size: number) =>
  ({ left, top, right: left + size, bottom: top + size, width: size, height: size }) as DOMRect

function layOut() {
  const origin = document.createElement('div')
  const rail = document.createElement('div')
  const header = document.createElement('div')
  const obstacle = document.createElement('button')
  obstacle.dataset.canvasObstacle = ''
  rail.append(obstacle)
  document.body.append(origin, header, rail)
  origin.getBoundingClientRect = () => box(0, 0, 1000)
  let at = box(10, 10, 40)
  const readObstacle = vi.fn(() => at)
  obstacle.getBoundingClientRect = readObstacle
  return { origin, header, obstacle, readObstacle, moveTo: (next: DOMRect) => (at = next) }
}

beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('canvas obstacles', () => {
  it('measures once, then reads no layout while nothing moves', () => {
    vi.useFakeTimers()
    const read = createObstacleReader()
    const { origin, readObstacle } = layOut()
    expect(read(origin).rects).toEqual([{ left: 10, top: 10, right: 50, bottom: 50 }])
    for (let second = 0; second < 5; second++) {
      vi.advanceTimersByTime(1_000)
      read(origin)
    }
    expect(readObstacle).toHaveBeenCalledTimes(1)
  })

  it('an obstacle that resizes is measured again', () => {
    const read = createObstacleReader()
    const { origin, obstacle, moveTo } = layOut()
    const { version } = read(origin)
    moveTo(box(10, 10, 80))
    FakeResizeObserver.latest?.resize(obstacle, 80)
    expect(read(origin)).toEqual({
      rects: [{ left: 10, top: 10, right: 90, bottom: 90 }],
      version: version + 1
    })
  })

  it('a box beside its column that grows moves it, and is measured again', () => {
    const read = createObstacleReader()
    const { origin, header, moveTo } = layOut()
    read(origin)
    moveTo(box(10, 40, 40))
    FakeResizeObserver.latest?.resize(header, 30)
    expect(read(origin).rects).toEqual([{ left: 10, top: 40, right: 50, bottom: 80 }])
  })

  it('with two origins, 10 still frames measure no more than the one-origin case', () => {
    const stillFrameReads = (
      origins: readonly Element[],
      readObstacle: { mock: { calls: unknown[] } }
    ) => {
      const read = createObstacleReader()
      for (const origin of origins) read(origin)
      const settled = readObstacle.mock.calls.length
      for (let frame = 0; frame < 10; frame++) for (const origin of origins) read(origin)
      return readObstacle.mock.calls.length - settled
    }
    const { origin: cards, readObstacle } = layOut()
    const names = document.createElement('div')
    names.getBoundingClientRect = () => box(0, 0, 1000)
    document.body.append(names)
    const oneOrigin = stillFrameReads([cards], readObstacle)
    expect(stillFrameReads([cards, names], readObstacle)).toBeLessThanOrEqual(oneOrigin)
  })

  it('a resize re-measures each origin once, against its own base', () => {
    const read = createObstacleReader()
    const { origin: cards, obstacle, moveTo } = layOut()
    const names = document.createElement('div')
    names.getBoundingClientRect = () => box(5, 5, 1000)
    document.body.append(names)
    read(cards)
    read(names)
    moveTo(box(10, 10, 80))
    FakeResizeObserver.latest?.resize(obstacle, 80)
    expect(read(cards).rects).toEqual([{ left: 10, top: 10, right: 90, bottom: 90 }])
    expect(read(names).rects).toEqual([{ left: 5, top: 5, right: 85, bottom: 85 }])
  })

  it('a window resize or a scroll is measured again', () => {
    const read = createObstacleReader()
    const { origin, readObstacle } = layOut()
    read(origin)
    window.dispatchEvent(new Event('resize'))
    read(origin)
    document.body.dispatchEvent(new Event('scroll'))
    read(origin)
    expect(readObstacle).toHaveBeenCalledTimes(3)
  })
})
