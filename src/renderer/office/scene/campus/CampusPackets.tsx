import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color } from 'three'
import type { CampusSpoke } from '../../logic/campus-geometry'
import {
  packetSpeedFor,
  runningCountsKey,
  type RunningRoom,
  type Vec3
} from '../../logic/campus-motion'
import { campusPacketPaths, type PacketPath } from '../../logic/campus-packets'
import { campusGlowMaterial, SOFT_DOT_FRAGMENT } from './campus-shaders'

const PACKETS_PER_PATH = { road: 4, arc: 2 } as const
// Each packet is a head and a short tail of fainter, smaller dots behind it.
const TAIL_DOTS = 4
const ARC_SPEED = 0.3
const DOT_PX = { road: 9, arc: 7 } as const

// `t` runs 0 at the room to 1 at the Brain along a quadratic curve; the tail trails behind.
const PACKET_VERTEX = /* glsl */ `
uniform float uTime;
attribute vec3 curveFrom;
attribute vec3 curveControl;
attribute vec3 curveTo;
attribute vec4 packet; // offset, speed, tail index, size in px
varying vec3 vColor;
varying float vAlpha;
void main() {
  float tail = packet.z;
  float t = fract(packet.x + uTime * packet.y) - tail * 0.018;
  float u = 1.0 - t;
  vec3 at = u * u * curveFrom + 2.0 * u * t * curveControl + t * t * curveTo;
  vColor = color;
  vAlpha = (t < 0.0 ? 0.0 : 1.0) * smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t)
    * (1.0 - tail * 0.22);
  gl_PointSize = packet.w * (1.0 - tail * 0.18);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 1.0);
}
`

const dotCount = (paths: readonly PacketPath[]): number =>
  paths.reduce((sum, path) => sum + PACKETS_PER_PATH[path.kind] * TAIL_DOTS, 0)

function packetGeometry(
  paths: readonly PacketPath[],
  chipOf: (projectKey: string | null) => string
): BufferGeometry | null {
  const count = dotCount(paths)
  if (count === 0) return null
  const curves = { from: new Float32Array(count * 3), control: new Float32Array(count * 3) }
  const to = new Float32Array(count * 3)
  const packets = new Float32Array(count * 4)
  const colors = new Float32Array(count * 3)
  const tint = new Color()
  const put = (array: Float32Array, at: number, point: Vec3): void =>
    array.set([point.x, point.y, point.z], at * 3)
  let dot = 0
  paths.forEach((path, pathIndex) => {
    tint.set(chipOf(path.projectKey)).lerp(new Color('#ffffff'), 0.35)
    const perPath = PACKETS_PER_PATH[path.kind]
    for (let packet = 0; packet < perPath; packet++) {
      const offset = (packet / perPath + pathIndex * 0.13) % 1
      for (let tail = 0; tail < TAIL_DOTS; tail++) {
        put(curves.from, dot, path.from)
        put(curves.control, dot, path.control)
        put(to, dot, path.to)
        packets.set([offset, ARC_SPEED, tail, DOT_PX[path.kind]], dot * 4)
        tint.toArray(colors, dot * 3)
        dot++
      }
    }
  })
  const geometry = new BufferGeometry()
  // Placed in the shader; three still needs a position attribute to count the points.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('curveFrom', new BufferAttribute(curves.from, 3))
  geometry.setAttribute('curveControl', new BufferAttribute(curves.control, 3))
  geometry.setAttribute('curveTo', new BufferAttribute(to, 3))
  geometry.setAttribute('packet', new BufferAttribute(packets, 4))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

// Road packets take their room's running count as speed; arcs keep one steady pace.
function writeRoadSpeeds(
  geometry: BufferGeometry,
  paths: readonly PacketPath[],
  rooms: readonly RunningRoom[] | undefined
): void {
  const running = new Map(rooms?.map((room) => [room.projectKey, room.runningCount]))
  const packet = geometry.getAttribute('packet')
  let dot = 0
  for (const path of paths) {
    const dots = PACKETS_PER_PATH[path.kind] * TAIL_DOTS
    if (path.kind === 'road') {
      const speed = packetSpeedFor(running.get(path.projectKey ?? '') ?? 0)
      for (let index = dot; index < dot + dots; index++) packet.setY(index, speed)
    }
    dot += dots
  }
  packet.needsUpdate = true
}

interface CampusPacketsProps {
  spokes: readonly CampusSpoke[]
  core: Vec3
  chipOf: (projectKey: string | null) => string
  rooms?: readonly RunningRoom[]
}

// Bright packets riding every road and arc into the Brain: one Points draw, moved by the shader.
export function CampusPackets({ spokes, core, chipOf, rooms }: CampusPacketsProps) {
  const paths = useMemo(() => campusPacketPaths(spokes, core), [spokes, core])
  const geometry = useMemo(() => packetGeometry(paths, chipOf), [paths, chipOf])
  const material = useMemo(() => campusGlowMaterial(PACKET_VERTEX, SOFT_DOT_FRAGMENT), [])
  useEffect(() => () => geometry?.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  const roomsRef = useRef(rooms)
  roomsRef.current = rooms
  const runningKey = runningCountsKey(rooms)
  useEffect(() => {
    if (geometry) writeRoadSpeeds(geometry, paths, roomsRef.current)
  }, [geometry, paths, runningKey])
  if (!geometry) return null
  // The shader places every dot, so the empty bounds would cull them all.
  return (
    <points geometry={geometry} material={material} frustumCulled={false} name="campus-packets" />
  )
}
