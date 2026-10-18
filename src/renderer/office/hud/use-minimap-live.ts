import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { officePoses, type AgentPose } from '../../office-live/pose-store'
import { browserVisibilityEnv } from '../logic/frame-governor'
import { percentAlong } from '../logic/minimap-model'
import { officeView, viewFootprint } from '../logic/office-view'
import type { Bounds } from '../logic/zone-framing'

// 4 Hz: often enough for a walk to read, and React never renders for it.
const LIVE_TICK_MS = 250
const DOT_SELECTOR = '[data-agent-key], [data-agent-ring], [data-worker-key]'

interface Dot {
  element: HTMLElement | SVGElement
  agentKey: string
  isWorkerButton: boolean
  // The pose last written; the store keeps a pose's object until it moves.
  written?: AgentPose
}

function drawFootprint(map: HTMLElement): void {
  const view = officeView.read()
  const outline = map.querySelector('[data-view-footprint]')
  if (!view || !outline) return
  outline.setAttribute(
    'points',
    viewFootprint(view)
      .map((point) => `${point.x},${point.z}`)
      .join(' ')
  )
}

function findDots(map: HTMLElement): Dot[] {
  return [...map.querySelectorAll<HTMLElement | SVGElement>(DOT_SELECTOR)].map((element) => {
    const { agentKey, agentRing, workerKey } = element.dataset
    return {
      element,
      agentKey: agentKey ?? agentRing ?? workerKey ?? '',
      isWorkerButton: workerKey !== undefined
    }
  })
}

function moveDots(dots: readonly Dot[], bounds: Bounds): void {
  for (const dot of dots) {
    const pose = officePoses.read(dot.agentKey)
    if (!pose || pose === dot.written) continue
    dot.written = pose
    if (dot.isWorkerButton) {
      dot.element.style.left = percentAlong(pose.x, bounds.minX, bounds.maxX)
      dot.element.style.top = percentAlong(pose.z, bounds.minZ, bounds.maxZ)
      continue
    }
    dot.element.setAttribute('cx', String(pose.x))
    dot.element.setAttribute('cy', String(pose.z))
  }
}

// Moves the view outline and the walkers' dots by writing attributes, polling the stores'
// versions so a still camera and a seated office cost a comparison each tick. Off where no
// camera moves (the list view), and paused while the page is hidden.
export function useMinimapLive(
  mapRef: RefObject<HTMLElement | null>,
  bounds: Bounds,
  isLive: boolean
): void {
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds
  // A commit may add or drop dots, so the cached elements are found again after it.
  const dotsRef = useRef<Dot[] | null>(null)
  useLayoutEffect(() => {
    dotsRef.current = null
  })
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isLive) return
    const visibility = browserVisibilityEnv()
    let viewVersion = -1
    let poseVersion = -1
    let timer: ReturnType<typeof setInterval> | null = null
    const tick = (): void => {
      if (officeView.version() !== viewVersion) {
        viewVersion = officeView.version()
        drawFootprint(map)
      }
      const isFound = dotsRef.current === null
      const dots = (dotsRef.current ??= findDots(map))
      if (isFound || officePoses.version() !== poseVersion) {
        poseVersion = officePoses.version()
        moveDots(dots, boundsRef.current)
      }
    }
    const followVisibility = (): void => {
      const isHidden = visibility.read().isHidden
      if (isHidden && timer !== null) {
        clearInterval(timer)
        timer = null
      } else if (!isHidden && timer === null) {
        tick()
        timer = setInterval(tick, LIVE_TICK_MS)
      }
    }
    followVisibility()
    const stopFollowing = visibility.onChange(followVisibility)
    return () => {
      stopFollowing()
      if (timer !== null) clearInterval(timer)
    }
  }, [mapRef, isLive])
}
