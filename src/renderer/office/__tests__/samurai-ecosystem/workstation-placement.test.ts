import { describe, expect, it } from 'vitest'
import { FURNITURE_SCALE, GUEST_FURNITURE_SCALE } from '../../../../shared/office/figure-scale'
import { WORKSTATIONS, workstationPlacement } from '../../themes/workstations'

describe('physical workstation placement', () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    it(`shares hardware scale and screen-facing transform at heading ${heading}`, () => {
      const slot = { slotId: 'desk_main', x: 12, z: -8, heading }
      const screen = workstationPlacement(slot, WORKSTATIONS.corporate)
      const [across, height, along] = WORKSTATIONS.corporate.screen
      expect(screen.x).toBeCloseTo(
        slot.x + FURNITURE_SCALE * (across * Math.cos(heading) + along * Math.sin(heading))
      )
      expect(screen.z).toBeCloseTo(
        slot.z + FURNITURE_SCALE * (along * Math.cos(heading) - across * Math.sin(heading))
      )
      expect(screen.y).toBeCloseTo(height * FURNITURE_SCALE)
      expect(screen.width).toBeCloseTo(WORKSTATIONS.corporate.width * FURNITURE_SCALE)
      expect(screen.rotationY).toBeCloseTo(heading + Math.PI)
    })
  }

  it('uses guest furniture scale without moving the seat', () => {
    const slot = { slotId: 'guest_1', x: 5, z: 7, heading: 0 }
    const screen = workstationPlacement(slot, WORKSTATIONS.edo)
    expect(screen.x).toBe(5)
    expect(screen.z).toBeCloseTo(7 + WORKSTATIONS.edo.screen[2] * GUEST_FURNITURE_SCALE)
    expect(screen.height).toBeCloseTo(WORKSTATIONS.edo.height * GUEST_FURNITURE_SCALE)
  })
})
