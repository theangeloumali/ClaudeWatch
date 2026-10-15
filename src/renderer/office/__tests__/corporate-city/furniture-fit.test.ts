import { Group, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  AGENT_SCALE,
  FURNITURE_SCALE,
  SUBAGENT_SCALE
} from '../../../../shared/office/figure-scale'
import { robotPose } from '../../logic/character-pose'
import {
  HUMAN_PIVOT,
  humanParts,
  selectHumanAppearance
} from '../../themes/corporate-city/human-parts'
import { humanPose } from '../../themes/corporate-city/human-pose'
import {
  CORPORATE_DESK_PARTS,
  CORPORATE_LOUNGE_CHAIR_PARTS
} from '../../themes/corporate-city/office-furniture'
import { HUMAN_SKINS } from '../../themes/corporate-city/palette'

describe('adult worker and furniture scale reconciliation', () => {
  it('supports a smaller adult subagent on the shared company lounge cushion', () => {
    const pose = humanPose(robotPose('lounging', 0, 0), {
      mood: 'lounging',
      time: 0,
      phase: 0,
      delta: 0,
      isReducedMotion: true,
      isSubagent: true,
      isInLounge: true
    })
    const pelvis = humanParts(selectHumanAppearance('fit-worker'), HUMAN_SKINS.claude.trim).joints
      .body[1]
    const pelvisBottom = (pose.bodyY + pelvis.at[1] - pelvis.size[1] / 2) * SUBAGENT_SCALE
    const seatTop = 0.355 * FURNITURE_SCALE
    expect(Math.abs(pelvisBottom - seatTop)).toBeLessThanOrEqual(0.025)
    expect(pose.bodyY - 0.3 * pose.lowerLegScale).toBeCloseTo(0)
  })
  it('supports the seated pelvis on both task and lounge chairs', () => {
    const pose = humanPose(robotPose('working', 0, 0), {
      mood: 'working',
      time: 0,
      phase: 0,
      delta: 0,
      isReducedMotion: true
    })
    const pelvis = humanParts(selectHumanAppearance('fit-worker'), HUMAN_SKINS.claude.trim).joints
      .body[1]
    const pelvisBottom = (pose.bodyY + pelvis.at[1] - pelvis.size[1] / 2) * AGENT_SCALE
    for (const chairParts of [CORPORATE_DESK_PARTS, CORPORATE_LOUNGE_CHAIR_PARTS]) {
      const seat = chairParts
        .filter((part) => part.at[2] === 0 && part.size[0] > 0.4 && part.size[1] <= 0.1)
        .sort(
          (first, second) => second.at[1] + second.size[1] / 2 - (first.at[1] + first.size[1] / 2)
        )[0]
      if (!seat) throw new Error('Missing chair seat')
      const seatTop = (seat.at[1] + seat.size[1] / 2) * FURNITURE_SCALE
      expect(Math.abs(pelvisBottom - seatTop)).toBeLessThanOrEqual(0.025)
    }
  })

  it('puts the working hand at the keyboard rather than typing in mid-air', () => {
    const pose = humanPose(robotPose('working', 0, 0), {
      mood: 'working',
      time: 0,
      phase: 0,
      delta: 0,
      isReducedMotion: true
    })
    const body = new Group()
    body.position.y = pose.bodyY
    body.rotation.x = pose.bodyPitch
    const shoulder = new Group()
    shoulder.position.set(...HUMAN_PIVOT.leftArm)
    shoulder.rotation.x = pose.leftArm
    const elbow = new Group()
    elbow.position.set(...HUMAN_PIVOT.leftElbow)
    elbow.rotation.x = pose.leftElbow
    body.add(shoulder)
    shoulder.add(elbow)
    body.updateMatrixWorld(true)
    const hand = elbow.localToWorld(new Vector3(0, -0.199, 0.009)).multiplyScalar(AGENT_SCALE)
    const keyboard = CORPORATE_DESK_PARTS.find((part) => part.size[0] === 0.36 && part.at[2] > 0.3)
    if (!keyboard) throw new Error('Missing keyboard')
    const keyboardTop = (keyboard.at[1] + keyboard.size[1] / 2) * FURNITURE_SCALE
    expect(hand.y - keyboardTop).toBeGreaterThanOrEqual(0)
    expect(hand.y - keyboardTop).toBeLessThanOrEqual(0.04)
    expect(Math.abs(hand.z - keyboard.at[2] * FURNITURE_SCALE)).toBeLessThanOrEqual(
      (keyboard.size[2] * FURNITURE_SCALE) / 2
    )
  })
})
