import { afterEach, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { type BridgeIo, systemIo } from './io'
import { collectOpencode } from './opencode'
import { fixtureIo } from './__fixtures__/helpers'
import {
  buildOpencodeDb,
  insertMessage,
  insertPart,
  insertSession
} from './__fixtures__/opencode-db'

const START = 'Sat Oct 10 15:29:12 2026'
const STARTED_AT = Date.parse(`${START} UTC`)
const NOW = STARTED_AT + 600_000
const TOKENS = { input: 1200, output: 300, reasoning: 50, cacheRead: 9000, cacheWrite: 400 }

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// A macOS process table and the folder `lsof` names for each pid, over a real database in a temp folder.
function setup(
  fill: (db: DatabaseSync) => void,
  folders: Record<number, string> = { 42: '/repo' },
  starts: Record<number, string> = {}
): { io: BridgeIo; root: string; opens: () => number } {
  const { root } = buildOpencodeDb(fill)
  roots.push(root)
  const io = fixtureIo({ '/repo/.git': null, '/other/.git': null })
  const table = Object.keys(folders).map(
    (pid) => `${pid} ${starts[Number(pid)] ?? START} /Users/dev/.opencode/bin/opencode`
  )
  io.exec = vi.fn(async (file: string, args: string[]) =>
    file.endsWith('ps') ? table.join('\n') : `p${args[2]}\nn${folders[Number(args[2])]}\n`
  )
  let opened = 0
  io.readOpencode = (path, read) => {
    opened++
    return systemIo.readOpencode(path, read)
  }
  return { io, root, opens: () => opened }
}

// A root session mid-turn: one tool done, one running, and a subagent at work.
function workingSession(db: DatabaseSync): void {
  insertSession(db, { id: 'ses_old', directory: '/repo', updatedAtMs: NOW - 90_000 })
  insertSession(db, {
    id: 'ses_root',
    directory: '/repo',
    title: 'Ship the feed',
    updatedAtMs: NOW - 2000,
    tokens: TOKENS
  })
  insertSession(db, { id: 'ses_else', directory: '/elsewhere', updatedAtMs: NOW - 1000 })
  insertSession(db, { id: 'ses_gone', directory: '/repo', updatedAtMs: NOW, archivedAtMs: NOW })
  insertSession(db, {
    id: 'ses_child',
    parentId: 'ses_root',
    directory: '/repo',
    agent: 'explore',
    updatedAtMs: NOW - 3000,
    tokens: { input: 70, output: 20, reasoning: 5, cacheRead: 300, cacheWrite: 10 }
  })
  insertSession(db, {
    id: 'ses_done_child',
    parentId: 'ses_root',
    directory: '/repo',
    agent: 'general',
    updatedAtMs: NOW - 200_000
  })
  const at = NOW - 4000
  insertMessage(db, { id: 'msg_1', sessionId: 'ses_root', atMs: at, data: { role: 'user' } })
  insertMessage(db, {
    id: 'msg_2',
    sessionId: 'ses_root',
    atMs: at + 100,
    data: { role: 'assistant', time: { created: at + 100 } }
  })
  const parts = [
    { type: 'step-start' },
    { type: 'reasoning', text: 'SECRET_PROMPT', time: { start: at, end: at + 1 } },
    { type: 'tool', tool: 'read', state: { status: 'completed', output: 'SECRET_PROMPT' } },
    {
      type: 'tool',
      tool: 'bash',
      state: { status: 'running', input: { command: 'SECRET_PROMPT' } }
    }
  ]
  parts.forEach((data, index) =>
    insertPart(db, {
      id: `prt_${index}`,
      messageId: 'msg_2',
      sessionId: 'ses_root',
      atMs: at,
      data
    })
  )
}

it('shows a running OpenCode process as a session, from its newest session in that folder', async () => {
  const { io, root } = setup(workingSession)
  const batch = await collectOpencode(root, io, undefined, NOW, 'darwin')
  expect(batch.sources).toEqual([{ id: 'opencode', ok: true, detail: 'live' }])
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]).toMatchObject({
    key: 'opencode:ses_root',
    provider: 'opencode',
    sessionId: 'ses_root',
    pid: 42,
    name: 'Ship the feed',
    cwd: '/repo',
    projectLabel: 'repo',
    projectRoot: '/repo',
    host: 'terminal',
    activity: 'running',
    attention: 'none',
    currentTool: { name: 'bash', category: 'run' },
    startedAtMs: STARTED_AT,
    updatedAtMs: NOW - 2000,
    usage: {
      own: { input: 1200, output: 350, cacheWrite: 400, cacheRead: 9000 },
      subagents: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
      contextLimit: null
    },
    subagents: [
      {
        id: 'ses_child',
        type: 'explore',
        activity: 'thinking',
        tokens: { input: 70, output: 25, cacheWrite: 10, cacheRead: 300 }
      }
    ],
    accountKey: null
  })
  const feed = JSON.stringify(batch)
  expect(feed).not.toContain('SECRET_PROMPT')
  expect(feed).not.toContain('DO_NOT_READ')
})

