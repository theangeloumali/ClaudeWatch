import { createElement } from 'react'
import { Box3, Euler, Group, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  AGENT_SCALE,
  FURNITURE_SCALE,
  GUEST_FURNITURE_SCALE,
  SUBAGENT_SCALE
} from '../../../../shared/office/figure-scale'
import { robotPose } from '../../logic/character-pose'
import { DESK_REACH } from '../../logic/room-layout'
import {
  HUMAN_PIVOT,
  humanParts,
  selectHumanAppearance
} from '../../themes/corporate-city/human-parts'
import { humanPose } from '../../themes/corporate-city/human-pose'
import {
  CORPORATE_COMPUTER_PARTS,
  CORPORATE_DESK_PARTS
} from '../../themes/corporate-city/office-furniture'
import {
  CORPORATE_MATERIALS,
  CORPORATE_PALETTE,
  HUMAN_SKINS
} from '../../themes/corporate-city/palette'
import { EDO_COMPUTER_PARTS, EDO_DESK_PARTS } from '../../themes/edo-computer-parts'
import { EDO } from '../../themes/palettes'
import { Parts, type PartSpec } from '../../themes/parts'
import { mergedDraws } from '../../themes/scene.test-utils'
import { steamJoints, steamPivot } from '../../themes/steam-variant'
import { WORKSTATIONS } from '../../themes/workstations'

const EPSILON = 1e-6
const PROVIDERS = Object.entries(HUMAN_SKINS).map(([provider, skin]) => ({ provider, skin }))
const DESK_MOODS = ['idle', 'working', 'reading', 'thinking', 'needs-you'] satisfies Parameters<
  typeof robotPose
>[0][]
const ARM_SIDES = ['leftArm', 'rightArm'] satisfies (keyof typeof HUMAN_PIVOT)[]
const FRAME_TIMES = [0, 0.125, 0.25, 0.375, 0.5]
const SCALED_SEATS = [
  { agent: AGENT_SCALE, furniture: FURNITURE_SCALE },
  { agent: SUBAGENT_SCALE, furniture: GUEST_FURNITURE_SCALE }
]
const COMPUTERS = [
  {
    name: 'Corporate',
    parts: CORPORATE_COMPUTER_PARTS,
    desk: CORPORATE_DESK_PARTS,
    screen: WORKSTATIONS.corporate,
    glass: CORPORATE_MATERIALS.screen,
    tableTop: 0.57,
    tableBottom: 0.51,
    keyboardWidth: 0.36,
    keyboardDepth: 0.14,
    keyboardAlong: DESK_REACH - 0.16,
    colors: [...Object.values(CORPORATE_MATERIALS), ...Object.values(CORPORATE_PALETTE)]
  },
  {
    name: 'NeoEdo',
    parts: EDO_COMPUTER_PARTS,
    desk: EDO_DESK_PARTS,
    screen: WORKSTATIONS.edo,
    glass: EDO.ink,
    tableTop: 0.485,
    tableBottom: 0.395,
    keyboardWidth: 0.34,
    keyboardDepth: 0.13,
    keyboardAlong: DESK_REACH - 0.18,
    colors: Object.values(EDO)
  }
]

// Rotation-aware bounds also catch horizontal cable and control-cylinder overhangs.
function boundsOf(part: PartSpec) {
  const halfSize = new Vector3(...part.size).multiplyScalar(0.5)
  const transform = new Matrix4().makeRotationFromEuler(
    new Euler(part.rotation?.[0] ?? 0, part.rotation?.[1] ?? 0, part.rotation?.[2] ?? 0)
  )
  transform.setPosition(...part.at)
  return new Box3(halfSize.clone().negate(), halfSize).applyMatrix4(transform)
}

function keyboardOf(computer: (typeof COMPUTERS)[number]) {
  const keyboard = computer.parts.find(
    (part) => part.size[0] === computer.keyboardWidth && part.size[2] === computer.keyboardDepth
  )
  if (!keyboard) throw new Error(`Missing ${computer.name} keyboard chassis`)
  return keyboard
}

