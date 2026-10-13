import { afterEach, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { type BridgeIo, systemIo } from './io'
import { collectOpencode } from './opencode'
import { opencodeProcesses } from './opencode-activity'
import type { ProcessRow } from './process-table'
import { splitCommandLine } from '../shared/platform-process'
import { fixtureIo } from './__fixtures__/helpers'
import { buildOpencodeDb, insertSession } from './__fixtures__/opencode-db'

// Command lines as Win32_Process reports them on Windows 11, observed 2026-10-13.
const TUI = 'C:\\nvm4w\\nodejs\\node_modules\\@opencode\\cli\\bin\\opencode.exe'
const WORKER =
  'C:\\Users\\a\\AppData\\Local\\nvm\\v24.18.0\\node_modules\\@opencode\\cli\\bin\\opencode.exe serve --service'
const SHIM = '"C:\\Program Files\\Git\\usr\\bin\\sh.exe" /c/nvm4w/nodejs/opencode'
const STARTED_MS = Date.parse('2026-10-13T03:00:00Z')
const NOW = STARTED_MS + 600_000

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function row(pid: number, commandLine: string, startedAtMs = STARTED_MS): ProcessRow {
  return { pid, lstart: '0', startedAtMs, argv: splitCommandLine(commandLine) }
}
// A session OpenCode wrote on Windows: it records its folder with forward slashes.
function session(
  db: DatabaseSync,
  id: string,
  directory: string,
  createdAtMs: number,
  updatedAtMs: number
): void {
  insertSession(db, { id, directory, title: id, updatedAtMs })
  db.prepare('UPDATE session SET time_created = ? WHERE id = ?').run(createdAtMs, id)
}
function setup(fill: (db: DatabaseSync) => void): { io: BridgeIo; root: string } {
  const { root } = buildOpencodeDb(fill)
  roots.push(root)
  const io = fixtureIo()
  io.exec = vi.fn(io.exec)
  io.readOpencode = (path, read) => systemIo.readOpencode(path, read)
  return { io, root }
}
const collect = ({ io, root }: { io: BridgeIo; root: string }, rows: ProcessRow[], now = NOW) =>
  collectOpencode(root, io, async () => rows, now, 'win32')

it('counts the opencode.exe a terminal runs, never its serve worker or the shell shim', () => {
  const rows = [row(1, SHIM), row(2, TUI), row(3, WORKER), row(4, 'C:\\x\\OpenCode.EXE run hi')]
  expect(opencodeProcesses(rows).map(({ pid }) => pid)).toEqual([2, 4])
})

it('places a Windows process at the session it began, without asking for its folder', async () => {
  const fixture = setup((db) => {
    session(db, 'ses_before', 'C:/Users/a/old', STARTED_MS - 90_000, STARTED_MS - 60_000)
    session(db, 'ses_mine', 'C:/Users/a/repo', STARTED_MS + 5000, NOW - 1000)
  })
  const { sessions, sources } = await collect(fixture, [row(42, TUI)])
  expect(sessions).toMatchObject([
    { key: 'opencode:ses_mine', pid: 42, cwd: 'C:\\Users\\a\\repo', name: 'ses_mine' }
  ])
  expect(sources).toEqual([{ id: 'opencode', ok: true, detail: 'live' }])
  expect(fixture.io.exec).not.toHaveBeenCalled()
})

it('shows no Windows process before it writes a session, since no folder is known for it', async () => {
  const fixture = setup((db) => {
    session(db, 'ses_before', 'C:/Users/a/old', STARTED_MS - 90_000, STARTED_MS - 60_000)
  })
  expect((await collect(fixture, [row(42, TUI)])).sessions).toEqual([])
})

it('gives each of two Windows processes the session it began, however recently each was written', async () => {
  const fixture = setup((db) => {
    session(db, 'ses_older', 'C:/Users/a/one', STARTED_MS + 1000, NOW - 1000)
    session(db, 'ses_newer', 'C:/Users/a/two', STARTED_MS + 130_000, NOW - 2000)
  })
  const rows = [row(42, TUI), row(43, TUI, STARTED_MS + 120_000)]
  const { sessions } = await collect(fixture, rows)
  const owners = Object.fromEntries(sessions.map((found) => [found.pid, found.sessionId]))
  expect(owners).toEqual({ 42: 'ses_older', 43: 'ses_newer' })
})

it('shows the sessions of two Windows processes it cannot tell apart, with no process, until it can', async () => {
  const fixture = setup((db) => {
    session(db, 'ses_one', 'C:/Users/a/one', STARTED_MS + 90_000, STARTED_MS + 92_000)
    session(db, 'ses_two', 'C:/Users/a/two', STARTED_MS + 120_000, STARTED_MS + 122_000)
  })
  const both = [row(42, TUI), row(43, TUI, STARTED_MS + 60_000)]
  const shown = async (atMs: number, rows = both) =>
    (await collect(fixture, rows, STARTED_MS + atMs)).sessions.map(({ key, pid, cwd }) => [
      key,
      pid,
      cwd
    ])
  expect(await shown(122_000)).toEqual([
    ['opencode:ses_two', null, 'C:\\Users\\a\\two'],
    ['opencode:ses_one', null, 'C:\\Users\\a\\one']
  ])
  // Nothing was remembered from the guess it declined: alone, 42 takes the session only it began,
  // under the key it was shown with.
  expect(await shown(200_000, [both[0]])).toEqual([['opencode:ses_one', 42, 'C:\\Users\\a\\one']])
})

it('shows no more sessions without a process than there are processes it cannot place', async () => {
  const fixture = setup((db) => {
    for (const [id, offsetMs] of [
      ['a', 70_000],
      ['b', 80_000],
      ['c', 90_000]
    ] as const)
      session(
        db,
        `ses_${id}`,
        `C:/Users/a/${id}`,
        STARTED_MS + offsetMs,
        STARTED_MS + offsetMs + 1000
      )
  })
  const both = [row(42, TUI), row(43, TUI, STARTED_MS + 60_000)]
  const { sessions } = await collect(fixture, both, STARTED_MS + 100_000)
  expect(sessions.map(({ key, pid }) => [key, pid])).toEqual([
    ['opencode:ses_c', null],
    ['opencode:ses_b', null]
  ])
})

it('shows the session of a prompted Windows terminal beside one never prompted', async () => {
  const fixture = setup((db) => {
    session(db, 'ses_prompted', 'C:/Users/a/repo', STARTED_MS + 70_000, STARTED_MS + 75_000)
  })
  const rows = [row(42, TUI), row(43, TUI, STARTED_MS + 60_000)]
  const { sessions } = await collect(fixture, rows, STARTED_MS + 80_000)
  expect(sessions).toMatchObject([
    { key: 'opencode:ses_prompted', pid: null, cwd: 'C:\\Users\\a\\repo' }
  ])
})

it('gives a Windows process that has written nothing yet no other process’s session', async () => {
  const fixture = setup((db) => {
    session(db, 'ses_theirs', 'C:/Users/a/two', STARTED_MS + 10_000, NOW - 1000)
  })
  const first = row(43, TUI)
  expect((await collect(fixture, [first])).sessions).toHaveLength(1)
  const later = row(42, TUI, STARTED_MS + 60_000)
  const { sessions } = await collect(fixture, [first, later])
  expect(sessions.map(({ pid, sessionId }) => [pid, sessionId])).toEqual([[43, 'ses_theirs']])
})

it('places a Windows process at the session it continued, begun before it started', async () => {
  const fixture = setup((db) => {
    session(db, 'ses_resumed', 'C:/Users/a/repo', STARTED_MS - 86_400_000, NOW - 1000)
  })
  const [found] = (await collect(fixture, [row(42, TUI)])).sessions
  expect(found).toMatchObject({ pid: 42, sessionId: 'ses_resumed', cwd: 'C:\\Users\\a\\repo' })
})

it('never places a Windows process in an install folder', async () => {
  const fixture = setup((db) => {
    session(db, 'ses_app', 'C:/Program Files/Tool', STARTED_MS + 1000, NOW - 1000)
    session(db, 'ses_store', 'C:/Program Files/WindowsApps/OpenCode', STARTED_MS + 1000, NOW - 900)
  })
  expect((await collect(fixture, [row(42, TUI)])).sessions).toEqual([])
})
