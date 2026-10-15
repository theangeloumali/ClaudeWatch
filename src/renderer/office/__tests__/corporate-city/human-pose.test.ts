import { Group, Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { robotPose, type RobotMood } from '../../logic/character-pose'
import {
  applyHumanPose,
  HUMAN_STRIDE_METRES,
  humanPose
} from '../../themes/corporate-city/human-pose'
import { HUMAN_PIVOT } from '../../themes/corporate-city/human-parts'
import type { RobotRig, ThemePoseOptions } from '../../themes/types'

function options(mood: RobotMood, overrides: Partial<ThemePoseOptions> = {}): ThemePoseOptions {
  return { mood, time: 0.5, phase: 0, delta: 0.1, isReducedMotion: false, ...overrides }
}

function poseFor(mood: RobotMood, overrides: Partial<ThemePoseOptions> = {}) {
  const settings = options(mood, overrides)
  return humanPose(robotPose(mood, settings.time, settings.phase, settings), settings)
}

function rigFixture(): RobotRig {
  const joint = () => ({ current: new Group() })
  return {
    body: joint(),
    head: joint(),
    leftArm: joint(),
    rightArm: joint(),
    gear: joint(),
    legs: joint(),
    base: joint(),
    sensor: joint(),
    thought: joint(),
    eye: { current: new Mesh() },
    puffs: [{ current: new Mesh() }],
    leftElbow: joint(),
    rightElbow: joint(),
    leftHip: joint(),
    rightHip: joint(),
    leftKnee: joint(),
    rightKnee: joint()
  }
}

describe('human seated and walking poses', () => {
  const SEATED_MOODS: readonly RobotMood[] = [
    'idle',
    'working',
    'reading',
    'thinking',
    'needs-you',
    'lounging'
  ]
  for (const mood of SEATED_MOODS) {
    it(`holds articulated seated ${mood} under reduced motion`, () => {
      const pose = poseFor(mood, { isReducedMotion: true })
      expect(pose.isSeated).toBe(true)
      expect(pose.bodyY).toBeLessThan(HUMAN_PIVOT.body[1])
      expect(pose.leftHip + pose.bodyPitch).toBeCloseTo(-Math.PI / 2)
      expect(pose.rightHip + pose.bodyPitch).toBeCloseTo(-Math.PI / 2)
      expect(pose.leftKnee).toBeCloseTo(Math.PI / 2)
      expect(pose.rightKnee).toBeCloseTo(Math.PI / 2)
      expect(pose.leftElbow).toBeLessThan(0)
      expect(pose.rightElbow).toBeLessThan(0)
      expect(pose).toEqual(poseFor(mood, { time: 200, phase: 0.9, isReducedMotion: true }))
    })
  }

  it('keeps typing forearms level with reachable hands above the seated hips', () => {
    const pose = poseFor('working', { isReducedMotion: true })
    expect(pose.leftArm + pose.leftElbow + pose.bodyPitch).toBeCloseTo(-Math.PI / 2, 1)
    const elbowY = pose.bodyY + HUMAN_PIVOT.leftArm[1] - 0.19 * Math.cos(pose.leftArm)
    expect(elbowY).toBeGreaterThan(pose.bodyY)
    expect(elbowY).toBeLessThan(0.55)
  })

  it('distinguishes reading, thinking, waiting and lounge without invented moods', () => {
    const reading = poseFor('reading')
    const thinking = poseFor('thinking')
    const waiting = poseFor('needs-you')
    const lounge = poseFor('lounging')
    expect(reading.isReading).toBe(true)
    expect(reading.headPitch).toBeGreaterThan(0)
    expect(thinking.rightElbow).not.toBe(reading.rightElbow)
    expect(waiting.needsAttention).toBe(true)
    expect(waiting.rightArm).toBeLessThan(-2)
    expect(lounge.bodyPitch).toBeLessThan(0)
    expect(lounge.isReading).toBe(false)
  })

  it('rests idle hands above the thighs and brings the thinking hand to the chin', () => {
    const idle = poseFor('idle', { isReducedMotion: true })
    const idleHandY =
      idle.bodyY +
      HUMAN_PIVOT.leftArm[1] -
      0.19 * Math.cos(idle.leftArm) -
      0.199 * Math.cos(idle.leftArm + idle.leftElbow)
    expect(idleHandY).toBeGreaterThan(idle.bodyY + 0.09)
    const thinking = poseFor('thinking', { isReducedMotion: true })
    const body = new Group()
    body.position.y = thinking.bodyY
    body.rotation.x = thinking.bodyPitch
    const shoulder = new Group()
    shoulder.position.set(...HUMAN_PIVOT.rightArm)
    shoulder.rotation.set(thinking.rightArm, thinking.rightArmYaw, thinking.rightArmRoll)
    const elbow = new Group()
    elbow.position.set(...HUMAN_PIVOT.rightElbow)
    elbow.rotation.x = thinking.rightElbow
    body.add(shoulder)
    shoulder.add(elbow)
    body.updateMatrixWorld(true)
    const hand = elbow.localToWorld(new Vector3(0, -0.199, 0.009))
    const chin = body.localToWorld(new Vector3(0, HUMAN_PIVOT.head[1] + 0.005, 0.067))
    expect(hand.distanceTo(chin)).toBeLessThan(0.08)
  })

  it('drives opposite arms and legs from travel distance, not wall clock time', () => {
    const travelDistance = HUMAN_STRIDE_METRES / 4
    const pose = poseFor('walking', { isMoving: true, travelDistance })
    expect(pose.isSeated).toBe(false)
    expect(pose.leftHip).toBeGreaterThan(0)
    expect(pose.rightHip).toBeLessThan(0)
    expect(pose.leftArm * pose.leftHip).toBeLessThan(0)
    expect(pose.rightArm * pose.rightHip).toBeLessThan(0)
    expect(pose.rightKnee).toBeGreaterThan(pose.leftKnee)
    expect(pose).toEqual(poseFor('walking', { isMoving: true, travelDistance, time: 100 }))
    expect(
      poseFor('walking', {
        isMoving: true,
        travelDistance: travelDistance + HUMAN_STRIDE_METRES / 2
      }).leftHip
    ).toBeCloseTo(-pose.leftHip)
    expect(
      poseFor('walking', { isMoving: true, travelDistance: travelDistance + HUMAN_STRIDE_METRES })
        .leftHip
    ).toBeCloseTo(pose.leftHip)
  })

  it('walks while attention is pending and preserves the truthful attention flag', () => {
    const settings = { isMoving: true, travelDistance: HUMAN_STRIDE_METRES / 4 }
    const walking = poseFor('walking', settings)
    const waiting = poseFor('needs-you', settings)
    expect(waiting.needsAttention).toBe(true)
    expect(waiting.isSeated).toBe(false)
    expect(waiting.leftHip).toBe(walking.leftHip)
    expect(waiting.rightArm).toBe(walking.rightArm)
    expect(waiting.isReading).toBe(false)
  })

  it('holds a standing gait-free pose while moving under reduced motion', () => {
    const pose = poseFor('needs-you', {
      isMoving: true,
      isReducedMotion: true,
      travelDistance: 0.25
    })
    expect(pose.bodyY).toBe(HUMAN_PIVOT.body[1])
    expect(pose.leftHip).toBe(0)
    expect(pose.rightHip).toBe(0)
    expect(pose.leftKnee).toBe(0)
    expect(pose.rightKnee).toBe(0)
    expect(pose.leftArm).toBe(0)
    expect(pose.rightArm).toBe(0)
    expect(pose).toEqual(
      poseFor('needs-you', { isMoving: true, isReducedMotion: true, travelDistance: 30, time: 99 })
    )
  })

  it('applies all separate joints, hides pooled effects and resets walking after sitting', () => {
    const rig = rigFixture()
    const seated = options('reading')
    applyHumanPose(rig, robotPose('reading', seated.time, seated.phase), seated)
    expect(rig.gear.current?.visible).toBe(true)
    expect(rig.leftKnee?.current?.rotation.x).toBeCloseTo(Math.PI / 2)
    const settings = options('needs-you', {
      isMoving: true,
      travelDistance: HUMAN_STRIDE_METRES / 4
    })
    const legacyPose = robotPose('needs-you', settings.time, settings.phase)
    const target = humanPose(legacyPose, settings)
    rig.body.current?.position.set(4, 0, 7)
    applyHumanPose(rig, legacyPose, settings)
    expect(rig.body.current?.position.x).toBe(4)
    expect(rig.body.current?.position.z).toBe(7)
    expect(rig.body.current?.position.y).toBe(target.bodyY)
    expect(rig.leftElbow?.current?.rotation.x).toBe(target.leftElbow)
    expect(rig.rightElbow?.current?.rotation.x).toBe(target.rightElbow)
    expect(rig.leftHip?.current?.rotation.x).toBe(target.leftHip)
    expect(rig.rightHip?.current?.rotation.x).toBe(target.rightHip)
    expect(rig.rightKnee?.current?.rotation.x).toBe(target.rightKnee)
    expect(rig.gear.current?.visible).toBe(false)
    expect(rig.thought.current?.visible).toBe(false)
    expect(rig.puffs.every((ref) => !ref.current?.visible)).toBe(true)
  })

  it('accepts legacy rigs without optional articulated refs', () => {
    const rig = rigFixture()
    delete rig.leftElbow
    delete rig.rightElbow
    delete rig.leftHip
    delete rig.rightHip
    delete rig.leftKnee
    delete rig.rightKnee
    const settings = options('idle')
    expect(() => applyHumanPose(rig, robotPose('idle', 0, 0), settings)).not.toThrow()
  })
})
