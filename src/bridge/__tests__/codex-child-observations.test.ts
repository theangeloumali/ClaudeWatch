import { expect, it, vi } from 'vitest'
import { fixtureIo } from '../__fixtures__/helpers'
import { collectCodex } from '../codex'
import { ForbiddenError } from '../io'
import { OPEN_TOOL_HOLD_MS } from '../liveness'

const NOW = Date.parse('2026-10-14T12:00:00Z')
const PRIVATE_TEXT = 'PRIVATE_PROMPT_AND_TOOL_ARGUMENTS'
const SESSIONS_PATH = '/codex/sessions'
// dry-new: existing rollout builders are private to legacy tests; fixtureIo supplies all file I/O.
function rollout(options: {
  id: string
  parentThreadId?: string
  extra?: Record<string, unknown>
  payloads?: Record<string, unknown>[]
  inputTokens?: number
}): string {
  const source = options.parentThreadId
    ? {
        subagent: {
          thread_spawn: {
            parent_thread_id: options.parentThreadId,
            agent_nickname: 'Scout',
            agent_role: 'explorer'
          }
        }
      }
    : 'cli'
  const header = {
    type: 'session_meta',
    payload: { id: options.id, cwd: '/repo', source, prompt: PRIVATE_TEXT, ...options.extra }
  }
  const payloads = options.payloads ?? [
    { type: 'function_call', call_id: 'call_1', name: 'exec_command', arguments: PRIVATE_TEXT }
  ]
  const records = payloads.map((payload) => ({
    type: 'response_item',
    timestamp: new Date(NOW - 1000).toISOString(),
    payload
  }))
  const usage =
    options.inputTokens === undefined
      ? []
      : [
          {
            type: 'event_msg',
            payload: {
              type: 'token_count',
              info: {
                total_token_usage: {
                  input_tokens: options.inputTokens,
                  cached_input_tokens: 0,
                  cache_write_input_tokens: 0,
                  output_tokens: 10,
                  total_tokens: options.inputTokens + 10
                }
              }
            }
          }
        ]
  return [header, ...records, ...usage].map((record) => JSON.stringify(record)).join('\n')
}

function setup(
  rollouts: Record<string, string>,
  times: Record<string, number> = {},
  processArguments = ['/bin/codex']
) {
  const files: Record<string, string | null> = { '/repo/.git': null }
  const modificationTimes: Record<string, number> = {}
  for (const [filename, contents] of Object.entries(rollouts)) {
    const path = `${SESSIONS_PATH}/rollout-${filename}.jsonl`
    files[path] = contents
    modificationTimes[path] = times[filename] ?? NOW - 1000
  }
  const io = fixtureIo(files)
  const stat = io.stat
  io.stat = async (path) => {
    const status = await stat(path)
    const timestamp = modificationTimes[path]
    return timestamp === undefined ? status : { ...status, mtimeMs: timestamp }
  }
  io.exec = async () => 'p42\nn/repo\n'
  const collect = (now = NOW) =>
    collectCodex(
      '/codex',
      io,
      async () => [
        {
          pid: 42,
          argv: processArguments,
          lstart: new Date(NOW - 2_000_000).toUTCString(),
          startedAtMs: NOW - 2_000_000
        }
      ],
      false,
      now
    )
  return { collect, io, modificationTimes }
}

