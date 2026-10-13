import { afterEach, expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { systemIo } from './io'
import { collectOpencode } from './opencode'
import { splitCommandLine } from '../shared/platform-process'
import { OPENCODE_STATEMENTS, type OpencodeDbError, type OpencodeStatement } from './opencode-db'
import { fixtureIo } from './__fixtures__/helpers'
import { buildOpencodeDb, insertSession, OPENCODE_SCHEMA } from './__fixtures__/opencode-db'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(fill: Parameters<typeof buildOpencodeDb>[0] = () => {}, schema = OPENCODE_SCHEMA) {
  const built = buildOpencodeDb(fill, schema)
  roots.push(built.root)
  return built
}
// The tables OpenCode 2.0 moved its sessions to, as 2.0.27 creates them, beside the 1.x ones it
// keeps but no longer writes.
const OPENCODE_2_SCHEMA = `
  CREATE TABLE session_v2 (
    id text PRIMARY KEY, project_id text NOT NULL, parent_id text, slug text NOT NULL,
    directory text NOT NULL, title text, version text NOT NULL, agent text,
    tokens_input integer DEFAULT 0 NOT NULL, tokens_output integer DEFAULT 0 NOT NULL,
    tokens_reasoning integer DEFAULT 0 NOT NULL, tokens_cache_read integer DEFAULT 0 NOT NULL,
    tokens_cache_write integer DEFAULT 0 NOT NULL, time_created integer NOT NULL,
    time_updated integer NOT NULL, time_archived integer
  );
  CREATE INDEX session_v2_parent_idx ON session_v2 (parent_id);
  CREATE TABLE session_message (
    id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, seq integer NOT NULL,
    time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL
  );
  CREATE UNIQUE INDEX session_message_session_seq_idx ON session_message (session_id, seq);
  CREATE INDEX session_message_session_time_created_id_idx
    ON session_message (session_id, time_created, id);
`
const BOTH_SCHEMAS = OPENCODE_SCHEMA + OPENCODE_2_SCHEMA
function insertSession2(
  db: DatabaseSync,
  row: {
    id: string
    directory: string
    parentId?: string
    updatedAtMs: number
    archivedAtMs?: number
  }
): void {
  db.prepare(
    `INSERT INTO session_v2 (id, project_id, parent_id, slug, directory, title, version, agent,
       tokens_input, tokens_output, time_created, time_updated, time_archived)
     VALUES (?, 'p', ?, 'slug', ?, ?, '2.0.27', 'build', 1200, 300, ?, ?, ?)`
  ).run(
    row.id,
    row.parentId ?? null,
    row.directory,
    row.id,
    row.updatedAtMs - 1000,
    row.updatedAtMs,
    row.archivedAtMs ?? null
  )
}
function insertMessage2(
  db: DatabaseSync,
  row: { id: string; sessionId: string; type: string; seq: number; atMs: number; data: object }
): void {
  db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    row.id,
    row.sessionId,
    row.type,
    row.seq,
    row.atMs,
    row.atMs,
    JSON.stringify(row.data)
  )
}

const statements = Object.entries(OPENCODE_STATEMENTS)
const failure = (reason: OpencodeDbError['reason']) =>
  expect.objectContaining({ name: 'OpencodeDbError', reason })
const readRoots = (target: string) =>
  systemIo.readOpencode(target, (query) => query('rootSessions', '/repo'))

it.each(statements)('keeps the %s statement to the session tables, bounded and keyed', (_, sql) => {
  const tables = [...sql.matchAll(/\b(?:FROM|JOIN)\s+(\w+)/gi)].map((match) => match[1])
  expect(tables.length).toBeGreaterThan(0)
  const sessionTables = ['session', 'message', 'part', 'session_v2', 'session_message']
  for (const table of tables) expect(sessionTables).toContain(table)
  expect(sql).not.toMatch(/credential|account|auth|\*/i)
  expect(sql).toMatch(/^\s*SELECT\b/i)
  expect(sql).toMatch(/\bLIMIT \d+\s*$/)
  // Keyed by one session, parent or folder, or bounded to the sessions written since a time.
  expect(sql).toMatch(/\b((session_id|parent_id|directory) = \?|time_updated >= \?)/)
  expect(sql).toMatch(/\bINDEXED BY \w+/)
})

