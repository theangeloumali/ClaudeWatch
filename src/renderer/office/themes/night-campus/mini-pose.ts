import type { RobotPose } from '../../logic/character-pose'
import { HUMAN_PIVOT } from '../corporate-city/human-parts'
import { applyHumanPose } from '../corporate-city/human-pose'
import type { Vector } from '../primitives'
import type { RobotRig, ThemePoseOptions } from '../types'
import type { BakedPart } from './glb-props'

export const MINI_PERSON_JOINTS = [
  'torso',
  'torso-cloth',
  'head',
  'leg-left',
  'leg-right',
  'arm-left',
  'arm-left-cloth',
  'arm-right',
  'arm-right-cloth'
] as const

// The Kenney figure is 0.67 tall with a big head; this keeps that head below the monitor top.
export const MINI_SCALE = 1.3
// Set on the body group MiniPerson draws, so the pose only remaps the figure it was built for.
export const MINI_BODY_FLAG = 'campusMini'

// human-pose's hip heights: seated on the task chair, and standing.
const HUMAN_SEATED_Y = 0.3
const HUMAN_STANDING_Y = HUMAN_PIVOT.body[1]
// The mini's hip pivot above its feet, and above the chair seat once its legs lie forward.
const MINI_STANDING_Y = 0.176 * MINI_SCALE
const MINI_SEATED_Y = 0.32

// Its legs are shorter than the human's, so the same sit or stand ends at other hip heights.
export function miniBodyY(humanY: number): number {
  const share = (humanY - HUMAN_SEATED_Y) / (HUMAN_STANDING_Y - HUMAN_SEATED_Y)
  return MINI_SEATED_Y + share * (MINI_STANDING_Y - MINI_SEATED_Y)
}

type RigJoint = 'head' | 'leftArm' | 'rightArm' | 'leftHip' | 'rightHip'

// The Kenney joint each rig joint drives. Its own left is +x, while the rig's left is -x.
export const MINI_JOINT_OF: Record<RigJoint, string> = {
  head: 'head',
  leftArm: 'arm-right',
  rightArm: 'arm-left',
  leftHip: 'leg-right',
  rightHip: 'leg-left'
}

// Each rig joint's place in the body group, which sits on the figure's torso pivot.
export function miniRigPositions(person: ReadonlyMap<string, BakedPart>): Record<RigJoint, Vector> {
  const torso = person.get('torso')?.pivot ?? [0, 0, 0]
  const offset = (joint: RigJoint): Vector => {
    const pivot = person.get(MINI_JOINT_OF[joint])?.pivot ?? torso
    return [
      (pivot[0] - torso[0]) * MINI_SCALE,
      (pivot[1] - torso[1]) * MINI_SCALE,
      (pivot[2] - torso[2]) * MINI_SCALE
    ]
  }
  return {
    head: offset('head'),
    leftArm: offset('leftArm'),
    rightArm: offset('rightArm'),
    leftHip: offset('leftHip'),
    rightHip: offset('rightHip')
  }
}

// The human pose, with the hip height carried over to the mini figure when it is the one drawn.
export function applyCampusPose(rig: RobotRig, pose: RobotPose, options: ThemePoseOptions): void {
  applyHumanPose(rig, pose, options)
  const body = rig.body.current
  if (body?.userData[MINI_BODY_FLAG] === true) body.position.y = miniBodyY(body.position.y)
}
