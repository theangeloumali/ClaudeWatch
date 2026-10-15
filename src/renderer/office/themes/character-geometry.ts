import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  RingGeometry,
  SphereGeometry,
  type BufferGeometry
} from 'three'
import { CITIZEN_SCALE } from '../../../shared/office/figure-scale'
import { citizenGeometry, type FigurePart } from '../citizens/figure-parts'
import type { PlayerCharacterId } from '../player/character-choice'
import { MARKER_Y, playerGeometry } from '../player/figure'
import { HUMAN_PIVOT } from './corporate-city/human-parts'
import {
  characterParts,
  type CharacterJoint,
  type CharacterOptions
} from './cyberpunk-city/character-parts'
import type { PartSpec } from './parts'
import type { Vector } from './primitives'
import type { OfficeTheme, ThemePalette } from './types'

const OWNER_SCALE = 1.6
const UNIT_GEOMETRY = {
  box: () => new BoxGeometry(1, 1, 1),
  sphere: () => new SphereGeometry(0.5, 10, 6),
  cylinder: () => new CylinderGeometry(0.5, 0.5, 1, 8),
  cone: () => new ConeGeometry(0.5, 1, 6)
}
const JOINTS: readonly CharacterJoint[] = [
  'body',
  'head',
  'leftArm',
  'rightArm',
  'leftElbow',
  'rightElbow',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee'
]

const HIP_HEIGHT = HUMAN_PIVOT.body[1]
const SHOULDER_HEIGHT = HIP_HEIGHT + HUMAN_PIVOT.leftArm[1]
const ELBOW_HEIGHT = SHOULDER_HEIGHT + HUMAN_PIVOT.leftElbow[1]
const KNEE_HEIGHT = HIP_HEIGHT + HUMAN_PIVOT.leftKnee[1]
const ABSOLUTE_PIVOTS: Record<CharacterJoint, Vector> = {
  body: HUMAN_PIVOT.body,
  head: [0, HIP_HEIGHT + HUMAN_PIVOT.head[1], 0],
  leftArm: [HUMAN_PIVOT.leftArm[0], SHOULDER_HEIGHT, 0],
  rightArm: [HUMAN_PIVOT.rightArm[0], SHOULDER_HEIGHT, 0],
  leftElbow: [HUMAN_PIVOT.leftArm[0], ELBOW_HEIGHT, 0],
  rightElbow: [HUMAN_PIVOT.rightArm[0], ELBOW_HEIGHT, 0],
  leftHip: [HUMAN_PIVOT.leftHip[0], HIP_HEIGHT, 0],
  rightHip: [HUMAN_PIVOT.rightHip[0], HIP_HEIGHT, 0],
  leftKnee: [HUMAN_PIVOT.leftHip[0], KNEE_HEIGHT, 0],
  rightKnee: [HUMAN_PIVOT.rightHip[0], KNEE_HEIGHT, 0]
}

function geometryPart(part: PartSpec, pivot: Vector): FigurePart {
  const geometry = UNIT_GEOMETRY[part.shape]().scale(...part.size)
  if (part.rotation)
    geometry.rotateX(part.rotation[0]).rotateY(part.rotation[1]).rotateZ(part.rotation[2])
  geometry.translate(part.at[0] + pivot[0], part.at[1] + pivot[1], part.at[2] + pivot[2])
  return { geometry, color: part.color }
}

// dry-new: named owner choices reuse role data and the citizen merger, not world-specific factories.
function characterFigureParts(options: CharacterOptions): FigurePart[] {
  const figure = characterParts(options)
  return [
    ...JOINTS.flatMap((joint) =>
      figure.joints[joint].map((part) => geometryPart(part, ABSOLUTE_PIVOTS[joint]))
    ),
    ...figure.eyes.map((part) => geometryPart(part, ABSOLUTE_PIVOTS.head))
  ]
}

// Caller memoizes by choice/palette and disposes the returned buffer; never cache disposed geometry.
export function playerCharacterGeometry(
  id: PlayerCharacterId,
  palette: ThemePalette
): BufferGeometry {
  if (id === 'theme') return playerGeometry(palette)
  const parts = characterFigureParts({ kind: id, palette, variant: 0 }).map((part) => ({
    ...part,
    geometry: part.geometry.scale(OWNER_SCALE, OWNER_SCALE, OWNER_SCALE)
  }))
  parts.push(
    {
      geometry: new RingGeometry(0.48, 0.61, 24).rotateX(-Math.PI / 2).translate(0, 0.018, 0),
      color: palette.glow
    },
    {
      geometry: new ConeGeometry(0.18, 0.32, 4).rotateX(Math.PI).translate(0, MARKER_Y, 0),
      color: palette.glow
    }
  )
  const merged = citizenGeometry({ name: `Owner ${id}`, parts: () => parts }).scale(
    1 / CITIZEN_SCALE,
    1 / CITIZEN_SCALE,
    1 / CITIZEN_SCALE
  )
  const flat = merged.toNonIndexed()
  merged.dispose()
  flat.computeVertexNormals()
  return flat
}

const GEOMETRY_FACTORIES = {
  samurai: (palette: ThemePalette) => playerCharacterGeometry('samurai', palette),
  courier: (palette: ThemePalette) => playerCharacterGeometry('courier', palette),
  technician: (palette: ThemePalette) => playerCharacterGeometry('technician', palette),
  guard: (palette: ThemePalette) => playerCharacterGeometry('guard', palette),
  human: (palette: ThemePalette) => playerCharacterGeometry('human', palette),
  scoutrobo: (palette: ThemePalette) => playerCharacterGeometry('scoutrobo', palette)
} satisfies Record<Exclude<PlayerCharacterId, 'theme'>, NonNullable<OfficeTheme['playerGeometry']>>

// Stable factories preserve PlayerLayer's memo; undefined retains the current world's own player.
export function playerCharacterGeometryFactory(
  id: PlayerCharacterId
): OfficeTheme['playerGeometry'] {
  return id === 'theme' ? undefined : GEOMETRY_FACTORIES[id]
}