describe.each(COMPUTERS)('$name computer hardware', (computer) => {
  it('backs the exact live screen with a recessed opaque glass face', () => {
    const { screen } = computer
    const glass = computer.parts.find(
      (part) =>
        part.color === computer.glass &&
        part.size[0] === screen.width &&
        part.size[1] === screen.height
    )
    if (!glass) throw new Error('Missing authored screen face')
    expect(glass.at.slice(0, 2)).toEqual(screen.screen.slice(0, 2))
    expect(boundsOf(glass).min.z - screen.screen[2]).toBeCloseTo(0.004)
    expect(glass.glow).not.toBe(true)
    for (const part of computer.parts) {
      const bounds = boundsOf(part)
      const overlapsOpening =
        bounds.max.x > -screen.width / 2 &&
        bounds.min.x < screen.width / 2 &&
        bounds.max.y > screen.screen[1] - screen.height / 2 &&
        bounds.min.y < screen.screen[1] + screen.height / 2
      if (overlapsOpening)
        expect(bounds.min.z).toBeGreaterThanOrEqual(screen.screen[2] + 0.003 - EPSILON)
    }
  })

  it('surrounds the screen with four bezel edges and a rear enclosure', () => {
    const { screen } = computer
    const edges = computer.parts.filter(
      (part) =>
        part.shape === 'box' &&
        Math.abs(part.at[2] - screen.screen[2]) < 0.03 &&
        (part.size[0] >= screen.width || part.size[1] >= screen.height) &&
        (part.size[0] < 0.04 || part.size[1] < 0.04)
    )
    expect(edges.length).toBeGreaterThanOrEqual(4)
    expect(edges.some((part) => part.at[0] < -screen.width / 2)).toBe(true)
    expect(edges.some((part) => part.at[0] > screen.width / 2)).toBe(true)
    expect(edges.some((part) => part.at[1] > screen.screen[1] + screen.height / 2)).toBe(true)
    expect(edges.some((part) => part.at[1] < screen.screen[1] - screen.height / 2)).toBe(true)
    const housing = computer.parts.filter(
      (part) => part.size[0] > screen.width * 0.85 && part.size[1] > screen.height * 0.8
    )
    const enclosure = housing.reduce((bounds, part) => bounds.union(boundsOf(part)), new Box3())
    expect(enclosure.max.z - screen.screen[2]).toBeGreaterThan(
      computer.name === 'NeoEdo' ? 0.2 : 0.06
    )
    expect(enclosure.max.z - screen.screen[2]).toBeLessThan(0.29)
    expect(
      computer.parts.some(
        (part) =>
          part.at[0] === 0 &&
          part.at[1] - part.size[1] / 2 >= computer.tableTop - EPSILON &&
          part.at[1] < computer.tableTop + 0.04 &&
          part.size[0] >= 0.2
      )
    ).toBe(true)
  })

  it('has separated key rows, a spacebar, modifiers and navigation or function groups', () => {
    const keyboard = keyboardOf(computer)
    expect(keyboard.at[2]).toBe(computer.keyboardAlong)
    const keys = computer.parts.filter(
      (part) =>
        part.size[0] <= 0.035 &&
        part.size[1] <= 0.007 &&
        part.size[2] <= 0.025 &&
        Math.abs(part.at[0]) <= keyboard.size[0] / 2 &&
        part.at[1] >= boundsOf(keyboard).max.y &&
        Math.abs(part.at[2] - keyboard.at[2]) <= keyboard.size[2] / 2
    )
    expect(keys.length).toBeGreaterThan(32)
    expect(new Set(keys.map((part) => part.at[2])).size).toBeGreaterThanOrEqual(4)
    for (const key of keys) {
      const bounds = boundsOf(key)
      expect(bounds.min.x).toBeGreaterThanOrEqual(-keyboard.size[0] / 2 - EPSILON)
      expect(bounds.max.x).toBeLessThanOrEqual(keyboard.size[0] / 2 + EPSILON)
      expect(bounds.min.z).toBeGreaterThanOrEqual(boundsOf(keyboard).min.z - EPSILON)
      expect(bounds.max.z).toBeLessThanOrEqual(boundsOf(keyboard).max.z + EPSILON)
    }
    expect(
      computer.parts.some(
        (part) =>
          part.size[0] > 0.09 &&
          part.size[0] < 0.15 &&
          part.size[1] <= 0.007 &&
          part.at[2] < keyboard.at[2]
      )
    ).toBe(true)
  })

  it('includes a separate mouse with paired buttons and a horizontal scroll wheel', () => {
    const mouse = computer.parts.filter(
      (part) => part.at[0] > 0.25 && Math.abs(part.at[2] - computer.keyboardAlong) < 0.06
    )
    expect(mouse.length).toBeGreaterThanOrEqual(5)
    expect(
      mouse.filter((part) => part.shape === 'box' && part.size[1] <= 0.007).length
    ).toBeGreaterThanOrEqual(2)
    expect(
      mouse.some((part) => part.shape === 'cylinder' && part.rotation?.[2] === Math.PI / 2)
    ).toBe(true)
  })

  it('includes a floor-supported tower with front vents, side vents, a control and ports', () => {
    const tower = computer.parts.find(
      (part) => part.size[1] >= 0.35 && part.size[0] > 0.15 && part.size[0] < 0.25
    )
    if (!tower) throw new Error('Missing computer tower')
    const chassis = boundsOf(tower)
    expect(chassis.min.y).toBeCloseTo(0.02)
    expect(chassis.max.y).toBeLessThan(computer.tableTop - 0.03)
    expect(chassis.min.z).toBeGreaterThan(0.5)
    const fittings = computer.parts.filter(
      (part) => Math.abs(part.at[0] - tower.at[0]) <= 0.11 && part.at[1] < chassis.max.y
    )
    expect(
      fittings.filter((part) => part.size[0] >= 0.12 && part.size[1] <= 0.009).length
    ).toBeGreaterThanOrEqual(5)
    expect(
      fittings.filter((part) => part.size[0] <= 0.008 && part.size[1] >= 0.1).length
    ).toBeGreaterThanOrEqual(5)
    expect(
      fittings.some((part) => part.shape === 'cylinder' && part.rotation?.[0] === Math.PI / 2)
    ).toBe(true)
    expect(
      fittings.filter(
        (part) => part.shape === 'box' && part.size[0] <= 0.035 && part.size[1] <= 0.02
      ).length
    ).toBeGreaterThanOrEqual(2)
  })

  it('routes cables through a rear entry and under-desk tray without occupying the seat', () => {
    expect(
      computer.parts.some(
        (part) =>
          boundsOf(part).max.y < computer.tableBottom && part.size[0] >= 0.4 && part.size[1] < 0.05
      )
    ).toBe(true)
    expect(
      computer.parts.some(
        (part) =>
          part.shape === 'cylinder' && part.size[0] >= 0.045 && part.at[2] > DESK_REACH + 0.2
      )
    ).toBe(true)
    expect(
      computer.parts.filter((part) => part.size[0] <= 0.01 && part.size[1] >= 0.1).length
    ).toBeGreaterThanOrEqual(2)
    for (const scale of [FURNITURE_SCALE, GUEST_FURNITURE_SCALE]) {
      for (const part of computer.parts) {
        const bounds = boundsOf(part)
        expect(bounds.min.y * scale).toBeGreaterThanOrEqual(-EPSILON)
        expect(bounds.min.z * scale).toBeGreaterThan(0.29 * scale)
        expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeLessThanOrEqual(
          0.65 + EPSILON
        )
        expect(
          Math.max(Math.abs(bounds.min.z - DESK_REACH), Math.abs(bounds.max.z - DESK_REACH))
        ).toBeLessThanOrEqual(0.325 + EPSILON)
      }
    }
    expect(computer.parts.every((part) => computer.desk.includes(part))).toBe(true)
  })

  it('keeps towers and cable trays outside the unchanged table supports', () => {
    const supports = computer.desk.filter(
      (part) => part.at[2] === DESK_REACH && Math.abs(part.at[0]) > 0.4 && part.size[1] >= 0.35
    )
    expect(supports).toHaveLength(2)
    for (const part of computer.parts) {
      for (const support of supports)
        expect(boundsOf(part).intersectsBox(boundsOf(support))).toBe(false)
    }
  })

  it('reuses palette-backed unit geometry with no glow or per-desk draw growth', () => {
    for (const part of computer.parts) {
      expect(['box', 'cylinder']).toContain(part.shape)
      expect(computer.colors).toContain(part.color)
      expect(part.size.every((length) => Number.isFinite(length) && length > 0)).toBe(true)
      expect(part.at.every(Number.isFinite)).toBe(true)
      expect(part.glow).not.toBe(true)
    }
    const one = mergedDraws(createElement(Parts, { parts: computer.parts }))
    const many = mergedDraws(
      Array.from({ length: 12 }, (_, index) =>
        createElement(Parts, { key: index, parts: computer.parts })
      )
    )
    expect(one.untextured).toBeLessThanOrEqual(10)
    expect(many.untextured).toBe(one.untextured)
    expect(one.draws).toBe(one.untextured)
  })
})

