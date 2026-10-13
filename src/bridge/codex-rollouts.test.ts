import { expect, it, vi } from 'vitest'
import { accountKey } from './account-key'
import { findRollouts } from './codex-rollouts'
import { join } from 'node:path'
import { fixtureIo } from './__fixtures__/helpers'
import { ForbiddenError } from './io'

it('caches headers by path, mtime and size and prunes deleted files', async () => {
  const path = '/codex/sessions/rollout-a.jsonl'
  const files: Record<string, string | null> = {
    [path]: JSON.stringify({ type: 'session_meta', payload: { id: 'a', cwd: '/repo' } })
  }
  const io = fixtureIo(files)
  const stat = io.stat
  let mtimeMs = 1000
  let size = 100
  // Matched by name: the bridge asks with whichever separator its platform joins with.
  io.stat = async (candidate) =>
    candidate.endsWith('rollout-a.jsonl') ? { directory: false, mtimeMs, size } : stat(candidate)
  const header = vi.spyOn(io, 'readFirstLine')
  await findRollouts('/codex', io, false, 'darwin')
  await findRollouts('/codex', io, false, 'darwin')
  expect(header).toHaveBeenCalledTimes(1)
  mtimeMs++
  await findRollouts('/codex', io, false, 'darwin')
  expect(header).toHaveBeenCalledTimes(2)
  size++
  await findRollouts('/codex', io, false, 'darwin')
  expect(header).toHaveBeenCalledTimes(3)
  delete files[path]
  expect(await findRollouts('/codex', io, false, 'darwin')).toEqual([])
  files[path] = JSON.stringify({ type: 'session_meta', payload: { id: 'b', cwd: '/new' } })
  expect((await findRollouts('/codex', io, false, 'darwin'))[0].id).toBe('b')
  expect(header).toHaveBeenCalledTimes(4)
})

it('derives no account key unless asked to, and reads the header again when the answer changes', async () => {
  const io = fixtureIo({
    '/codex/sessions/rollout-a.jsonl': JSON.stringify({
      type: 'session_meta',
      payload: { id: 'a', cwd: '/repo', creator_account_id: 'acct_CANARY_ID' }
    })
  })
  expect((await findRollouts('/codex', io, false, 'darwin'))[0].accountKey).toBeNull()
  expect((await findRollouts('/codex', io, true, 'darwin'))[0].accountKey).toBe(
    accountKey('codex', 'acct_CANARY_ID')
  )
  expect((await findRollouts('/codex', io, false, 'darwin'))[0].accountKey).toBeNull()
})

it('names the account a rollout was created under by its hashed key, never the raw id', async () => {
  const meta = (payload: Record<string, unknown>): string =>
    JSON.stringify({ type: 'session_meta', payload })
  const io = fixtureIo({
    '/codex/sessions/rollout-a.jsonl': meta({
      id: 'a',
      cwd: '/repo',
      creator_account_id: 'acct_CANARY_ID',
      creator_user_id: 'user_CANARY_ID'
    }),
    '/codex/sessions/rollout-b.jsonl': meta({ id: 'b', cwd: '/repo' }),
    '/codex/sessions/rollout-c.jsonl': meta({ id: 'c', cwd: '/repo', creator_account_id: 7 })
  })
  const rollouts = await findRollouts('/codex', io, true, 'darwin')
  const keyOf = (id: string): unknown => rollouts.find((rollout) => rollout.id === id)?.accountKey
  expect(keyOf('a')).toBe(accountKey('codex', 'acct_CANARY_ID'))
  expect(keyOf('b')).toBeNull()
  expect(keyOf('c')).toBeNull()
  expect(JSON.stringify(rollouts)).not.toContain('CANARY')
})

