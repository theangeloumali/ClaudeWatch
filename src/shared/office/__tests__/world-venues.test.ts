import { expect, it } from 'vitest'
import { buildLayout } from '../../../office/sim/layout'
import { session } from '../../../office/sim/fixtures'
import { createWorldDocument, validateWorldDocument } from '../world-document'

it('provides real bounded entertainment destinations without inventing provider sessions', () => {
  const sessions = ['north', 'east', 'south', 'west'].map((project) => session(project, project))
  const layout = buildLayout(sessions, undefined)
  const document = createWorldDocument(layout, sessions)
  expect(document.venues.map((venue) => venue.kind)).toEqual([
    'arcade',
    'lounge',
    'market',
    'garage',
    'transit'
  ])
  expect(
    document.venues.every((venue) => venue.capacity > 0 && venue.capacity <= venue.slots.length)
  ).toBe(true)
  expect(validateWorldDocument(document, { layout, sessions })).toEqual([])
  expect(sessions).toHaveLength(4)
})
