import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityLevel } from '../../logic/quality'
import { listThemes } from '../../themes/registry'
import { CityBeacons } from '../CityBeacons'
import { CityParticles } from '../CityParticles'
import { DoneFlags } from '../DoneFlags'
import { LeaderCrowns } from '../LeaderCrowns'

const harness = vi.hoisted(() => ({ level: 'full', frames: 0 }))
vi.mock('@react-three/fiber', () => ({ useFrame: () => void (harness.frames += 1) }))
vi.mock('../../quality-store', () => ({
  useQualityChoice: () => ({ pin: harness.level, chosen: 'full' }),
  useQualityLevel: () => harness.level
}))

const palette = listThemes()[0].palette
const LAYERS: Record<string, () => ReactElement> = {
  beacons: () => <CityBeacons floors={[]} palette={palette} band="building" />,
  particles: () => <CityParticles palette={palette} band="building" />,
  flags: () => <DoneFlags palette={palette} band="building" />
}

beforeEach(() => {
  harness.frames = 0
  // react-dom stands in for the canvas and does not know <primitive>.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const mount = (level: QualityLevel, layer: () => ReactElement) => {
  harness.level = level
  return render(layer())
}

describe('city marks by detail level', () => {
  it.each(Object.keys(LAYERS))('light shows no %s and asks for no frame work', (name) => {
    const { container } = mount('light', LAYERS[name])
    expect(container.innerHTML).toBe('')
    expect(harness.frames).toBe(0)
  })

  it.each(Object.keys(LAYERS))('full and balanced mount one mesh for %s', (name) => {
    for (const level of ['full', 'balanced'] as const) {
      const { container, unmount } = mount(level, LAYERS[name])
      expect(container.querySelectorAll('primitive')).toHaveLength(1)
      unmount()
    }
  })

  // The spire batch takes the lighter levels' last draw; the leaders card still names leaders.
  it('crowns show at full only, so spires keep their draw at the lighter levels', () => {
    const crowns = () => <LeaderCrowns agents={[]} sessions={[]} palette={palette} />
    for (const level of ['balanced', 'light'] as const) {
      const { container, unmount } = mount(level, crowns)
      expect(container.innerHTML).toBe('')
      unmount()
    }
    expect(harness.frames).toBe(0)
    expect(mount('full', crowns).container.querySelectorAll('primitive')).toHaveLength(1)
  })
})
