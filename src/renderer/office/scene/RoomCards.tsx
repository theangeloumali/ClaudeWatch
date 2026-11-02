import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import type { MemoryNotes } from '../../../shared/office/types'
import { crestFor } from '../../deck/roster'
import { clearOfObstacles, pinInside, type Rect } from '../logic/card-culling'
import type { CampusRoomColors } from '../logic/campus-colors'
import { hudSafeInsets, type InspectorLayout } from '../logic/hud-layout'
import type { RoomCard } from '../logic/room-cards'
import { cardSafeArea } from '../logic/zone-framing'
import type { OfficeTheme } from '../themes/types'
import { GLASS_CLASS, GLASS_META_CLASS, inkOn } from '../hud/glass'
import { setCameraZoom } from '../hud/camera-zoom'
import { readCanvasObstacles } from './canvas-obstacles'
import { OFFSCREEN } from './CardProjector'
import { storeSlot } from './snapshot-slot'

const ROOM_CARD_LIFT = 3.2
const BRAIN_CARD_LIFT = 4.6
const BRAIN_KEY = 'brain'
const NOTE_COUNT = new Intl.NumberFormat('en-US')

export type RoomCardAnchors = Map<string, HTMLElement>

export interface CampusCards {
  rooms: readonly RoomCard[]
  colors: ReadonlyMap<string, CampusRoomColors>
  hub: { x: number; z: number }
  memory: MemoryNotes | undefined
}

export function useRoomCardAnchors(): RoomCardAnchors {
  const [anchors] = useState<RoomCardAnchors>(() => new Map())
  return anchors
}

export function brainLine(memory: MemoryNotes | undefined): string {
  return memory ? `${NOTE_COUNT.format(memory.notes)} notes · shared memory` : 'memory unavailable'
}

interface RoomCardLayerProps {
  rooms: readonly RoomCard[]
  colors: ReadonlyMap<string, CampusRoomColors>
  skins: OfficeTheme['robot']['skins']
  memory: MemoryNotes | undefined
  anchors: RoomCardAnchors
}

// The Campus labels: one card per room and the Brain card over the hub. The same counts are
// in the side panels, so the layer is hidden from assistive tech, as the name cards are.
export function RoomCardLayer({ rooms, colors, skins, memory, anchors }: RoomCardLayerProps) {
  const register = (key: string) => (element: HTMLElement | null) => {
    if (element) anchors.set(key, element)
    else anchors.delete(key)
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={register(BRAIN_KEY)}
        style={{ transform: OFFSCREEN }}
        className={`${GLASS_CLASS} absolute left-0 top-0 px-3 py-2 text-center`}
      >
        <p className="text-[11px] font-bold tracking-[0.18em]">THE BRAIN</p>
        <p className={GLASS_META_CLASS}>{brainLine(memory)}</p>
      </div>
      {rooms.map((room) => {
        const chip = colors.get(room.projectKey)?.chip ?? '#64748b'
        return (
          <div
            key={room.projectKey}
            ref={register(room.projectKey)}
            style={{ transform: OFFSCREEN }}
            className={`${GLASS_CLASS} absolute left-0 top-0 flex items-center gap-2 py-1.5 pl-1.5 pr-2.5`}
          >
            <span
              className="grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-bold"
              style={{ backgroundColor: chip, color: inkOn(chip) }}
            >
              {crestFor(room.label)}
            </span>
            <span className="min-w-0">
              <span className="block max-w-[180px] truncate text-xs font-semibold">
                {room.label}
              </span>
              <span className={`${GLASS_META_CLASS} block whitespace-nowrap`}>
                <span className={room.runningCount > 0 ? 'text-emerald-400' : 'text-white/40'}>
                  ●
                </span>{' '}
                {room.agentCount} {room.agentCount === 1 ? 'agent' : 'agents'} · {room.runningCount}{' '}
                running
              </span>
            </span>
            {room.faces.length > 0 && (
              <span className="flex shrink-0 items-center pl-1">
                {room.faces.map((face) => {
                  const skin = skins[face.provider]
                  return (
                    <span
                      key={face.agentKey}
                      className="-ml-1.5 grid size-6 place-items-center rounded-full border-2 text-[9px] font-bold first:ml-0"
                      style={{
                        backgroundColor: skin.body,
                        borderColor: skin.trim,
                        color: inkOn(skin.body)
                      }}
                    >
                      {face.initials}
                    </span>
                  )
                })}
                {room.moreCount > 0 && (
                  <span className={`${GLASS_META_CLASS} pl-1`}>+{room.moreCount}</span>
                )}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface RoomCardProjectorProps {
  rooms: readonly RoomCard[]
  hub: { x: number; z: number }
  anchors: RoomCardAnchors
  hasInspector: boolean
  inspectorLayout?: InspectorLayout
}

// Places the Brain card first, then each room card, each kept clear of the HUD and of every
// card already placed; a card with no clear spot hides rather than overlap.
export function RoomCardProjector({
  rooms,
  hub,
  anchors,
  hasInspector,
  inspectorLayout
}: RoomCardProjectorProps) {
  const point = useMemo(() => new Vector3(), [])
  const view = useRef<number[]>([])
  const last = useRef<{ rooms: readonly RoomCard[] | null; obstacles: number }>({
    rooms: null,
    obstacles: -1
  })
  useFrame(({ camera, size }) => {
    const zoom = 'zoom' in camera && typeof camera.zoom === 'number' ? camera.zoom : 1
    setCameraZoom(zoom)
    const layer = anchors.get(BRAIN_KEY)?.parentElement
    const obstacles = readCanvasObstacles(layer ?? undefined)
    const slots = view.current
    const hasMoved =
      storeSlot(slots, 0, camera.position.x) |
      storeSlot(slots, 1, camera.position.y) |
      storeSlot(slots, 2, camera.position.z) |
      storeSlot(slots, 3, camera.quaternion.y) |
      storeSlot(slots, 4, zoom) |
      storeSlot(slots, 5, size.width) |
      storeSlot(slots, 6, size.height) |
      storeSlot(slots, 7, hasInspector ? 1 : 0)
    if (!hasMoved && last.current.rooms === rooms && last.current.obstacles === obstacles.version)
      return
    last.current = { rooms, obstacles: obstacles.version }
    camera.updateMatrixWorld()
    const area = cardSafeArea(size, hudSafeInsets(hasInspector, inspectorLayout))
    const placed: Rect[] = [...obstacles.rects]
    const targets = [
      { key: BRAIN_KEY, x: hub.x, y: BRAIN_CARD_LIFT, z: hub.z },
      ...rooms.map((room) => ({ key: room.projectKey, x: room.x, y: ROOM_CARD_LIFT, z: room.z }))
    ]
    for (const target of targets) {
      const element = anchors.get(target.key)
      if (!element) continue
      point.set(target.x, target.y, target.z).project(camera)
      const isOnScreen = point.z < 1 && Math.abs(point.x) <= 1.1 && Math.abs(point.y) <= 1.1
      const box = { width: element.offsetWidth, height: element.offsetHeight }
      const at = pinInside(
        { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height },
        box,
        area
      )
      const rect = clearOfObstacles(
        {
          left: at.x - box.width / 2,
          right: at.x + box.width / 2,
          top: at.y - box.height,
          bottom: at.y
        },
        area,
        placed
      )
      if (!isOnScreen || !rect) {
        element.style.transform = OFFSCREEN
        continue
      }
      placed.push(rect)
      element.style.transform = `translate(${(rect.left + rect.right) / 2}px, ${rect.bottom}px) translate(-50%, -100%)`
    }
  })
  return null
}
