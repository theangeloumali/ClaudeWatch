// perf-6: each view's shader programs are compiled ahead of the frame that first draws them.
import type { RootState } from '@react-three/fiber'
import { cleanup, render } from '@testing-library/react'
import { OrthographicCamera, Scene } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShaderPrewarm } from '../ShaderPrewarm'

afterEach(cleanup)

function fakeRoot() {
  const scene = new Scene()
  const camera = new OrthographicCamera()
  const compileAsync = vi.fn(() => Promise.resolve(scene))
  const state = { gl: { compileAsync }, scene, camera }
  const root = { get: () => state } as unknown as RootState
  return { root, scene, camera, compileAsync }
}

describe('ShaderPrewarm', () => {
  it('compiles the scene once the canvas exists, and again after a view switch', () => {
    const { root, scene, camera, compileAsync } = fakeRoot()
    const { rerender } = render(<ShaderPrewarm root={null} viewMode="city" />)
    expect(compileAsync).not.toHaveBeenCalled()
    rerender(<ShaderPrewarm root={root} viewMode="city" />)
    expect(compileAsync).toHaveBeenCalledWith(scene, camera)
    rerender(<ShaderPrewarm root={root} viewMode="office" />)
    expect(compileAsync).toHaveBeenCalledTimes(2)
    rerender(<ShaderPrewarm root={root} viewMode="office" />)
    expect(compileAsync).toHaveBeenCalledTimes(2)
  })
})
