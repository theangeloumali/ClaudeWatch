import { expect, it } from 'vitest'
import { ISO_START_AZIMUTH } from '../../renderer/office/logic/camera-bands'
import { generatedMap, rosters } from '../sim/__tests__/generated-floors'

// The default Office camera's ground direction, from the scene toward it.
const CAMERA = { x: Math.sin(ISO_START_AZIMUTH), z: Math.cos(ISO_START_AZIMUTH) }

// Web project only: the node one compiles the sim without the renderer's camera.
it('faces every generated corner seat away from the camera, so the screen beyond faces it', () => {
  const floors = rosters()
    .map(generatedMap)
    .flatMap((map) => map.floors.filter((floor) => floor.rooms.length))
  const wrong: string[] = []
  for (const floor of floors) {
    const corner = floor.zones[0]?.lounge
    if (!corner) wrong.push(`${floor.id}: no corner`)
    for (const seat of corner?.slots ?? []) {
      const screenNormal = { x: -Math.sin(seat.heading), z: -Math.cos(seat.heading) }
      if (screenNormal.x * CAMERA.x + screenNormal.z * CAMERA.z <= 0)
        wrong.push(`${floor.id}/${seat.id}: heading ${seat.heading.toFixed(2)}`)
    }
  }
  expect(floors.length).toBeGreaterThan(40)
  expect(wrong).toEqual([])
})
