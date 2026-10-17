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
// pushing the rail down), so all of those are watched, with the canvas layers.
function boxesAround(origins: Iterable<Element>, obstacles: readonly Element[]): Set<Element> {
  const boxes = new Set<Element>(origins)
  for (const obstacle of obstacles)
    for (let node: Element | null = obstacle; node?.parentElement; node = node.parentElement)
      for (const sibling of node.parentElement.children) boxes.add(sibling)
  return boxes
}

interface OriginReading {
  reading: ObstacleReading
  key: string
  generation: number
}

const NO_OBSTACLES: ObstacleReading = { rects: [], version: 0 }

// `origin` is a layer laid over the canvas, so rects come out in canvas pixels. Each origin keeps
// its own reading, re-measured only after something could have moved: a watched box resized, the
// window resized or anything scrolled. Without ResizeObserver every read measures.
export function createObstacleReader(): (origin: Element | null | undefined) => ObstacleReading {
  // Bumped by anything that can move an obstacle; a reading taken at an older one is stale.
  let generation = 0
  let lastVersion = 0
  const readings = new WeakMap<Element, OriginReading>()
  const origins = new Set<Element>()
  let watched = new Set<Element>()
  let observer: ResizeObserver | null = null
  const sizes = new WeakMap<Element, string>()
  const markStale = (): void => {
    generation += 1
  }
  // A box's first report is the size just measured, so only a later change is a move.
  const onResize: ResizeObserverCallback = (entries) => {
    for (const { target, contentRect } of entries) {
      const size = `${contentRect.width}x${contentRect.height}`
      const known = sizes.get(target)
      sizes.set(target, size)
      if (known !== undefined && known !== size) markStale()
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
    if (!origin) return NO_OBSTACLES
    const canObserve = typeof ResizeObserver === 'function'
    const known = readings.get(origin)
    if (canObserve && known?.generation === generation) return known.reading
    const obstacles = [...document.querySelectorAll(OBSTACLE_SELECTOR)]
    if (canObserve) {
      origins.add(origin)
      for (const seen of origins) if (!seen.isConnected) origins.delete(seen)
      watch(boxesAround(origins, obstacles))
    }
    const rects = measure(origin, obstacles)
    const key = rects.map((rect) => Object.values(rect).join(',')).join(';')
    // Versions are unique across origins, so a remounted layer never matches a stale one.
    const reading = known?.key === key ? known.reading : { rects, version: ++lastVersion }
    readings.set(origin, { reading, key, generation })
    return reading
  }
}

// One reader for the card and office-name projectors, so they share one observer.
export const readCanvasObstacles = createObstacleReader()
