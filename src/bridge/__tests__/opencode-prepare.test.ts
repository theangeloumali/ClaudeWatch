import { rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { buildOpencodeDb } from '../__fixtures__/opencode-db'
import { OPENCODE_READ_STATEMENTS, readOpencodeDb } from '../opencode-db'

// perf-4: every query re-compiled its SQL; `prepare` was a third of the poller's steady CPU.
const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('compiles each statement once per read, however often it is asked', () => {
  const { root, path } = buildOpencodeDb(() => {})
  roots.push(root)
  const prepare = vi.spyOn(DatabaseSync.prototype, 'prepare')
  readOpencodeDb(path, (query) => {
    for (const sessionId of ['ses_a', 'ses_b', 'ses_c', 'ses_d', 'ses_e'])
      query('newestMessage', sessionId)
  })
  // One for the OpenCode 2 table probe, one for the repeated statement.
  expect(prepare.mock.calls.length).toBeLessThanOrEqual(2)
})

it.each(['v2NewestMessages', 'v2NewestParts'] as const)(
  'answers %s for a batch of sessions from an index, never a table scan',
  (statement) => {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE session_message (id text PRIMARY KEY, session_id text NOT NULL,
      type text NOT NULL, seq integer NOT NULL, time_created integer, time_updated integer,
      data text NOT NULL);
      CREATE UNIQUE INDEX session_message_session_seq_idx ON session_message (session_id, seq);`)
    const sql = OPENCODE_READ_STATEMENTS[statement]
    const steps = db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all('["ses_a","ses_b"]')
      .map((step) => String(step.detail))
    db.close()

    expect(steps).toContain(
      'SEARCH session_message USING COVERING INDEX session_message_session_seq_idx (session_id=?)'
    )
    expect(steps.filter((step) => /^SCAN (?!\(subquery|\w+ VIRTUAL TABLE)/.test(step))).toEqual([])
  }
)
