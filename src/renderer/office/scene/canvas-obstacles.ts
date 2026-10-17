import type { Rect } from '../logic/card-culling'

// Chrome that floats over the scene inside the card safe area. The inspector's resize handle
// carries its own mark.
const OBSTACLE_SELECTOR = '[data-canvas-obstacle], [data-inspector-resizer]'

export interface ObstacleReading {
  rects: readonly Rect[]
  // Moves only when a rect does, so an idle projector can tell nothing changed.
  version: number
}

function measure(origin: Element, obstacles: readonly Element[]): Rect[] {
  const base = origin.getBoundingClientRect()
  return obstacles.flatMap((element) => {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return []
    return [
      {
        left: rect.left - base.left,
        top: rect.top - base.top,
        right: rect.right - base.left,
        bottom: rect.bottom - base.top
      }
    ]
  })
}

// An obstacle moves when it, an ancestor or a box beside an ancestor resizes (a news line
// pushing the rail down), so all of those are watched, with the canvas layer.
function boxesAround(origin: Element, obstacles: readonly Element[]): Set<Element> {
  const boxes = new Set<Element>([origin])
  for (const obstacle of obstacles)
    for (let node: Element | null = obstacle; node?.parentElement; node = node.parentElement)
      for (const sibling of node.parentElement.children) boxes.add(sibling)
  return boxes
}

// `origin` is a layer laid over the canvas, so rects come out in canvas pixels. Layout is read
// only after something could have moved: a watched box resized, the window resized or anything
// scrolled. Without ResizeObserver every read measures.
export function createObstacleReader(): (origin: Element | null | undefined) => ObstacleReading {
  let reading: ObstacleReading = { rects: [], version: 0 }
  let key = ''
  let isStale = true
  let measuredOrigin: Element | null = null
  let watched = new Set<Element>()
  let observer: ResizeObserver | null = null
  const sizes = new WeakMap<Element, string>()
  const markStale = (): void => {
    isStale = true
  }
  // A box's first report is the size just measured, so only a later change is a move.
  const onResize: ResizeObserverCallback = (entries) => {
    for (const { target, contentRect } of entries) {
      const size = `${contentRect.width}x${contentRect.height}`
      const known = sizes.get(target)
      sizes.set(target, size)
      if (known !== undefined && known !== size) isStale = true
    }
  }
  const watch = (boxes: Set<Element>): void => {
    if (!observer) {
      observer = new ResizeObserver(onResize)
      window.addEventListener('resize', markStale)
      document.addEventListener('scroll', markStale, { capture: true, passive: true })
    }
    for (const element of watched) if (!boxes.has(element)) observer.unobserve(element)
    for (const element of boxes) if (!watched.has(element)) observer.observe(element)
    watched = boxes
  }
  return (origin) => {
    if (!origin || (!isStale && origin === measuredOrigin)) return reading
    const obstacles = [...document.querySelectorAll(OBSTACLE_SELECTOR)]
    const canObserve = typeof ResizeObserver === 'function'
    if (canObserve) watch(boxesAround(origin, obstacles))
    isStale = !canObserve
    measuredOrigin = origin
    const rects = measure(origin, obstacles)
    const nextKey = rects.map((rect) => Object.values(rect).join(',')).join(';')
    if (nextKey !== key) {
      key = nextKey
      reading = { rects, version: reading.version + 1 }
    }
    return reading
  }
}

// Shared by the card and office-name projectors, which run in the same frame.
export const readCanvasObstacles = createObstacleReader()
