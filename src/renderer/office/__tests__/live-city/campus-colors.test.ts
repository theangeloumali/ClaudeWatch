import { describe, expect, it } from 'vitest'
import { campusRoomColors } from '../../logic/campus-colors'
import type { CampusSpoke } from '../../logic/campus-geometry'

function spokeAt(projectKey: string | null, degrees: number): CampusSpoke {
  const radians = (degrees * Math.PI) / 180
  const from = { x: Math.cos(radians) * 20, z: Math.sin(radians) * 20 }
  return { buildingId: `b-${projectKey}-${degrees}`, projectKey, from, to: from }
}

describe('campusRoomColors', () => {
  it('gives rooms that sit next to each other on the ring different colours', () => {
    const angles = [0, 45, 90, 135, 180, 225, 270, 315]
    const spokes = angles.map((degrees, index) => spokeAt(`p${index}`, degrees)).reverse()
    const colors = campusRoomColors(spokes)
    for (let index = 0; index < angles.length; index += 1) {
      const next = (index + 1) % angles.length
      expect(colors.get(`p${index}`)?.slab).not.toBe(colors.get(`p${next}`)?.slab)
    }
  })

  it('keeps one colour per project when a project has two plates', () => {
    const colors = campusRoomColors([
      spokeAt('alpha', 0),
      spokeAt('alpha', 90),
      spokeAt('beta', 180)
    ])
    expect(colors.size).toBe(2)
    expect(colors.get('alpha')?.slab).not.toBe(colors.get('beta')?.slab)
  })

  it('skips plates with no project', () => {
    expect(campusRoomColors([spokeAt(null, 0)]).size).toBe(0)
  })
})