it.each(statements)('answers the %s statement from an index, never a table scan', (_, sql) => {
  const { path } = fixture(() => {}, BOTH_SCHEMAS)
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const values = [...sql.matchAll(/\?/g)].map(() => 'x')
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values)
    const steps = plan.map((step) => String(step.detail))
    expect(steps.some((step) => step.startsWith('SEARCH'))).toBe(true)
    // Walking the parts of the one message found is no table scan.
    const scans = steps.filter(
      (step) => step.startsWith('SCAN') && !/^SCAN \w+ VIRTUAL TABLE/.test(step)
    )
    expect(scans).toEqual([])
  } finally {
    db.close()
  }
})

// An OpenCode 2 session mid-turn: a reply that has run one tool and is running another.
function workingSession2(db: DatabaseSync, directory: string, atMs: number): void {
  insertSession2(db, { id: 'ses_v2', directory, updatedAtMs: atMs })
  insertSession2(db, { id: 'ses_v2_child', parentId: 'ses_v2', directory, updatedAtMs: atMs })
  insertSession2(db, { id: 'ses_v2_gone', directory, updatedAtMs: atMs + 1, archivedAtMs: atMs })
  insertMessage2(db, { id: 'msg_1', sessionId: 'ses_v2', type: 'user', seq: 1, atMs, data: {} })
  insertMessage2(db, {
    id: 'msg_2',
    sessionId: 'ses_v2',
    type: 'assistant',
    seq: 2,
    atMs: atMs + 100,
    data: {
      time: { created: atMs + 100 },
      content: [
        { type: 'reasoning', text: 'SECRET_PROMPT' },
        { type: 'tool', name: 'shell', state: { status: 'completed', input: 'SECRET_PROMPT' } },
        { type: 'tool', name: 'read', state: { status: 'running' } }
      ]
    }
  })
  // Bookkeeping rows a session writes between turns say nothing about the turn.
  insertMessage2(db, {
    id: 'msg_3',
    sessionId: 'ses_v2',
    type: 'system',
    seq: 3,
    atMs: atMs + 200,
    data: {}
  })
}

it('asks an OpenCode 2 database the same questions, and finds a message’s parts inside it', async () => {
  const { path } = fixture((db) => workingSession2(db, 'C:/a', 6000), BOTH_SCHEMAS)
  const rows = await systemIo.readOpencode(path, (query) => ({
    roots: query('rootSessions', 'C:/a'),
    recent: query('recentRootSessions', 5000),
    children: query('childSessions', 'ses_v2'),
    message: query('newestMessage', 'ses_v2'),
    parts: query('messageParts', 'msg_2', 'ses_v2')
  }))
  expect(rows.roots).toMatchObject([{ id: 'ses_v2', tokens_input: 1200, time_updated: 6000 }])
  expect(rows.recent).toEqual([
    { id: 'ses_v2', directory: 'C:/a', time_created: 5000, time_updated: 6000 }
  ])
  expect(rows.children).toMatchObject([{ id: 'ses_v2_child', agent: 'build' }])
  expect(rows.message).toEqual([
    {
      id: 'msg_2',
      time_created: 6100,
      role: 'assistant',
      finish: null,
      completed: null,
      error: null
    }
  ])
  expect(rows.parts).toEqual([
    { type: 'tool', tool: 'read', status: 'running' },
    { type: 'tool', tool: 'shell', status: 'completed' },
    { type: 'reasoning', tool: null, status: null }
  ])
  expect(JSON.stringify(rows)).not.toContain('SECRET_PROMPT')
})

