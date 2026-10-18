import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three'
import type { FigurePart } from '../../citizens/figure-parts'
import { HUMAN_PIVOT } from '../corporate-city/human-parts'
import type { PartSpec } from '../parts'
import type { Vector } from '../primitives'
import { samuraiParts, selectSamuraiAppearance } from './armor'

const UNIT_GEOMETRY = {
  box: () => new BoxGeometry(1, 1, 1),
  sphere: () => new SphereGeometry(0.5, 10, 6),
  cylinder: () => new CylinderGeometry(0.5, 0.5, 1, 8),
  cone: () => new ConeGeometry(0.5, 1, 6)
}
const JOINT_NAMES = [
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
] as const

function figurePart(part: PartSpec, pivot: Vector): FigurePart {
  const geometry = UNIT_GEOMETRY[part.shape]().scale(...part.size)
  if (part.rotation)
    geometry.rotateX(part.rotation[0]).rotateY(part.rotation[1]).rotateZ(part.rotation[2])
  geometry.translate(part.at[0] + pivot[0], part.at[1] + pivot[1], part.at[2] + pivot[2])
  return { geometry, color: part.color }
}

// dry-new: the owner and decorative citizens need the same armor, not the corporate owner's shirt.
export function samuraiFigureParts(
  appearance: ReturnType<typeof selectSamuraiAppearance>
): FigurePart[] {
  const human = samuraiParts(appearance)
  const hipHeight = HUMAN_PIVOT.body[1]
  const shoulders = hipHeight + HUMAN_PIVOT.leftArm[1]
  const elbows = shoulders + HUMAN_PIVOT.leftElbow[1]
  const knees = hipHeight + HUMAN_PIVOT.leftKnee[1]
  const pivots: Record<keyof typeof human.joints, Vector> = {
    body: HUMAN_PIVOT.body,
    head: [0, hipHeight + HUMAN_PIVOT.head[1], 0],
    leftArm: [HUMAN_PIVOT.leftArm[0], shoulders, 0],
    rightArm: [HUMAN_PIVOT.rightArm[0], shoulders, 0],
    leftElbow: [HUMAN_PIVOT.leftArm[0], elbows, 0],
    rightElbow: [HUMAN_PIVOT.rightArm[0], elbows, 0],
    leftHip: [HUMAN_PIVOT.leftHip[0], hipHeight, 0],
    rightHip: [HUMAN_PIVOT.rightHip[0], hipHeight, 0],
    leftKnee: [HUMAN_PIVOT.leftHip[0], knees, 0],
    rightKnee: [HUMAN_PIVOT.rightHip[0], knees, 0]
  }
  return [
    ...JOINT_NAMES.flatMap((joint) =>
      human.joints[joint].map((part) => figurePart(part, pivots[joint]))
    ),
    ...human.eyes.map((part) => figurePart(part, pivots.head))
  ]
}