it('projects named explicit descendants without claiming them as CLI roots', async () => {
  const { collect } = setup(
    {
      root: rollout({ id: 'root' }),
      child: rollout({ id: 'child', parentThreadId: 'root' }),
      grandchild: rollout({ id: 'grandchild', parentThreadId: 'child' })
    },
    { child: NOW, grandchild: NOW }
  )
  const batch = await collect()

  expect(batch.sources[0].ok).toBe(true)
  expect(batch.sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(batch.sessions[0].subagents.map((child) => child.id).sort()).toEqual([
    'child',
    'grandchild'
  ])
  for (const child of batch.sessions[0].subagents) {
    expect(child).toMatchObject({
      name: 'Scout',
      type: 'explorer',
      kind: 'subagent',
      pid: null,
      orcaPaneKey: null,
      activity: 'running',
      currentTool: { name: 'exec_command', category: 'run' },
      observation: { sourceId: 'codex', observedAtMs: NOW, coverage: 'own' }
    })
    expect(child).not.toHaveProperty('actions')
  }
  expect(JSON.stringify(batch)).not.toContain(PRIVATE_TEXT)
})

it('excludes completed and historical children despite explicit lineage', async () => {
  const { collect } = setup(
    {
      root: rollout({ id: 'root' }),
      completed: rollout({
        id: 'completed',
        parentThreadId: 'root',
        payloads: [
          { type: 'function_call', call_id: 'call_1', name: 'exec_command' },
          { type: 'task_complete', text: PRIVATE_TEXT }
        ]
      }),
      historical: rollout({ id: 'historical', parentThreadId: 'root' })
    },
    { historical: NOW - 2_000_000 }
  )
  const { sessions } = await collect()

  expect(sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(sessions[0].subagents).toEqual([])
})

it('does not invent lineage from shared cwd or unknown subagent metadata', async () => {
  const { collect } = setup(
    {
      root: rollout({ id: 'root' }),
      orphan: rollout({ id: 'orphan', parentThreadId: 'missing' }),
      unknown: rollout({ id: 'unknown', extra: { source: 'subagent' } }),
      malformed: rollout({
        id: 'malformed',
        extra: {
          source: { subagent: { thread_spawn: { parent_thread_id: { text: PRIVATE_TEXT } } } }
        }
      }),
      cycle_a: rollout({ id: 'cycle_a', parentThreadId: 'cycle_b' }),
      cycle_b: rollout({ id: 'cycle_b', parentThreadId: 'cycle_a' })
    },
    { orphan: NOW, unknown: NOW, malformed: NOW }
  )
  const batch = await collect()

  expect(batch.sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(batch.sessions[0].subagents).toEqual([])
  expect(JSON.stringify(batch)).not.toContain(PRIVATE_TEXT)
})

it('does not refresh an unchanged child observation on the next poll', async () => {
  const { collect } = setup({
    root: rollout({ id: 'root' }),
    child: rollout({ id: 'child', parentThreadId: 'root' })
  })
  const first = await collect()
  const later = await collect(NOW + 60_000)

  expect(first.sessions[0].subagents).toHaveLength(1)
  expect(later.sessions[0].subagents).toHaveLength(1)
  expect(later.sessions[0].subagents[0].observation).toEqual(
    first.sessions[0].subagents[0].observation
  )
  expect(later.sessions[0].subagents[0].observation?.observedAtMs).toBe(NOW)
})

it('counts each descendant total once across duplicate files and polls', async () => {
  const child = rollout({ id: 'child', parentThreadId: 'root', inputTokens: 40 })
  const { collect } = setup({
    root: rollout({ id: 'root', inputTokens: 100 }),
    child,
    duplicate: child,
    grandchild: rollout({ id: 'grandchild', parentThreadId: 'child', inputTokens: 20 })
  })
  const first = await collect()
  const later = await collect(NOW + 10_000)

  for (const batch of [first, later]) {
    expect(batch.sessions[0].subagents).toHaveLength(2)
    expect(batch.sessions[0].usage).toMatchObject({
      own: { input: 100, output: 10 },
      subagents: { input: 60, output: 20 },
      spawned: 2
    })
  }
})

it.each([180_000, 2_000_000])(
  'keeps a quiet hosted parent as the container for a fresh explicit child on cold start (%i ms)',
  async (parentQuietMs) => {
    const { collect } = setup(
      {
        root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }] }),
        child: rollout({ id: 'child', parentThreadId: 'root' })
      },
      { root: NOW - parentQuietMs, child: NOW },
      ['/bin/codex', 'app-server']
    )
    const { sessions } = await collect()
    expect(sessions.map((session) => session.sessionId)).toEqual(['root'])
    expect(sessions[0]).toMatchObject({ pid: null, activity: 'idle', currentTool: null })
    expect(sessions[0].subagents).toMatchObject([{ id: 'child', activity: 'running' }])
  }
)

it('keeps an old hosted root for a live grandchild through a quiet completed intermediate', async () => {
  const { collect } = setup(
    {
      root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }], inputTokens: 100 }),
      child: rollout({
        id: 'child',
        parentThreadId: 'root',
        payloads: [{ type: 'task_complete' }]
      }),
      grandchild: rollout({ id: 'grandchild', parentThreadId: 'child', inputTokens: 20 })
    },
    { root: NOW - 2_000_000, child: NOW - 2_000_000, grandchild: NOW },
    ['/bin/codex', 'app-server']
  )
  const { sessions } = await collect()
  expect(sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(sessions[0]).toMatchObject({ activity: 'idle', currentTool: null })
  expect(sessions[0].subagents.map((child) => child.id)).toEqual(['grandchild'])
  expect(sessions[0].usage).toMatchObject({ subagents: { input: 20, output: 10 }, spawned: 1 })
})

