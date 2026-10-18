import { useMemo, type ReactNode } from 'react'
import { FrontSide } from 'three'
import type { WallSegment } from '../logic/room-layout'
import { zoneSignPlacement, zoneWalls } from '../logic/zone-model'
import type { ZoneGeometry } from '../scene-model'
import { Matte } from '../scene/InstancedParts'
import { useSignTexture } from '../scene/textures'
import { box, Parts, type PartSpec } from './parts'
import type { FloorProps, ThemePalette } from './types'

const FLAT = -Math.PI / 2
// Below the agent-office floors (y 0.012) so nested plates never z-fight.
const COMPANY_PLATE_Y = 0.003
const PROJECT_PLATE_Y = 0.007
const FENCE = { height: 0.6, thickness: 0.18 }
const PROJECT_WALL = { height: 1.15, thickness: 0.14 }
const COMPANY_SIGN = { y: 3.6, height: 1.1, maxWidth: 7 }
const PROJECT_SIGN = { y: 1.75, width: 2.8, height: 0.58 }

// Unit geometry scaled per piece, so BatchedScene merges every wall and plate into one draw.
function Plate({ zone, y, color }: { zone: ZoneGeometry; y: number; color: string }) {
  return (
    <mesh
      position={[zone.x, y, zone.z]}
      rotation={[FLAT, 0, 0]}
      scale={[zone.width, zone.depth, 1]}
    >
      <planeGeometry args={[1, 1]} />
      <Matte color={color} />
    </mesh>
  )
}

function Walls({
  segments,
  height,
  thickness,
  color
}: {
  segments: readonly WallSegment[]
  height: number
  thickness: number
  color: string
}) {
  return (
    <>
      {segments.map((segment, index) => (
        <mesh
          key={index}
          position={[segment.x, height / 2, segment.z]}
          rotation={[0, segment.normalZ === 0 ? Math.PI / 2 : 0, 0]}
          scale={[segment.length + thickness, height, thickness]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <Matte color={color} />
        </mesh>
      ))}
    </>
  )
}

function Sign({
  zone,
  y,
  width,
  height
}: {
  zone: ZoneGeometry
  y: number
  width: number
  height: number
}) {
  const place = zoneSignPlacement(zone)
  const texture = useSignTexture(zone.label)
  // Two single-sided faces instead of DoubleSide, so the name never reads mirrored from behind.
  return (
    <group position={[place.x, y, place.z]} rotation={[0, place.rotationY, 0]}>
      {[0, Math.PI].map((turn) => (
        <mesh key={turn} rotation={[0, turn, 0]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} side={FrontSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

// A company's grounds: its own ground tint, a low fence with one wide gate, the theme's gate
// ornament there and the company name on a large sign above it.
export function CompanyGrounds({
  zone,
  palette,
  gate
}: {
  zone: ZoneGeometry
  palette: ThemePalette
  gate: ReactNode
}) {
  const segments = useMemo(() => zoneWalls(zone), [zone])
  const place = zoneSignPlacement(zone)
  const signWidth = Math.min(COMPANY_SIGN.maxWidth, Math.max(3, zone.width * 0.3))
  return (
    <group>
      <Plate zone={zone} y={COMPANY_PLATE_Y} color={palette.stone} />
      <Walls
        segments={segments}
        height={FENCE.height}
        thickness={FENCE.thickness}
        color={palette.lacquer}
      />
      <group position={[place.x, 0, place.z]} rotation={[0, place.rotationY, 0]}>
        {gate}
      </group>
      <Sign zone={zone} y={COMPANY_SIGN.y} width={signWidth} height={COMPANY_SIGN.height} />
    </group>
  )
}

// A project office: a walled room with one door and the project's sign over it.
export function ProjectRoom({ zone, palette }: { zone: ZoneGeometry; palette: ThemePalette }) {
  const segments = useMemo(() => zoneWalls(zone), [zone])
  return (
    <group>
      <Plate zone={zone} y={PROJECT_PLATE_Y} color={palette.floor} />
      <Walls
        segments={segments}
        height={PROJECT_WALL.height}
        thickness={PROJECT_WALL.thickness}
        color={palette.paper}
      />
      <Sign
        zone={zone}
        y={PROJECT_SIGN.y}
        width={PROJECT_SIGN.width}
        height={PROJECT_SIGN.height}
      />
    </group>
  )
}

// The slab a themed floor stands on, with the corridor laid over it as a lane.
export function FloorSlab({ floor, ground, lane }: FloorProps & { ground: string; lane: string }) {
  return (
    <Parts
      parts={[
        box([0, -0.16, 0], [floor.width + 1, 0.3, floor.depth + 1], ground),
        box([0, -0.005, floor.corridor.z], [floor.width, 0.02, floor.corridor.width], lane)
      ]}
    />
  )
}

export function LiftAt({ floor, parts }: FloorProps & { parts: readonly PartSpec[] }) {
  return (
    <group position={[floor.elevator.x, 0, floor.elevator.z]}>
      <Parts parts={parts} />
    </group>
  )
}