it('says why an OpenCode 2 reply stopped, by the type it records', async () => {
  const { path } = fixture((db) => {
    insertSession2(db, { id: 'ses_v2', directory: 'C:/a', updatedAtMs: 6000 })
    const data = { time: { created: 6000, completed: 6100 }, error: { type: 'aborted' } }
    insertMessage2(db, {
      id: 'msg_a',
      sessionId: 'ses_v2',
      type: 'assistant',
      seq: 1,
      atMs: 6000,
      data
    })
  }, BOTH_SCHEMAS)
  const [message] = await systemIo.readOpencode(path, (query) => query('newestMessage', 'ses_v2'))
  expect(message).toMatchObject({ error: 'aborted', completed: 6100 })
})

it('says an OpenCode 2 database whose tables changed has changed, never reading the stale 1.x ones', async () => {
  const schema = BOTH_SCHEMAS.replace(
    'INDEX session_v2_parent_idx ON session_v2',
    'INDEX other_idx ON session_v2'
  )
  const { path } = fixture(
    (db) => insertSession(db, { id: 'ses_v1', directory: '/repo', updatedAtMs: 9000 }),
    schema
  )
  await expect(readRoots(path)).rejects.toEqual(failure('changed'))
})

it('shows the OpenCode 2 session a process is working in, not the stale 1.x one', async () => {
  const startedAtMs = 5000
  const { root } = fixture((db) => {
    insertSession(db, { id: 'ses_v1', directory: 'C:/Users/a/repo', updatedAtMs: 9000 })
    workingSession2(db, 'C:/Users/a/repo', 9000)
  }, BOTH_SCHEMAS)
  const io = fixtureIo()
  io.readOpencode = systemIo.readOpencode
  const opencode = {
    pid: 42,
    lstart: '0',
    startedAtMs,
    argv: splitCommandLine('C:\\x\\opencode.exe')
  }
  const { sessions } = await collectOpencode(root, io, async () => [opencode], 9500, 'win32')
  expect(sessions).toMatchObject([
    {
      key: 'opencode:ses_v2',
      cwd: 'C:\\Users\\a\\repo',
      activity: 'reading',
      currentTool: { name: 'read' },
      usage: { own: { input: 1200, output: 300 } },
      subagents: [{ id: 'ses_v2_child', type: 'build', activity: 'thinking' }]
    }
  ])
})

it('finds the root sessions written since a time, newest first, with their folders', async () => {
  const { path } = fixture((db) => {
    insertSession(db, { id: 'ses_old', directory: 'C:/old', updatedAtMs: 4000 })
    insertSession(db, { id: 'ses_a', directory: 'C:/a', updatedAtMs: 6000 })
    insertSession(db, { id: 'ses_b', directory: 'C:/b', updatedAtMs: 7000 })
    insertSession(db, { id: 'ses_child', parentId: 'ses_a', directory: 'C:/a', updatedAtMs: 8000 })
    insertSession(db, { id: 'ses_gone', directory: 'C:/c', updatedAtMs: 9000, archivedAtMs: 9000 })
  })
  const rows = await systemIo.readOpencode(path, (query) => query('recentRootSessions', 5000))
  expect(rows).toEqual([
    { id: 'ses_b', directory: 'C:/b', time_created: 6000, time_updated: 7000 },
    { id: 'ses_a', directory: 'C:/a', time_created: 5000, time_updated: 6000 }
  ])
})

it('runs a fixed statement by name and no other text', async () => {
  const { path } = fixture((db) =>
    insertSession(db, { id: 'ses_a', directory: '/repo', updatedAtMs: 5000 })
  )
  const rows = await readRoots(path)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ id: 'ses_a', time_updated: 5000 })
  for (const text of ['SELECT value FROM credential LIMIT 1', 'credential', '__proto__']) {
    // Only a caller that lies about the type can even ask.
    const name = text as OpencodeStatement
    await expect(systemIo.readOpencode(path, (query) => query(name))).rejects.toThrow('forbidden')
  }
})