it.each(['completed', 'historical', 'unknown', 'orphan', 'cycle', 'silent'])(
  'does not revive a quiet hosted root for a %s child',
  async (kind) => {
    let parentThreadId = 'root'
    if (kind === 'orphan') parentThreadId = 'missing'
    if (kind === 'cycle') parentThreadId = 'cycle'
    const child = rollout({
      id: 'child',
      parentThreadId,
      ...(kind === 'completed' && { payloads: [{ type: 'task_complete' }] }),
      ...(kind === 'silent' && { payloads: [] }),
      ...(kind === 'unknown' && { extra: { source: 'subagent' } })
    })
    const rollouts: Record<string, string> = {
      root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }] }),
      child
    }
    if (kind === 'cycle') rollouts.cycle = rollout({ id: 'cycle', parentThreadId: 'child' })
    const { collect } = setup(
      rollouts,
      { root: NOW - 2_000_000, child: kind === 'historical' ? NOW - 2_000_000 : NOW },
      ['/bin/codex', 'app-server']
    )
    const batch = await collect()
    expect(batch.sessions).toEqual([])
    expect(batch.sources[0].ok).toBe(true)
  }
)

it('does not infer a hosted parent from a child while only a CLI in another cwd runs', async () => {
  const { collect, io } = setup(
    {
      root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }] }),
      child: rollout({ id: 'child', parentThreadId: 'root' })
    },
    { root: NOW - 2_000_000, child: NOW }
  )
  io.exec = async () => 'p42\nn/other\n'
  const { sessions } = await collect()
  expect(sessions).toHaveLength(1)
  expect(sessions[0]).toMatchObject({ pid: 42, cwd: '/other', subagents: [] })
  expect(sessions[0].sessionId).not.toBe('root')
})

it('opens no hosted rollouts when neither an app-server nor a Codex CLI runs', async () => {
  const { collect, io } = setup(
    { root: rollout({ id: 'root' }), child: rollout({ id: 'child', parentThreadId: 'root' }) },
    { root: NOW - 2_000_000, child: NOW },
    ['/bin/not-codex']
  )
  const readTail = vi.spyOn(io, 'readTail')
  expect((await collect()).sessions).toEqual([])
  expect(readTail).not.toHaveBeenCalled()
})

it('reads hosted descendants once and preserves observation ages and unique totals across polls', async () => {
  const child = rollout({ id: 'child', parentThreadId: 'root', inputTokens: 40 })
  const { collect, io } = setup(
    {
      root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }], inputTokens: 100 }),
      child,
      duplicate: child,
      grandchild: rollout({ id: 'grandchild', parentThreadId: 'child', inputTokens: 20 })
    },
    { root: NOW - 2_000_000, child: NOW, duplicate: NOW, grandchild: NOW },
    ['/bin/codex', 'app-server']
  )
  const readTail = vi.spyOn(io, 'readTail')
  const first = await collect()
  const later = await collect(NOW + 10_000)
  for (const batch of [first, later]) {
    expect(batch.sessions.map((session) => session.sessionId)).toEqual(['root'])
    expect(batch.sessions[0].subagents).toHaveLength(2)
    expect(batch.sessions[0].usage).toMatchObject({
      own: { input: 100, output: 10 },
      subagents: { input: 60, output: 20 },
      spawned: 2
    })
  }
  expect(later.sessions[0].observation).toEqual(first.sessions[0].observation)
  expect(later.sessions[0].subagents.map((child) => child.observation)).toEqual(
    first.sessions[0].subagents.map((child) => child.observation)
  )
  expect(later.sessions[0].updatedAtMs).toBe(first.sessions[0].updatedAtMs)
  expect(readTail).toHaveBeenCalledTimes(3)
})

it.each(['app-bundled', 'archived'])(
  'does not promote an %s root through a fresh child',
  async (kind) => {
    const { collect, io } = setup(
      {
        root: rollout({
          id: 'root',
          payloads: [{ type: 'task_complete' }],
          ...(kind === 'app-bundled' && { extra: { cwd: '/Applications/Host.app/Contents' } })
        }),
        child: rollout({ id: 'child', parentThreadId: 'root' })
      },
      { root: NOW - 2_000_000, child: NOW },
      ['/bin/codex', 'app-server']
    )
    if (kind === 'archived') {
      const readFirstLine = io.readFirstLine
      io.readFirstLine = async (path) => {
        if (path.endsWith('rollout-root.jsonl')) throw new ForbiddenError('archived')
        return readFirstLine(path)
      }
    }
    const readTail = vi.spyOn(io, 'readTail')
    expect((await collect()).sessions).toEqual([])
    expect(readTail).not.toHaveBeenCalled()
  }
)

