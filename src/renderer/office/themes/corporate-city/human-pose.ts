import type { RobotPose } from '../../logic/character-pose'
import type { RobotRig, ThemePoseOptions } from '../types'
import { HUMAN_PIVOT, HUMAN_PELVIS, HUMAN_LOWER_LEG_LENGTH } from './human-parts'
import { AGENT_SCALE, SUBAGENT_SCALE } from '../../../../shared/office/figure-scale'

export const HUMAN_STRIDE_METRES = 1.05
const SEATED_HIP_Y = 0.3
const QUARTER_TURN = Math.PI / 2

const SEATED_POSTURES = {
  idle: {
    bodyPitch: 0,
    headPitch: 0,
    leftArm: -0.45,
    rightArm: -0.45,
    leftElbow: -0.9,
    rightElbow: -0.9,
    rightArmRoll: 0,
    rightArmYaw: 0
  },
  working: {
    bodyPitch: 0.04,
    headPitch: 0,
    leftArm: -0.7,
    rightArm: -0.7,
    leftElbow: -QUARTER_TURN - 0.04 + 0.7,
    rightElbow: -QUARTER_TURN - 0.04 + 0.7,
    rightArmRoll: 0,
    rightArmYaw: 0
  },
  reading: {
    bodyPitch: 0.02,
    headPitch: 0.26,
    leftArm: -1.03,
    rightArm: -1.03,
    leftElbow: -0.64,
    rightElbow: -0.64,
    rightArmRoll: 0,
    rightArmYaw: 0
  },
  thinking: {
    bodyPitch: 0.02,
    headPitch: -0.06,
    leftArm: -0.85,
    rightArm: -1.8,
    leftElbow: -0.64,
    rightElbow: -2.3,
    rightArmRoll: 0,
    rightArmYaw: -0.95
  },
  'needs-you': {
    bodyPitch: 0,
    headPitch: 0,
    leftArm: -0.45,
    rightArm: -2.5,
    leftElbow: -0.9,
    rightElbow: -0.35,
    rightArmRoll: -0.12,
    rightArmYaw: 0
  },
  lounging: {
    bodyPitch: -0.12,
    headPitch: -0.08,
    leftArm: -0.35,
    rightArm: -0.35,
    leftElbow: -0.95,
    rightElbow: -0.95,
    rightArmRoll: 0,
    rightArmYaw: 0
  }
}

// dry-new: human postures articulate separate joints; the legacy adapter only rotates shoulders.
export function humanPose(pose: RobotPose, options: ThemePoseOptions) {
  const needsAttention = options.mood === 'needs-you'
  const isWalking = options.isMoving ?? options.mood === 'walking'
  if (isWalking || options.mood === 'walking') return walkingPose(options)
  const isDeskTask = ['working', 'thinking', 'reading'].includes(options.mood)
  if (options.seatPresence === 'none' || (isDeskTask && options.seatPresence === 'lounge'))
    return waitingPose(options)
  const posture = SEATED_POSTURES[options.mood]
  const motionShare = options.isReducedMotion ? 0 : 1
  const pelvisBottom = HUMAN_PELVIS.at[1] - HUMAN_PELVIS.size[1] / 2
  // Company lounge chairs are shared; shorter adults sit at the same cushion height.
  const seatLift =
    options.isSubagent && options.isInLounge
      ? (SEATED_HIP_Y + pelvisBottom) * (AGENT_SCALE / SUBAGENT_SCALE - 1)
      : 0
  const seated = {
    ...posture,
    isSeated: true,
    isReading: options.mood === 'reading',
    needsAttention,
    bodyY: SEATED_HIP_Y + seatLift,
    lowerLegScale: 1 + seatLift / HUMAN_LOWER_LEG_LENGTH,
    bodyRoll: 0,
    leftHip: -QUARTER_TURN - posture.bodyPitch,
    rightHip: -QUARTER_TURN - posture.bodyPitch,
    leftKnee: QUARTER_TURN,
    rightKnee: QUARTER_TURN,
    eyeOpen: options.isReducedMotion ? 1 : pose.eyeOpen
  }
  if (options.mood === 'working') return { ...seated, ...typingJoints(pose, options) }
  if (options.mood === 'reading') seated.headPitch += (pose.headPitch - 0.4) * 0.3 * motionShare
  if (options.mood === 'thinking') seated.headPitch += (pose.headPitch + 0.15) * 0.3 * motionShare
  return seated
}

