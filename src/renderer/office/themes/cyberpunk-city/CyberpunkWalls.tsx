import { useMemo } from 'react'
import { doorSide } from '../../logic/room-layout'
import { InstancedParts } from '../../scene/InstancedParts'
import type { InstancePlacement } from '../../scene/instancing'
import { BandedWalls, type WallBand } from '../BandedWalls'
import { Parts, box } from '../parts'
import type { WallsProps } from '../types'
import { UNIT_SHAPES } from '../unit-parts'
import { CYBERPUNK_PALETTE as palette } from './palette'

const BANDS: readonly WallBand[] = [
  {
    name: 'cyberpunk-skirt',
    color: palette.ink,
    thickness: 0.12,
    span: () => ({ y: 0.03, scaleY: 0.06 })
  },
  {
    name: 'cyberpunk-infill',
    color: palette.brass,
    thickness: 0.09,
    span: (height) => ({
      y: 0.06 + Math.max(0.01, Math.min(0.72, height) - 0.09) / 2,
      scaleY: Math.max(0.01, Math.min(0.72, height) - 0.09)
    })
  },
  {
    name: 'cyberpunk-cap',
    color: palette.ink,
    thickness: 0.12,
    span: (height) => ({ y: Math.min(0.72, height) - 0.015, scaleY: 0.03 })
  }
]

// dry-new: upper glass is bounded to one rear window per room; opaque work partitions stay low.
export function CyberpunkWalls(props: WallsProps) {
  const windows = useMemo(
    () =>
      props.rooms.map(
        (room) =>
          ({
            x: room.x,
            z: room.z + ((doorSide(room) === 'north' ? 1 : -1) * room.depth) / 2,
            y: 1.17,
            rotationY: 0,
            scaleX: Math.max(0.01, Math.min(1.25, room.width - 0.25)),
            scaleY: 0.72,
            scaleZ: 0.018
          }) satisfies InstancePlacement
      ),
    [props.rooms]
  )
  const frames = useMemo(
    () =>
      windows.flatMap((window) => [
        ...[-1, 1].map((side) =>
          box(
            [window.x + (side * window.scaleX) / 2, window.y, window.z],
            [0.035, 0.78, 0.045],
            palette.ink
          )
        ),
        ...[-1, 1].map((side) =>
          box(
            [window.x, window.y + side * 0.375, window.z],
            [window.scaleX + 0.035, 0.03, 0.045],
            palette.ink
          )
        )
      ]),
    [windows]
  )
  return (
    <>
      <BandedWalls {...props} bands={BANDS} />
      {props.mode !== 'down' && (
        <>
          <Parts parts={frames} />
          <InstancedParts placements={windows}>
            {UNIT_SHAPES.box}
            <meshStandardMaterial
              color={palette.glow}
              transparent
              opacity={0.22}
              roughness={0.8}
              depthWrite={false}
            />
          </InstancedParts>
        </>
      )}
    </>
  )
}
