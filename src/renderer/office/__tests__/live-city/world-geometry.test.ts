import { expect, it } from 'vitest'
import { buildLayout } from '../../../../office/sim/layout'
import { session } from '../../../../office/sim/fixtures'
import { toFloorGeometry } from '../../../office-live/layout-geometry'

it('retains every real floor identity and elevation when converting the effective layout', () => {
  const sessions = [session('one')]
  const layout = buildLayout(sessions, undefined)
  const first = {
    ...layout.floors[0],
    id: 'building:one:1',
    elevation: 0,
    buildingId: 'building:one',
    floorNumber: 1
  }
  const second = { ...structuredClone(first), id: 'building:one:2', elevation: 5.5, floorNumber: 2 }
  const geometry = toFloorGeometry({ ...layout, floors: [first, second] }, sessions)
  expect(geometry.map((floor) => floor.floorId)).toEqual([first.id, second.id])
  expect(geometry).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        floorId: first.id,
        elevation: 0,
        buildingId: first.buildingId,
        floorNumber: 1
      }),
      expect.objectContaining({
        floorId: second.id,
        elevation: 5.5,
        buildingId: first.buildingId,
        floorNumber: 2
      })
    ])
  )
})

it('keeps a local room display name separate from the actual session name', () => {
  const sessions = [session('one')]
  const layout = buildLayout(sessions, undefined)
  const room = layout.floors[0].rooms[0]
  layout.floors[0].rooms[0] = { ...room, ...{ displayLabel: 'Local room name' } }
  const geometry = toFloorGeometry(layout, sessions)
  expect(geometry[0].rooms[0].label).toBe('Local room name')
  expect(sessions[0].name).toBe('one')
})
