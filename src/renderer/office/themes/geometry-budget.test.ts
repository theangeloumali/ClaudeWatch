import { createElement, isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeGeometry } from './geometry-audit.test-utils'
import { Texture } from 'three'
import { InstancedParts } from '../scene/InstancedParts'
import { listThemes } from './registry'
import { makeAgent } from '../__tests__/fixtures'
import { useRobotRig } from './rig'

// Expand the real procedural JSX without a Canvas, frame loop or GPU.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: () => ({ current: null }),
  useState: () => [false, () => undefined]
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined, Canvas: () => null }))
vi.mock('@react-three/drei', () => ({ Html: () => null, OrbitControls: () => null }))
vi.mock('../scene/textures', () => ({ useSignTexture: () => new Texture() }))

interface Props {
  children?: ReactNode
  args?: readonly (number | undefined)[]
  placements?: readonly object[]
  ref?: object
}

function expand(node: ReactNode): ReactNode {
  if (!isValidElement<Props>(node) || typeof node.type !== 'function') return node
  if (node.type === InstancedParts) return node
  return expand((node.type as (props: Props) => ReactNode)(node.props))
}

function triangleCount(kind: string, args: readonly (number | undefined)[]): number {
  const geometry = makeGeometry(kind, args)
  const triangles = (geometry.index?.count ?? geometry.attributes.position.count) / 3
  geometry.dispose()
  return triangles
}

function audit(
  node: ReactNode,
  instances = 1
): { draws: number; triangles: number; refs: object[] } {
  if (Array.isArray(node)) {
    return node
      .map((child) => audit(child, instances))
      .reduce(
        (sum, entry) => ({
          draws: sum.draws + entry.draws,
          triangles: sum.triangles + entry.triangles,
          refs: [...sum.refs, ...entry.refs]
        }),
        { draws: 0, triangles: 0, refs: [] }
      )
  }
  const element = expand(node)
  if (Array.isArray(element)) return audit(element, instances)
  if (!isValidElement<Props>(element)) return { draws: 0, triangles: 0, refs: [] }
  const instanced = element.type === InstancedParts || element.type === 'instancedMesh'
  const count =
    element.type === InstancedParts
      ? (element.props.placements?.length ?? 0)
      : instanced
        ? (element.props.args?.[2] ?? 0)
        : instances
  const children = audit(element.props.children, count)
  const kind = typeof element.type === 'string' ? element.type : ''
  return {
    draws: children.draws + (kind === 'mesh' || instanced ? 1 : 0),
    triangles:
      children.triangles +
      (kind.endsWith('Geometry') ? triangleCount(kind, element.props.args ?? []) * instances : 0),
    refs: element.props.ref ? [...children.refs, element.props.ref] : children.refs
  }
}

describe('procedural geometry budgets', () => {
  for (const theme of listThemes()) {
    it(`${theme.id} keeps each provider model under 2500 triangles with controller refs`, () => {
      for (const provider of ['claude', 'codex'] as const) {
        const rig = useRobotRig()
        const agent = makeAgent({ agentKey: `${provider}:model`, provider })
        const result = audit(
          createElement(theme.robot.Model, {
            agent,
            skin: theme.robot.skins[provider],
            rosterIndex: 0,
            rig,
            isReducedMotion: true
          })
        )
        expect(result.triangles).toBeLessThanOrEqual(2500)
        for (const ref of [
          rig.body,
          rig.head,
          rig.leftArm,
          rig.rightArm,
          rig.gear,
          rig.eye,
          rig.thought,
          rig.base
        ]) {
          expect(result.refs).toContain(ref)
        }
      }
    })
  }
})
