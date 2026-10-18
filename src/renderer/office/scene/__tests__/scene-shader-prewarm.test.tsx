// perf-6: the Office canvas prewarms its shaders once created and on every view switch.
import { cleanup, render } from '@testing-library/react'
import { Children, isValidElement, useEffect, type ReactNode } from 'react'
import { OrthographicCamera, Scene } from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { makeFloor, makeRoom } from '../../__tests__/fixtures'
import { themeForTeam } from '../../themes/registry'
import OfficeScene from '../OfficeScene'
import { ShaderPrewarm } from '../ShaderPrewarm'

const compileAsync = vi.fn(() => Promise.resolve())
const state = { gl: { compileAsync }, scene: new Scene(), camera: new OrthographicCamera() }

// Only the prewarm is drawn; the canvas hands it the root as R3F's onCreated would.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    children,
    onCreated
  }: {
    children?: ReactNode
    onCreated?: (root: { get: () => typeof state }) => void
  }) => {
    useEffect(() => onCreated?.({ get: () => state }), [onCreated])
    return (
      <>
        {Children.toArray(children).filter(
          (child) => isValidElement(child) && child.type === ShaderPrewarm
        )}
      </>
    )
  },
  useFrame: () => undefined,
  useThree: () => undefined
}))

afterEach(() => {
  cleanup()
  compileAsync.mockClear()
})

const floor = makeFloor({ floorId: 'f1', label: 'Main', rooms: [makeRoom({ id: 'r1' })] })
const floors = [floor]

function scene(viewMode: 'city' | 'office') {
  return (
    <OfficeScene
      theme={themeForTeam()}
      floors={[{ floorId: 'f1', label: 'Main', attentionCount: 0 }]}
      sessions={[]}
      floor={floor}
      visibleFloors={floors}
      allFloors={floors}
      agents={[]}
      cards={[]}
      stacks={[]}
      selectedAgentKey={null}
      wallsMode="cutaway"
      cameraRequest={null}
      metrics={{ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 }}
      onSelectAgent={() => undefined}
      onFlyToAgent={() => undefined}
      onFlyToZone={() => undefined}
      reviewableKeys={new Set()}
      onReview={() => undefined}
      speakingAgentKey={null}
      viewMode={viewMode}
    />
  )
}

it('prewarms the shaders of the first view and of each view switched to', () => {
  const view = render(scene('city'))
  expect(compileAsync).toHaveBeenCalledWith(state.scene, state.camera)
  view.rerender(scene('office'))
  expect(compileAsync).toHaveBeenCalledTimes(2)
})
