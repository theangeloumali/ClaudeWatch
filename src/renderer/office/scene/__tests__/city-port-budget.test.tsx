import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial
} from 'three'
import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS, type QualityLevel } from '../../logic/quality'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'

const MATRIX_BYTES = 16 * 4
const allocations = Object.values(CITY_LAYER_BUDGET)

const steadyDraws = (level: QualityLevel): number =>
  allocations
    .filter((allocation) => !allocation.isTransient)
    .reduce((sum, allocation) => sum + allocation.draws[level], 0)

const peakDraws = (level: QualityLevel): number =>
  allocations.reduce((sum, allocation) => sum + allocation.draws[level], 0)

// A stand-in port layer: three alike kiosks the batcher instances, and a fleet that poses its own.
function standInLayer() {
  const layer = new Group()
  const kioskShape = new BoxGeometry(1, 2, 1)
  const kioskPaint = new MeshStandardMaterial({ color: '#8a6f3a' })
  const kiosks = [0, 1, 2].map((index) => {
    const kiosk = new Mesh(kioskShape, kioskPaint)
    kiosk.position.x = index * 3
    layer.add(kiosk)
    return kiosk
  })
  const fleet = new InstancedMesh(new CylinderGeometry(0.5, 0.5, 1), kioskPaint, 4)
  for (let car = 0; car < fleet.count; car++)
    fleet.setMatrixAt(car, new Matrix4().makeTranslation(car * 2, 0, 9))
  layer.add(fleet)
  return { layer, kiosks, fleet }
}

describe('city port budget', () => {
  it('every port layer declares an allocation, and their sum stays within +12 draws at full', () => {
    for (const allocation of allocations)
      for (const level of QUALITY_LEVELS) {
        expect(Number.isInteger(allocation.draws[level])).toBe(true)
        expect(allocation.draws[level]).toBeGreaterThanOrEqual(0)
      }
    expect(steadyDraws('full')).toBeLessThanOrEqual(12)
  })

  it('the steady sum stays within +8 draws at balanced and +4 at light', () => {
    expect(steadyDraws('balanced')).toBeLessThanOrEqual(8)
    expect(steadyDraws('light')).toBeLessThanOrEqual(4)
  })

  it('the transient peak stays within +15 draws at full', () => {
    expect(peakDraws('full')).toBeLessThanOrEqual(15)
  })

  it('no layer draws more at a lighter level', () => {
    for (const { draws } of allocations) {
      expect(draws.balanced).toBeLessThanOrEqual(draws.full)
      expect(draws.light).toBeLessThanOrEqual(draws.balanced)
    }
  })

  it('trains upload their 2 kB a frame, and every other layer nothing while still', () => {
    const { trains, ...still } = CITY_LAYER_BUDGET
    expect(trains.uploadBytes).toBe(2048)
    expect(Object.values(still).every((allocation) => allocation.uploadBytes === 0)).toBe(true)
  })

  it('measures a layer as its batch draws it: alike parts are one draw', () => {
    const { layer } = standInLayer()
    expect(measureLayer(layer).draws).toBe(2)
  })

  it('a port layer uploads 0 bytes on a frame where nothing it draws moved', () => {
    const { layer } = standInLayer()
    expect(measureLayer(layer).uploadBytes).toBeGreaterThan(0)
    expect(measureLayer(layer).uploadBytes).toBe(0)
  })

  it('counts only the parts that moved', () => {
    const { layer, kiosks } = standInLayer()
    measureLayer(layer)
    kiosks[1].position.z = 3
    expect(measureLayer(layer).uploadBytes).toBe(MATRIX_BYTES)
  })

  it("counts a layer's own dirty ranges, and the whole buffer when it gives none", () => {
    const { layer, fleet } = standInLayer()
    measureLayer(layer)
    fleet.setMatrixAt(2, new Matrix4().makeTranslation(5, 0, 9))
    fleet.instanceMatrix.addUpdateRange(2 * 16, 16)
    fleet.instanceMatrix.needsUpdate = true
    expect(measureLayer(layer).uploadBytes).toBe(MATRIX_BYTES)
    fleet.instanceMatrix.needsUpdate = true
    expect(measureLayer(layer).uploadBytes).toBe(fleet.count * MATRIX_BYTES)
  })
})
