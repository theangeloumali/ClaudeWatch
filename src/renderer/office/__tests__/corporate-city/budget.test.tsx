import { expect, it, vi } from 'vitest'
import { Texture } from 'three'
import {
  agentsOn,
  companyThemes,
  DRAW_CEILING,
  measure,
  report,
  TRIANGLE_CEILING
} from '../../themes/live-budget.test-utils'
import { getTheme } from '../../themes/registry'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: object) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: class {} }))
vi.mock('../../scene/textures', () => ({
  signTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

it.each([20, 40, 60])(
  'keeps %i corporate workers and city geometry within the existing budgets',
  (count) => {
    const theme = getTheme('corporate-city')
    expect(theme.id).toBe('corporate-city')
    const measured = measure({
      ...agentsOn(count === 60 ? 10 : 4, count),
      floorTheme: theme,
      themeIdFor: () => theme.id
    })
    report(`Corporate City ${count} agents`, measured)
    expect(measured.draws).toBeLessThanOrEqual(DRAW_CEILING)
    expect(measured.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  }
)

it('composes contemporary and legacy districts without weakening the draw ceiling', () => {
  const measured = measure({
    ...agentsOn(10, 60),
    floorTheme: getTheme('corporate-city'),
    themeIdFor: companyThemes(['corporate-city', 'neo-edo-steam', 'violet-court'])
  })
  expect(measured.themeCount).toBe(3)
  expect(measured.draws).toBeLessThanOrEqual(DRAW_CEILING)
  expect(measured.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
})