// The database and its log as `stat` sees them; a test moves either one.
function stampDatabase(io: BridgeIo): { db: number; wal: number } {
  const stamps = { db: 1000, wal: 1000 }
  const stat = io.stat
  io.stat = async (path) => {
    if (path.endsWith('opencode.db')) return { directory: false, mtimeMs: stamps.db, size: 4096 }
    if (path.endsWith('opencode.db-wal'))
      return { directory: false, mtimeMs: stamps.wal, size: 512 }
    return stat(path)
  }
  return stamps
}

it('opens the database again only when it or its log changed, or the agents did', async () => {
  const { io, root, opens } = setup(workingSession)
  const stamps = stampDatabase(io)
  const first = await collectOpencode(root, io, undefined, NOW, 'darwin')
  const second = await collectOpencode(root, io, undefined, NOW + 1000, 'darwin')
  expect(opens()).toBe(1)
  expect(second.sessions.map(({ key, activity }) => [key, activity])).toEqual(
    first.sessions.map(({ key, activity }) => [key, activity])
  )
  stamps.wal++
  await collectOpencode(root, io, undefined, NOW + 2000, 'darwin')
  expect(opens()).toBe(2)
})

it('ages a session’s state with the clock while its database stays unchanged', async () => {
  const { io, root, opens } = setup((db) => {
    insertSession(db, { id: 'ses_root', directory: '/repo', updatedAtMs: NOW - 1000 })
    insertMessage(db, {
      id: 'msg_1',
      sessionId: 'ses_root',
      atMs: NOW - 1000,
      data: { role: 'user' }
    })
  })
  stampDatabase(io)
  const activity = async (atMs: number) =>
    (await collectOpencode(root, io, undefined, atMs, 'darwin')).sessions[0].activity
  expect(await activity(NOW)).toBe('thinking')
  expect(await activity(NOW + 61_000)).toBe('idle')
  expect(opens()).toBe(1)
})

it('shows a finished turn as done', async () => {
  const { io, root } = setup((db) => {
    insertSession(db, { id: 'ses_root', directory: '/repo', updatedAtMs: NOW - 2000 })
    const data = { role: 'assistant', finish: 'stop', time: { completed: NOW - 2000 } }
    insertMessage(db, { id: 'msg_1', sessionId: 'ses_root', atMs: NOW - 2500, data })
    const part = { type: 'step-finish', reason: 'stop' }
    insertPart(db, {
      id: 'prt_1',
      messageId: 'msg_1',
      sessionId: 'ses_root',
      atMs: NOW,
      data: part
    })
  })
  const { sessions } = await collectOpencode(root, io, undefined, NOW, 'darwin')
  expect(sessions[0]).toMatchObject({ activity: 'idle', attention: 'done', currentTool: null })
})

