import { describe, vi } from 'vitest'
import { Texture } from 'three'
import { describeLoungeAndAmbient } from '../lounge-ambient.test-utils'
import { GROVE_LOT_KIT } from './grove-lots'
import { quietGrove } from './index'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: object) => ({ current })
}))
vi.mock('@react-three/fiber', () => import('../frame-capture.test-utils'))
vi.mock('../../scene/textures', () => ({
  useSignTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

describe('Quiet Grove lounge and ambient', () => {
  describeLoungeAndAmbient(quietGrove, GROVE_LOT_KIT, ['ambient-firefly', 'ambient-leaf'])
})
