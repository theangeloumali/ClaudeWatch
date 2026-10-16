import { describe, expect, it } from 'vitest'
import { buildLayout } from '../../../office/sim/layout'
import { session } from '../../../office/sim/fixtures'
import { createWorldDocument } from '../world-document'
import { parseWorldSaveReply } from '../world-sync'

const sessions = [session('claude:a')]
const city = { ...createWorldDocument(buildLayout(sessions, undefined), sessions), revision: 2 }

describe('parseWorldSaveReply', () => {
  it('keeps a well-formed reply as it is', () => {
    expect(parseWorldSaveReply({ success: true, document: city })).toEqual({
      success: true,
      document: city
    })
    expect(parseWorldSaveReply({ success: false, reason: 'conflict', document: null })).toEqual({
      success: false,
      reason: 'conflict',
      document: null
    })
  })

  it.each([
    ['nothing', null],
    ['a success with no city', { success: true }],
    ['a success whose city is not a world document', { success: true, document: { version: 2 } }],
    [
      'the bare not-permitted reply of a view-only server',
      { success: false, reason: 'not-permitted' }
    ]
  ])('reads %s as a refusal that names no city', (_name, reply) => {
    expect(parseWorldSaveReply(reply)).toMatchObject({ success: false, document: null })
  })

  it('keeps a known refusal reason and drops an unknown one', () => {
    expect(parseWorldSaveReply({ success: false, reason: 'not-permitted' })).toMatchObject({
      reason: 'not-permitted'
    })
    expect(parseWorldSaveReply({ success: false, reason: 'rm -rf' })).toMatchObject({
      reason: 'storage-write'
    })
  })
})
