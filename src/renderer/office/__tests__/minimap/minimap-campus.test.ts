import { describe, expect, it } from 'vitest'
import { campusGeometry } from '../../logic/campus-geometry'
import { campusMinimap } from '../../hud/campus-hud-model'
import { buildMinimapModel } from '../../logic/minimap-model'
import { makeFloor, makeFrame, makeZone } from '../fixtures'

const room = (floorId: string, x: number, projectKey: string) =>
  makeFloor({
    floorId,
    x,
    z: 0,
    width: 10,
    depth: 10,
    zones: [makeZone({ id: `project:${floorId}`, kind: 'project', projectKey })]
  })

describe('minimap in Campus', () => {
  const floors = [room('east', 30, 'p_east'), room('west', -30, 'p_west')]
  const geometry = campusGeometry(floors)
  const colors = new Map([['p_east', '#ff0000']])
  const model = buildMinimapModel({
    frame: makeFrame({ floors }),
    viewMode: 'city',
    focusedFloorId: null,
    focusedRoomId: null,
    selectedAgentKey: null,
    isPreview: false,
    campus: campusMinimap(geometry, colors)
  })

  it('colours each room by its chip and leaves an unknown project uncoloured', () => {
    expect(model.floors.map((floor) => [floor.floorId, floor.color])).toEqual([
      ['east', '#ff0000'],
      ['west', null]
    ])
  })

  it('carries the hub and a spoke per room, framed inside the bounds', () => {
    expect(model.campus?.hub).toMatchObject({ x: 0, z: 0 })
    expect(model.campus?.spokes).toHaveLength(2)
    const { minX, maxX } = model.bounds ?? { minX: 0, maxX: 0 }
    expect(minX).toBeLessThanOrEqual(-35)
    expect(maxX).toBeGreaterThanOrEqual(35)
  })

  it('has no campus layer outside Campus', () => {
    const city = buildMinimapModel({
      frame: makeFrame({ floors }),
      viewMode: 'city',
      focusedFloorId: null,
      focusedRoomId: null,
      selectedAgentKey: null,
      isPreview: false
    })
    expect(city.campus).toBeNull()
    expect(city.floors.every((floor) => floor.color === null)).toBe(true)
  })
})