it('shows a process whose folder has no session written since it started as idle and unnamed', async () => {
  const { io, root } = setup((db) =>
    insertSession(db, {
      id: 'ses_last_week',
      directory: '/repo',
      updatedAtMs: STARTED_AT - 1,
      tokens: TOKENS
    })
  )
  const { sessions, sources } = await collectOpencode(root, io, undefined, NOW, 'darwin')
  expect(sessions).toHaveLength(1)
  expect(sessions[0]).toMatchObject({
    key: `opencode:pid-42-${STARTED_AT}`,
    name: 'repo',
    activity: 'idle',
    attention: 'none',
    usage: null,
    subagents: []
  })
  expect(sources[0].ok).toBe(true)
})

it('gives two processes in one folder a session each, never the same one twice', async () => {
  const { io, root } = setup(
    (db) => insertSession(db, { id: 'ses_root', directory: '/repo', updatedAtMs: NOW }),
    { 42: '/repo', 43: '/repo' }
  )
  const { sessions } = await collectOpencode(root, io, undefined, NOW, 'darwin')
  expect(sessions.map((session) => session.key)).toEqual([
    'opencode:ses_root',
    `opencode:pid-43-${STARTED_AT}`
  ])
})

it('lets the newest process claim the newest session, so an older one in the same folder keeps its own', async () => {
  const { io, root } = setup(
    (db) => {
      insertSession(db, { id: 'ses_A', directory: '/repo', updatedAtMs: NOW - 30_000 })
      insertSession(db, { id: 'ses_B', directory: '/repo', updatedAtMs: NOW })
    },
    { 42: '/repo', 43: '/repo' },
    { 43: 'Sat Oct 10 15:39:12 2026' }
  )
  const { sessions } = await collectOpencode(root, io, undefined, NOW, 'darwin')
  const owners = Object.fromEntries(sessions.map((session) => [session.pid, session.key]))
  expect(owners).toEqual({ 42: 'opencode:ses_A', 43: 'opencode:ses_B' })
})

it('keeps the key a process was first shown under once its first conversation lands', async () => {
  const { io, root } = setup(() => undefined)
  const [before] = (await collectOpencode(root, io, undefined, NOW, 'darwin')).sessions
  const db = new DatabaseSync(join(root, 'opencode.db'))
  insertSession(db, { id: 'ses_new', directory: '/repo', title: 'First', updatedAtMs: NOW })
  db.close()
  const [after] = (await collectOpencode(root, io, undefined, NOW + 1000, 'darwin')).sessions
  expect(after).toMatchObject({ key: before.key, sessionId: 'ses_new', name: 'First' })
  expect(before.key).toBe(`opencode:pid-42-${STARTED_AT}`)
})

it('strips control and bidi override characters from a session title', async () => {
  const { io, root } = setup((db) =>
    insertSession(db, {
      id: 'ses_root',
      directory: '/repo',
      title: 'Ship\u0007 the\u202E feed\u2066\u0000',
      updatedAtMs: NOW
    })
  )
  const [session] = (await collectOpencode(root, io, undefined, NOW, 'darwin')).sessions
  expect(session.name).toBe('Ship the feed')
})

it('keeps a child session written a moment after the tick began', async () => {
  const { io, root } = setup((db) => {
    insertSession(db, { id: 'ses_root', directory: '/repo', updatedAtMs: NOW })
    insertSession(db, {
      id: 'ses_kid',
      parentId: 'ses_root',
      directory: '/repo',
      updatedAtMs: NOW + 1500
    })
  })
  const [session] = (await collectOpencode(root, io, undefined, NOW, 'darwin')).sessions
  expect(session.subagents.map((agent) => agent.id)).toEqual(['ses_kid'])
})

