import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  RingGeometry,
  SphereGeometry,
  type BufferGeometry
} from 'three'
import { CITIZEN_SCALE } from '../../../../shared/office/figure-scale'
import { citizenGeometry, type FigurePart } from '../../citizens/figure-parts'
import { MARKER_Y } from '../../player/figure'
import type { PartSpec } from '../parts'
import type { Vector } from '../primitives'
import type { ThemePalette } from '../types'
import { HUMAN_PIVOT, humanParts, selectHumanAppearance } from './human-parts'

const OWNER_SCALE = 1.6
const UNIT_GEOMETRY = {
  box: () => new BoxGeometry(1, 1, 1),
  sphere: () => new SphereGeometry(0.5, 10, 6),
  cylinder: () => new CylinderGeometry(0.5, 0.5, 1, 8),
  cone: () => new ConeGeometry(0.5, 1, 6)
}

function ownerPart(part: PartSpec, pivot: Vector): FigurePart {
  const geometry = UNIT_GEOMETRY[part.shape]().scale(...part.size)
  if (part.rotation) {
    geometry.rotateX(part.rotation[0]).rotateY(part.rotation[1]).rotateZ(part.rotation[2])
  }
  geometry.translate(part.at[0] + pivot[0], part.at[1] + pivot[1], part.at[2] + pivot[2])
  return { geometry: geometry.scale(OWNER_SCALE, OWNER_SCALE, OWNER_SCALE), color: part.color }
}

// dry-new: the existing owner is a cloaked traveller; reuse its marker and the citizen merger.
export function corporatePlayerGeometry(palette: ThemePalette): BufferGeometry {
  const appearance = { ...selectHumanAppearance('corporate-city-owner'), shirt: palette.lacquer }
  const human = humanParts(appearance, palette.gold)
  const hips = HUMAN_PIVOT.body[1]
  const shoulders = hips + HUMAN_PIVOT.leftArm[1]
  const elbows = shoulders + HUMAN_PIVOT.leftElbow[1]
  const knees = hips + HUMAN_PIVOT.leftKnee[1]
  const headPivot: Vector = [0, hips + HUMAN_PIVOT.head[1], 0]
  const pivots: Readonly<Record<string, Vector>> = {
    body: HUMAN_PIVOT.body,
    head: headPivot,
    leftArm: [HUMAN_PIVOT.leftArm[0], shoulders, 0],
    rightArm: [HUMAN_PIVOT.rightArm[0], shoulders, 0],
    leftElbow: [HUMAN_PIVOT.leftArm[0], elbows, 0],
    rightElbow: [HUMAN_PIVOT.rightArm[0], elbows, 0],
    leftHip: [HUMAN_PIVOT.leftHip[0], hips, 0],
    rightHip: [HUMAN_PIVOT.rightHip[0], hips, 0],
    leftKnee: [HUMAN_PIVOT.leftHip[0], knees, 0],
    rightKnee: [HUMAN_PIVOT.rightHip[0], knees, 0]
  } satisfies Record<keyof typeof human.joints, Vector>
  const parts = Object.entries(human.joints).flatMap(([joint, jointParts]) => {
    const pivot = pivots[joint]
    if (!pivot) throw new Error(`Missing owner pivot: ${joint}`)
    return jointParts.map((part) => ownerPart(part, pivot))
  })
  parts.push(...human.eyes.map((part) => ownerPart(part, headPivot)))
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
  // citizenGeometry disposes the source buffers; undo only its town-wide scale, not owner size.
  return citizenGeometry({ name: 'Corporate owner', parts: () => parts }).scale(
    1 / CITIZEN_SCALE,
    1 / CITIZEN_SCALE,
    1 / CITIZEN_SCALE
  )
}