describe('Corporate provider hand clearance', () => {
  it.each(PROVIDERS)('keeps $provider hand poses clear of keys and the monitor', ({ skin }) => {
    const keys = CORPORATE_COMPUTER_PARTS.filter(
      (part) =>
        part.at[1] >= 0.59 &&
        part.at[1] <= 0.6 &&
        Math.abs(part.at[0]) <= 0.18 &&
        part.at[2] < DESK_REACH - 0.08
    )
    const keyTop = Math.max(...keys.map((part) => boundsOf(part).max.y))
    const handPart = humanParts(
      selectHumanAppearance('hardware-fit'),
      skin.trim
    ).joints.leftElbow.find((part) => part.shape === 'box' && part.size[0] === 0.063)
    if (!handPart) throw new Error('Missing articulated hand')
    const monitor = CORPORATE_COMPUTER_PARTS.filter(
      (part) => part.at[1] > 0.67 && part.size[0] > 0.04
    )
    for (const scales of SCALED_SEATS) {
      const furnitureTransform = new Matrix4().makeScale(
        scales.furniture,
        scales.furniture,
        scales.furniture
      )
      for (const mood of DESK_MOODS) {
        for (const time of FRAME_TIMES) {
          const pose = humanPose(robotPose(mood, time, 0), {
            mood,
            time,
            phase: 0,
            delta: 0,
            isReducedMotion: false
          })
          const body = new Group()
          body.position.y = pose.bodyY
          body.rotation.x = pose.bodyPitch
          for (const side of ARM_SIDES) {
            const shoulder = new Group()
            shoulder.position.set(...HUMAN_PIVOT[side])
            shoulder.rotation.set(
              side === 'leftArm' ? pose.leftArm : pose.rightArm,
              side === 'rightArm' ? pose.rightArmYaw : 0,
              side === 'rightArm' ? pose.rightArmRoll : 0
            )
            const elbow = new Group()
            elbow.position.set(...HUMAN_PIVOT.leftElbow)
            elbow.rotation.x = side === 'leftArm' ? pose.leftElbow : pose.rightElbow
            body.add(shoulder)
            shoulder.add(elbow)
            body.updateMatrixWorld(true)
            const hand = elbow
              .localToWorld(new Vector3(...handPart.at))
              .multiplyScalar(scales.agent)
            if (mood === 'working') {
              expect(hand.y - keyTop * scales.furniture).toBeGreaterThanOrEqual(0)
              expect(hand.y - keyTop * scales.furniture).toBeLessThanOrEqual(0.04)
              expect(hand.z).toBeGreaterThanOrEqual((DESK_REACH - 0.23) * scales.furniture)
              expect(hand.z).toBeLessThanOrEqual((DESK_REACH - 0.09) * scales.furniture)
            }
            const handTransform = new Matrix4().makeScale(scales.agent, scales.agent, scales.agent)
            handTransform.multiply(elbow.matrixWorld)
            const handBounds = boundsOf(handPart).applyMatrix4(handTransform)
            for (const fitting of [...keys, ...monitor]) {
              const fittingBounds = boundsOf(fitting).applyMatrix4(furnitureTransform)
              expect(handBounds.intersectsBox(fittingBounds)).toBe(false)
            }
          }
        }
      }
    }
  })
})