it('keeps a quiet child session while a tool it started is still running', async () => {
  const { io, root } = setup((db) => {
    insertSession(db, { id: 'ses_root', directory: '/repo', updatedAtMs: NOW })
    for (const [id, status] of [
      ['ses_build', 'running'],
      ['ses_ended', 'completed']
    ]) {
      insertSession(db, {
        id,
        parentId: 'ses_root',
        directory: '/repo',
        updatedAtMs: NOW - 300_000
      })
      const messageId = `msg_${id}`
      const data = { role: 'assistant', time: { created: NOW - 300_000 } }
      insertMessage(db, { id: messageId, sessionId: id, atMs: NOW - 300_000, data })
      const part = { type: 'tool', tool: 'bash', state: { status } }
      insertPart(db, { id: `prt_${id}`, messageId, sessionId: id, atMs: NOW - 300_000, data: part })
    }
  })
  const [session] = (await collectOpencode(root, io, undefined, NOW, 'darwin')).sessions
  expect(session.subagents).toMatchObject([{ id: 'ses_build', activity: 'running' }])
})

it('says nothing and opens nothing when OpenCode is not running', async () => {
  const { io, root, opens } = setup(workingSession, {})
  const batch = await collectOpencode(root, io, undefined, NOW, 'darwin')
  expect(batch).toEqual({ sessions: [], sources: [{ id: 'opencode', ok: true, detail: 'empty' }] })
  expect(opens()).toBe(0)
})

it('asks where an OpenCode process runs once, and skips one that runs inside an app bundle', async () => {
  const { io, root } = setup(workingSession, { 42: '/repo', 43: '/Applications/X.app/Contents' })
  await collectOpencode(root, io, undefined, NOW, 'darwin')
  const batch = await collectOpencode(root, io, undefined, NOW, 'darwin')
  expect(batch.sessions.map((session) => session.pid)).toEqual([42])
  const lsofRuns = vi.mocked(io.exec).mock.calls.filter(([file]) => file.endsWith('lsof'))
  expect(lsofRuns).toHaveLength(2)
})

it('keeps the other agents when one process cannot be asked where it runs', async () => {
  const { io, root } = setup(workingSession, { 42: '/repo', 43: '/other' })
  const exec = io.exec
  io.exec = async (file, args) => {
    if (file.endsWith('lsof') && args[2] === '43') throw new Error('no such process')
    return exec(file, args)
  }
  const batch = await collectOpencode(root, io, undefined, NOW, 'darwin')
  expect(batch.sessions.map((session) => session.pid)).toEqual([42])
  expect(batch.sources).toEqual([
    { id: 'opencode', ok: false, detail: 'OpenCode process read failed' }
  ])
})

it.each([
  ['a column', 'ALTER TABLE session RENAME COLUMN tokens_reasoning TO tokens_thinking'],
  ['a table', 'ALTER TABLE part RENAME TO fragment'],
  ['an index', 'DROP INDEX part_message_id_id_idx']
])('gives a health reason and no session when an update took %s away', async (_, migration) => {
  const { io, root } = setup((db) => {
    workingSession(db)
    db.exec(migration)
  })
  expect(await collectOpencode(root, io, undefined, NOW, 'darwin')).toEqual({
    sessions: [],
    sources: [
      {
        id: 'opencode',
        ok: false,
        detail: 'OpenCode database has a shape this version cannot read'
      }
    ]
  })
})

it('gives a health reason and no session when OpenCode runs without a database', async () => {
  const { io, root } = setup(workingSession)
  expect(await collectOpencode(`${root}/absent`, io, undefined, NOW, 'darwin')).toEqual({
    sessions: [],
    sources: [
      { id: 'opencode', ok: false, detail: 'OpenCode is running but its database was not found' }
    ]
  })
})

it('drops only the session whose data is not JSON, and says so', async () => {
  const { io, root } = setup(
    (db) => {
      workingSession(db)
      insertSession(db, { id: 'ses_bad', directory: '/other', updatedAtMs: NOW })
      insertMessage(db, { id: 'msg_bad', sessionId: 'ses_bad', atMs: NOW, data: '{broken' })
    },
    { 42: '/repo', 43: '/other' }
  )
  const batch = await collectOpencode(root, io, undefined, NOW, 'darwin')
  expect(batch.sessions.map((session) => session.key)).toEqual(['opencode:ses_root'])
  expect(batch.sources).toEqual([
    { id: 'opencode', ok: false, detail: 'OpenCode session data could not be read' }
  ])
})
