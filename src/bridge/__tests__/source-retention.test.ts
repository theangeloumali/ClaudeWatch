import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { SessionRef } from '../../shared/office/types'
import {
  fixtureIo,
  hostPath,
  hostTable,
  isTableQuery,
  registryEntry,
  session
} from '../__fixtures__/helpers'
import { emptySnapshot, reduce } from '../reducer'
import { collectClaude } from '../registry'

// health-5: a failing source held ended sessions for ever; the bound is how long it has failed.
const source = (ok: boolean) => ({ id: 'claude:/root', ok, detail: ok ? 'live' : 'failed' })
const ended = { ...session('ended'), observation: undefined }

function failFor(minutes: number, reported: SessionRef[] = []) {
  let snapshot = reduce(emptySnapshot(), { now: 0, sessions: [ended], sources: [source(true)] })
  for (let atMs = 2_000; atMs <= minutes * 60_000; atMs += 2_000)
    snapshot = reduce(snapshot, { now: atMs, sessions: reported, sources: [source(false)] })
  return snapshot.sessions.map((s) => s.key)
}

it('lets an ended session go once its source has been failing for ten minutes', () => {
  expect(failFor(11)).toEqual([])
})

it('still holds an ended session through a shorter failure', () => {
  expect(failFor(5)).toEqual(['claude:ended'])
})

it('keeps a quiet live session its failing source still reports', () => {
  const quiet = { ...session('quiet'), updatedAtMs: 0 }
  expect(failFor(11, [quiet])).toEqual(['claude:quiet'])
})

const root = hostPath('/claude')
const entry = registryEntry(process.platform)
const file = join(root, 'sessions', '42.json')

function registry(files: Record<string, string>) {
  const all: Record<string, string | null> = { ...files, [hostPath('/repo/.git')]: null }
  const io = fixtureIo(all)
  const live = { isRunning: true }
  io.exec = async (program, args) =>
    isTableQuery(program, args)
      ? hostTable(live.isRunning ? [{ pid: 42, start: entry.procStart, command: 'claude' }] : [])
      : ''
  return { io, live, write: (text: string) => void (all[file] = text) }
}

it('one malformed registry file leaves the root ok', async () => {
  const { io } = registry({
    [file]: JSON.stringify(entry),
    [join(root, 'sessions', '43.json')]: '{'
  })
  const batch = await collectClaude([root], io, 1000)

  expect(batch.sources[0]).toMatchObject({ ok: true })
  expect(batch.sessions.map(({ pid }) => pid)).toEqual([42])
})

it('keeps the session of a registry file that a truncated write left unreadable', async () => {
  const fixture = registry({ [file]: JSON.stringify(entry) })
  const [before] = (await collectClaude([root], fixture.io, 1000)).sessions
  expect(before?.pid).toBe(42)
  fixture.write('{"pid":4')
  const batch = await collectClaude([root], fixture.io, 3000)

  expect(batch.sessions.map(({ key }) => key)).toEqual([before?.key])
  expect(batch.sources[0]).toMatchObject({ ok: true })
})

it('lets that session go once its process exits', async () => {
  const fixture = registry({ [file]: JSON.stringify(entry) })
  expect((await collectClaude([root], fixture.io, 1000)).sessions).toHaveLength(1)
  fixture.write('{"pid":4')
  fixture.live.isRunning = false

  expect((await collectClaude([root], fixture.io, 3000)).sessions).toEqual([])
})
