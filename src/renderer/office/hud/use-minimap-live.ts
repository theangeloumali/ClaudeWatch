import { useEffect, useRef, type RefObject } from 'react'
import { officePoses } from '../../office-live/pose-store'
import { officeView, viewFootprint } from '../logic/office-view'
import type { Bounds } from '../logic/zone-framing'

// 4 Hz: often enough for a walk to read, and React never renders for it.
const LIVE_TICK_MS = 250

const percentAlong = (value: number, low: number, high: number): string =>
  `${((value - low) / (high - low)) * 100}%`

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

function moveDots(map: HTMLElement, bounds: Bounds): void {
  for (const element of map.querySelectorAll<HTMLElement | SVGElement>(
    '[data-agent-key], [data-agent-ring], [data-worker-key]'
  )) {
    const { agentKey, agentRing, workerKey } = element.dataset
    const pose = officePoses.read(agentKey ?? agentRing ?? workerKey ?? '')
    if (!pose) continue
    if (workerKey !== undefined) {
      element.style.left = percentAlong(pose.x, bounds.minX, bounds.maxX)
      element.style.top = percentAlong(pose.z, bounds.minZ, bounds.maxZ)
      continue
    }
    element.setAttribute('cx', String(pose.x))
    element.setAttribute('cy', String(pose.z))
  }
}

// Moves the view outline and the walkers' dots by writing attributes, polling the stores'
// versions so a still camera and a seated office cost a comparison each tick. Off where no
// camera moves (the list view), so that map starts no loop.
export function useMinimapLive(
  mapRef: RefObject<HTMLElement | null>,
  bounds: Bounds,
  isLive: boolean
): void {
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isLive) return
    let viewVersion = -1
    let poseVersion = -1
    const tick = (): void => {
      if (officeView.version() !== viewVersion) {
        viewVersion = officeView.version()
        drawFootprint(map)
      }
      if (officePoses.version() !== poseVersion) {
        poseVersion = officePoses.version()
        moveDots(map, boundsRef.current)
      }
    }
    tick()
    const timer = setInterval(tick, LIVE_TICK_MS)
    return () => clearInterval(timer)
  }, [mapRef, isLive])
}
