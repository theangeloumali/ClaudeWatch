import { expect, it, vi } from 'vitest'
import { collectCodex, codexProcesses } from './codex'
import type { BridgeIo } from './io'
import type { ProcessRow } from './process-table'
import { splitCommandLine } from '../shared/platform-process'
import { fixtureIo } from './__fixtures__/helpers'

// Command lines as Win32_Process reports them on Windows 11, observed 2026-10-13.
const VENDOR_CODEX =
  'C:\\Users\\a\\AppData\\Local\\nvm\\v24.18.0\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe'
const LAUNCHER =
  'C:\\nvm4w\\nodejs\\node.exe C:\\nvm4w\\nodejs/node_modules/@openai/codex/bin/codex.js exec "say hi"'
const DESKTOP_CODEX =
  'C:\\Users\\a\\AppData\\Local\\OpenAI\\Codex\\bin\\2e5e00daee91c61d\\codex.exe'
const APP_SERVER = `${DESKTOP_CODEX} -c features.code_mode_host=true app-server --analytics-default-enabled`
const EXEC_SERVER = `${DESKTOP_CODEX} -c "forced_login_method=\\"chatgpt\\"" exec-server --remote https://x`
const ROOT = 'C:\\Users\\a\\.codex'
const STARTED_MS = Date.parse('2026-10-13T03:37:49Z')

function row(pid: number, commandLine: string, startedAtMs = STARTED_MS): ProcessRow {
  return { pid, lstart: '0', startedAtMs, argv: splitCommandLine(commandLine) }
}
// Codex files a rollout under the local date it began: sessions/YYYY/MM/DD.
function dayFolder(atMs: number): string {
  const day = new Date(atMs)
  const two = (value: number): string => String(value).padStart(2, '0')
  return `${day.getFullYear()}/${two(day.getMonth() + 1)}/${two(day.getDate())}`
}
function meta(id: string, cwd: string, extra: object = {}): string {
  return JSON.stringify({ type: 'session_meta', payload: { id, cwd, source: 'cli', ...extra } })
}
interface Written {
  header: string
  mtimeMs: number
}
// A Windows session folder whose rollouts were last written at the given times.
function codexHome(
  rollouts: Record<string, Written>
): BridgeIo & { add: (id: string, rollout: Written) => void } {
  const files: Record<string, string | null> = { 'C:/Users/a/repo/.git': null }
  const add = (id: string, rollout: Written): void => {
    rollouts[id] = rollout
    files[`C:/Users/a/.codex/sessions/${dayFolder(STARTED_MS)}/rollout-${id}.jsonl`] =
      rollout.header
  }
  for (const [id, rollout] of Object.entries(rollouts)) add(id, rollout)
  const io = fixtureIo(files)
  const stat = io.stat
  io.stat = async (path) => {
    const id = /rollout-(\w+)\.jsonl$/.exec(path)?.[1]
    return id && rollouts[id]
      ? { directory: false, mtimeMs: rollouts[id].mtimeMs, size: rollouts[id].header.length }
      : stat(path)
  }
  return { ...io, add }
}
const collect = (io: BridgeIo, rows: ProcessRow[], now = STARTED_MS + 60_000) =>
  collectCodex(ROOT, io, async () => rows, false, now, 'win32')

it('counts the vendor codex.exe as the session, never its node launcher or the desktop servers', () => {
  const rows = [
    row(1, LAUNCHER),
    row(2, `${VENDOR_CODEX} exec --skip-git-repo-check "say hi"`),
    row(3, APP_SERVER),
    row(4, EXEC_SERVER),
    row(5, '"C:\\Users\\a\\AppData\\Local\\OpenAI\\Codex\\bin\\x\\codex-code-mode-host.exe"'),
    row(6, 'C:\\Tools\\Codex.EXE resume')
  ]
  expect(codexProcesses(rows).map(({ pid }) => pid)).toEqual([2, 6])
})