it('reports an unreadable child without reviving its quiet hosted parent', async () => {
  const { collect, io } = setup(
    {
      root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }] }),
      child: rollout({ id: 'child', parentThreadId: 'root' })
    },
    { root: NOW - 2_000_000, child: NOW },
    ['/bin/codex', 'app-server']
  )
  const readTail = io.readTail
  io.readTail = async (path) => {
    if (path.endsWith('rollout-child.jsonl')) throw new Error('unreadable')
    return readTail(path)
  }
  const batch = await collect()
  expect(batch.sessions).toEqual([])
  expect(batch.sources[0]).toMatchObject({ ok: false, detail: 'child rollout read failed' })
})

it('keeps the 128-child observation cap when fresh descendants retain a hosted root', async () => {
  const rollouts: Record<string, string> = {
    root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }], inputTokens: 100 })
  }
  const times: Record<string, number> = { root: NOW - 2_000_000 }
  for (let index = 0; index < 130; index++) {
    const id = `child-${index}`
    rollouts[id] = rollout({ id, parentThreadId: 'root', inputTokens: 1 })
    times[id] = NOW
  }
  const { collect, io } = setup(rollouts, times, ['/bin/codex', 'app-server'])
  const readTail = vi.spyOn(io, 'readTail')
  const { sessions } = await collect()
  expect(sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(sessions[0].subagents).toHaveLength(128)
  expect(sessions[0].usage).toMatchObject({ subagents: { input: 128 }, spawned: 128 })
  expect(readTail).toHaveBeenCalledTimes(129)
})

it('retains descendant totals when only the hosted parent has fresh writes on a later poll', async () => {
  const { collect, modificationTimes } = setup(
    {
      root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }], inputTokens: 100 }),
      child: rollout({ id: 'child', parentThreadId: 'root', inputTokens: 40 })
    },
    { root: NOW - 2_000_000, child: NOW },
    ['/bin/codex', 'app-server']
  )
  expect((await collect()).sessions[0].usage).toMatchObject({
    subagents: { input: 40 },
    spawned: 1
  })
  modificationTimes[`${SESSIONS_PATH}/rollout-root.jsonl`] = NOW + 2_000_000
  const later = await collect(NOW + 2_000_000)
  expect(later.sessions.map((session) => session.sessionId)).toEqual(['root'])
  expect(later.sessions[0].subagents).toEqual([])
  expect(later.sessions[0].usage).toMatchObject({ subagents: { input: 40 }, spawned: 1 })
})

it.each([180_000, 2_000_000])(
  'keeps a retained parent’s own tool state bounded without changing its event time (%i ms)',
  async (quietMs) => {
    const parentEventAt = NOW - quietMs
    const root = rollout({ id: 'root' }).replaceAll(
      new Date(NOW - 1000).toISOString(),
      new Date(parentEventAt).toISOString()
    )
    const { collect } = setup(
      { root, child: rollout({ id: 'child', parentThreadId: 'root' }) },
      { root: parentEventAt, child: NOW },
      ['/bin/codex', 'app-server']
    )
    const { sessions } = await collect()
    expect(sessions.map((session) => session.sessionId)).toEqual(['root'])
    expect(sessions[0].updatedAtMs).toBe(parentEventAt)
    expect(sessions[0].activity).toBe(quietMs < OPEN_TOOL_HOLD_MS ? 'running' : 'idle')
    expect(sessions[0].currentTool).toEqual(
      quietMs < OPEN_TOOL_HOLD_MS
        ? { name: 'exec_command', category: 'run', callId: 'call_1' }
        : null
    )
    expect(sessions[0].subagents).toMatchObject([{ id: 'child', activity: 'running' }])
  }
)

it('does not retain a hosted root through lineage beyond the ancestor traversal bound', async () => {
  const rollouts: Record<string, string> = {
    root: rollout({ id: 'root', payloads: [{ type: 'task_complete' }] })
  }
  const times: Record<string, number> = { root: NOW - 2_000_000 }
  let parentThreadId = 'root'
  for (let index = 0; index < 10; index++) {
    const id = `intermediate-${index}`
    rollouts[id] = rollout({ id, parentThreadId, payloads: [{ type: 'task_complete' }] })
    times[id] = NOW - 2_000_000
    parentThreadId = id
  }
  rollouts.child = rollout({ id: 'child', parentThreadId })
  times.child = NOW
  const { collect, io } = setup(rollouts, times, ['/bin/codex', 'app-server'])
  const readTail = vi.spyOn(io, 'readTail')
  expect((await collect()).sessions).toEqual([])
  expect(readTail).not.toHaveBeenCalled()
})