it('keeps only rollouts whose folder is an absolute path with no control characters', async () => {
  const meta = (id: string, cwd: string): string =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd } })
  const io = fixtureIo({
    '/codex/sessions/rollout-a.jsonl': meta('a', '/repo'),
    '/codex/sessions/rollout-b.jsonl': meta('b', 'repo'),
    '/codex/sessions/rollout-c.jsonl': meta('c', '/repo\n; open -a Calculator'),
    '/codex/sessions/rollout-d.jsonl': meta('d', '/repo\u001b[2J')
  })
  expect((await findRollouts('/codex', io, false, 'darwin')).map((rollout) => rollout.id)).toEqual([
    'a'
  ])
})

it('walks a Windows session folder and keeps only drive or UNC folders on win32', async () => {
  const meta = (id: string, cwd: string): string =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd } })
  const io = fixtureIo({
    'C:/Users/a/.codex/sessions/2026/10/13/rollout-a.jsonl': meta('a', 'C:\\Users\\a\\repo'),
    'C:/Users/a/.codex/sessions/rollout-b.jsonl': meta('b', '\\\\server\\share\\repo'),
    'C:/Users/a/.codex/sessions/rollout-c.jsonl': meta('c', '/repo'),
    'C:/Users/a/.codex/sessions/rollout-d.jsonl': meta('d', 'repo')
  })
  const rollouts = await findRollouts('C:\\Users\\a\\.codex', io, false, 'win32')
  const sessions = join('C:\\Users\\a\\.codex', 'sessions')
  expect(rollouts.map(({ id, path }) => [id, path]).sort()).toEqual([
    ['a', join(sessions, '2026', '10', '13', 'rollout-a.jsonl')],
    ['b', join(sessions, 'rollout-b.jsonl')]
  ])
})

it('says how the CLI started a thread, as against an app-server or a parent thread', async () => {
  const meta = (id: string, source?: unknown): string =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/repo', source } })
  const io = fixtureIo({
    '/codex/sessions/rollout-a.jsonl': meta('a', 'cli'),
    '/codex/sessions/rollout-b.jsonl': meta('b', 'exec'),
    '/codex/sessions/rollout-c.jsonl': meta('c', 'vscode'),
    '/codex/sessions/rollout-d.jsonl': meta('d', { subagent: { thread_spawn: {} } }),
    '/codex/sessions/rollout-e.jsonl': meta('e')
  })
  const rollouts = await findRollouts('/codex', io, false, 'darwin')
  const started = Object.fromEntries(rollouts.map(({ id, startedBy }) => [id, startedBy]))
  expect(started).toEqual({ a: 'terminal', b: 'exec', c: null, d: null, e: undefined })
})

it('still fails the walk on a real read error, which a skip would hide', async () => {
  const io = fixtureIo({
    '/codex/sessions/rollout-a.jsonl': JSON.stringify({
      type: 'session_meta',
      payload: { id: 'a', cwd: '/repo' }
    })
  })
  io.readFirstLine = vi.fn(async () => {
    throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
  })
  await expect(findRollouts('/codex', io, false, 'darwin')).rejects.toThrow('EACCES')
})

it('skips a rollout it may not read, such as one Codex hard-linked to archive it, and finds the rest', async () => {
  const meta = (id: string): string =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/repo' } })
  const io = fixtureIo({
    '/codex/sessions/rollout-a.jsonl': meta('a'),
    '/codex/sessions/rollout-linked.jsonl': meta('linked')
  })
  const readFirstLine = io.readFirstLine
  const header = vi.fn(async (path: string) => {
    if (path.endsWith('rollout-linked.jsonl'))
      throw new ForbiddenError('forbidden: credential store')
    return readFirstLine(path)
  })
  io.readFirstLine = header
  const found = async () => (await findRollouts('/codex', io, false, 'darwin')).map(({ id }) => id)
  expect(await found()).toEqual(['a'])
  // Refused once, it is not asked about again until it changes.
  expect(await found()).toEqual(['a'])
  expect(header.mock.calls.filter(([path]) => path.endsWith('rollout-linked.jsonl'))).toHaveLength(
    1
  )
})
