import { createElement } from 'react'
import { Texture } from 'three'
import { expect, it, vi } from 'vitest'
import { FloorView } from '../../scene/FloorView'
import { mergedDraws, everyElement } from '../../themes/scene.test-utils'
import { makeFloor } from '../fixtures'
import { getTheme } from '../../themes/registry'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: unknown) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('../../scene/textures', () => ({
  useSignTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

it('opens upper opaque ceilings in cutaway mode while retaining physical storey heights', () => {
  const theme = getTheme('corporate-city')
  const floor = makeFloor({ floorId: 'upper', elevation: 5.5 })
  const tree = createElement(FloorView, {
    floor,
    floorTheme: theme,
    zoneGroups: [],
    wallsMode: 'cutaway',
    isReducedMotion: true,
    ...{ openInteriors: true }
  })
  const planes = everyElement(tree).filter((node) => node.props.name === 'floor-cutaway-surface')
  expect(planes).toHaveLength(1)
  expect(mergedDraws(tree).draws).toBeLessThan(8)
})
