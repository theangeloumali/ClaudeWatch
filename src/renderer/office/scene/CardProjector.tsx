import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type Camera } from 'three'
import type { ZoomBand } from '../logic/camera-bands'
import {
  clearOfObstacles,
  cullCards,
  pinInside,
  type CullCandidate,
  type Rect
} from '../logic/card-culling'
import type { NameCard, ProjectStack } from '../logic/name-cards'
import { cardSafeArea } from '../logic/zone-framing'
import { hudSafeInsets, type InspectorLayout } from '../logic/hud-layout'
import type { AgentView } from '../../../shared/office/types'
import { livePose, officePoses } from '../../office-live/pose-store'
import type { FloorGeometry } from '../scene-model'
import { agentElevation, floorElevation } from './all-floor-model'
import { findZone } from '../logic/zone-model'
import { levelInUse, type QualityLevel } from '../logic/quality'
import { useQualityChoice } from '../quality-store'
import { readCanvasObstacles } from './canvas-obstacles'

// Over an agent's head (scene/Robot.tsx draws agents 1.65 m tall).
export const CARD_HEIGHT = 2.45
const PILL_HEIGHT = 1.55
const DOT_HEIGHT = 1.7
const STACK_HEIGHT = 2.6
const STACK_COLUMN_WIDTH = 360
const STACK_GAP = 8
const COMPACT_OFFICE_WIDTH = 1024
// Cards are DOM written every moving frame; a light machine moves half as many (clearspent-3).
const DESK_CARD_CAP: Record<QualityLevel, number> = { full: 12, balanced: 12, light: 6 }
const OVERFLOW_CLASS =
  'absolute left-0 top-0 rounded-lg bg-neutral-900/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md'
export const OFFSCREEN = 'translate(-9999px, -9999px)'

export interface CardAnchors {
  cards: Map<string, HTMLElement>
  dots: Map<string, HTMLElement>
  stacks: Map<string, HTMLElement>
}

interface Size {
  width: number
  height: number
}

interface CardProjectorProps {
  cards: readonly NameCard[]
  stacks: readonly ProjectStack[]
  anchors: CardAnchors
  band: ZoomBand
  selectedAgentKey: string | null
  inspectorLayout?: InspectorLayout
  agents?: readonly AgentView[]
  visibleFloors: readonly FloorGeometry[]
}

// Writes a snapshot slot and returns 1 if it changed, so the idle check allocates nothing.
function store(snapshot: number[], index: number, value: number): number {
  const hasChanged = snapshot[index] !== value
  snapshot[index] = value
  return hasChanged ? 1 : 0
}

function hideAll(elements: Map<string, HTMLElement>): void {
  for (const element of elements.values()) element.style.transform = OFFSCREEN
}

// The "+N more" count for capped desk cards, kept in the card layer next to the cards themselves.
function overflowBadge(current: HTMLElement | null, anchors: CardAnchors): HTMLElement | null {
  if (current?.isConnected) return current
  const layer = anchors.cards.values().next().value?.parentElement
  if (!layer) return null
  const badge = document.createElement('span')
  badge.dataset.cardOverflow = ''
  badge.className = OVERFLOW_CLASS
  badge.style.transform = OFFSCREEN
  layer.append(badge)
  return badge
}

