import { useRef } from 'react'
import { MathUtils, type Group, type Mesh } from 'three'
import { steamPuffs, type RobotPose } from '../logic/character-pose'
import { advanceSeat } from '../logic/seat-ease'
import type { OfficeTheme, RobotRig, ThemePoseOptions } from './types'

export function useRobotRig(): RobotRig {
  return {
    body: useRef<Group>(null),
    head: useRef<Group>(null),
    leftArm: useRef<Group>(null),
    rightArm: useRef<Group>(null),
    gear: useRef<Group>(null),
    legs: useRef<Group>(null),
    base: useRef<Group>(null),
    sensor: useRef<Group>(null),
    eye: useRef<Mesh>(null),
    thought: useRef<Group>(null),
    puffs: [useRef<Mesh>(null), useRef<Mesh>(null), useRef<Mesh>(null)],
    leftElbow: useRef<Group>(null),
    rightElbow: useRef<Group>(null),
    leftHip: useRef<Group>(null),
    rightHip: useRef<Group>(null),
    leftKnee: useRef<Group>(null),
    rightKnee: useRef<Group>(null)
  }
}

export function applyThemePose(rig: RobotRig, pose: RobotPose, options: ThemePoseOptions): void {
  // Robots keep their height at a desk; only a gaming robot on its seat sinks into it.
  const isSunk = options.mood === 'gaming' && options.seatPresence !== 'none'
  const seatedness = advanceSeat(options.seat, isSunk, pose.bob, options)
  const away = isSunk ? 1 - seatedness : seatedness
  const fromY = isSunk ? 0 : (options.seat?.seatedY ?? pose.bob)
  if (rig.body.current) {
    rig.body.current.position.y = MathUtils.lerp(pose.bob, fromY, away)
    rig.body.current.rotation.z = pose.sway
    rig.body.current.rotation.x = pose.lean
  }
  rig.head.current?.rotation.set(pose.headPitch, 0, 0)
  rig.leftArm.current?.rotation.set(pose.leftArm, 0, 0)
  rig.rightArm.current?.rotation.set(pose.rightArm, 0, pose.rightArmRoll)
  if (rig.gear.current) rig.gear.current.rotation.z += pose.gearSpeed * options.delta
  rig.eye.current?.scale.set(1, pose.eyeOpen, 1)
  if (rig.thought.current)
    rig.thought.current.visible = options.mood === 'thinking' && options.seatPresence !== 'none'
  const puffs =
    options.mood === 'working' && options.seatPresence !== 'none' && !options.isReducedMotion
      ? steamPuffs(options.time, options.phase)
      : []
  rig.puffs.forEach((ref, index) => {
    const mesh = ref.current
    if (!mesh) return
    const puff = puffs[index]
    mesh.visible = Boolean(puff && puff.opacity > 0)
    if (!puff || !mesh.visible) return
    mesh.position.y = 1.12 + puff.y
    mesh.scale.setScalar(puff.scale)
  })
}

// A single writer owns the joints; legacy themes keep their original adapter.
export function applyModelPose(input: {
  theme: OfficeTheme
  rig: RobotRig
  pose: RobotPose
  options: ThemePoseOptions
}): void {
  const applyPose = input.theme.robot.applyPose ?? applyThemePose
  applyPose(input.rig, input.pose, input.options)
}
