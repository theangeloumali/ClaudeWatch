import { expect, it } from 'vitest'
import { roadNet } from '../road-net'
import { twoOfficeCity } from './pedestrian.test-utils'

// The ambient fleet and every work trip drive the same net, so it is built once per plan.
it("builds a plan's road net once", () => {
  const { plan } = twoOfficeCity()
  expect(roadNet(plan)).toBe(roadNet(plan))
})
