import { describe, expect, it } from 'vitest'
import { Group, Mesh } from 'three'
import { robotPose } from '../logic/character-pose'
import { applyThemePose } from './rig'
import type { RobotRig } from './types'

function rigFixture(): RobotRig {
  const group = () => ({ current: new Group() })
  return {
    body: group(),
    head: group(),
    leftArm: group(),
    rightArm: group(),
    gear: group(),
    base: group(),
    legs: group(),
    sensor: group(),
    eye: { current: new Mesh() },
    thought: group(),
    puffs: [0, 1, 2].map(() => ({ current: new Mesh() }))
  }
}

describe('theme rig pose adapter', () => {
  it('maps every existing pose field to the original named part', () => {
    const rig = rigFixture()
    const pose = robotPose('working', 0.5, 0)
    applyThemePose(rig, pose, {
      mood: 'working',
      time: 0.5,
      phase: 0,
      delta: 0.1,
      isReducedMotion: false
    })
    expect(rig.body.current?.position.y).toBe(pose.bob)
    expect(rig.body.current?.rotation.z).toBe(pose.sway)
    expect(rig.body.current?.rotation.x).toBe(0)
    expect(rig.head.current?.rotation.x).toBe(pose.headPitch)
    expect(rig.leftArm.current?.rotation.x).toBe(pose.leftArm)
    expect(rig.rightArm.current?.rotation.x).toBe(pose.rightArm)
    expect(rig.rightArm.current?.rotation.z).toBe(pose.rightArmRoll)
    expect(rig.gear.current?.rotation.z).toBeCloseTo(pose.gearSpeed * 0.1)
    expect(rig.eye.current?.scale.y).toBe(pose.eyeOpen)
    expect(rig.puffs[0].current?.visible).toBe(true)
    expect(rig.puffs[0].current?.position.y).toBeGreaterThan(1.12)
    expect(rig.puffs[0].current?.scale.x).toBeGreaterThan(0)
  })
  it('holds posture under reduced motion and hides steam outside work', () => {
    const rig = rigFixture()
    applyThemePose(rig, robotPose('thinking', 1, 0, { isReducedMotion: true }), {
      mood: 'thinking',
      time: 1,
      phase: 0,
      delta: 1,
      isReducedMotion: true
    })
    expect(rig.thought.current?.visible).toBe(true)
    expect(rig.puffs.every((ref) => !ref.current?.visible)).toBe(true)
    expect(rig.gear.current?.rotation.z).toBe(0)
  })
  it('seats a gaming agent: body low and leaning in, no steam and no thought bubble', () => {
    const rig = rigFixture()
    const pose = robotPose('gaming', 0.5, 0)
    applyThemePose(rig, pose, {
      mood: 'gaming',
      time: 0.5,
      phase: 0,
      delta: 0.1,
      isReducedMotion: false
    })
    expect(rig.body.current?.position.y).toBe(pose.bob)
    expect(rig.body.current?.rotation.x).toBe(pose.lean)
    expect(rig.leftArm.current?.rotation.x).toBe(pose.leftArm)
    expect(rig.thought.current?.visible).toBe(false)
    expect(rig.puffs.every((ref) => !ref.current?.visible)).toBe(true)
  })
})