it('places a Windows process at the rollout it began writing, without asking for its folder', async () => {
  const io = codexHome({
    before: { header: meta('before', 'C:\\Users\\a\\old'), mtimeMs: STARTED_MS - 1000 },
    desktop: {
      header: meta('desktop', 'C:\\Users\\a\\chat', { source: 'vscode' }),
      mtimeMs: STARTED_MS + 5000
    },
    mine: { header: meta('mine', 'C:\\Users\\a\\repo'), mtimeMs: STARTED_MS + 2000 }
  })
  const exec = vi.fn(io.exec)
  io.exec = exec
  const { sessions, sources } = await collect(io, [row(42, `${VENDOR_CODEX} exec hi`)])
  expect(sessions).toMatchObject([
    { key: 'codex:mine', pid: 42, cwd: 'C:\\Users\\a\\repo', projectLabel: 'repo' }
  ])
  expect(sources).toEqual([{ id: 'codex', ok: true, detail: 'live' }])
  expect(exec).not.toHaveBeenCalled()
})

it('shows no Windows process before its first rollout lands, since no folder is known for it', async () => {
  const io = codexHome({})
  const { sessions, sources } = await collect(io, [row(42, VENDOR_CODEX)])
  expect(sessions).toEqual([])
  expect(sources[0].ok).toBe(true)
})

it('looks for a waiting process’s first rollout on the next tick, not 30 s later', async () => {
  const io = codexHome({})
  const rows = [row(42, VENDOR_CODEX)]
  const list = vi.spyOn(io, 'list')
  expect((await collect(io, rows, STARTED_MS + 2000)).sessions).toEqual([])
  io.add('first', { header: meta('first', 'C:\\Users\\a\\repo'), mtimeMs: STARTED_MS + 3000 })
  const [session] = (await collect(io, rows, STARTED_MS + 4000)).sessions
  expect(session).toMatchObject({ key: 'codex:first', pid: 42 })
  // Found, its rollout is followed between full walks again.
  const walks = list.mock.calls.length
  await collect(io, rows, STARTED_MS + 6000)
  expect(list.mock.calls.length).toBe(walks)
})

it('looks only in today’s and yesterday’s folders while a process waits, between full walks', async () => {
  const io = codexHome({})
  io.add('history', { header: meta('history', 'C:\\Users\\a\\old'), mtimeMs: STARTED_MS - 1000 })
  const rows = [row(42, VENDOR_CODEX)]
  await collect(io, rows, STARTED_MS + 2000)
  const list = vi.spyOn(io, 'list')
  await collect(io, rows, STARTED_MS + 4000)
  const listed = list.mock.calls.map(([path]) => path.replaceAll('\\', '/'))
  const recent = [STARTED_MS + 4000, STARTED_MS + 4000 - 86_400_000].map(
    (atMs) => `C:/Users/a/.codex/sessions/${dayFolder(atMs)}`
  )
  expect(listed.sort()).toEqual(recent.sort())
})

it('keeps a Windows process in its folder, whatever letter case or separator a later rollout uses', async () => {
  const io = codexHome({
    first: { header: meta('first', 'C:\\Users\\a\\repo'), mtimeMs: STARTED_MS + 2000 }
  })
  const rows = [row(42, VENDOR_CODEX)]
  expect((await collect(io, rows)).sessions[0].key).toBe('codex:first')
  // The folder found first is the process's own: a newer rollout in another folder is not.
  io.add('other', { header: meta('other', 'C:\\Users\\a\\elsewhere'), mtimeMs: STARTED_MS + 9000 })
  io.add('next', { header: meta('next', 'c:/users/A/Repo/'), mtimeMs: STARTED_MS + 8000 })
  const [session] = (await collect(io, rows, STARTED_MS + 120_000)).sessions
  expect(session).toMatchObject({ key: 'codex:next', pid: 42, cwd: 'C:\\Users\\a\\repo' })
})

