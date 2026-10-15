import { useFrame } from '@react-three/fiber'
import { useMemo, type RefObject } from 'react'
import { Vector3 } from 'three'
import type { AgentView } from '../../../shared/office/types'
import { OFFSCREEN } from '../scene/CardProjector'
import type { FloorGeometry } from '../scene-model'
import { MARKER_Y } from './figure'
import { groundHeight } from './walk-ground'
import { TalkPrompt } from './TalkPrompt'
import type { Player } from './walking'

interface PlayerLabelAnchors {
  marker: RefObject<HTMLDivElement | null>
  prompt: RefObject<HTMLDivElement | null>
}

// dry-new: reuse the card overlay surface instead of mounting a separate React root in each avatar.
export function PlayerLabels({
  anchors,
  nearAgent
}: {
  anchors: PlayerLabelAnchors
  nearAgent?: AgentView
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={anchors.marker}
        style={{ transform: OFFSCREEN }}
        className="absolute left-0 top-0 rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-paper"
      >
        You
      </div>
      <div ref={anchors.prompt} style={{ transform: OFFSCREEN }} className="absolute left-0 top-0">
        {nearAgent && <TalkPrompt label={nearAgent.label} />}
      </div>
    </div>
  )
}

export function PlayerLabelProjector({
  anchors,
  player,
  floor,
  nearAgent
}: {
  anchors: PlayerLabelAnchors
  player: Player
  floor: FloorGeometry
  nearAgent?: AgentView
}) {
  const point = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    const project = (element: HTMLDivElement | null, x: number, y: number, z: number): void => {
      if (!element) return
      point.set(x, y, z).project(camera)
      element.style.transform =
        Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1
          ? OFFSCREEN
          : `translate(${((point.x + 1) * size.width) / 2 - element.offsetWidth / 2}px, ${((1 - point.y) * size.height) / 2 - element.offsetHeight / 2}px)`
    }
    project(
      anchors.marker.current,
      player.position.x,
      (player.elevation ?? groundHeight(floor, player.position)) + MARKER_Y + 0.3,
      player.position.z
    )
    if (nearAgent)
      project(anchors.prompt.current, nearAgent.x, (nearAgent.elevation ?? 0) + 3.7, nearAgent.z)
    else if (anchors.prompt.current) anchors.prompt.current.style.transform = OFFSCREEN
  })
  return null
}
