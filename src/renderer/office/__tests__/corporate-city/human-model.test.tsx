import { Children, isValidElement, type ReactNode } from 'react'
import { BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { AgentView, ProviderId } from '../../../../shared/office/types'
import { HUMAN_SKINS, CORPORATE_PALETTE } from '../../themes/corporate-city/palette'
import { HumanFrame } from '../../themes/corporate-city/HumanFrame'
import {
  HUMAN_PIVOT,
  humanParts,
  selectHumanAppearance
} from '../../themes/corporate-city/human-parts'
import { corporatePlayerGeometry } from '../../themes/corporate-city/player-geometry'
import type { RobotModelProps, RobotRig } from '../../themes/types'

const PROVIDERS: readonly ProviderId[] = ['claude', 'codex', 'opencode']
const ROLES = [false, true] as const

function modelProps(provider: ProviderId, isSubagent: boolean): RobotModelProps {
  const joint = () => ({ current: null })
  const rig: RobotRig = {
    body: joint(),
    head: joint(),
    leftArm: joint(),
    rightArm: joint(),
    gear: joint(),
    legs: joint(),
    base: joint(),
    sensor: joint(),
    eye: joint(),
    thought: joint(),
    puffs: [],
    leftElbow: joint(),
    rightElbow: joint(),
    leftHip: joint(),
    rightHip: joint(),
    leftKnee: joint(),
    rightKnee: joint()
  }
  const agent: AgentView = {
    agentKey: 'stable-human',
    provider,
    isSubagent,
    floorId: 'floor',
    roomId: 'room',
    slotId: 'desk',
    x: 0,
    z: 0,
    heading: 0,
    activity: 'editing',
    attention: 'none',
    label: 'Worker'
  }
  return { agent, rig, skin: HUMAN_SKINS[provider], rosterIndex: 0, isReducedMotion: false }
}

function boundRefs(tree: ReactNode): Set<unknown> {
  const refs = new Set<unknown>()
  Children.forEach(tree, (element) => {
    if (!isValidElement<{ children?: ReactNode; ref?: unknown }>(element)) return
    const ref: unknown =
      Object.getOwnPropertyDescriptor(element.props, 'ref')?.value ??
      Object.getOwnPropertyDescriptor(element, 'ref')?.value
    if (ref) refs.add(ref)
    for (const childRef of boundRefs(element.props.children)) refs.add(childRef)
  })
  return refs
}

describe('corporate human anatomy and casting', () => {
  it('casts six stable silhouettes with varied skin, hair and civilian clothes', () => {
    const appearances = Array.from({ length: 512 }, (_, index) =>
      selectHumanAppearance(`agent-${index}`)
    )
    expect(new Set(appearances.map((appearance) => appearance.variant)).size).toBe(6)
    expect(new Set(appearances.map((appearance) => appearance.skin)).size).toBe(6)
    expect(new Set(appearances.map((appearance) => appearance.hair)).size).toBe(6)
    expect(new Set(appearances.map((appearance) => appearance.shirt)).size).toBe(6)
    expect(selectHumanAppearance('stable-human')).toEqual(selectHumanAppearance('stable-human'))
    const silhouettes = appearances.map((appearance) =>
      JSON.stringify(
        humanParts(appearance, HUMAN_SKINS.claude.trim).joints.head.map(({ at, size }) => ({
          at,
          size
        }))
      )
    )
    expect(new Set(silhouettes).size).toBe(6)
  })

  for (const provider of PROVIDERS) {
    for (const isSubagent of ROLES) {
      it(`binds adult anatomy for ${provider}, subagent=${isSubagent}`, () => {
        const props = modelProps(provider, isSubagent)
        const appearance = selectHumanAppearance(props.agent.agentKey)
        const parts = humanParts(appearance, HUMAN_SKINS[provider].trim)
        const refs = boundRefs(HumanFrame(props))
        for (const ref of Object.values(props.rig).filter((ref) => !Array.isArray(ref))) {
          expect(refs.has(ref)).toBe(true)
        }
        expect(appearance).toEqual(
          selectHumanAppearance(modelProps('claude', false).agent.agentKey)
        )
        expect(parts.joints.body.some((part) => part.color === HUMAN_SKINS[provider].trim)).toBe(
          true
        )
        expect(parts.joints.leftElbow.some((part) => part.color === appearance.skin)).toBe(true)
        expect(parts.joints.rightElbow.some((part) => part.color === appearance.skin)).toBe(true)
        expect(parts.joints.leftKnee.length).toBeGreaterThanOrEqual(2)
        expect(parts.joints.rightKnee.length).toBeGreaterThanOrEqual(2)
        expect(parts.eyes).toHaveLength(2)
        expect(parts.eyes.every((part) => !part.glow)).toBe(true)
      })
    }
  }

  it('keeps adult proportions normalized before the controller scales them', () => {
    for (let index = 0; index < 64; index++) {
      const parts = humanParts(selectHumanAppearance(`height-${index}`), HUMAN_SKINS.codex.trim)
      const headTop = Math.max(
        ...parts.joints.head.map(
          (part) => HUMAN_PIVOT.body[1] + HUMAN_PIVOT.head[1] + part.at[1] + part.size[1] / 2
        )
      )
      const footBottom = Math.min(
        ...parts.joints.leftKnee.map(
          (part) => HUMAN_PIVOT.body[1] + HUMAN_PIVOT.leftKnee[1] + part.at[1] - part.size[1] / 2
        )
      )
      expect(headTop).toBeGreaterThanOrEqual(1.05)
      expect(headTop).toBeLessThanOrEqual(1.15)
      expect(footBottom).toBeCloseTo(0)
      expect(headTop / parts.joints.head[0].size[1]).toBeGreaterThan(6)
    }
  })

  it('keeps topology fixed and every appearance below 2500 triangles', () => {
    const geometries = {
      box: new BoxGeometry(1, 1, 1),
      sphere: new SphereGeometry(0.5, 10, 6),
      cylinder: new CylinderGeometry(0.5, 0.5, 1, 8),
      cone: new ConeGeometry(0.5, 1, 6)
    }
    const partCounts = new Set<number>()
    try {
      for (let index = 0; index < 128; index++) {
        const parts = humanParts(
          selectHumanAppearance(`budget-${index}`),
          HUMAN_SKINS.opencode.trim
        )
        const allParts = [...Object.values(parts.joints).flat(), ...parts.eyes, ...parts.book]
        const triangles = allParts.reduce((count, part) => {
          const geometry = geometries[part.shape]
          return count + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
        }, 0)
        partCounts.add(allParts.length)
        expect(triangles).toBeLessThanOrEqual(2500)
      }
      expect(partCounts.size).toBe(1)
    } finally {
      Object.values(geometries).forEach((geometry) => geometry.dispose())
    }
  })

  it('creates a single vertex-colored adult owner with a ring and overhead pointer', () => {
    const dispose = vi.spyOn(BoxGeometry.prototype, 'dispose')
    const geometry = corporatePlayerGeometry(CORPORATE_PALETTE)
    try {
      geometry.computeBoundingBox()
      expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count)
      expect(
        (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
      ).toBeLessThanOrEqual(2500)
      expect(geometry.boundingBox?.min.y).toBeCloseTo(0)
      expect(geometry.boundingBox?.max.y).toBeGreaterThan(2)
      const positions = geometry.getAttribute('position')
      const bodyHeights = Array.from({ length: positions.count }, (_, vertex) =>
        positions.getY(vertex)
      ).filter((height) => height < 2)
      expect(Math.max(...bodyHeights)).toBeGreaterThanOrEqual(1.6)
      expect(Math.max(...bodyHeights)).toBeLessThanOrEqual(1.8)
      expect(geometry.boundingBox?.max.x).toBeGreaterThanOrEqual(0.5)
      expect(dispose).toHaveBeenCalled()
    } finally {
      geometry.dispose()
      dispose.mockRestore()
    }
  })
})
