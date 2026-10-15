import { rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { fixtureIo } from '../__fixtures__/helpers'
import { buildOpencodeDb, OPENCODE_SCHEMA } from '../__fixtures__/opencode-db'
import { systemIo } from '../io'
import { collectOpencode } from '../opencode'
import { OPENCODE_READ_STATEMENTS, readOpencodeDb } from '../opencode-db'
import { OPEN_TOOL_HOLD_MS } from '../liveness'

const NOW = Date.parse('2026-10-14T12:00:00Z')
const PRIVATE_TEXT = 'PRIVATE_PROMPT_AND_TOOL_ARGUMENTS'
const ROOT_MODEL = { providerID: 'openai', id: 'gpt-6.1-sol-fast', variant: 'xhigh' }
const CHILD_MODEL = { providerID: 'anthropic', id: 'claude-sonnet-4-6' }
const PRIVATE_MODEL = 'PRIVATE_UNSUPPORTED_MODEL_METADATA'
// dry-new: the existing SQLite builder accepts schemas; its insert helpers only write legacy rows.
const V2_SCHEMA = `
  CREATE TABLE session_v2 (
    id TEXT PRIMARY KEY, parent_id TEXT, directory TEXT, title TEXT, agent TEXT, model TEXT,
    time_created INTEGER, time_updated INTEGER, time_archived INTEGER,
    time_idle INTEGER, idle_outcome TEXT,
    tokens_input INTEGER DEFAULT 0, tokens_output INTEGER DEFAULT 0,
    tokens_reasoning INTEGER DEFAULT 0, tokens_cache_read INTEGER DEFAULT 0,
    tokens_cache_write INTEGER DEFAULT 0
  );
  CREATE INDEX session_v2_parent_idx ON session_v2 (parent_id);
  CREATE TABLE session_message (
    id TEXT PRIMARY KEY, session_id TEXT, seq INTEGER, type TEXT,
    time_created INTEGER, time_updated INTEGER, data TEXT
  );
  CREATE INDEX session_message_time_created_idx ON session_message (time_created);
  CREATE INDEX session_message_session_seq_idx ON session_message (session_id, seq);
`
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function insertV2Session(
  db: DatabaseSync,
  row: { id: string; parentId?: string; updatedAtMs?: number; modelJson?: string | null }
): void {
  db.prepare(
    `INSERT INTO session_v2
      (id, parent_id, directory, title, agent, time_created, time_updated, model)
     VALUES (?, ?, '/repo', 'V2 work', 'explore', ?, ?, ?)`
  ).run(
    row.id,
    row.parentId ?? null,
    NOW - 2_000_000,
    row.updatedAtMs ?? NOW - 1_200_000,
    row.modelJson ?? null
  )
}

function insertV2Message(
  db: DatabaseSync,
  row: { sessionId: string; createdAtMs?: number; updatedAtMs?: number }
): void {
  const content = [
    { type: 'text', text: PRIVATE_TEXT },
    { type: 'tool', name: 'read', state: { status: 'running', input: PRIVATE_TEXT } }
  ]
  db.prepare('INSERT INTO session_message VALUES (?, ?, 1, ?, ?, ?, ?)').run(
    `msg_${row.sessionId}`,
    row.sessionId,
    'assistant',
    row.createdAtMs ?? NOW - 120_000,
    row.updatedAtMs ?? NOW - 1000,
    JSON.stringify({ content })
  )
}

function setup(fill: Parameters<typeof buildOpencodeDb>[0]) {
  const built = buildOpencodeDb(fill, `${OPENCODE_SCHEMA}\n${V2_SCHEMA}`)
  roots.push(built.root)
  const io = fixtureIo({ '/repo/.git': null })
  io.readOpencode = systemIo.readOpencode
  io.exec = async () => 'p42\nn/repo\n'
  const collect = () =>
    collectOpencode(
      built.root,
      io,
      async () => [
        {
          pid: 42,
          argv: ['/bin/opencode'],
          lstart: new Date(NOW - 2_000_000).toUTCString(),
          startedAtMs: NOW - 2_000_000
        }
      ],
      NOW
    )
  return { ...built, collect }
}

function workingFamily(
  db: DatabaseSync,
  models: { rootModelJson?: string | null; childModelJson?: string | null } = {}
): void {
  insertV2Session(db, { id: 'root', modelJson: models.rootModelJson })
  insertV2Message(db, { sessionId: 'root' })
  insertV2Session(db, { id: 'child', parentId: 'root', modelJson: models.childModelJson })
  insertV2Message(db, { sessionId: 'child' })
}

it('discovers an ongoing stream whose message creation predates the hold window', async () => {
  const { collect } = setup((db) => {
    workingFamily(db)
    db.prepare('UPDATE session_message SET time_created = ?, time_updated = ?').run(
      NOW - OPEN_TOOL_HOLD_MS - 1,
      NOW - 1000
    )
  })
  const batch = await collect()
  expect(batch.sources[0]).toMatchObject({ ok: true, detail: 'live' })
  expect(batch.sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(batch.sessions[0].subagents.map((child) => child.id)).toEqual(['child'])
})

it('retains a live stream after newer completed roots evict it from the discovery window', async () => {
  const { collect, path } = setup(workingFamily)
  expect((await collect()).sessions.map((session) => session.sessionId)).toEqual(['root'])
  const database = new DatabaseSync(path)
  try {
    database.prepare('UPDATE session_message SET time_created = ?').run(NOW - OPEN_TOOL_HOLD_MS - 1)
    for (let index = 0; index < 80; index++) insertV2Session(database, { id: `completed_${index}` })
  } finally {
    database.close()
  }
  const batch = await collect()
  expect(batch.sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(batch.sessions[0].subagents.map((child) => child.id)).toEqual(['child'])
})

it('checks indexed roots even when recent-message candidates are completed', async () => {
  const { collect } = setup((database) => {
    for (let index = 0; index < 64; index++) {
      const id = `completed_${index}`
      insertV2Session(database, { id })
      insertV2Message(database, { sessionId: id, createdAtMs: NOW - 1000 })
    }
    database.exec('UPDATE session_message SET type = \'idle\', data = \'{"outcome":"succeeded"}\'')
    workingFamily(database)
    database
      .prepare("UPDATE session_message SET time_created = ? WHERE session_id IN ('root', 'child')")
      .run(NOW - OPEN_TOOL_HOLD_MS - 1)
  })
  const batch = await collect()
  expect(batch.sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(batch.sessions[0].subagents.map((child) => child.id)).toEqual(['child'])
})

it('checks direct roots after completed descendant chains exhaust ancestor lookups', async () => {
  const { collect } = setup((database) => {
    for (let index = 0; index < 64; index++) {
      insertV2Session(database, { id: `ancestor_${index}` })
      insertV2Session(database, { id: `middle_${index}`, parentId: `ancestor_${index}` })
      insertV2Session(database, { id: `recent_${index}`, parentId: `middle_${index}` })
      insertV2Message(database, { sessionId: `recent_${index}`, createdAtMs: NOW - 1000 })
    }
    database.exec('UPDATE session_message SET type = \'idle\', data = \'{"outcome":"succeeded"}\'')
    for (let index = 0; index < 64; index++) insertV2Session(database, { id: `newer_${index}` })
    workingFamily(database)
    database
      .prepare("UPDATE session_message SET time_created = ? WHERE session_id IN ('root', 'child')")
      .run(NOW - OPEN_TOOL_HOLD_MS - 1)
  })
  const batch = await collect()
  expect(batch.sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(batch.sessions[0].subagents.map((child) => child.id)).toEqual(['child'])
})

it('retains provider-qualified model IDs independently on roots and children', async () => {
  const rootModel = { providerID: 'openrouter', id: 'anthropic/claude-sonnet-4.6' }
  const childModel = { providerID: 'openrouter', id: 'openai/gpt-6.1-sol-fast' }
  const { collect } = setup((database) => {
    workingFamily(database, {
      rootModelJson: JSON.stringify(rootModel),
      childModelJson: JSON.stringify(childModel)
    })
  })
  const { sessions } = await collect()
  expect(sessions[0]).toMatchObject({
    provider: 'opencode',
    selectedModel: { providerId: rootModel.providerID, modelId: rootModel.id }
  })
  expect(sessions[0].subagents[0]).toHaveProperty('selectedModel', {
    providerId: childModel.providerID,
    modelId: childModel.id
  })
})

it.each([
  ['v2RecentRoots', 64, []],
  ['v2ChildSessions', 32, ['root']],
  ['v2RecentRootsWithoutModel', 64, []],
  ['v2ChildSessionsWithoutModel', 32, ['root']]
] as const)(
  'bounds archive checks for %s before filtering historical rows',
  (statement, limit, bindings) => {
    const database = new DatabaseSync(':memory:')
    let archiveChecks = 0
    try {
      database.exec(V2_SCHEMA)
      database.function('observed_archive', (marker) => {
        archiveChecks++
        return marker
      })
      for (let index = 0; index < 2000; index++) {
        insertV2Session(database, {
          id: `history_${index}`,
          ...(bindings.length > 0 && { parentId: 'root' })
        })
      }
      database.exec('UPDATE session_v2 SET time_archived = 1')
      const observedQuery = OPENCODE_READ_STATEMENTS[statement].replace(
        'time_archived IS NULL',
        'observed_archive(time_archived) IS NULL'
      )
      expect(database.prepare(observedQuery).all(...bindings)).toEqual([])
      expect(archiveChecks).toBeLessThanOrEqual(limit)
    } finally {
      database.close()
    }
  }
)

it('discovers V2 beside legacy tables using streaming message freshness', async () => {
  const { collect } = setup(workingFamily)
  const batch = await collect()

  expect(batch.sources[0]).toMatchObject({ ok: true, detail: 'live' })
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]).toMatchObject({
    sessionId: 'root',
    pid: null,
    host: 'unknown',
    updatedAtMs: NOW - 1000,
    activity: 'reading',
    observation: { coverage: 'own', observedAtMs: NOW },
    subagents: [
      {
        id: 'child',
        pid: null,
        orcaPaneKey: null,
        activity: 'reading',
        currentTool: { name: 'read', category: 'read' },
        observation: { sourceId: 'opencode', coverage: 'own', observedAtMs: NOW }
      }
    ]
  })
  expect(batch.sessions[0].subagents).toHaveLength(1)
})

it('keeps prompt and tool arguments out of query rows and the feed', async () => {
  const { collect, path } = setup(workingFamily)
  const projected = readOpencodeDb(path, (query) => [
    query('v2NewestMessage', 'root'),
    query('v2MessageParts', 'root')
  ])
  const batch = await collect()

  expect(JSON.stringify(projected)).not.toContain(PRIVATE_TEXT)
  expect(JSON.stringify(batch)).not.toContain(PRIVATE_TEXT)
  expect(JSON.stringify(batch)).not.toContain('DO_NOT_READ')
})

it('excludes recent successful children and completed roots', async () => {
  const { collect } = setup((db) => {
    workingFamily(db)
    insertV2Session(db, { id: 'finished' })
    insertV2Message(db, { sessionId: 'finished' })
    db.prepare('UPDATE session_v2 SET time_idle = ?, idle_outcome = ? WHERE id != ?').run(
      NOW,
      'success',
      'root'
    )
  })
  const { sessions } = await collect()

  expect(sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(sessions[0].subagents).toEqual([])
})

it('does not attach orphans, cycles or historical tools by shared cwd', async () => {
  const { collect } = setup((db) => {
    insertV2Session(db, { id: 'root' })
    insertV2Message(db, { sessionId: 'root' })
    for (const [id, parentId] of [
      ['orphan', 'missing'],
      ['cycle_a', 'cycle_b'],
      ['cycle_b', 'cycle_a']
    ]) {
      insertV2Session(db, { id, parentId })
      insertV2Message(db, { sessionId: id })
    }
    insertV2Session(db, { id: 'historical', parentId: 'root', updatedAtMs: NOW - 2_000_000 })
    insertV2Message(db, {
      sessionId: 'historical',
      createdAtMs: NOW - 2_000_000,
      updatedAtMs: NOW - 2_000_000
    })
  })
  const { sessions } = await collect()

  expect(sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(sessions[0].subagents).toEqual([])
})

it.each([
  'session_message_time_created_idx',
  'session_message_session_seq_idx',
  'session_v2_parent_idx'
])('reports a changed schema when %s is missing', async (index) => {
  const { collect } = setup((db) => {
    workingFamily(db)
    db.exec(`DROP INDEX ${index}`)
  })
  expect(await collect()).toMatchObject({
    sessions: [],
    sources: [{ ok: false, detail: 'OpenCode database has a shape this version cannot read' }]
  })
})

it('bounds discovery of a wide child family', async () => {
  const { collect } = setup((db) => {
    insertV2Session(db, { id: 'root' })
    for (let index = 0; index < 40; index++) {
      insertV2Session(db, { id: `child_${index}`, parentId: 'root' })
      insertV2Message(db, { sessionId: `child_${index}` })
    }
  })
  const { sessions } = await collect()

  expect(sessions).toHaveLength(1)
  expect(sessions[0].subagents).toHaveLength(32)
  expect(new Set(sessions[0].subagents.map((child) => child.id)).size).toBe(32)
})

it('carries each identity’s selected model without changing the OpenCode transport provider', async () => {
  const { collect } = setup((database) => {
    workingFamily(database, {
      rootModelJson: JSON.stringify(ROOT_MODEL),
      childModelJson: JSON.stringify(CHILD_MODEL)
    })
  })
  const { sessions, sources } = await collect()

  expect(sources[0]).toMatchObject({ ok: true, detail: 'live' })
  expect(sessions).toHaveLength(1)
  expect(sessions[0]).toMatchObject({ key: 'opencode:root', provider: 'opencode' })
  expect(sessions[0]).toHaveProperty('selectedModel', {
    providerId: 'openai',
    modelId: 'gpt-6.1-sol-fast',
    variant: 'xhigh'
  })
  expect(sessions[0].subagents).toHaveLength(1)
  expect(sessions[0].subagents[0]).toHaveProperty('selectedModel', {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6'
  })
})

it.each([
  ['absent', undefined],
  ['null', null],
  ['malformed JSON', '{'],
  ['JSON null', 'null'],
  ['scalar', '42'],
  ['array', JSON.stringify([ROOT_MODEL])],
  ['missing provider', JSON.stringify({ id: ROOT_MODEL.id })],
  ['non-string provider', JSON.stringify({ ...ROOT_MODEL, providerID: 42 })],
  ['non-string model', JSON.stringify({ ...ROOT_MODEL, id: { name: ROOT_MODEL.id } })],
  ['empty model', JSON.stringify({ ...ROOT_MODEL, id: '' })],
  ['control character', JSON.stringify({ ...ROOT_MODEL, providerID: 'openai\nprivate' })],
  ['provider trailing newline', JSON.stringify({ ...ROOT_MODEL, providerID: 'openai\n' })],
  ['model trailing newline', JSON.stringify({ ...ROOT_MODEL, id: 'gpt-6.1-sol-fast\n' })],
  ['bidi model', JSON.stringify({ ...ROOT_MODEL, id: 'gpt-\u202espoof' })],
  ['oversized provider', JSON.stringify({ ...ROOT_MODEL, providerID: 'p'.repeat(129) })],
  ['oversized model', JSON.stringify({ ...ROOT_MODEL, id: 'm'.repeat(129) })]
] as const)(
  'suppresses %s child model metadata without inheritance or data loss',
  async (_label, childModelJson) => {
    const { collect } = setup((database) => {
      workingFamily(database, { rootModelJson: JSON.stringify(ROOT_MODEL), childModelJson })
      database.exec(`UPDATE session_v2 SET
      tokens_input = CASE WHEN parent_id IS NULL THEN 13 ELSE 31 END,
      tokens_output = 7, tokens_reasoning = 3, tokens_cache_read = 5, tokens_cache_write = 2`)
    })
    const { sessions, sources } = await collect()

    expect(sources[0]).toMatchObject({ ok: true, detail: 'live' })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: 'root',
      provider: 'opencode',
      activity: 'reading',
      usage: { own: { input: 13, output: 10, cacheRead: 5, cacheWrite: 2 } }
    })
    expect(sessions[0].subagents).toHaveLength(1)
    expect(sessions[0].subagents[0]).toMatchObject({
      id: 'child',
      activity: 'reading',
      tokens: { input: 31, output: 10, cacheRead: 5, cacheWrite: 2 },
      observation: { sourceId: 'opencode', coverage: 'own' }
    })
    expect(sessions[0].subagents[0]).not.toHaveProperty('selectedModel')
    expect(sessions[0]).toHaveProperty('selectedModel', {
      providerId: 'openai',
      modelId: 'gpt-6.1-sol-fast',
      variant: 'xhigh'
    })
  }
)

it.each([undefined, '{', JSON.stringify({ ...ROOT_MODEL, providerID: false })])(
  'retains a child’s own selected model when the root model is invalid (%s)',
  async (rootModelJson) => {
    const { collect } = setup((database) => {
      workingFamily(database, { rootModelJson, childModelJson: JSON.stringify(CHILD_MODEL) })
    })
    const { sessions, sources } = await collect()

    expect(sources[0]).toMatchObject({ ok: true, detail: 'live' })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).not.toHaveProperty('selectedModel')
    expect(sessions[0].subagents).toHaveLength(1)
    expect(sessions[0].subagents[0]).toMatchObject({ id: 'child', activity: 'reading' })
    expect(sessions[0].subagents[0]).toHaveProperty('selectedModel', {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6'
    })
  }
)

it('projects only selected model scalars, excluding raw and unsupported private fields', async () => {
  const modelJson = JSON.stringify({
    ...ROOT_MODEL,
    prompt: PRIVATE_TEXT,
    unsupported: { credential: PRIVATE_MODEL },
    executingModel: PRIVATE_MODEL
  })
  const { collect, path } = setup((database) => {
    workingFamily(database, { rootModelJson: modelJson, childModelJson: modelJson })
  })
  const projected = readOpencodeDb(path, (query) => [
    ...query('v2RecentSessions', NOW - OPEN_TOOL_HOLD_MS),
    ...query('v2Session', 'root'),
    ...query('v2RecentRoots'),
    ...query('v2ChildSessions', 'root')
  ])
  const batch = await collect()

  expect(projected.length).toBeGreaterThan(0)
  expect(JSON.stringify(projected)).not.toContain(PRIVATE_MODEL)
  expect(JSON.stringify(projected)).not.toContain(PRIVATE_TEXT)
  for (const row of projected) {
    expect(row).not.toHaveProperty('model')
    expect(Object.values(row)).toEqual(
      expect.arrayContaining(['openai', 'gpt-6.1-sol-fast', 'xhigh'])
    )
  }
  expect(JSON.stringify(batch)).not.toContain(PRIVATE_MODEL)
  expect(JSON.stringify(batch)).not.toContain(PRIVATE_TEXT)
  expect(JSON.stringify(batch)).not.toContain('executingModel')
  expect(batch.sessions[0]).toHaveProperty('selectedModel', {
    providerId: 'openai',
    modelId: 'gpt-6.1-sol-fast',
    variant: 'xhigh'
  })
})

it('does not revive completed or stale children that have valid selected models', async () => {
  const { collect } = setup((database) => {
    workingFamily(database, {
      rootModelJson: JSON.stringify(ROOT_MODEL),
      childModelJson: JSON.stringify(CHILD_MODEL)
    })
    insertV2Session(database, {
      id: 'completed_model',
      parentId: 'root',
      modelJson: JSON.stringify(ROOT_MODEL)
    })
    insertV2Message(database, { sessionId: 'completed_model' })
    database
      .prepare('UPDATE session_v2 SET time_idle = ?, idle_outcome = ? WHERE id = ?')
      .run(NOW, 'success', 'completed_model')
    const staleAtMs = NOW - OPEN_TOOL_HOLD_MS - 1
    insertV2Session(database, {
      id: 'stale_model',
      parentId: 'root',
      updatedAtMs: staleAtMs,
      modelJson: JSON.stringify(ROOT_MODEL)
    })
    insertV2Message(database, {
      sessionId: 'stale_model',
      createdAtMs: staleAtMs,
      updatedAtMs: staleAtMs
    })
  })
  const { sessions } = await collect()

  expect(sessions).toHaveLength(1)
  expect(sessions[0].subagents.map((child) => child.id)).toEqual(['child'])
  expect(sessions[0].subagents[0]).toHaveProperty('selectedModel', {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6'
  })
})

it('updates selected models without changing stable session or child identities', async () => {
  const { collect, path } = setup((database) => {
    workingFamily(database, {
      rootModelJson: JSON.stringify(ROOT_MODEL),
      childModelJson: JSON.stringify(CHILD_MODEL)
    })
  })
  const before = await collect()
  const database = new DatabaseSync(path)
  try {
    const updateModel = database.prepare('UPDATE session_v2 SET model = ? WHERE id = ?')
    updateModel.run(JSON.stringify(CHILD_MODEL), 'root')
    updateModel.run(JSON.stringify(ROOT_MODEL), 'child')
  } finally {
    database.close()
  }
  const after = await collect()

  expect(before.sessions).toHaveLength(1)
  expect(after.sessions).toHaveLength(1)
  expect(after.sessions[0]).toMatchObject({
    key: before.sessions[0].key,
    sessionId: before.sessions[0].sessionId,
    provider: 'opencode',
    subagents: [{ id: before.sessions[0].subagents[0].id }]
  })
  expect(after.sessions[0]).toHaveProperty('selectedModel', {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6'
  })
  expect(after.sessions[0].subagents[0]).toHaveProperty('selectedModel', {
    providerId: 'openai',
    modelId: 'gpt-6.1-sol-fast',
    variant: 'xhigh'
  })
})

it.each([null, 42, {}, '', 'x\nhigh', 'xhigh\n', 'x\u202ehigh', 'v'.repeat(129)])(
  'omits an invalid optional variant without dropping valid selected model IDs (%j)',
  async (variant) => {
    const { collect } = setup((database) => {
      const modelJson = JSON.stringify({ ...ROOT_MODEL, variant })
      workingFamily(database, { rootModelJson: modelJson, childModelJson: modelJson })
    })
    const { sessions, sources } = await collect()

    expect(sources[0]).toMatchObject({ ok: true, detail: 'live' })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].subagents).toHaveLength(1)
    for (const identity of [sessions[0], sessions[0].subagents[0]]) {
      expect(identity).toHaveProperty('selectedModel', {
        providerId: 'openai',
        modelId: 'gpt-6.1-sol-fast'
      })
    }
  }
)