function waitingPose(options: ThemePoseOptions) {
  const standing = walkingPose({ ...options, isMoving: false })
  return {
    ...standing,
    rightArm: options.mood === 'needs-you' ? -2.5 : 0,
    rightElbow: options.mood === 'needs-you' ? -0.35 : 0
  }
}

function typingJoints(pose: RobotPose, options: ThemePoseOptions) {
  const posture = SEATED_POSTURES.working
  const motionShare = options.isReducedMotion ? 0 : 0.1
  const leftArm = posture.leftArm + (pose.leftArm + 0.95) * motionShare
  const rightArm = posture.rightArm + (pose.rightArm + 0.95) * motionShare
  return {
    leftArm,
    rightArm,
    leftElbow: -QUARTER_TURN - posture.bodyPitch - leftArm,
    rightElbow: -QUARTER_TURN - posture.bodyPitch - rightArm
  }
}

function walkingPose(options: ThemePoseOptions) {
  const isWalking = options.isMoving ?? options.mood === 'walking'
  // Distance, not elapsed time: paused travel cannot turn into treadmill animation.
  const stride =
    options.isReducedMotion || !isWalking
      ? 0
      : Math.sin(
          ((options.travelDistance ?? 0) / HUMAN_STRIDE_METRES) * Math.PI * 2 +
            options.phase * Math.PI * 2
        )
  const gaitShare = options.isReducedMotion || !isWalking ? 0 : 1
  return {
    isSeated: false,
    isReading: false,
    needsAttention: options.mood === 'needs-you',
    bodyY: HUMAN_PIVOT.body[1] + Math.abs(stride) * 0.014,
    lowerLegScale: 1,
    bodyPitch: 0,
    bodyRoll: stride * 0.018,
    headPitch: 0,
    leftArm: stride ? -stride * 0.36 : 0,
    rightArm: stride * 0.36,
    rightArmRoll: 0,
    rightArmYaw: 0,
    leftElbow: gaitShare ? -0.18 : 0,
    rightElbow: gaitShare ? -0.18 : 0,
    leftHip: stride * 0.52,
    rightHip: stride ? -stride * 0.52 : 0,
    leftKnee: (0.08 + Math.max(0, -stride) * 0.42) * gaitShare,
    rightKnee: (0.08 + Math.max(0, stride) * 0.42) * gaitShare,
    eyeOpen: 1
  }
}

export function applyHumanPose(rig: RobotRig, pose: RobotPose, options: ThemePoseOptions): void {
  const target = humanPose(pose, options)
  if (rig.body.current) {
    rig.body.current.position.y = target.bodyY
    rig.body.current.rotation.set(target.bodyPitch, 0, target.bodyRoll)
  }
  rig.head.current?.rotation.set(target.headPitch, 0, 0)
  rig.leftArm.current?.rotation.set(target.leftArm, 0, 0)
  rig.rightArm.current?.rotation.set(target.rightArm, target.rightArmYaw, target.rightArmRoll)
  rig.leftElbow?.current?.rotation.set(target.leftElbow, 0, 0)
  rig.rightElbow?.current?.rotation.set(target.rightElbow, 0, 0)
  rig.leftHip?.current?.rotation.set(target.leftHip, 0, 0)
  rig.rightHip?.current?.rotation.set(target.rightHip, 0, 0)
  rig.leftKnee?.current?.rotation.set(target.leftKnee, 0, 0)
  rig.rightKnee?.current?.rotation.set(target.rightKnee, 0, 0)
  if (rig.leftKnee?.current) rig.leftKnee.current.scale.y = target.lowerLegScale
  if (rig.rightKnee?.current) rig.rightKnee.current.scale.y = target.lowerLegScale
  rig.sensor.current?.scale.set(1, Math.max(0.2, target.eyeOpen), 1)
  if (rig.gear.current) rig.gear.current.visible = target.isReading
  if (rig.thought.current) rig.thought.current.visible = false
  rig.puffs.forEach((ref) => {
    if (ref.current) ref.current.visible = false
  })
}
