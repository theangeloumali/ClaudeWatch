import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { OfficeLabel } from '../logic/office-labels'
import type { ZoomBand } from '../logic/camera-bands'
import type { NameCard } from '../logic/name-cards'
import { hudSafeInsets, type InspectorLayout } from '../logic/hud-layout'
import { cardSafeArea } from '../logic/zone-framing'
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

// Office labels yield to worker cards; the selected office is pinned in HUD-safe headroom.
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
  const last = useRef<{
    pose: string
    labels?: readonly OfficeLabel[]
    cards?: readonly NameCard[]
    layout?: InspectorLayout
    band?: ZoomBand
    hasInspector?: boolean
  }>({ pose: '' })
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    const pose = `${camera.matrixWorld.elements.join(',')}:${'zoom' in camera ? camera.zoom : ''}:${size.width}:${size.height}`
    if (
      last.current.pose === pose &&
      last.current.labels === labels &&
      last.current.cards === cards &&
      last.current.layout === inspectorLayout &&
      last.current.band === band &&
      last.current.hasInspector === hasInspector
    )
      return
    last.current = {
      pose,
      labels,
      cards,
      layout: inspectorLayout,
      band,
      hasInspector
    }
    const insets = hudSafeInsets(hasInspector, inspectorLayout)
    const safe = { ...cardSafeArea(size, insets), top: insets.top }
    const blocked = [...cardAnchors.cards.values(), ...cardAnchors.stacks.values()].flatMap(
      (element) => {
        if (element.style.transform === OFFSCREEN) return []
        const rect = element.getBoundingClientRect()
        // Canvas and overlays share the same root origin.
        const root = element.parentElement?.getBoundingClientRect()
        return root
          ? [
              {
                left: rect.left - root.left,
                top: rect.top - root.top,
                right: rect.right - root.left,
                bottom: rect.bottom - root.top
              }
            ]
          : []
      }
    )
    let shown = 0
    for (const label of [...labels].sort(
      (first, second) =>
        Number(second.isSelected) - Number(first.isSelected) ||
        Number(second.kind === 'room') - Number(first.kind === 'room')
    )) {
      const element = anchors.get(label.id)
      if (!element) continue
      element.style.transform = OFFSCREEN
      if (
        (band === 'building' && label.kind === 'room' && !label.isSelected) ||
        (band === 'desk' && !label.isSelected && label.kind !== 'room') ||
        shown >= MAX_OFFICE_NAMES
      )
        continue
      element.style.maxWidth = `${Math.max(1, Math.min(480, safe.right - safe.left - LABEL_GAP * 2))}px`
      const width = element.offsetWidth
      const height = element.offsetHeight
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
      const rect = { left, top, right: left + width, bottom: top + height }
      const fits =
        left >= safe.left &&
        rect.right <= safe.right &&
        top >= safe.top &&
        rect.bottom <= safe.bottom
      const overlaps = blocked.some(
        (other) =>
          rect.left < other.right &&
          rect.right > other.left &&
          rect.top < other.bottom &&
          rect.bottom > other.top
      )
      if (!fits || overlaps) continue
      element.style.transform = `translate(${left}px, ${top}px)`
      blocked.push(rect)
      shown += 1
    }
  })
  return null
}
