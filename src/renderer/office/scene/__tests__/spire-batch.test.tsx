// A spire stage change rebuilds one city-wide batch, never the buildings' (perf-11's crew rule).
import { describe, expect, it, vi } from 'vitest'
import { listThemes } from '../../themes/registry'
import { mergedDraws } from '../../themes/scene.test-utils'
import { spireBatchRevision } from '../batch-revision'
import { TokenSpires } from '../TokenSpire'

vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current }),
  useLayoutEffect: () => undefined
}))
vi.mock('../CompanyLens', () => ({ CompanyLens: () => null }))

const themes = listThemes()
const spires = themes.flatMap((theme, index) =>
  [1, 3, 6].map((stage) => ({ buildingId: `b${index}:${stage}`, stage, theme }))
)

describe('the city spire batch', () => {
  it('spires cost at most one draw', () => {
    const batch = TokenSpires({ spires, floors: [], palette: themes[0].palette })
    const { draws } = mergedDraws(batch)
    console.info(`City spires: ${draws} draw for ${spires.length} spires`)
    expect(draws).toBeLessThanOrEqual(1)
  })

  it('is re-keyed by a stage or a theme, so only it rebuilds', () => {
    const at = (stage: number, theme = themes[0]) =>
      spireBatchRevision([{ buildingId: 'tower', stage, theme }])
    expect(at(2)).not.toBe(at(1))
    expect(at(2, themes[1])).not.toBe(at(2))
    expect(at(2)).toBe(at(2))
  })
})
