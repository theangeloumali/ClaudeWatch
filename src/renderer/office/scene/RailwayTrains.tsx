import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, Group, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { box, mergeParts, type FigurePart } from '../citizens/figure-parts'
import { cityClock } from '../logic/city-clock'
import { levelInUse, type QualityLevel } from '../logic/quality'
import { useQualityChoice } from '../quality-store'
import type { ThemePalette } from '../themes/types'
import { RAILWAY, type RailwayPlan } from '../town/railway-plan'
import { CAR_LENGTH, laneAt, trainRuns, type CarKind } from '../town/railway-runs'

// Bogies this near a car's middle keep its body on the deck through the ring's tight bends.
const BOGIE_M = 1.5
// A wagon's body is white so its per-wagon tint shows true.
const UNTINTED = '#FFFFFF'
const WAGON_TINTS: readonly (keyof ThemePalette)[] = [
  'wood',
  'copper',
  'brass',
  'stone',
  'lacquer',
  'gold'
]

// Faces +z, standing on the rail top at y = 0. Real scale, so never through citizenGeometry.
function carParts(kind: CarKind, palette: ThemePalette): FigurePart[] {
  const length = CAR_LENGTH[kind]
  const underframe = box(palette.ink, [2.3, 0.6, length - 0.6], [0, 0.4, 0])
  if (kind === 'wagon')
    return [
      underframe,
      box(UNTINTED, [2.5, 2.4, length], [0, 1.9, 0]),
      box(UNTINTED, [2.3, 0.15, length - 0.3], [0, 3.175, 0])
    ]
  if (kind === 'locomotive')
    return [
      underframe,
      box(palette.lacquer, [2.5, 2.4, length], [0, 1.9, 0]),
      box(palette.ink, [2.54, 0.6, 1.6], [0, 2.5, length / 2 - 1.2]),
      box(palette.stone, [2.3, 0.2, length - 0.4], [0, 3.2, 0])
    ]
  return [
    underframe,
    box(palette.paper, [2.5, 2.3, length], [0, 1.85, 0]),
    box(palette.copper, [2.52, 0.18, length - 0.2], [0, 1.35, 0]),
    box(palette.ink, [2.54, 0.7, length - 1.2], [0, 2.2, 0]),
    box(palette.stone, [2.3, 0.2, length - 0.4], [0, 3.1, 0])
  ]
}

export interface TrainSet {
  group: Group
  pose(nowMs: number): void
  dispose(): void
}

// One instanced draw per car kind, posed from the timetable: only the car matrices go up.
export function trainSet(
  railway: RailwayPlan,
  level: QualityLevel,
  palette: ThemePalette
): TrainSet {
  const runs = trainRuns(railway, level)
  const counts = new Map<CarKind, number>()
  for (const car of runs.flatMap((run) => run.cars))
    counts.set(car.kind, (counts.get(car.kind) ?? 0) + 1)
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 })
  const meshes = new Map<CarKind, InstancedMesh>()
  const group = new Group()
  const tint = new Color()
  for (const [kind, count] of counts) {
    const mesh = new InstancedMesh(mergeParts(kind, carParts(kind, palette)), material, count)
    mesh.name = kind
    mesh.frustumCulled = false
    if (kind === 'wagon')
      for (let slot = 0; slot < count; slot++)
        mesh.setColorAt(slot, tint.set(palette[WAGON_TINTS[slot % WAGON_TINTS.length]]))
    meshes.set(kind, mesh)
    group.add(mesh)
  }

  const place = new Object3D()
  let posedMs: number | null = null
  return {
    group,
    pose(nowMs) {
      // A pinned clock (reduced motion) moves nothing, so nothing goes up.
      if (nowMs === posedMs) return
      posedMs = nowMs
      for (const run of runs) {
        const { at } = run.at(nowMs / 1000)
        for (const car of run.cars) {
          const middle = at + car.offset
          const front = laneAt(run.lane, middle + BOGIE_M)
          const rear = laneAt(run.lane, middle - BOGIE_M)
          const heading = Math.atan2(front.x - rear.x, front.z - rear.z)
          place.position.set((front.x + rear.x) / 2, RAILWAY.railTop, (front.z + rear.z) / 2)
          place.rotation.set(0, car.isReversed ? heading + Math.PI : heading, 0)
          place.updateMatrix()
          meshes.get(car.kind)?.setMatrixAt(car.slot, place.matrix)
        }
      }
      for (const mesh of meshes.values()) {
        mesh.instanceMatrix.clearUpdateRanges()
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16)
        mesh.instanceMatrix.needsUpdate = true
      }
    },
    dispose() {
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose()
        mesh.dispose()
      }
      material.dispose()
    }
  }
}

// Trains on the ring, moved only on frames the governor draws: no frame loop of their own.
export function RailwayTrains({
  railway,
  palette
}: {
  railway: RailwayPlan
  palette: ThemePalette
}) {
  const { pin, chosen } = useQualityChoice()
  const level = levelInUse(pin, chosen)
  const trains = useMemo(() => trainSet(railway, level, palette), [railway, level, palette])
  useEffect(() => () => trains.dispose(), [trains])
  useFrame(() => trains.pose(cityClock.now()))
  return <primitive object={trains.group} />
}
