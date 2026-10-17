import { useEffect, useMemo } from 'react'
import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import type { ThemePalette } from '../themes/types'
import { RailwayTrains } from './RailwayTrains'
import type { TownPlan } from '../town/town-plan'
import {
  RAILWAY,
  railwayPlan,
  shownRailway,
  type RailwayPlan,
  type RailwaySpan
} from '../town/railway-plan'
import {
  railwayStations,
  stationBoxes,
  type RailwayBox,
  type RailwayTint
} from '../town/railway-stations'

// A part laid along every span: `across` metres outward of the deck's centre.
interface DeckPart {
  across: number
  halfWidth: number
  bottom: number
  top: number
  tint: RailwayTint
}

const BALLAST_TOP = RAILWAY.deckTop + 0.15
const RAIL_GAUGE_HALF = 0.72
const DECK_PARTS: readonly DeckPart[] = [
  { across: 0, halfWidth: RAILWAY.deckHalfWidth, bottom: 4.6, top: RAILWAY.deckTop, tint: 'deck' },
  ...[-1, 1].flatMap((side): DeckPart[] => [
    {
      across: side * RAILWAY.track,
      halfWidth: 1.3,
      bottom: RAILWAY.deckTop,
      top: BALLAST_TOP,
      tint: 'ballast'
    },
    ...[-1, 1].map(
      (rail): DeckPart => ({
        across: side * RAILWAY.track + rail * RAIL_GAUGE_HALF,
        halfWidth: 0.05,
        bottom: BALLAST_TOP,
        top: RAILWAY.railTop,
        tint: 'rail'
      })
    ),
    {
      across: side * (RAILWAY.deckHalfWidth - 0.1),
      halfWidth: 0.1,
      bottom: RAILWAY.deckTop,
      top: RAILWAY.deckTop + 0.9,
      tint: 'parapet'
    }
  ])
]

const TINT_OF: Record<RailwayTint, keyof ThemePalette> = {
  deck: 'stone',
  pier: 'stone',
  ballast: 'wood',
  rail: 'ink',
  parapet: 'paper',
  platform: 'floor',
  canopy: 'copper',
  tower: 'lacquer'
}

function spanBoxes(span: RailwaySpan): RailwayBox[] {
  const { from, to, isBend } = span
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  const ahead = { x: (to.x - from.x) / length, z: (to.z - from.z) / length }
  // Clockwise, so outward is the step's right hand.
  const outward = { x: ahead.z, z: -ahead.x }
  return DECK_PARTS.map((part) => {
    // A bend's outer edge is longer than its chord; stretching each box to it leaves no gap.
    const stretch = isBend ? (RAILWAY.offset + part.across + part.halfWidth) / RAILWAY.offset : 1
    return {
      x: (from.x + to.x) / 2 + outward.x * part.across,
      z: (from.z + to.z) / 2 + outward.z * part.across,
      y: (part.bottom + part.top) / 2,
      width: part.halfWidth * 2,
      height: part.top - part.bottom,
      length: length * stretch,
      heading: Math.atan2(ahead.x, ahead.z),
      tint: part.tint
    }
  })
}

function railwayBoxes(railway: RailwayPlan): RailwayBox[] {
  const piers = railway.piers.flatMap(({ x, z, heading }): RailwayBox[] => [
    { x, z, y: 2, width: 0.7, height: 4, length: 1.4, heading, tint: 'pier' },
    { x, z, y: 4.3, width: 5.2, height: 0.6, length: 1.2, heading, tint: 'pier' }
  ])
  return [
    ...railway.spans.flatMap(spanBoxes),
    ...piers,
    ...railwayStations(railway).flatMap(stationBoxes)
  ]
}

// The whole viaduct, its piers and stations as one instanced draw, placed once.
export function viaductMesh(
  railway: RailwayPlan,
  palette: ThemePalette
): InstancedMesh<BoxGeometry, MeshStandardMaterial> {
  const boxes = railwayBoxes(railway)
  const mesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }),
    boxes.length
  )
  const place = new Object3D()
  const paint = new Color()
  boxes.forEach((box, index) => {
    place.position.set(box.x, box.y, box.z)
    place.rotation.set(0, box.heading, 0)
    place.scale.set(box.width, box.height, box.length)
    place.updateMatrix()
    mesh.setMatrixAt(index, place.matrix)
    mesh.setColorAt(index, paint.set(palette[TINT_OF[box.tint]]))
  })
  mesh.matrixAutoUpdate = false
  mesh.computeBoundingSphere()
  return mesh
}

// Nothing here reads the quality level, so stepping it never rebuilds the viaduct.
export function RailwayStructures({
  railway,
  palette
}: {
  railway: RailwayPlan
  palette: ThemePalette
}) {
  const mesh = useMemo(() => viaductMesh(railway, palette), [railway, palette])
  useEffect(() => {
    shownRailway.set(railway)
    return () => shownRailway.set(null)
  }, [railway])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    },
    [mesh]
  )
  return <primitive object={mesh} />
}

// The ring round the city, none until it has streets; trains follow the vehicles switch.
export function RailwayLayer({
  plan,
  palette,
  hasTrains
}: {
  plan: TownPlan
  palette: ThemePalette
  hasTrains: boolean
}) {
  const railway = railwayPlan(plan)
  if (!railway) return null
  return (
    <>
      <RailwayStructures railway={railway} palette={palette} />
      {hasTrains && <RailwayTrains railway={railway} palette={palette} />}
    </>
  )
}
