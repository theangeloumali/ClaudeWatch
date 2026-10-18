import { expect, it, vi } from 'vitest'
import { Texture } from 'three'
import {
  agentsOn,
  companyThemes,
  DRAW_CEILING,
  measure,
  TRIANGLE_CEILING
} from '../../themes/live-budget.test-utils'
import { getTheme } from '../../themes/registry'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: unknown) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: class {} }))
vi.mock('../../scene/textures', () => ({
  signTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

it.each([20, 40, 60])(
  'bounds the actual mixed corporate/cyberpunk scene with %i workers',
  (count) => {
    const composition = agentsOn(4, count)
    const result = measure({
      ...composition,
      floorTheme: getTheme('cyberpunk-city'),
      themeIdFor: companyThemes(['corporate-city', 'cyberpunk-city'])
    })
    expect(result.themeCount).toBe(2)
    expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
    expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  },
  30_000
)

it('costs fewer triangles than the corporate baseline with 60 workers', () => {
  const composition = agentsOn(4, 60)
  const corporate = measure({
    ...composition,
    floorTheme: getTheme('corporate-city'),
    themeIdFor: () => 'corporate-city'
  })
  const cyberpunk = measure({
    ...composition,
    floorTheme: getTheme('cyberpunk-city'),
    themeIdFor: () => 'cyberpunk-city'
  })
  expect(cyberpunk.draws).toBeLessThanOrEqual(DRAW_CEILING)
  expect(cyberpunk.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  expect(cyberpunk.triangles).toBeLessThan(corporate.triangles)
}, 30_000)