it('retains live V2 identities when an older schema has no model column', async () => {
  const { collect } = setup((database) => {
    workingFamily(database)
    database.exec('ALTER TABLE session_v2 DROP COLUMN model')
  })

  // The second poll exercises retained-root lookups on the pre-model schema.
  for (const batch of [await collect(), await collect()]) {
    expect(batch.sources[0]).toMatchObject({ ok: true, detail: 'live' })
    expect(batch.sessions).toHaveLength(1)
    expect(batch.sessions[0]).toMatchObject({
      key: 'opencode:root',
      provider: 'opencode',
      activity: 'reading'
    })
    expect(batch.sessions[0]).not.toHaveProperty('selectedModel')
    expect(batch.sessions[0].subagents).toHaveLength(1)
    expect(batch.sessions[0].subagents[0]).toMatchObject({ id: 'child', activity: 'reading' })
    expect(batch.sessions[0].subagents[0]).not.toHaveProperty('selectedModel')
  }
})

it('bounds selected model query columns before values leave SQLite', () => {
  const { path } = setup((database) => {
    const modelJson = JSON.stringify({
      providerID: `openai\u0000${'p'.repeat(4096)}`,
      id: { unsupported: PRIVATE_MODEL },
      variant: 'v'.repeat(4096)
    })
    workingFamily(database, { rootModelJson: modelJson, childModelJson: modelJson })
  })
  const projected = readOpencodeDb(path, (query) => [
    ...query('v2RecentSessions', NOW - OPEN_TOOL_HOLD_MS),
    ...query('v2Session', 'root'),
    ...query('v2RecentRoots'),
    ...query('v2ChildSessions', 'root')
  ])

  expect(projected.length).toBeGreaterThan(0)
  for (const row of projected) {
    expect(row).not.toHaveProperty('model')
    expect(row).toMatchObject({ model_provider_id: null, model_id: null, model_variant: null })
  }
  expect(JSON.stringify(projected)).not.toContain(PRIVATE_MODEL)
})
