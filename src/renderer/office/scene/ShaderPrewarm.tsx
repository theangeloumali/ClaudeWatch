import type { RootState } from '@react-three/fiber'
import { useEffect } from 'react'

// perf-6: a view's programs link ahead of the frame that first draws them, in parallel where
// KHR_parallel_shader_compile allows. Shader error checks stay on: off, a failed shader draws
// silently black. Mounted inside the canvas, so it runs after that view's parts are placed.
export function ShaderPrewarm({
  root,
  viewMode
}: {
  root: Pick<RootState, 'get'> | null
  viewMode?: 'city' | 'office'
}) {
  useEffect(() => {
    if (!root) return
    const { gl, scene, camera } = root.get()
    void gl.compileAsync(scene, camera)
  }, [root, viewMode])
  return null
}
