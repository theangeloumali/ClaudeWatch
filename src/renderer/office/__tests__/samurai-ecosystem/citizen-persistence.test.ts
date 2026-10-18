import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MoverLayer } from '../../citizens/MoverLayer'
import { SceneBodies } from '../../scene/BodySpace'
import { getTheme } from '../../themes/registry'
import { groupZonesByTheme } from '../../logic/office-themes'
import { MOVER_FLOORS, townOn } from '../../town/movers.test-utils'

const frame = vi.hoisted(() => ({ callback: (_state: object, _delta: number): void => {} }))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: typeof frame.callback) => {
    frame.callback = callback
  }
}))
vi.mock('../../quality-store', () => ({
  useQualityChoice: () => ({ pin: 'full', chosen: 'full' })
}))

it('keeps citizen positions through a feed frame that changes no ground or trip', () => {
  const floor = MOVER_FLOORS[0][1]
  const town = townOn(floor)
  const theme = getTheme('corporate-city')
  const bodies = new SceneBodies()
  const props = {
    floor,
    plan: town.plan,
    owners: town.owners,
    floorTheme: theme,
    zoneGroups: groupZonesByTheme(floor, () => theme.id),
    player: null,
    isReducedMotion: false,
    hasVehicles: false,
    bodies
  }
  const view = renderHook(
    (current) => {
      MoverLayer(current)
      return null
    },
    { initialProps: props }
  )
  act(() => {
    for (let tick = 0; tick < 20; tick++) frame.callback({}, 0.1)
  })
  const before = bodies.external()
  view.rerender({ ...props, floor: { ...floor }, plan: { ...town.plan } })
  expect(bodies.external()).toEqual(before)
  view.unmount()
  expect(bodies.external()).toEqual([])
})