it('gives each of two Windows processes the thread it created, however recently each was written', async () => {
  const io = codexHome({
    older: {
      header: meta('older', 'C:\\Users\\a\\one', { timestamp: '2026-10-13T03:37:50Z' }),
      mtimeMs: STARTED_MS + 190_000
    },
    newer: {
      header: meta('newer', 'C:\\Users\\a\\two', { timestamp: '2026-10-13T03:40:01Z' }),
      mtimeMs: STARTED_MS + 180_000
    }
  })
  const rows = [row(42, VENDOR_CODEX), row(43, VENDOR_CODEX, STARTED_MS + 130_000)]
  const { sessions } = await collect(io, rows, STARTED_MS + 200_000)
  const owners = Object.fromEntries(sessions.map((session) => [session.pid, session.sessionId]))
  expect(owners).toEqual({ 42: 'older', 43: 'newer' })
})

const createdAt = (offsetMs: number): { timestamp: string } => ({
  timestamp: new Date(STARTED_MS + offsetMs).toISOString()
})

it('shows the threads of two Windows processes it cannot tell apart, with no process, until it can', async () => {
  const io = codexHome({
    one: {
      header: meta('one', 'C:\\Users\\a\\one', createdAt(90_000)),
      mtimeMs: STARTED_MS + 92_000
    }
  })
  const both = [row(42, VENDOR_CODEX), row(43, VENDOR_CODEX, STARTED_MS + 60_000)]
  const shown = async (atMs: number, rows = both) =>
    (await collect(io, rows, STARTED_MS + atMs)).sessions.map(({ key, pid, cwd }) => [
      key,
      pid,
      cwd
    ])
  expect(await shown(92_000)).toEqual([['codex:one', null, 'C:\\Users\\a\\one']])
  io.add('two', {
    header: meta('two', 'C:\\Users\\a\\two', createdAt(120_000)),
    mtimeMs: STARTED_MS + 122_000
  })
  expect(await shown(122_000)).toEqual([
    ['codex:two', null, 'C:\\Users\\a\\two'],
    ['codex:one', null, 'C:\\Users\\a\\one']
  ])
  // Nothing was remembered from the guess it declined: alone, 42 takes the thread only it began,
  // under the key it was shown with.
  expect(await shown(200_000, [both[0]])).toEqual([['codex:one', 42, 'C:\\Users\\a\\one']])
})

it('shows no more threads without a process than there are processes it cannot place', async () => {
  const thread = (id: string, offsetMs: number) => ({
    header: meta(id, `C:\\Users\\a\\${id}`, createdAt(offsetMs)),
    mtimeMs: STARTED_MS + offsetMs + 1000
  })
  const io = codexHome({ a: thread('a', 70_000), b: thread('b', 80_000), c: thread('c', 90_000) })
  const both = [row(42, VENDOR_CODEX), row(43, VENDOR_CODEX, STARTED_MS + 60_000)]
  const { sessions } = await collect(io, both, STARTED_MS + 100_000)
  expect(sessions.map(({ key, pid }) => [key, pid])).toEqual([
    ['codex:c', null],
    ['codex:b', null]
  ])
})

it('shows the thread of a prompted Windows terminal beside one never prompted', async () => {
  const io = codexHome({
    prompted: {
      header: meta('prompted', 'C:\\Users\\a\\repo', createdAt(70_000)),
      mtimeMs: STARTED_MS + 75_000
    }
  })
  const rows = [row(42, VENDOR_CODEX), row(43, VENDOR_CODEX, STARTED_MS + 60_000)]
  const { sessions } = await collect(io, rows, STARTED_MS + 80_000)
  expect(sessions).toMatchObject([{ key: 'codex:prompted', pid: null, cwd: 'C:\\Users\\a\\repo' }])
})