it('opens nothing but a file named opencode.db, and never an auth file', async () => {
  const { root, path } = fixture()
  for (const name of ['auth.json', 'mcp-auth.json', 'MCP-Auth.JSON', 'AUTH.json']) {
    copyFileSync(path, join(root, name))
    await expect(readRoots(join(root, name))).rejects.toThrow('forbidden')
  }
  // A link named like the database is followed, and what it points at is refused.
  mkdirSync(join(root, 'linked'))
  await symlink(join(root, 'mcp-auth.json'), join(root, 'linked', 'opencode.db'))
  await expect(readRoots(join(root, 'linked', 'opencode.db'))).rejects.toThrow('forbidden')
  copyFileSync(path, join(root, 'other.db'))
  await expect(readRoots(join(root, 'other.db'))).rejects.toThrow('forbidden')
})

it('refuses the OpenCode auth files to every file reader, in any letter case and through a link', async () => {
  const { root } = fixture()
  await writeFile(join(root, 'auth.json'), 'DO_NOT_READ')
  await writeFile(join(root, 'mcp-auth.json'), 'DO_NOT_READ')
  await symlink(join(root, 'auth.json'), join(root, 'session.json'))
  await symlink(join(root, 'mcp-auth.json'), join(root, 'mcp.json'))
  for (const name of [
    'auth.json',
    'mcp-auth.json',
    'AUTH.JSON',
    'Mcp-Auth.Json',
    'session.json',
    'mcp.json'
  ]) {
    const path = join(root, name)
    await expect(systemIo.readText(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readTail(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readFirstLine(path)).rejects.toThrow('forbidden')
    await expect(systemIo.readFrom(path, 0, 64)).rejects.toThrow('forbidden')
  }
})

it('reads a database with an unfinished log and leaves every byte of it alone', async () => {
  const { root, path } = fixture()
  const writer = new DatabaseSync(path)
  writer.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0')
  insertSession(writer, { id: 'ses_wal', directory: '/repo', updatedAtMs: 7000 })
  // A copy taken while the writer is open is what a killed OpenCode leaves: a log not yet merged.
  const crashed = join(root, 'crashed')
  mkdirSync(crashed)
  copyFileSync(path, join(crashed, 'opencode.db'))
  copyFileSync(`${path}-wal`, join(crashed, 'opencode.db-wal'))
  writer.close()
  const database = join(crashed, 'opencode.db')
  const before = { db: readFileSync(database), wal: readFileSync(`${database}-wal`) }
  expect(before.wal.length).toBeGreaterThan(0)

  const rows = await readRoots(database)

  expect(rows.map((row) => row.id)).toEqual(['ses_wal'])
  expect(readFileSync(database).equals(before.db)).toBe(true)
  expect(readFileSync(`${database}-wal`).equals(before.wal)).toBe(true)
})

it('says a missing database is missing, and creates none', async () => {
  const { root } = fixture()
  const absent = join(root, 'absent', 'opencode.db')
  await expect(readRoots(absent)).rejects.toEqual(failure('missing'))
  expect(existsSync(absent)).toBe(false)
})

it('says a file that is not a database is unreadable', async () => {
  const { root } = fixture()
  mkdirSync(join(root, 'text'))
  await writeFile(join(root, 'text', 'opencode.db'), 'not a database, '.repeat(300))
  await expect(readRoots(join(root, 'text', 'opencode.db'))).rejects.toEqual(failure('unreadable'))
})

it.each([
  ['column', 'time_archived', 'time_shelved'],
  ['index', 'session_parent_idx', 'other_idx']
])('says a database whose %s was renamed has changed', async (_, from, to) => {
  const { path } = fixture(() => {}, OPENCODE_SCHEMA.replace(from, to))
  await expect(readRoots(path)).rejects.toEqual(failure('changed'))
})

it('says a database another process holds locked is busy', async () => {
  const { path } = fixture()
  const lock = new DatabaseSync(path)
  try {
    lock.exec('BEGIN EXCLUSIVE')
    await expect(readRoots(path)).rejects.toEqual(failure('busy'))
  } finally {
    lock.close()
  }
})

it('reports text that is not JSON as malformed data, not as a row', async () => {
  const { path } = fixture((db) =>
    db.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)').run('msg_a', 'ses_a', 1, 1, '{broken')
  )
  await expect(
    systemIo.readOpencode(path, (query) => query('newestMessage', 'ses_a'))
  ).rejects.toEqual(failure('malformed'))
})
