import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Texture, Vector3 } from 'three'
import { makeAgent } from '../__tests__/fixtures'
import { Robot } from '../scene/Robot'
import { robotPose } from '../logic/character-pose'
import { applyThemePose } from './rig'
import { getTheme } from './registry'
import { emptyRig, mountFigure, silhouette } from './steam-frames.test-utils'
import { BRASS, DRAW_CEILING, EDO, scaled } from './live-budget.test-utils'
import type { OfficeTheme, RobotModelProps } from './types'
import { steamVariant } from './steam-variant'
import { samuraiParts } from './samurai-parts'
import { brassParts } from './brass-parts'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: () => ({ current: null })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: class {} }))
vi.mock('../scene/textures', () => ({
  useSignTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

function model(theme: OfficeTheme, agentKey: string, overrides: Partial<RobotModelProps> = {}) {
  const agent = makeAgent({ agentKey })
  const props: RobotModelProps = {
    agent,
    skin: theme.robot.skins[agent.provider],
    rig: emptyRig(),
    rosterIndex: 0,
    isReducedMotion: true,
    ...overrides
  }
  return { props, node: createElement(theme.robot.Model, props) }
}

const representatives = new Map<string, string>()
for (let index = 0; index < 4096; index++) {
  const key = `claude:rig-${index}`
  representatives.set(JSON.stringify(steamVariant(key)), key)
}

for (const themeId of [EDO, BRASS])
  describe(themeId, () => {
    const theme = getTheme(themeId)
    it('provides all 72 shape combinations with provider colours on the main body', () => {
      expect(representatives.size).toBe(72)
      for (const provider of ['claude', 'codex', 'opencode'] as const) {
        const looks = [...representatives.values()].map((agentKey) => {
          const { props, node } = model(theme, agentKey, {
            agent: makeAgent({ agentKey, provider }),
            skin: theme.robot.skins[provider]
          })
          const { joints } = themeId === EDO ? samuraiParts(props) : brassParts(props)
          expect(joints.body[0].color).toBe(theme.robot.skins[provider].body)
          return silhouette(node)
        })
        expect(new Set(looks).size).toBe(72)
      }
    })
    it.each(['claude', 'codex', 'opencode'] as const)(
      'gives 12 %s keys at least eight silhouettes',
      (provider) => {
        for (const prefix of ['session', 'worker', 'agent']) {
          const shapes = Array.from({ length: 12 }, (_, index) => {
            const agent = makeAgent({ agentKey: `${provider}:${prefix}-${index}`, provider })
            return silhouette(
              model(theme, agent.agentKey, { agent, skin: theme.robot.skins[provider] }).node
            )
          })
          expect(new Set(shapes).size).toBeGreaterThanOrEqual(8)
        }
      }
    )

    it('keeps a look through activity, bay and roster changes', () => {
      const first = model(theme, 'claude:stable')
      const changed = model(theme, 'claude:stable', {
        agent: { ...first.props.agent, activity: 'editing', attention: 'done', place: 'lounge' },
        rosterIndex: 17
      })
      expect(silhouette(changed.node)).toBe(silhouette(first.node))
    })

    it('keeps subagents smaller kin without replacing their silhouette', () => {
      const lead = model(theme, 'claude:kin')
      const sub = model(theme, 'claude:kin', { agent: { ...lead.props.agent, isSubagent: true } })
      expect(silhouette(sub.node)).toBe(silhouette(lead.node))
      const root = (agent: RobotModelProps['agent']) =>
        mountFigure(
          createElement(Robot, {
            agent,
            theme,
            rosterIndex: 0,
            isSelected: false,
            isSpeaking: false,
            isReducedMotion: true,
            onSelect: () => undefined,
            onFly: () => undefined
          })
        ).children[0]
      expect(root(sub.props.agent).scale.x).toBeLessThan(root(lead.props.agent).scale.x)
    })

    it('attaches every rig ref, keeps the visor forward and hands at working height for every look', () => {
      for (const agentKey of representatives.values()) {
        const {
          node,
          props: { rig }
        } = model(theme, agentKey)
        const root = mountFigure(node)
        for (const ref of [
          rig.base,
          rig.body,
          rig.legs,
          rig.head,
          rig.leftArm,
          rig.rightArm,
          rig.gear,
          rig.sensor,
          rig.eye,
          rig.thought,
          ...rig.puffs
        ])
          expect(ref.current).not.toBeNull()
        expect(rig.eye.current?.parent).toBe(rig.head.current)
        expect(rig.sensor.current?.parent).toBe(rig.head.current)
        expect(rig.head.current?.parent).toBe(rig.body.current)
        expect(rig.eye.current?.position.z).toBeGreaterThan(0)
        applyThemePose(rig, robotPose('working', 0, 0, { isReducedMotion: true }), {
          mood: 'working',
          time: 0,
          phase: 0,
          delta: 0.016,
          isReducedMotion: true
        })
        root.updateMatrixWorld(true)
        for (const arm of [rig.leftArm.current, rig.rightArm.current]) {
          const hand = arm?.localToWorld(new Vector3(0, -0.3, 0))
          expect(hand?.y).toBeGreaterThan(0.4)
          expect(hand?.y).toBeLessThan(0.5)
          expect(hand?.z).toBeGreaterThan(0.2)
        }
        expect(rig.thought.current?.position.y).toBeGreaterThan(1.1)
        applyThemePose(
          rig,
          { ...robotPose('thinking', 0, 0), eyeOpen: 0.1 },
          {
            mood: 'thinking',
            time: 0,
            phase: 0,
            delta: 0.016,
            isReducedMotion: false
          }
        )
        expect(rig.thought.current?.visible).toBe(true)
        expect(rig.eye.current?.scale.y).toBe(0.1)
        expect(rig.head.current?.rotation.x).toBeLessThan(0)
        applyThemePose(rig, robotPose('working', 0, 0), {
          mood: 'working',
          time: 0.5,
          phase: 0,
          delta: 0.016,
          isReducedMotion: false
        })
        expect(rig.puffs.every((ref) => ref.current?.visible)).toBe(true)
      }
    })
  })

it('keeps the varied Edo, Brass and Orbital floor with 60 agents within 300 draws', () => {
  expect(scaled([EDO, BRASS, 'orbital-garrison'], 60, 10).draws).toBeLessThanOrEqual(DRAW_CEILING)
})
