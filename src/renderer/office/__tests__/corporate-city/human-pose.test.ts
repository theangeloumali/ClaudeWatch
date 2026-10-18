import { Group, Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { robotPose, type RobotMood } from '../../logic/character-pose'
import { createSeatEase, SEAT_EASE_SEC } from '../../logic/seat-ease'
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
    'gaming'
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

  it('distinguishes reading, thinking, waiting and gaming without invented moods', () => {
    const reading = poseFor('reading')
    const thinking = poseFor('thinking')
    const waiting = poseFor('needs-you')
    expect(reading.isReading).toBe(true)
    expect(reading.headPitch).toBeGreaterThan(0)
    expect(thinking.rightElbow).not.toBe(reading.rightElbow)
    expect(waiting.needsAttention).toBe(true)
    expect(waiting.rightArm).toBeLessThan(-2)
    expect(poseFor('gaming').isReading).toBe(false)
  })

  it('games with both hands out on a controller, leaning in and looking up at the screen', () => {
    const gaming = poseFor('gaming', { isReducedMotion: true })
    expect(gaming.bodyPitch).toBeGreaterThan(0)
    expect(gaming.headPitch + gaming.bodyPitch).toBeLessThan(0)
    for (const side of ['left', 'right'] as const) {
      const shoulder = gaming[`${side}Arm`]
      const elbow = gaming[`${side}Elbow`]
      expect(shoulder).toBeLessThan(-0.6)
      // The forearm rises from the elbow, so the hands meet in front of the chest.
      expect(shoulder + elbow + gaming.bodyPitch).toBeLessThan(-Math.PI / 2)
    }
    expect(gaming.leftArm).toBeCloseTo(gaming.rightArm)
  })

  it('bobs a little while gaming, and not at all under reduced motion', () => {
    const heights = [0.1, 0.4, 0.7, 1.0].map((time) => poseFor('gaming', { time }).bodyY)
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.002)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.03)
    expect(poseFor('gaming', { time: 0.1, isReducedMotion: true }).bodyY).toBe(
      poseFor('gaming', { time: 0.7, isReducedMotion: true }).bodyY
    )
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

describe('easing between standing and sitting', () => {
  // Six frames make up the ease exactly.
  const FRAME_SEC = SEAT_EASE_SEC / 6
  const SEATS = [
    { seat: 'desk', mood: 'working', place: { seatPresence: 'workstation' } },
    { seat: 'beanbag', mood: 'gaming', place: { seatPresence: 'lounge', isInLounge: true } }
  ] as const
  const STANDING_Y = HUMAN_PIVOT.body[1]
  const figure = () => ({ rig: rigFixture(), seat: createSeatEase() })
  type Figure = ReturnType<typeof figure>

  function drawFrame({ rig, seat }: Figure, mood: RobotMood, overrides: Partial<ThemePoseOptions>) {
    const settings = options(mood, { delta: FRAME_SEC, seat, ...overrides })
    applyHumanPose(rig, robotPose(mood, settings.time, settings.phase, settings), settings)
    return rig.body.current?.position.y ?? Number.NaN
  }
  const stand = (drawn: Figure, overrides: Partial<ThemePoseOptions> = {}) =>
    drawFrame(drawn, 'walking', { isMoving: true, travelDistance: 0, ...overrides })
  const frames = (count: number, draw: () => number) => Array.from({ length: count }, draw)

  for (const { seat, mood, place } of SEATS) {
    it(`sinks onto the ${seat} only over the ease, folding the legs as it goes`, () => {
      const drawn = figure()
      stand(drawn)
      const seatedY = poseFor(mood, place).bodyY
      const heights = frames(6, () => drawFrame(drawn, mood, place))
      expect(heights[0]).toBeLessThan(STANDING_Y)
      for (const height of heights.slice(0, 5)) expect(height).toBeGreaterThan(seatedY)
      heights.slice(1).forEach((height, index) => expect(height).toBeLessThan(heights[index]))
      expect(heights[5]).toBe(seatedY)
      expect(drawn.rig.leftKnee?.current?.rotation.x).toBeCloseTo(Math.PI / 2)
    })

    it(`bends the knees part way on the first frame onto the ${seat}`, () => {
      const drawn = figure()
      stand(drawn)
      drawFrame(drawn, mood, place)
      const knee = drawn.rig.leftKnee?.current?.rotation.x ?? Number.NaN
      expect(knee).toBeGreaterThan(0)
      expect(knee).toBeLessThan(Math.PI / 2)
    })

    it(`stands up from the ${seat} over the same ease`, () => {
      const drawn = figure()
      const seatedY = drawFrame(drawn, mood, place)
      const heights = frames(6, () => stand(drawn))
      expect(heights[0]).toBeGreaterThan(seatedY)
      for (const height of heights.slice(0, 5)) expect(height).toBeLessThan(STANDING_Y)
      heights.slice(1).forEach((height, index) => expect(height).toBeGreaterThan(heights[index]))
      expect(heights[5]).toBe(STANDING_Y)
      expect(drawn.rig.leftKnee?.current?.scale.y).toBe(1)
    })

    it(`snaps onto and off the ${seat} under reduced motion`, () => {
      const drawn = figure()
      const still = { ...place, isReducedMotion: true }
      stand(drawn, { isReducedMotion: true })
      expect(drawFrame(drawn, mood, still)).toBe(poseFor(mood, still).bodyY)
      expect(stand(drawn, { isReducedMotion: true })).toBe(STANDING_Y)
    })
  }

  it('draws a figure first seen in its seat already seated', () => {
    const place = { seatPresence: 'workstation' } as const
    expect(drawFrame(figure(), 'working', place)).toBe(poseFor('working', place).bodyY)
  })
})
