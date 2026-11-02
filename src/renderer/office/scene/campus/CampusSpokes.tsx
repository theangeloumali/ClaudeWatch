import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CampusSpoke } from '../../logic/campus-geometry'

const ROAD_WIDTH_M = 2.2
const ROAD_HEIGHT_M = 0.06
const DASH_LENGTH_M = 0.8
const DASH_GAP_M = 0.7
const DASH_WIDTH_M = 0.12
// Just outside the asphalt, so the trail reads as a glow along each kerb.
const TRAIL_OFFSET_M = ROAD_WIDTH_M / 2 + 0.15
const TRAIL_HEIGHT_M = 0.04
const ASPHALT = new Color('#1b2030')
const DASH = new Color('#c9d2e4')

// A box laid along a spoke, starting `along` metres in from its room end.
function stripAlong(
  spoke: CampusSpoke,
  size: { length: number; width: number; height: number },
  place: { along: number; y: number },
  color: Color
): BufferGeometry {
  const dx = spoke.to.x - spoke.from.x
  const dz = spoke.to.z - spoke.from.z
  const total = Math.hypot(dx, dz)
  const centre = (place.along + size.length / 2) / total
  const geometry = new BoxGeometry(size.width, size.height, size.length)
    .rotateY(Math.atan2(dx, dz))
    .translate(spoke.from.x + dx * centre, place.y, spoke.from.z + dz * centre)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let vertex = 0; vertex < count; vertex++) color.toArray(colors, vertex * 3)
  return geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

function roadParts(spoke: CampusSpoke): BufferGeometry[] {
  const length = Math.hypot(spoke.to.x - spoke.from.x, spoke.to.z - spoke.from.z)
  const road = { length, width: ROAD_WIDTH_M, height: ROAD_HEIGHT_M }
  const parts = [stripAlong(spoke, road, { along: 0, y: ROAD_HEIGHT_M / 2 }, ASPHALT)]
  const dash = { length: DASH_LENGTH_M, width: DASH_WIDTH_M, height: 0.01 }
  for (let along = DASH_GAP_M; along + DASH_LENGTH_M <= length; along += DASH_LENGTH_M + DASH_GAP_M)
    parts.push(stripAlong(spoke, dash, { along, y: ROAD_HEIGHT_M + 0.005 }, DASH))
  return parts
}

// Every road and its dashes in one buffer: one draw for all spokes.
function roadGeometry(spokes: readonly CampusSpoke[]): BufferGeometry | null {
  const parts = spokes.flatMap(roadParts)
  if (parts.length === 0) return null
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  return merged
}

// Both kerbs of every spoke as line segments, coloured by the room: the second draw.
function trailGeometry(
  spokes: readonly CampusSpoke[],
  chipOf: (spoke: CampusSpoke) => string
): BufferGeometry | null {
  if (spokes.length === 0) return null
  const positions = new Float32Array(spokes.length * 2 * 2 * 3)
  const colors = new Float32Array(positions.length)
  const tint = new Color()
  spokes.forEach((spoke, index) => {
    const dx = spoke.to.x - spoke.from.x
    const dz = spoke.to.z - spoke.from.z
    const length = Math.hypot(dx, dz) || 1
    // The right-hand normal in the ground plane.
    const nx = (dz / length) * TRAIL_OFFSET_M
    const nz = (-dx / length) * TRAIL_OFFSET_M
    tint.set(chipOf(spoke))
    for (const side of [-1, 1]) {
      const at = (index * 4 + (side + 1)) * 3
      positions.set([spoke.from.x + nx * side, TRAIL_HEIGHT_M, spoke.from.z + nz * side], at)
      positions.set([spoke.to.x + nx * side, TRAIL_HEIGHT_M, spoke.to.z + nz * side], at + 3)
      tint.toArray(colors, at)
      tint.toArray(colors, at + 3)
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

interface CampusSpokesProps {
  spokes: readonly CampusSpoke[]
  chipOf: (spoke: CampusSpoke) => string
}

// Static: rebuilt only when the ring changes, and nothing here asks for a frame.
export function CampusSpokes({ spokes, chipOf }: CampusSpokesProps) {
  const roads = useMemo(() => roadGeometry(spokes), [spokes])
  const trails = useMemo(() => trailGeometry(spokes, chipOf), [spokes, chipOf])
  useEffect(() => () => roads?.dispose(), [roads])
  useEffect(() => () => trails?.dispose(), [trails])
  return (
    <>
      {roads && (
        <mesh geometry={roads} name="campus-roads">
          <meshStandardMaterial vertexColors roughness={0.9} metalness={0.05} />
        </mesh>
      )}
      {trails && (
        <lineSegments geometry={trails} name="campus-trails">
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.85}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      )}
    </>
  )
}
