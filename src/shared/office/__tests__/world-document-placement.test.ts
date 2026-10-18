import { expect, it } from 'vitest'
import { buildLayout } from '../../../office/sim/layout'
import { session } from '../../../office/sim/fixtures'
import { createWorldDocument } from '../world-document'

it('gives independent companies distinct neighborhoods rather than one compact central block', () => {
  const sessions = Array.from({ length: 3 }, (_, index) => ({
    ...session(`worker:${index}`, `project:${index}`),
    companyKey: `company:${index}`,
    companyLabel: `Company ${index}`
  }))
  const document = createWorldDocument(buildLayout(sessions, undefined), sessions)
  expect(document.buildings).toHaveLength(3)
  for (const [index, building] of document.buildings.entries()) {
    for (const other of document.buildings.slice(index + 1)) {
      const first = building.footprint,
        second = other.footprint
      const streetGap = Math.max(
        Math.abs(first.x - second.x) - (first.width + second.width) / 2,
        Math.abs(first.z - second.z) - (first.depth + second.depth) / 2
      )
      expect(streetGap).toBeGreaterThanOrEqual(24)
    }
  }
})
