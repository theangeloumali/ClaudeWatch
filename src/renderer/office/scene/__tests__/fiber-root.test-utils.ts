import { _roots, act, createRoot, extend, type Catalogue } from '@react-three/fiber'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { vi } from 'vitest'

const THREE_CLASSES: Catalogue = Object.fromEntries(
  Object.entries(THREE).filter(
    (entry): entry is [string, Catalogue[string]] => typeof entry[1] === 'function'
  )
)

export interface FiberMount {
  scene: THREE.Scene
  rerender(node: ReactNode): Promise<void>
  unmount(): Promise<void>
}

// A node under the real fiber reconciler, so its hooks and refs run; the stub renderer never draws.
export async function mountInFiber(node: ReactNode): Promise<FiberMount> {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  // As <Canvas> does, so JSX like <mesh> resolves.
  extend(THREE_CLASSES)
  const canvas = document.createElement('canvas')
  const root = createRoot(canvas)
  const gl = { domElement: canvas, render() {}, setPixelRatio() {}, setSize() {}, dispose() {} }
  await root.configure({ gl: gl as never, frameloop: 'never', events: undefined })
  await act(async () => root.render(node))
  const scene = _roots.get(canvas)?.store.getState().scene
  if (!scene) throw new Error('no fiber root')
  return {
    scene,
    rerender: (next) => act(async () => void root.render(next)),
    unmount: () => act(async () => root.unmount())
  }
}
