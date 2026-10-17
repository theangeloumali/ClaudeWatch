import type { Rect } from '../logic/card-culling'

// Chrome that floats over the scene inside the card safe area. The inspector's resize handle
// carries its own mark.
const OBSTACLE_SELECTOR = '[data-canvas-obstacle], [data-inspector-resizer]'
// Layout reads at most four times a second, never every frame.
const MEASURE_EVERY_MS = 250

export interface ObstacleReading {
  rects: readonly Rect[]
  // Moves only when a rect does, so an idle projector can tell nothing changed.
  version: number
}

function measure(origin: Element): Rect[] {
  const base = origin.getBoundingClientRect()
  return [...document.querySelectorAll(OBSTACLE_SELECTOR)].flatMap((element) => {
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

// `origin` is a layer laid over the canvas, so rects come out in canvas pixels.
function createObstacleReader(): (origin: Element | null | undefined) => ObstacleReading {
  let reading: ObstacleReading = { rects: [], version: 0 }
  let key = ''
  let measuredAtMs = Number.NEGATIVE_INFINITY
  return (origin) => {
    const nowMs = Date.now()
    if (!origin || nowMs - measuredAtMs < MEASURE_EVERY_MS) return reading
    measuredAtMs = nowMs
    const rects = measure(origin)
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
