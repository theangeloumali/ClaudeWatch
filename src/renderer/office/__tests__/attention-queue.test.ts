import { describe, expect, it } from 'vitest'
import type { CityEvent } from '../../office-live/city-events'
import {
  buildAttentionQueue,
  cityEventNews,
  newAttentionItems,
  nextAttentionKey,
  queueNews
} from '../logic/attention-queue'
import { milestoneAmount, milestoneStep } from '../logic/token-spires'
import { usage } from '../scene/__tests__/city-marks.test-utils'
import { makeSession } from './fixtures'

describe('attention queue', () => {
  const sessions = [
    makeSession({ key: 'claude:a', attention: 'question', updatedAtMs: 300 }),
    makeSession({ key: 'claude:b', attention: 'permission', updatedAtMs: 100 }),
    makeSession({ key: 'codex:c', attention: 'done', updatedAtMs: 50 }),
    makeSession({ key: 'claude:d', attention: 'error', updatedAtMs: 10 }),
    makeSession({ key: 'claude:e', attention: 'permission', updatedAtMs: 200 })
  ]

  it('holds only permission and question sessions, oldest first', () => {
    expect(buildAttentionQueue(sessions).map((item) => item.sessionKey)).toEqual([
      'claude:b',
      'claude:e',
      'claude:a'
    ])
  })

  it('moves Next to the item after the current one, wrapping, or to the head', () => {
    const queue = buildAttentionQueue(sessions)
    expect(nextAttentionKey(queue, null)).toBe('claude:b')
    expect(nextAttentionKey(queue, 'claude:b')).toBe('claude:e')
    expect(nextAttentionKey(queue, 'claude:a')).toBe('claude:b')
    expect(nextAttentionKey(queue, 'claude:zzz')).toBe('claude:b')
    expect(nextAttentionKey([], null)).toBeNull()
  })

  it('reports items that were not in the previous queue', () => {
    const before = buildAttentionQueue(sessions.slice(0, 2))
    const after = buildAttentionQueue(sessions)
    expect(newAttentionItems(before, after).map((item) => item.sessionKey)).toEqual(['claude:e'])
  })
})

describe('city news words', () => {
  const auth = makeSession({
    key: 'claude:a1b2',
    name: 'auth',
    projectLabel: 'PropApp',
    usage: usage(10_400_000)
  })
  const event = (kind: CityEvent['kind']): CityEvent => ({
    id: `claude:a1b2:${kind}`,
    kind,
    buildingId: 'building:c_test:p_1',
    sessionKey: auth.key,
    atMs: 0
  })

  it('words each event kind as "project › session · what happened"', () => {
    expect(cityEventNews(event('milestone'), [auth])?.text).toBe(
      'PropApp › auth · reached 10M tokens'
    )
    expect(cityEventNews(event('done'), [auth])?.text).toBe('PropApp › auth · finished its turn')
    expect(cityEventNews(event('hoist'), [auth])?.text).toBe(
      'PropApp › auth · built a new spire stage'
    )
  })

  it('a tool call has no words, and a session that left the feed is not named', () => {
    expect(cityEventNews(event('dispatch'), [auth])).toBeNull()
    expect(cityEventNews(event('done'), [])).toBeNull()
  })

  it('a needs-you item reads in the same words as the gem', () => {
    const [item] = buildAttentionQueue([{ ...auth, attention: 'permission' }])
    expect(queueNews(item).text).toBe('PropApp › auth · needs permission')
  })

  it('a milestone names the round amount of its 1-2-5 step', () => {
    for (let step = 1; step <= 12; step++) expect(milestoneStep(milestoneAmount(step))).toBe(step)
    expect([1, 2, 3, 4].map(milestoneAmount)).toEqual([1e6, 2e6, 5e6, 1e7])
  })
})
