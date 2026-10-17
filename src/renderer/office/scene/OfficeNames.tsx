import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { OfficeLabel } from '../logic/office-labels'
import type { ZoomBand } from '../logic/camera-bands'
import type { NameCard } from '../logic/name-cards'
import { hudSafeInsets, type InspectorLayout } from '../logic/hud-layout'
import { cardSafeArea } from '../logic/zone-framing'
import { clearOfObstacles, type Rect } from '../logic/card-culling'
import { readCanvasObstacles } from './canvas-obstacles'
import { OFFSCREEN, type CardAnchors } from './CardProjector'

export type OfficeNameAnchors = Map<string, HTMLElement>
const LABEL_GAP = 8
const MAX_OFFICE_NAMES = 12

interface OfficeNamesProps {
  labels: readonly OfficeLabel[]
  anchors: OfficeNameAnchors
}

export function OfficeNameLayer({ labels, anchors }: OfficeNamesProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {labels.map((label) => (
        <div
          key={label.id}
          ref={(element) => {
            if (element) anchors.set(label.id, element)
            else anchors.delete(label.id)
          }}
          style={{ transform: OFFSCREEN }}
          className="absolute left-0 top-0 max-w-[min(480px,calc(100vw-2rem))] rounded-md bg-surface/95 px-3 py-1.5 text-paper shadow-md"
        >
          <span className="block text-[10px] text-mist">
            {label.company}
            {label.context ? ` · ${label.context}` : ''} ·{' '}
            {label.kind === 'room' ? 'Room' : 'Office'}
          </span>
          <span className="block break-words text-[13px] font-semibold">{label.name}</span>
        </div>
      ))}
    </div>
  )
}

// Office labels yield to worker cards and floating chrome; the selected office is pinned in
// HUD-safe headroom. Each pass reads every rect and size first, then writes, so it lays out once.
export function OfficeNameProjector({
  labels,
  anchors,
  cardAnchors,
  band,
  hasInspector,
  inspectorLayout,
  cards
}: OfficeNamesProps & {
  cardAnchors: CardAnchors
  band: ZoomBand
  hasInspector: boolean
  inspectorLayout?: InspectorLayout
  cards?: readonly NameCard[]
}) {
  const point = useMemo(() => new Vector3(), [])
  const sizes = useMemo(
    () => new WeakMap<HTMLElement, { key: string; width: number; height: number }>(),
    []
  )
  const measurements = useRef(0)
  const last = useRef<{
    pose: string
    labels?: readonly OfficeLabel[]
    cards?: readonly NameCard[]
    layout?: InspectorLayout
    band?: ZoomBand
    hasInspector?: boolean
    obstacles?: number
    measurements?: number
    maxWidth?: string
  }>({ pose: '' })
  // A font or wrapping change re-measures a label, with no layout read on a still frame.
  const labelKeys = labels.map((label) => label.id).join('\0')
  useEffect(() => {
    if (!labelKeys || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => {
      measurements.current += 1
    })
    for (const element of anchors.values()) observer.observe(element)
    return () => observer.disconnect()
  }, [anchors, labelKeys])
  const sizeOf = (element: HTMLElement, label: OfficeLabel, maxWidth: string) => {
    const key = `${label.company}:${label.context}:${label.kind}:${label.name}:${maxWidth}:${measurements.current}`
    const cached = sizes.get(element)
    if (cached?.key === key) return cached
    const fresh = { key, width: element.offsetWidth, height: element.offsetHeight }
    sizes.set(element, fresh)
    return fresh
  }
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    const obstacles = readCanvasObstacles(anchors.values().next().value?.parentElement)
    const pose = `${camera.matrixWorld.elements.join(',')}:${'zoom' in camera ? camera.zoom : ''}:${size.width}:${size.height}`
    const previous = last.current
    if (
      previous.pose === pose &&
      previous.labels === labels &&
      previous.cards === cards &&
      previous.layout === inspectorLayout &&
      previous.band === band &&
      previous.hasInspector === hasInspector &&
      previous.obstacles === obstacles.version &&
      previous.measurements === measurements.current
    )
      return
    const insets = hudSafeInsets(hasInspector, inspectorLayout)
    const safe = { ...cardSafeArea(size, insets), top: insets.top }
    const maxWidth = `${Math.max(1, Math.min(480, safe.right - safe.left - LABEL_GAP * 2))}px`
    // The one write before the reads, and only when the safe width changed.
    if (previous.maxWidth !== maxWidth)
      for (const element of anchors.values()) element.style.maxWidth = maxWidth
    last.current = {
      pose,
      labels,
      cards,
      layout: inspectorLayout,
      band,
      hasInspector,
      obstacles: obstacles.version,
      measurements: measurements.current,
      maxWidth
    }

    const blocked: Rect[] = [...obstacles.rects]
    for (const element of [...cardAnchors.cards.values(), ...cardAnchors.stacks.values()]) {
      if (element.style.transform === OFFSCREEN) continue
      const rect = element.getBoundingClientRect()
      // Canvas and overlays share the same root origin.
      const root = element.parentElement?.getBoundingClientRect()
      if (root)
        blocked.push({
          left: rect.left - root.left,
          top: rect.top - root.top,
          right: rect.right - root.left,
          bottom: rect.bottom - root.top
        })
    }
    const placed = new Map<HTMLElement, string>()
    for (const label of [...labels].sort(
      (first, second) =>
        Number(second.isSelected) - Number(first.isSelected) ||
        Number(second.kind === 'room') - Number(first.kind === 'room')
    )) {
      const element = anchors.get(label.id)
      if (
        !element ||
        (band === 'building' && label.kind === 'room' && !label.isSelected) ||
        (band === 'desk' && !label.isSelected && label.kind !== 'room') ||
        placed.size >= MAX_OFFICE_NAMES
      )
        continue
      const { width, height } = sizeOf(element, label, maxWidth)
      point.set(label.x, label.y ?? 0.35, label.z).project(camera)
      if (
        !label.isSelected &&
        (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1)
      )
        continue
      const left = label.isSelected
        ? safe.left + LABEL_GAP
        : ((point.x + 1) * size.width) / 2 - width / 2
      const top = label.isSelected
        ? safe.top + LABEL_GAP
        : ((1 - point.y) * size.height) / 2 + LABEL_GAP
      const at = { left, top, right: left + width, bottom: top + height }
      // The pinned label moves out from under chrome; any other one under it is left out.
      const rect = label.isSelected ? clearOfObstacles(at, safe, obstacles.rects) : at
      const fits =
        rect !== null &&
        rect.left >= safe.left &&
        rect.right <= safe.right &&
        rect.top >= safe.top &&
        rect.bottom <= safe.bottom
      if (
        !rect ||
        !fits ||
        blocked.some(
          (other) =>
            rect.left < other.right &&
            rect.right > other.left &&
            rect.top < other.bottom &&
            rect.bottom > other.top
        )
      )
        continue
      placed.set(element, `translate(${rect.left}px, ${rect.top}px)`)
      blocked.push(rect)
    }
    for (const element of anchors.values()) {
      const transform = placed.get(element) ?? OFFSCREEN
      if (element.style.transform !== transform) element.style.transform = transform
    }
  })
  return null
}
