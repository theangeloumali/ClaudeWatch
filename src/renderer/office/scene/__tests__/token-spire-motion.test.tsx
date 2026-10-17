import { advance } from '@react-three/fiber'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildingPlaces } from '../../logic/building-place'
import { getTheme } from '../../themes/registry'
import { TokenSpire } from '../TokenSpire'
import { mountInFiber } from './fiber-root.test-utils'

vi.mock('../../logic/city-clock', () => ({
  cityClock: { now: () => 1_000, isPinned: () => true }
}))

const theme = getTheme('corporate-city')

afterEach(() => {
  buildingPlaces.setRoof('tower', null)
  vi.unstubAllGlobals()
})

describe('token spire under reduced motion', () => {
  it('a stage reached under reduced motion shows its new module', async () => {
    buildingPlaces.setRoof('tower', { x: 4, y: 10, z: -2 }, { x: 4, y: 9, z: -2 })
    buildingPlaces.setStage('tower', 1, 0)
    const spire = (stage: number) => <TokenSpire buildingId="tower" theme={theme} stage={stage} />
    const { scene, rerender, unmount } = await mountInFiber(spire(1))
    advance(1)
    // The stage feed runs in the frame loop, so it can see stage 2 a frame before React mounts it.
    buildingPlaces.setStage('tower', 2, 1_000)
    advance(2)
    await rerender(spire(2))
    advance(3)
    const modules = scene.getObjectByName('token-spire:tower')?.children ?? []
    expect(modules.map((module) => module.visible)).toEqual([true, true])
    await unmount()
  })
})