describe('NeoEdo provider pose clearance', () => {
  it.each(PROVIDERS)(
    'keeps $provider articulated hands clear of CRT glass and keycaps',
    ({ skin }) => {
      const joints = steamJoints({ skin }, EDO.ink)
      const fittings = EDO_COMPUTER_PARTS.filter(
        (part) =>
          (part.at[1] >= 0.51 && part.at[1] <= 0.516 && Math.abs(part.at[0]) < 0.17) ||
          (part.size[0] === WORKSTATIONS.edo.width && part.size[1] === WORKSTATIONS.edo.height)
      )
      for (const scales of SCALED_SEATS) {
        const furnitureTransform = new Matrix4().makeScale(
          scales.furniture,
          scales.furniture,
          scales.furniture
        )
        for (const mood of DESK_MOODS) {
          for (const time of FRAME_TIMES) {
            const pose = robotPose(mood, time, 0)
            const body = new Matrix4().makeRotationFromEuler(new Euler(pose.lean, 0, pose.sway))
            body.setPosition(0, pose.bob, 0)
            for (const side of ARM_SIDES) {
              const shoulder = new Matrix4().makeRotationFromEuler(
                new Euler(
                  side === 'leftArm' ? pose.leftArm : pose.rightArm,
                  0,
                  side === 'rightArm' ? pose.rightArmRoll : 0
                )
              )
              shoulder.setPosition(...steamPivot(0)[side])
              const transform = new Matrix4().makeScale(scales.agent, scales.agent, scales.agent)
              transform.multiply(body).multiply(shoulder)
              const hand = joints[side].find((part) => part.at[1] === -0.3)
              if (!hand) throw new Error('Missing NeoEdo hand')
              const handBounds = boundsOf(hand).applyMatrix4(transform)
              for (const fitting of fittings)
                expect(
                  handBounds.intersectsBox(boundsOf(fitting).applyMatrix4(furnitureTransform))
                ).toBe(false)
            }
          }
        }
      }
    }
  )
})
