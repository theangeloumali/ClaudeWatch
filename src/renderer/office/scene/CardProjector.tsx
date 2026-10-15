import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type Camera } from 'three'
import type { ZoomBand } from '../logic/camera-bands'
import { cullCards, type CullCandidate } from '../logic/card-culling'
import type { NameCard, ProjectStack } from '../logic/name-cards'
import { cardSafeArea } from '../logic/zone-framing'
import { hudSafeInsets, type InspectorLayout } from '../logic/hud-layout'
import type { AgentView } from '../../../shared/office/types'
import type { FloorGeometry } from '../scene-model'
import { agentElevation, floorElevation } from './all-floor-model'
import { findZone } from '../logic/zone-model'

// Over an agent's head (scene/Robot.tsx draws agents 1.65 m tall).
export const CARD_HEIGHT = 2.45
const PILL_HEIGHT = 1.55
const DOT_HEIGHT = 1.7
const STACK_HEIGHT = 2.6
const STACK_COLUMN_WIDTH = 360
const STACK_GAP = 8
const COMPACT_OFFICE_WIDTH = 1024
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
  visibleFloors?: readonly FloorGeometry[]
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

// Runs inside the Canvas each projected frame: moves the DOM cards, and outside the desk band
// culls overlapping cards in screen space (card-culling.ts). Only style is written, never React state.
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
  const heights = useMemo(
    () => new Map(agents?.map((agent) => [agent.agentKey, agentElevation(agent)])),
    [agents]
  )
  const stackHeights = useMemo(
    () =>
      new Map(
        stacks.map((stack) => {
          const floor = visibleFloors?.find(
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
  }>({
    view: [],
    cards: null,
    stacks: null,
    band: null,
    selectedAgentKey: null,
    layout: undefined,
    measurements: -1,
    heights: null,
    stackHeights: null
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
      last.stackHeights === stackHeights
    if (isSameView) return
    last.cards = cards
    last.stacks = stacks
    last.band = band
    last.selectedAgentKey = selectedAgentKey
    last.layout = inspectorLayout
    last.measurements = measurementRevision.current
    last.heights = heights
    last.stackHeights = stackHeights
    // camera-controls moves the camera after three last built its matrix, and the renderer only
    // rebuilds it after this callback: without this the cards trail the canvas while it turns.
    camera.updateMatrixWorld()

    if (band === 'building') {
      for (const card of cards) {
        const height =
          (heights.get(card.agentKey) ?? 0) + (card.kind === 'card' ? CARD_HEIGHT : PILL_HEIGHT)
        place(
          anchors.cards.get(card.agentKey),
          card.agentKey === selectedAgentKey ? toScreen(camera, size, card.x, height, card.z) : null
        )
      }
      hideAll(anchors.dots)
      const insets = hudSafeInsets(selectedAgentKey !== null, inspectorLayout)
      const safe = { ...cardSafeArea(size, insets), top: insets.top }
      const columnWidth = Math.min(STACK_COLUMN_WIDTH, Math.max(1, safe.right - safe.left))
      let columnLeft = safe.left
      let rowTop = safe.top
      const summaryElements = stacks.flatMap((stack) => {
        const element = anchors.stacks.get(stack.projectKey)
        return element ? [element] : []
      })
      for (const element of summaryElements) element.style.maxWidth = `${columnWidth}px`
      const summarySizes = summaryElements.map((element) => ({
        element,
        height: element.offsetHeight
      }))
      for (const { element, height } of summarySizes) {
        if (rowTop + height > safe.bottom) {
          rowTop = safe.top
          columnLeft += columnWidth + STACK_GAP
        }
        const fits = columnLeft + columnWidth <= safe.right && rowTop + height <= safe.bottom
        place(element, fits ? { x: columnLeft + columnWidth / 2, y: rowTop + height } : null)
        rowTop += height + STACK_GAP
      }
      return
    }

    if (band === 'desk') {
      for (const card of cards) {
        const height =
          (heights.get(card.agentKey) ?? 0) + (card.kind === 'card' ? CARD_HEIGHT : PILL_HEIGHT)
        place(anchors.cards.get(card.agentKey), toScreen(camera, size, card.x, height, card.z))
      }
      hideAll(anchors.dots)
      hideAll(anchors.stacks)
      return
    }

    const candidates: CullCandidate[] = []
    const positions = new Map<string, { x: number; y: number }>()
    for (const card of cards) {
      const element = anchors.cards.get(card.agentKey)
      const isSelected = card.agentKey === selectedAgentKey
      const at = toScreen(
        camera,
        size,
        card.x,
        (heights.get(card.agentKey) ?? 0) + (card.kind === 'card' ? CARD_HEIGHT : PILL_HEIGHT),
        card.z
      )
      if (!element || !at) {
        place(element, null)
        continue
      }
      const { width, height } = measure(
        element,
        `${band}:${isSelected}:${card.title}:${card.detail}:${card.status}:${measurementRevision.current}`
      )
      positions.set(card.agentKey, at)
      candidates.push({
        agentKey: card.agentKey,
        projectKey: card.projectKey,
        status: card.status,
        updatedAtMs: card.updatedAtMs,
        isSelected,
        rect: { left: at.x - width / 2, right: at.x + width / 2, top: at.y - height, bottom: at.y }
      })
    }

    const outcome = cullCards(
      candidates,
      cardSafeArea(size, hudSafeInsets(selectedAgentKey !== null, inspectorLayout))
    )
    for (const card of cards) {
      const isShown = outcome.cards.has(card.agentKey)
      if (positions.has(card.agentKey))
        place(
          anchors.cards.get(card.agentKey),
          isShown ? (positions.get(card.agentKey) ?? null) : null
        )
      const dot = outcome.dots.has(card.agentKey)
        ? toScreen(camera, size, card.x, (heights.get(card.agentKey) ?? 0) + DOT_HEIGHT, card.z)
        : null
      place(anchors.dots.get(card.agentKey), dot)
    }
    for (const stack of stacks) {
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
