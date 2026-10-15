import { expect, it, vi } from 'vitest'
import { OrcaSource } from '../../orca'
import { reduce } from '../../reducer'
import { fixtureIo, session } from '../../__fixtures__/helpers'
import { ORCA_CLI } from '../../../shared/orca-bundle'
import { collectClaude } from '../../registry'
import { collectCodex } from '../../codex'
import { registryEntry } from '../../__fixtures__/helpers'
import type { SessionRef } from '../../../shared/office/types'

it('keeps the successful Orca check time on cached and failed polls', async () => {
  const io = fixtureIo({ [ORCA_CLI]: '' })
  io.exec = vi.fn(async () => '{"ok":true}')
  const source = new OrcaSource(io)
  expect(await source.poll(1000)).toMatchObject({
    ok: true,
    checkedAtMs: 1000,
    staleAfterMs: 300000
  })
  expect(await source.poll(2000)).toMatchObject({ checkedAtMs: 1000 })
  io.exec = vi.fn(async () => {
    throw new Error('unavailable')
  })
  expect(await source.poll(301000)).toMatchObject({ ok: false, checkedAtMs: 1000 })
})

it('retains failed-source records and their original observation age', () => {
  const known = {
    ...session('a'),
    observation: {
      sourceId: 'claude:registry',
      observedAtMs: 1000,
      staleAfterMs: 500,
      coverage: 'own' as const
    }
  }
  const source = {
    id: 'claude:registry',
    ok: true,
    detail: 'live',
    checkedAtMs: 1000,
    staleAfterMs: 500
  }
  const previous = { rev: 1, generatedAtMs: 1000, sessions: [known], sources: [source] }
  const next = reduce(previous, {
    now: 2000,
    sessions: [],
    sources: [{ id: source.id, ok: false, detail: 'read failed' }]
  })
  expect(next.sessions).toEqual([known])
  expect(next.sources[0]).toMatchObject({ ok: false, checkedAtMs: 1000 })
  expect(
    reduce(next, { now: 3000, sessions: [], sources: [{ ...source, checkedAtMs: 3000 }] }).sessions
  ).toEqual([])
})

it('attests a registry record when read without changing its activity timestamp', async () => {
  const entry = registryEntry()
  const io = fixtureIo({
    '/claude/sessions/42.json': JSON.stringify({ ...entry, updatedAt: entry.updatedAtMs }),
    '/repo/.git': null
  })
  io.exec = async (_program, args) => (args.includes('lstart=') ? entry.procStart : '')
  const first = await collectClaude(['/claude'], io, 2000)
  const second = await collectClaude(['/claude'], io, 3000)
  expect(first.sessions[0].observation).toEqual({
    sourceId: 'claude:/claude',
    observedAtMs: 2000,
    staleAfterMs: 60000,
    coverage: 'own'
  })
  expect(second.sessions[0].observation?.observedAtMs).toBe(3000)
  expect(second.sessions[0].updatedAtMs).toBe(entry.updatedAtMs)
})

it('does not re-attest a cached Codex tail through process or file-health checks', async () => {
  const meta = JSON.stringify({ type: 'session_meta', payload: { id: 'a', cwd: '/repo' } })
  const files: Record<string, string | null> = {
    '/codex/sessions/rollout-a.jsonl': `${meta}\n`,
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  io.exec = async (program) =>
    program.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : 'p42\nn/repo\n'
  const first = await collectCodex('/codex', io, undefined, false, 2000)
  const second = await collectCodex('/codex', io, undefined, false, 3000)
  expect(first.sessions[0].observation?.observedAtMs).toBe(2000)
  expect(second.sessions[0].observation?.observedAtMs).toBe(2000)
  expect(second.sources[0].checkedAtMs).toBe(3000)
  files['/codex/sessions/rollout-a.jsonl'] += 'changed\n'
  const reread = await collectCodex('/codex', io, undefined, false, 4000)
  expect(reread.sessions[0].observation?.observedAtMs).toBe(4000)
})

it.each([
  { provider: 'claude', sessionId: 'new-conversation' },
  { provider: 'codex', sessionId: 'old-conversation' }
] as const)(
  'does not retain failed-source workers across identity change to $provider/$sessionId',
  (identity) => {
    const known: SessionRef = {
      ...session('old-conversation'),
      key: 'claude:stable-process-key',
      subagents: [{ id: 'old-child', type: 'ravi', activity: 'running' }]
    }
    const current: SessionRef = { ...known, ...identity, subagents: [] }
    const next = reduce(
      { rev: 1, generatedAtMs: 1000, sessions: [known], sources: [] },
      {
        now: 2000,
        sessions: [current],
        sources: [{ id: 'claude:registry', ok: false, detail: 'read failed' }]
      }
    )
    expect(next.sessions).toHaveLength(1)
    expect(next.sessions[0].subagents).toEqual([])
  }
)

it('still retains missing workers for the same provider, conversation and process on failure', () => {
  const known: SessionRef = {
    ...session('same-conversation'),
    subagents: [{ id: 'held-child', type: 'ravi', activity: 'running' }]
  }
  const next = reduce(
    { rev: 1, generatedAtMs: 1000, sessions: [known], sources: [] },
    {
      now: 2000,
      sessions: [{ ...known, subagents: [] }],
      sources: [{ id: 'claude:registry', ok: false, detail: 'read failed' }]
    }
  )
  expect(next.sessions[0].subagents).toEqual(known.subagents)
})

it('does not mark a new conversation done because the previous conversation was running', () => {
  const known: SessionRef = {
    ...session('old-conversation'),
    key: 'claude:stable-process-key',
    activity: 'running'
  }
  const current: SessionRef = {
    ...known,
    sessionId: 'new-conversation',
    activity: 'idle',
    attention: 'none',
    updatedAtMs: 2000
  }
  const next = reduce(
    { rev: 1, generatedAtMs: 1000, sessions: [known], sources: [] },
    { now: 2000, sessions: [current], sources: [] }
  )
  expect(next.sessions[0].attention).toBe('none')
})
