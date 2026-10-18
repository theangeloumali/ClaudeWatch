import { describe, expect, it } from 'vitest'
import { sensorOpening } from './layout'

describe('world layout', () => {
  it('opens sensors for reading and thinking without changing other activities', () => {
    expect(sensorOpening('reading')).toBeCloseTo(-0.8)
    expect(sensorOpening('thinking')).toBeCloseTo(-0.8)
    expect(sensorOpening('idle')).toBe(0)
    expect(sensorOpening('editing')).toBe(0)
  })
})
