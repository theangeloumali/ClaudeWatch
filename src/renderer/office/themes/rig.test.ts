import { describe, expect, it } from 'vitest'
import { Group, Mesh } from 'three'
import { robotPose, type RobotMood } from '../logic/character-pose'
import { createSeatEase, SEAT_EASE_SEC } from '../logic/seat-ease'
import { applyThemePose } from './rig'
import type { RobotRig, ThemePoseOptions } from './types'

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

  describe('sinking into a game corner seat', () => {
    // Six frames make up the ease exactly.
    const FRAME_SEC = SEAT_EASE_SEC / 6
    const ON_SEAT = { seatPresence: 'lounge' } as const

    const figure = () => ({ rig: rigFixture(), seat: createSeatEase() })
    type Figure = ReturnType<typeof figure>

    function drawFrame(
      { rig, seat }: Figure,
      mood: RobotMood,
      overrides: Partial<ThemePoseOptions> = {}
    ) {
      const settings = { mood, time: 0.5, phase: 0, delta: FRAME_SEC, seat, ...overrides }
      const isReducedMotion = settings.isReducedMotion ?? false
      applyThemePose(rig, robotPose(mood, settings.time, 0, { isReducedMotion }), {
        ...settings,
        isReducedMotion
      })
      return rig.body.current?.position.y ?? Number.NaN
    }
    const frames = (count: number, draw: () => number) => Array.from({ length: count }, draw)
    const standingY = robotPose('walking', 0.5, 0).bob
    const sunkY = robotPose('gaming', 0.5, 0).bob

    it('sinks over the ease, never in one frame', () => {
      const drawn = figure()
      drawFrame(drawn, 'walking', { isMoving: true })
      const heights = frames(6, () => drawFrame(drawn, 'gaming', ON_SEAT))
      expect(heights[0]).toBeLessThan(standingY)
      for (const height of heights.slice(0, 5)) expect(height).toBeGreaterThan(sunkY)
      heights.slice(1).forEach((height, index) => expect(height).toBeLessThan(heights[index]))
      expect(heights[5]).toBe(sunkY)
    })

    it('rises back over the same ease', () => {
      const drawn = figure()
      drawFrame(drawn, 'gaming', ON_SEAT)
      const heights = frames(6, () => drawFrame(drawn, 'walking', { isMoving: true }))
      expect(heights[0]).toBeGreaterThan(sunkY)
      for (const height of heights.slice(0, 5)) expect(height).toBeLessThan(standingY)
      heights.slice(1).forEach((height, index) => expect(height).toBeGreaterThan(heights[index]))
      expect(heights[5]).toBe(standingY)
    })

    it('snaps in and out under reduced motion', () => {
      const drawn = figure()
      drawFrame(drawn, 'walking', { isMoving: true, isReducedMotion: true })
      expect(drawFrame(drawn, 'gaming', { ...ON_SEAT, isReducedMotion: true })).toBe(
        robotPose('gaming', 0, 0, { isReducedMotion: true }).bob
      )
      expect(drawFrame(drawn, 'walking', { isMoving: true, isReducedMotion: true })).toBe(0)
    })
  })
})
