import { describe, expect, it, vi } from 'vitest'
import { Group, Mesh } from 'three'
import { robotPose } from '../../logic/character-pose'
import { neoEdoSteam } from '../../themes/builtins'
import { applyModelPose } from '../../themes/rig'
import type { OfficeTheme, RobotRig } from '../../themes/types'

function legacyRig(): RobotRig {
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
    puffs: []
  }
}

describe('theme pose compatibility', () => {
  it('keeps the legacy pose adapter when a theme has no custom adapter', () => {
    const rig = legacyRig()
    const pose = robotPose('working', 0, 0, { isReducedMotion: true })
    applyModelPose({
      theme: neoEdoSteam,
      rig,
      pose,
      options: {
        mood: 'working',
        time: 0,
        phase: 0,
        delta: 0.1,
        isReducedMotion: true
      }
    })
    expect(rig.leftArm.current?.rotation.x).toBe(pose.leftArm)
    expect(rig.body.current?.position.y).toBe(pose.bob)
  })

  it('uses exactly one custom adapter instead of also overwriting its joints', () => {
    const rig = legacyRig()
    const applyPose = vi.fn(() => {
      if (rig.body.current) rig.body.current.position.y = 0.7
    })
    const theme: OfficeTheme = { ...neoEdoSteam, robot: { ...neoEdoSteam.robot, applyPose } }
    const pose = robotPose('walking', 1, 0)
    const options = {
      mood: 'walking' as const,
      time: 1,
      phase: 0,
      delta: 0.1,
      isReducedMotion: false,
      isMoving: true,
      travelDistance: 2
    }
    applyModelPose({ theme, rig, pose, options })
    expect(applyPose).toHaveBeenCalledExactlyOnceWith(rig, pose, options)
    expect(rig.body.current?.position.y).toBe(0.7)
    expect(rig.leftArm.current?.rotation.x).toBe(0)
  })
})
