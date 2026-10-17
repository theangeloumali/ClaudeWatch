import { Box3, Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { citizenGeometry } from '../citizens/figure-parts'
import { getTheme } from '../themes/registry'
import { cityStreetWidth } from '../../../shared/office/city-block-layout'
import { fallbackVehicle } from './fallback-vehicles'
import type { VehicleRole } from './town-dress'
import { SIDEWALK_M } from './town-grid'

const { palette } = getTheme('neo-edo-steam')
const ROLES: readonly VehicleRole[] = ['transit', 'freight', 'runabout']
// The middle of a lane on the city's narrowest street, from its centre line (trip-paths).
const NARROWEST_LANE_M = (cityStreetWidth(1) / 2 - SIDEWALK_M.collector) / 2

function sizeOf(role: VehicleRole): { box: Box3; size: Vector3 } {
  const geometry = citizenGeometry(fallbackVehicle(role, palette))
  const box = new Box3().setFromObject(new Mesh(geometry))
  geometry.dispose()
  return { box, size: box.getSize(new Vector3()) }
}

describe('fallbackVehicle', () => {
  it.each(ROLES)('builds a %s that stands on the ground, nose toward +z', (role) => {
    expect(fallbackVehicle(role, palette).role).toBe(role)
    const { box, size } = sizeOf(role)
    expect(box.min.y).toBeGreaterThan(-1e-6)
    expect(box.min.y).toBeLessThan(0.05)
    expect(size.z).toBeGreaterThan(size.x)
    // Half its width fits between the centre line and the middle of its lane.
    expect(size.x / 2).toBeLessThan(NARROWEST_LANE_M)
  })

  it('draws the cart about 1.2 m tall and the coach about 2.4 m, the wagon between', () => {
    expect(sizeOf('runabout').size.y).toBeCloseTo(1.2, 1)
    expect(sizeOf('transit').size.y).toBeCloseTo(2.4, 1)
    expect(sizeOf('freight').size.y).toBeGreaterThan(sizeOf('runabout').size.y)
    expect(sizeOf('freight').size.y).toBeLessThan(sizeOf('transit').size.y)
  })

  it('gives the three roles three names, in the theme’s own colours', () => {
    const names = ROLES.map((role) => fallbackVehicle(role, palette).name)
    expect(new Set(names).size).toBe(3)
    for (const part of fallbackVehicle('transit', palette).parts())
      expect(Object.values(palette)).toContain(part.color)
  })
})