it('gives a Windows process that has written nothing yet no other process’s thread', async () => {
  const io = codexHome({
    theirs: {
      header: meta('theirs', 'C:\\Users\\a\\two', createdAt(10_000)),
      mtimeMs: STARTED_MS + 20_000
    }
  })
  const first = row(43, VENDOR_CODEX)
  expect((await collect(io, [first], STARTED_MS + 21_000)).sessions).toHaveLength(1)
  io.add('theirs', {
    header: meta('theirs', 'C:\\Users\\a\\two', createdAt(10_000)),
    mtimeMs: STARTED_MS + 90_000
  })
  const later = row(42, VENDOR_CODEX, STARTED_MS + 60_000)
  const { sessions } = await collect(io, [first, later], STARTED_MS + 95_000)
  expect(sessions.map(({ pid, sessionId }) => [pid, sessionId])).toEqual([[43, 'theirs']])
})

it.each([
  ['a `codex exec` beside an idle terminal', 'exec', `${VENDOR_CODEX} exec hi`, VENDOR_CODEX],
  ['a terminal beside an idle `codex exec`', 'cli', VENDOR_CODEX, `${VENDOR_CODEX} exec hi`]
])('places %s by the kind of thread it writes', async (_, source, writer, idle) => {
  const io = codexHome({
    theirs: {
      header: meta('theirs', 'C:\\Users\\a\\repo', { source, ...createdAt(70_000) }),
      mtimeMs: STARTED_MS + 75_000
    }
  })
  const rows = [row(42, idle), row(43, writer, STARTED_MS + 60_000)]
  const { sessions } = await collect(io, rows, STARTED_MS + 80_000)
  expect(sessions.map(({ pid, sessionId }) => [pid, sessionId])).toEqual([[43, 'theirs']])
})

it('places a Windows terminal at a thread `codex exec` began, which it resumed', async () => {
  const io = codexHome({
    resumed: {
      header: meta('resumed', 'C:\\Users\\a\\repo', { source: 'exec', ...createdAt(-86_400_000) }),
      mtimeMs: STARTED_MS + 30_000
    }
  })
  const rows = [row(42, `${VENDOR_CODEX} resume`)]
  const [session] = (await collect(io, rows, STARTED_MS + 40_000)).sessions
  expect(session).toMatchObject({ pid: 42, sessionId: 'resumed' })
})

it('places a Windows process at the thread it resumed, begun before it started', async () => {
  const io = codexHome({
    resumed: {
      header: meta('resumed', 'C:\\Users\\a\\repo', createdAt(-86_400_000)),
      mtimeMs: STARTED_MS + 30_000
    }
  })
  const [session] = (await collect(io, [row(42, VENDOR_CODEX)], STARTED_MS + 40_000)).sessions
  expect(session).toMatchObject({ pid: 42, sessionId: 'resumed', cwd: 'C:\\Users\\a\\repo' })
})

it('shows the threads a Windows desktop app hosts, but none it runs from an install folder', async () => {
  const io = codexHome({
    chat: {
      header: meta('chat', 'C:\\Users\\a\\Documents\\Codex\\2026-10-12\\chat', {
        source: 'vscode'
      }),
      mtimeMs: STARTED_MS + 50_000
    },
    store: {
      header: meta('store', 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26\\app'),
      mtimeMs: STARTED_MS + 50_000
    },
    programs: {
      header: meta('programs', 'C:\\Users\\a\\AppData\\Local\\Programs\\Tool'),
      mtimeMs: STARTED_MS + 50_000
    },
    x86: {
      header: meta('x86', 'c:\\program files (x86)\\Tool'),
      mtimeMs: STARTED_MS + 50_000
    }
  })
  const { sessions } = await collect(io, [row(7, APP_SERVER), row(8, EXEC_SERVER)])
  expect(sessions.map(({ key, pid }) => [key, pid])).toEqual([['codex:chat', null]])
})