// Runs inside the Canvas each projected frame: moves the DOM cards and culls overlapping cards in
// screen space (card-culling.ts). Only style and the overflow count are written, never React state.
export function CardProjector({
  cards,
  stacks,
  anchors,
  band,
  selectedAgentKey,
  inspectorLayout,
  agents,
  visibleFloors
}: CardProjectorProps) {
  const point = useMemo(() => new Vector3(), [])
  const measurementRevision = useRef(0)
  const { pin, chosen } = useQualityChoice()
  const deskCardCap = DESK_CARD_CAP[levelInUse(pin, chosen)]
  const overflow = useRef<HTMLElement | null>(null)
  useEffect(() => () => overflow.current?.remove(), [])
  const heights = useMemo(
    () => new Map(agents?.map((agent) => [agent.agentKey, agentElevation(agent)])),
    [agents]
  )
  const frameAgents = useMemo(
    () => new Map(agents?.map((agent) => [agent.agentKey, agent])),
    [agents]
  )
  const stackHeights = useMemo(
    () =>
      new Map(
        stacks.map((stack) => {
          const floor = visibleFloors.find(
            (candidate) => stack.zoneId !== null && !!findZone(candidate, stack.zoneId)
          )
          return [stack.projectKey, floor ? floorElevation(floor) : 0] as const
        })
      ),
    [stacks, visibleFloors]
  )
  const invalidateRef = useRef<(() => void) | undefined>(undefined)
  const observedKeys = [
    ...cards.map((card) => `card:${card.agentKey}:${card.kind}`),
    ...stacks.map((stack) => `stack:${stack.projectKey}`)
  ]
    .sort()
    .join('\0')
  // Font and wrapping changes invalidate measurements without per-frame React state.
  useEffect(() => {
    if (!observedKeys || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => {
      measurementRevision.current += 1
      invalidateRef.current?.()
    })
    for (const element of [...anchors.cards.values(), ...anchors.stacks.values()]) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [anchors, observedKeys])
  const lastRef = useRef<{
    view: number[]
    cards: readonly NameCard[] | null
    stacks: readonly ProjectStack[] | null
    band: ZoomBand | null
    selectedAgentKey: string | null
    layout: InspectorLayout | undefined
    measurements: number
    heights: typeof heights | null
    stackHeights: typeof stackHeights | null
    cap: number
    poses: number
    obstacles: number
  }>({
    view: [],
    cards: null,
    stacks: null,
    band: null,
    selectedAgentKey: null,
    layout: undefined,
    measurements: -1,
    heights: null,
    stackHeights: null,
    cap: 0,
    poses: -1,
    obstacles: -1
  })
  const sizes = useMemo(
    () => new WeakMap<HTMLElement, { key: string; width: number; height: number }>(),
    []
  )

  const toScreen = (camera: Camera, size: Size, x: number, y: number, z: number) => {
    point.set(x, y, z).project(camera)
    if (point.z >= 1 || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1) return null
    return { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height }
  }
  const place = (element: HTMLElement | undefined, at: { x: number; y: number } | null): void => {
    if (!element) return
    element.style.transform = at
      ? `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`
      : OFFSCREEN
  }
  // A card follows its agent's live pose, as far in front of it as its frame placed it (perf-2).
  const anchorOf = (card: NameCard, lift: number) => {
    const agent = frameAgents.get(card.agentKey)
    if (!agent) return { x: card.x, y: (heights.get(card.agentKey) ?? 0) + lift, z: card.z }
    const pose = livePose(officePoses, agent)
    const reach = Math.hypot(card.x - agent.x, card.z - agent.z)
    return {
      x: pose.x + Math.sin(pose.heading) * reach,
      y: pose.elevation + lift,
      z: pose.z + Math.cos(pose.heading) * reach
    }
  }
  // A bottom-centre anchor moved out from under floating chrome, where the area has room.
  const clearOf = (
    at: { x: number; y: number },
    box: { width: number; height: number },
    area: Rect,
    obstacles: readonly Rect[]
  ) => {
    const rect = {
      left: at.x - box.width / 2,
      right: at.x + box.width / 2,
      top: at.y - box.height,
      bottom: at.y
    }
    const moved = clearOfObstacles(rect, area, obstacles)
    return moved ? { x: at.x, y: moved.bottom } : at
  }
  const measure = (element: HTMLElement, key: string) => {
    const cached = sizes.get(element)
    if (cached?.key === key) return cached
    const fresh = { key, width: element.offsetWidth, height: element.offsetHeight }
    sizes.set(element, fresh)
    return fresh
  }

  useFrame((state) => {
    const { camera, size } = state
    invalidateRef.current = state.invalidate
    // Cards only move when the camera, the viewport or the inputs change; skip idle frames.
    const zoom = 'zoom' in camera && typeof camera.zoom === 'number' ? camera.zoom : 1
    const { position, quaternion } = camera
    const last = lastRef.current
    const obstacles = readCanvasObstacles(anchors.cards.values().next().value?.parentElement)
    const view = last.view
    const hasMoved =
      store(view, 0, position.x) |
      store(view, 1, position.y) |
      store(view, 2, position.z) |
      store(view, 3, quaternion.x) |
      store(view, 4, quaternion.y) |
      store(view, 5, quaternion.z) |
      store(view, 6, quaternion.w) |
      store(view, 7, zoom) |
      store(view, 8, size.width) |
      store(view, 9, size.height)
    const isSameView =
      hasMoved === 0 &&
      last.cards === cards &&
      last.stacks === stacks &&
      last.band === band &&
      last.selectedAgentKey === selectedAgentKey &&
      last.layout === inspectorLayout &&
      last.measurements === measurementRevision.current &&
      last.heights === heights &&
      last.stackHeights === stackHeights &&
      last.cap === deskCardCap &&
      last.poses === officePoses.version() &&
      last.obstacles === obstacles.version
    if (isSameView) return
    last.cards = cards
    last.stacks = stacks
    last.band = band
    last.selectedAgentKey = selectedAgentKey
    last.layout = inspectorLayout
    last.measurements = measurementRevision.current
    last.heights = heights
    last.stackHeights = stackHeights
    last.cap = deskCardCap
    last.poses = officePoses.version()
    last.obstacles = obstacles.version
    // camera-controls moves the camera after three last built its matrix, and the renderer only
    // rebuilds it after this callback: without this the cards trail the canvas while it turns.
    camera.updateMatrixWorld()

    const insets = hudSafeInsets(selectedAgentKey !== null, inspectorLayout)
    const safeArea = cardSafeArea(size, insets)
    const sizeOf = (element: HTMLElement, card: NameCard, isSelected: boolean) =>
      measure(
        element,
        `${band}:${isSelected}:${card.title}:${card.detail}:${card.status}:${measurementRevision.current}`
      )
    const showOverflow = (count: number) => {
      if (count > 0) overflow.current = overflowBadge(overflow.current, anchors)
      const badge = overflow.current
      if (!badge) return
      const text = `+${count} more`
      if (count > 0 && badge.textContent !== text) badge.textContent = text
      badge.style.transform =
        count > 0
          ? `translate(${safeArea.left + STACK_GAP}px, ${safeArea.top + STACK_GAP}px)`
          : OFFSCREEN
    }
    if (band === 'building') {
      showOverflow(0)
      for (const card of cards) {
        const element = anchors.cards.get(card.agentKey)
        const anchor = anchorOf(card, card.kind === 'card' ? CARD_HEIGHT : PILL_HEIGHT)
        const at =
          element && card.agentKey === selectedAgentKey
            ? toScreen(camera, size, anchor.x, anchor.y, anchor.z)
            : null
        const box = element && at ? sizeOf(element, card, true) : null
        place(
          element,
          at && box ? clearOf(pinInside(at, box, safeArea), box, safeArea, obstacles.rects) : null
        )
      }
      hideAll(anchors.dots)
      const columnWidth = Math.min(STACK_COLUMN_WIDTH, Math.max(1, safeArea.right - safeArea.left))
      let columnLeft = safeArea.left
      let rowTop = safeArea.top
      const summaryElements = stacks.flatMap((stack) => {
        const element = anchors.stacks.get(stack.projectKey)
        return element ? [element] : []
      })
      for (const element of summaryElements)
        if (element.style.maxWidth !== `${columnWidth}px`)
          element.style.maxWidth = `${columnWidth}px`
      const summarySizes = summaryElements.map((element) => ({
        element,
        height: element.offsetHeight
      }))
      for (const { element, height } of summarySizes) {
        if (rowTop + height > safeArea.bottom) {
          rowTop = safeArea.top
          columnLeft += columnWidth + STACK_GAP
        }
        const fits =
          columnLeft + columnWidth <= safeArea.right && rowTop + height <= safeArea.bottom
        place(element, fits ? { x: columnLeft + columnWidth / 2, y: rowTop + height } : null)
        rowTop += height + STACK_GAP
      }
      return
    }

    // Pick, then place: every size is read before any card is written, so one pass lays out once.
    const candidates: CullCandidate[] = []
    const positions = new Map<string, { x: number; y: number }>()
    const unplaced: (HTMLElement | undefined)[] = []
    for (const card of cards) {
      const element = anchors.cards.get(card.agentKey)
      const isSelected = card.agentKey === selectedAgentKey
      const anchor = anchorOf(card, card.kind === 'card' ? CARD_HEIGHT : PILL_HEIGHT)
      const at = toScreen(camera, size, anchor.x, anchor.y, anchor.z)
      if (!element || !at) {
        unplaced.push(element)
        continue
      }
      const { width, height } = sizeOf(element, card, isSelected)
      // The selected card stays readable: pinned inside the safe area and moved clear of chrome.
      const placed = isSelected
        ? clearOf(
            pinInside(at, { width, height }, safeArea),
            { width, height },
            safeArea,
            obstacles.rects
          )
        : at
      positions.set(card.agentKey, placed)
      candidates.push({
        agentKey: card.agentKey,
        projectKey: card.projectKey,
        status: card.status,
        updatedAtMs: card.updatedAtMs,
        isSelected,
        rect: {
          left: placed.x - width / 2,
          right: placed.x + width / 2,
          top: placed.y - height,
          bottom: placed.y
        }
      })
    }

    // Desk zoom culls by collision only: stacking there would fold away the neighbours in view.
    const isDesk = band === 'desk'
    const outcome = cullCards(candidates, safeArea, {
      stackProjects: !isDesk,
      cap: isDesk ? deskCardCap : Number.POSITIVE_INFINITY,
      obstacles: obstacles.rects
    })
    for (const element of unplaced) place(element, null)
    showOverflow(outcome.capped)
    for (const card of cards) {
      const isShown = outcome.cards.has(card.agentKey)
      if (positions.has(card.agentKey))
        place(
          anchors.cards.get(card.agentKey),
          isShown ? (positions.get(card.agentKey) ?? null) : null
        )
      const dotAt = outcome.dots.has(card.agentKey) ? anchorOf(card, DOT_HEIGHT) : null
      const dot = dotAt ? toScreen(camera, size, dotAt.x, dotAt.y, dotAt.z) : null
      place(anchors.dots.get(card.agentKey), dot)
    }
    if (isDesk) hideAll(anchors.stacks)
    for (const stack of isDesk ? [] : stacks) {
      const isStacked =
        size.width >= COMPACT_OFFICE_WIDTH && outcome.stackedProjects.has(stack.projectKey)
      place(
        anchors.stacks.get(stack.projectKey),
        isStacked
          ? toScreen(
              camera,
              size,
              stack.x,
              (stackHeights.get(stack.projectKey) ?? 0) + STACK_HEIGHT,
              stack.z
            )
          : null
      )
    }
  })
  return null
}
