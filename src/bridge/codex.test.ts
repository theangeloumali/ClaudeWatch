import { expect, it, vi } from 'vitest'
import { accountKey } from './account-key'
import { collectCodex, codexProcesses, parseCodexActivity } from './codex'
import { parseProcessTable } from './process-table'
import { parseCodexUsage } from './codex-usage'
import { fixtureIo } from './__fixtures__/helpers'
import type { BridgeIo } from './io'

// These cases describe macOS, where `lsof` names the folder each process runs in.
const collectOnMac = (
  root: string,
  io: BridgeIo,
  readProcesses?: Parameters<typeof collectCodex>[2],
  derivesAccounts = false,
  now = Date.now()
): ReturnType<typeof collectCodex> =>
  collectCodex(root, io, readProcesses, derivesAccounts, now, 'darwin')

function tokenCount(total: number | null, cached = 0, last = 0): string {
  const usage = (input: number) => ({
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: 0,
    output_tokens: 40,
    reasoning_output_tokens: 30,
    total_tokens: input + 40
  })
  return JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info:
        total === null
          ? null
          : {
              total_token_usage: usage(total),
              last_token_usage: usage(last),
              model_context_window: 272000
            },
      rate_limits: { primary: { used_percent: 12 } }
    }
  })
}

it('takes Codex usage from the newest token count that carries one', () => {
  const tail = [tokenCount(100, 60, 50), 'broken', tokenCount(1000, 700, 300), tokenCount(null)]
  expect(parseCodexUsage(tail.join('\n'))).toEqual({
    own: { input: 300, output: 40, cacheWrite: 0, cacheRead: 700 },
    subagents: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    spawned: 0,
    contextTokens: 300,
    contextLimit: 272000
  })
})

it('reports Codex usage as unknown when the tail holds no token count', () => {
  const reasoning = JSON.stringify({ type: 'event_msg', payload: { type: 'reasoning' } })
  expect(parseCodexUsage(`${reasoning}\n${tokenCount(null)}`)).toBeNull()
  const quoted = JSON.stringify({
    type: 'response_item',
    payload: { type: 'message', text: '"token_count" total_token_usage' }
  })
  expect(parseCodexUsage(quoted)).toBeNull()
})

it('selects only CLI argv[0], excluding app-server and helpers', () => {
  const start = 'Sat Oct 10 15:29:12 2026'
  expect(
    codexProcesses(
      parseProcessTable(
        `42 ${start} /opt/bin/codex --model test\n43 ${start} codex app-server\n44 ${start} codex exec hello\n45 ${start} node /bin/codex\n46 ${start} codex app-server-helper\n47 ${start} codex --config x app-server`
      )
    )
  ).toEqual([
    { pid: 42, startedAtMs: Date.parse(`${start} UTC`), kind: 'terminal' },
    { pid: 44, startedAtMs: Date.parse(`${start} UTC`), kind: 'exec' }
  ])
})
it.each([
  ['function_call', 'running', 'none'],
  ['custom_tool_call', 'running', 'none'],
  ['reasoning', 'thinking', 'none'],
  ['task_complete', 'idle', 'done']
])('maps Codex event %s', (type, activity, attention) => {
  expect(
    parseCodexActivity(
      `invalid\n${JSON.stringify({ type: 'event_msg', timestamp: '2026-10-11T01:00:00Z', payload: { type, text: 'SECRET_TEXT' } })}`
    )
  ).toMatchObject({ activity, attention, updatedAtMs: Date.parse('2026-10-11T01:00:00Z') })
})
it('matches cwd using only rollout headers then tails the newest match', async () => {
  const meta = (id: string, cwd: string) =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd } })
  const io = fixtureIo({
    '/codex/sessions/2026/10/rollout-old.jsonl': meta('old', '/repo'),
    '/codex/sessions/2026/10/rollout-new.jsonl': `${meta('new', '/repo')}\n${JSON.stringify({ type: 'event_msg', payload: { type: 'reasoning', text: 'SECRET_PROMPT' } })}\n${tokenCount(1000, 700, 300)}`,
    '/codex/sessions/rollout-other.jsonl': meta('other', '/other'),
    '/repo/.git': null
  })
  const stat = io.stat
  io.stat = async (path) =>
    path.includes('rollout-new') ? { directory: false, mtimeMs: 2000, size: 100 } : stat(path)
  io.exec = vi.fn(async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : 'p42\nn/repo\n'
  )
  const tail = vi.spyOn(io, 'readTail')
  const batch = await collectOnMac('/codex', io)
  expect(batch.sessions[0]).toMatchObject({
    key: 'codex:new',
    pid: 42,
    activity: 'thinking',
    projectLabel: 'repo',
    usage: { own: { input: 300, cacheRead: 700 }, contextLimit: 272000 }
  })
  expect(JSON.stringify(batch.sessions)).not.toContain('SECRET_PROMPT')
  expect(tail).toHaveBeenCalledTimes(1)
  expect(batch.sources[0].ok).toBe(true)
})
it('asks where a Codex process runs once, and reads its rollout again only when the file changed', async () => {
  const meta = JSON.stringify({ type: 'session_meta', payload: { id: 'a', cwd: '/repo' } })
  const files: Record<string, string | null> = {
    '/codex/sessions/rollout-a.jsonl': `${meta}\n`,
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  let startedAt = 'Sat Oct 10 15:29:12 2026'
  const exec = vi.fn(async (program: string) =>
    program.endsWith('ps') ? `42 ${startedAt} /bin/codex` : 'p42\nn/repo\n'
  )
  io.exec = exec
  const tail = vi.spyOn(io, 'readTail')
  const folderAsks = (): number =>
    exec.mock.calls.filter(([program]) => program.endsWith('lsof')).length
  await collectOnMac('/codex', io)
  expect((await collectOnMac('/codex', io)).sessions).toHaveLength(1)
  expect([folderAsks(), tail.mock.calls.length]).toEqual([1, 1])
  files['/codex/sessions/rollout-a.jsonl'] += `${tokenCount(1000, 700, 300)}\n`
  expect((await collectOnMac('/codex', io)).sessions[0].usage?.own.input).toBe(300)
  expect([folderAsks(), tail.mock.calls.length]).toEqual([1, 2])
  // Another process under the same pid is asked about afresh.
  startedAt = 'Sun Oct 11 15:29:12 2026'
  await collectOnMac('/codex', io)
  expect(folderAsks()).toBe(2)
})

it('keeps the last usage it read while output pushes the token count out of the tail', async () => {
  const meta = JSON.stringify({ type: 'session_meta', payload: { id: 'a', cwd: '/repo' } })
  const files: Record<string, string | null> = {
    '/codex/sessions/rollout-a.jsonl': `${meta}\n${tokenCount(1000, 700, 300)}`,
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  io.exec = async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : 'p42\nn/repo\n'
  const usage = async (): Promise<unknown> => (await collectOnMac('/codex', io)).sessions[0].usage
  const counted = await usage()
  expect(counted).toMatchObject({ own: { input: 300, cacheRead: 700 } })

  // What a 64 KB tail holds after a long tool output: no token count at all.
  const output = JSON.stringify({
    type: 'response_item',
    payload: { type: 'function_call_output' }
  })
  files['/codex/sessions/rollout-a.jsonl'] = `${meta}\n${output}`
  expect(await usage()).toEqual(counted)
  files['/codex/sessions/rollout-a.jsonl'] = `${meta}\n${output}\n${tokenCount(2000, 700, 300)}`
  expect(await usage()).toMatchObject({ own: { input: 1300, cacheRead: 700 } })
})

// One Codex process in /repo with a rollout that holds a first total; `stop` ends the process.
function endingSession() {
  const rollout = '/codex/sessions/rollout-a.jsonl'
  const meta = JSON.stringify({ type: 'session_meta', payload: { id: 'a', cwd: '/repo' } })
  const files: Record<string, string | null> = {
    [rollout]: `${meta}\n${tokenCount(1000, 700, 300)}\n`,
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  let isRunning = true
  io.exec = async (file) => {
    if (!file.endsWith('ps')) return 'p42\nn/repo\n'
    return isRunning ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : ''
  }
  return { rollout, files, io, stop: () => void (isRunning = false) }
}

it('reads a rollout once more when its process has gone, for the total the thread ended on', async () => {
  const { rollout, files, io, stop } = endingSession()
  expect((await collectOnMac('/codex', io)).departed).toEqual([])

  // Its last turn, written and the process gone before the next look.
  files[rollout] += `${tokenCount(2000, 700, 300)}\n`
  stop()
  const tail = vi.spyOn(io, 'readTail')
  const batch = await collectOnMac('/codex', io)
  expect(batch.sessions).toEqual([])
  expect(batch.departed).toMatchObject([
    { sessionKey: 'codex:a', projectLabel: 'repo', counts: { input: 1300, cacheRead: 700 } }
  ])
  expect(batch.sources[0].ok).toBe(true)

  expect((await collectOnMac('/codex', io)).departed).toEqual([])
  expect(tail).toHaveBeenCalledTimes(1)
})

it('has no last total for a session whose rollout is gone, and says so when it cannot be read', async () => {
  const gone = endingSession()
  await collectOnMac('/codex', gone.io)
  delete gone.files[gone.rollout]
  gone.stop()
  const quiet = await collectOnMac('/codex', gone.io)
  expect([quiet.departed, quiet.sources[0].ok]).toEqual([[], true])

  const denied = endingSession()
  await collectOnMac('/codex', denied.io)
  denied.io.readTail = async () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' })
  }
  denied.stop()
  const failed = await collectOnMac('/codex', denied.io)
  expect(failed.departed).toEqual([])
  expect(failed.sources[0]).toEqual({ id: 'codex', ok: false, detail: 'rollout read failed' })
})

it('says when the thread itself began, which a resumed session’s process does not', async () => {
  const meta = (extra: object): string =>
    JSON.stringify({ type: 'session_meta', payload: { id: 'a', cwd: '/repo', ...extra } })
  const files: Record<string, string | null> = {
    '/codex/sessions/rollout-a.jsonl': meta({ timestamp: '2026-09-01T08:00:00.000Z' }),
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  io.exec = async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : 'p42\nn/repo\n'
  const [resumed] = (await collectOnMac('/codex', io)).sessions
  expect(resumed.startedAtMs).toBe(Date.parse('Sat Oct 10 15:29:12 2026 UTC'))
  expect(resumed.threadStartedAtMs).toBe(Date.parse('2026-09-01T08:00:00.000Z'))

  const undated = fixtureIo({ ...files, '/codex/sessions/rollout-a.jsonl': meta({}) })
  undated.exec = io.exec
  expect('threadStartedAtMs' in (await collectOnMac('/codex', undated)).sessions[0]).toBe(false)
})

it('keeps live CLI processes even without a rollout and reports process failures', async () => {
  const io = fixtureIo()
  io.exec = async (file) => (file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 codex' : 'n/plain')
  expect((await collectOnMac('/codex', io)).sessions[0]).toMatchObject({
    provider: 'codex',
    projectLabel: 'plain',
    usage: null
  })
  io.exec = async () => {
    throw new Error('denied')
  }
  expect((await collectOnMac('/codex', io)).sources[0].ok).toBe(false)
})
it('walks the session folders only every 30 s while a macOS process has no rollout yet', async () => {
  const io = fixtureIo({ '/codex/sessions/2026/rollout-old.jsonl': '{}', '/repo/.git': null })
  io.exec = async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 codex' : 'p42\nn/repo\n'
  const list = vi.spyOn(io, 'list')
  const now = Date.parse('2026-10-11T10:00:00Z')
  await collectOnMac('/codex', io, undefined, false, now)
  const walk = list.mock.calls.length
  for (const tick of [1, 2, 3, 4])
    await collectOnMac('/codex', io, undefined, false, now + tick * 2000)
  // `lsof` already placed it: its first rollout waits for the next full walk.
  expect(list.mock.calls.length).toBe(walk)
})
it('looks again between full walks only at the rollouts it showed, not at a folder’s history', async () => {
  const meta = (id: string) =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/repo' } })
  const files: Record<string, string | null> = { '/repo/.git': null }
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f'])
    files[`/codex/sessions/rollout-${id}.jsonl`] = meta(id)
  const io = fixtureIo(files)
  io.exec = async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : 'p42\nn/repo\n'
  const now = Date.parse('2026-10-11T10:00:00Z')
  expect((await collectOnMac('/codex', io, undefined, false, now)).sessions).toHaveLength(1)
  const stat = vi.spyOn(io, 'stat')
  await collectOnMac('/codex', io, undefined, false, now + 2000)
  const rollouts = stat.mock.calls.filter(([path]) => path.includes('rollout-'))
  expect(rollouts).toHaveLength(1)
})
it('skips Codex processes running inside an app bundle (helpers, not user sessions)', async () => {
  const io = fixtureIo()
  io.exec = async (file) =>
    file.endsWith('ps')
      ? '42 Sat Oct 10 15:29:12 2026 codex'
      : 'n/Applications/ChatGPT.app/Contents/Resources'
  expect((await collectOnMac('/codex', io)).sessions).toEqual([])
})

it.each([
  ['the account its rollout names, exactly', { creator_account_id: 'acct_CANARY_ID' }],
  ['no account when its rollout names none', {}]
])('attributes a Codex session to %s', async (_case, creator) => {
  const io = fixtureIo({
    '/codex/sessions/rollout-a.jsonl': JSON.stringify({
      type: 'session_meta',
      payload: { id: 'a', cwd: '/repo', ...creator }
    }),
    '/repo/.git': null
  })
  io.exec = async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : 'p42\nn/repo\n'
  const [unwatched] = (await collectOnMac('/codex', io)).sessions
  expect(unwatched).toMatchObject({ key: 'codex:a', accountKey: null })
  expect(unwatched.accountConfidence).toBeUndefined()
  const [session] = (await collectOnMac('/codex', io, undefined, true)).sessions
  const named = 'creator_account_id' in creator
  expect(session.key).toBe('codex:a')
  expect(session.accountKey).toBe(named ? accountKey('codex', 'acct_CANARY_ID') : null)
  expect(session.accountConfidence).toBe(named ? 'exact' : undefined)
  expect(JSON.stringify(session)).not.toContain('CANARY')
})

it('handles current Codex response_item tool and reasoning records without retaining inputs', () => {
  const tool = JSON.stringify({
    type: 'response_item',
    payload: { type: 'custom_tool_call', call_id: 'call-a', input: 'SECRET_INPUT' }
  })
  const reasoning = JSON.stringify({
    type: 'response_item',
    payload: { type: 'reasoning', summary: 'SECRET_PROMPT' }
  })
  expect(parseCodexActivity(tool).activity).toBe('running')
  const output = JSON.stringify({
    type: 'response_item',
    payload: { type: 'custom_tool_call_output', call_id: 'call-a' }
  })
  expect(parseCodexActivity(`${tool}\n${output}\n${reasoning}`).activity).toBe('thinking')
  expect(JSON.stringify(parseCodexActivity(tool))).not.toContain('SECRET_INPUT')
})

it.each(['/company/repo', '/company/repo/.claude/.worktree/task'])(
  'keeps main project and company identity for %s',
  async (cwd) => {
    const io = fixtureIo({
      '/company/repo/.git': null,
      '/company/repo/.claude/.worktree/task/.git': 'gitdir: /company/repo/.git/worktrees/task\n'
    })
    io.exec = async (file) =>
      file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 codex' : `n${cwd}`
    const batch = await collectOnMac('/codex', io)
    expect(batch.sessions[0]).toMatchObject({
      projectRoot: '/company/repo',
      projectLabel: 'repo',
      companyLabel: 'company',
      worktree: cwd === '/company/repo' ? null : cwd
    })
  }
)

function activityRecords(payloads: Record<string, unknown>[]): string {
  return payloads
    .map((payload) =>
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-10-12T01:00:00Z',
        payload
      })
    )
    .join('\n')
}

it('clears activity when a turn is aborted', () => {
  expect(
    parseCodexActivity(activityRecords([{ type: 'reasoning' }, { type: 'turn_aborted' }]))
  ).toMatchObject({ activity: 'idle', attention: 'none' })
})

it.each([
  ['function_call', 'function_call_output'],
  ['custom_tool_call', 'custom_tool_call_output'],
  ['local_shell_call', 'local_shell_call_output']
])('closes %s by call id and resumes thinking', (callType, outputType) => {
  expect(
    parseCodexActivity(
      activityRecords([
        { type: callType, call_id: 'call-a', name: 'exec_command' },
        { type: outputType, call_id: 'call-a' }
      ])
    )
  ).toMatchObject({ activity: 'thinking', currentTool: null })
})

it.each([
  ['apply_patch', 'editing', 'edit'],
  ['exec_command', 'running', 'run'],
  ['exec', 'running', 'run'],
  ['web_search', 'searching', 'web']
])('categorizes the open Codex tool %s', (name, activity, category) => {
  expect(
    parseCodexActivity(activityRecords([{ type: 'function_call', call_id: 'call-a', name }]))
  ).toMatchObject({ activity, currentTool: { name, category } })
})

it('keeps parallel calls open until each corresponding output arrives', () => {
  expect(
    parseCodexActivity(
      activityRecords([
        { type: 'function_call', call_id: 'call-a', name: 'exec_command' },
        { type: 'custom_tool_call', call_id: 'call-b', name: 'apply_patch' },
        { type: 'function_call_output', call_id: 'call-a' },
        { type: 'message', role: 'assistant' }
      ])
    )
  ).toMatchObject({ activity: 'editing', currentTool: { category: 'edit' } })
})

it('recognizes recent assistant output without treating user text as activity', () => {
  expect(
    parseCodexActivity(
      activityRecords([
        { type: 'message', role: 'assistant' },
        { type: 'message', role: 'user' }
      ])
    )
  ).toMatchObject({ activity: 'thinking' })
})

it('does not count exec servers, MCP servers or sandbox workers as sessions', () => {
  const started = 'Sat Oct 10 15:29:12 2026'
  expect(
    codexProcesses(
      parseProcessTable(
        [
          `42 ${started} /bin/codex exec-server`,
          `43 ${started} /bin/codex mcp-server`,
          `44 ${started} /bin/codex sandbox macos true`
        ].join('\n')
      )
    )
  ).toEqual([])
})

it('passes the open tool category through collection and removes departed processes', async () => {
  const meta = JSON.stringify({ type: 'session_meta', payload: { id: 'a', cwd: '/repo' } })
  const io = fixtureIo({
    '/codex/sessions/rollout-a.jsonl': `${meta}\n${activityRecords([
      { type: 'custom_tool_call', call_id: 'call-a', name: 'apply_patch' }
    ])}`,
    '/repo/.git': null
  })
  let isRunning = true
  io.exec = async (file) =>
    file.endsWith('ps') ? (isRunning ? '42 Sat Oct 10 15:29:12 2026 codex' : '') : 'p42\nn/repo\n'
  expect((await collectOnMac('/codex', io)).sessions).toMatchObject([
    { activity: 'editing', currentTool: { name: 'apply_patch', category: 'edit' } }
  ])
  isRunning = false
  expect((await collectOnMac('/codex', io)).sessions).toEqual([])
})

it('keeps exec sessions whose prompt mentions helper command names', () => {
  const started = 'Sat Oct 10 15:29:12 2026'
  expect(
    codexProcesses(
      parseProcessTable(`42 ${started} /bin/codex exec sandbox app-server exec-server`)
    )
  ).toHaveLength(1)
})

it('ages quiet assistant output to idle on cached tails while retaining open tools', async () => {
  const meta = JSON.stringify({ type: 'session_meta', payload: { id: 'a', cwd: '/repo' } })
  const files: Record<string, string | null> = {
    '/codex/sessions/rollout-a.jsonl': `${meta}\n${activityRecords([
      { type: 'message', role: 'assistant' }
    ])}`,
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  io.exec = async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 codex' : 'p42\nn/repo\n'
  const atMs = Date.parse('2026-10-12T01:00:00Z')
  expect(
    (await collectOnMac('/codex', io, undefined, false, atMs + 1000)).sessions[0].activity
  ).toBe('thinking')
  expect(
    (await collectOnMac('/codex', io, undefined, false, atMs + 60000)).sessions[0].activity
  ).toBe('idle')
  files['/codex/sessions/rollout-a.jsonl'] = `${meta}\n${activityRecords([
    { type: 'function_call', call_id: 'call-a', name: 'exec_command' }
  ])}`
  expect(
    (await collectOnMac('/codex', io, undefined, false, atMs + 60000)).sessions[0].activity
  ).toBe('running')
})

it('shows threads an app-server hosts (desktop app, IDE, plugins) while their rollout is fresh', async () => {
  const meta = (id: string, cwd: string) =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd } })
  const openShell = activityRecords([{ type: 'local_shell_call', call_id: 'c1' }])
  const io = fixtureIo({
    '/codex/sessions/rollout-live.jsonl': `${meta('live', '/repo')}\n${openShell}`,
    '/codex/sessions/rollout-quiet.jsonl': meta('quiet', '/repo'),
    '/repo/.git': null
  })
  const stat = io.stat
  const now = 1_000_000
  io.stat = async (path) =>
    path.includes('rollout-live')
      ? { directory: false, mtimeMs: now - 10_000, size: 200 }
      : path.includes('rollout-quiet')
        ? { directory: false, mtimeMs: now - 600_000, size: 100 }
        : stat(path)
  io.exec = vi.fn(async (file: string) =>
    file.endsWith('ps')
      ? '43 Sat Oct 10 15:29:12 2026 /Applications/Codex.app/codex app-server'
      : ''
  )
  const batch = await collectOnMac('/codex', io, undefined, false, now)
  expect(batch.sessions).toHaveLength(1)
  expect(batch.sessions[0]).toMatchObject({
    key: 'codex:live',
    provider: 'codex',
    pid: null,
    activity: 'running',
    projectLabel: 'repo'
  })
})

it('shows no hosted thread when no app-server is running', async () => {
  const io = fixtureIo({
    '/codex/sessions/rollout-live.jsonl': JSON.stringify({
      type: 'session_meta',
      payload: { id: 'live', cwd: '/repo' }
    }),
    '/repo/.git': null
  })
  io.exec = vi.fn(async () => '')
  expect((await collectOnMac('/codex', io, undefined, false, 1500)).sessions).toEqual([])
})

it('walks the session folders fully only every 30 s while app-servers run, and follows fresh rollouts between', async () => {
  const meta = (id: string) =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/repo' } })
  const files: Record<string, string | null> = {
    '/codex/sessions/2026/05/rollout-old.jsonl': meta('old'),
    '/codex/sessions/2026/10/rollout-live.jsonl': `${meta('live')}\n`,
    '/repo/.git': null
  }
  const io = fixtureIo(files)
  let now = 1_000_000
  const times: Record<string, number> = { live: now - 5_000, old: now - 9_000_000, late: now }
  const stat = io.stat
  io.stat = async (path) => {
    const id = /rollout-(\w+)/.exec(path)?.[1]
    const info = await stat(path)
    return id && times[id] !== undefined ? { ...info, mtimeMs: times[id] } : info
  }
  io.exec = vi.fn(async (file: string) =>
    file.endsWith('ps')
      ? '43 Sat Oct 10 15:29:12 2026 /Applications/Codex.app/codex app-server'
      : ''
  )
  const list = vi.spyOn(io, 'list')
  await collectOnMac('/codex', io, undefined, false, now)
  const fullWalk = list.mock.calls.length
  expect(fullWalk).toBeGreaterThan(0)

  // Ten seconds on the live thread opens a shell: seen without listing a folder again.
  now += 10_000
  times.live = now - 1_000
  files['/codex/sessions/2026/10/rollout-live.jsonl'] += activityRecords([
    { type: 'local_shell_call', call_id: 'c1' }
  ])
  const between = await collectOnMac('/codex', io, undefined, false, now)
  expect(list.mock.calls.length).toBe(fullWalk)
  expect(between.sessions.map((session) => [session.key, session.activity])).toEqual([
    ['codex:live', 'running']
  ])

  // A thread started since the last walk appears once the next full walk is due.
  files['/codex/sessions/2026/10/rollout-late.jsonl'] = meta('late')
  now += 25_000
  times.late = now - 1_000
  times.live = now - 1_000
  const later = await collectOnMac('/codex', io, undefined, false, now)
  expect(list.mock.calls.length).toBeGreaterThan(fullWalk)
  expect(later.sessions.map((session) => session.key).sort()).toEqual(['codex:late', 'codex:live'])
})

// One app-server and one hosted thread in /repo whose rollout time the test moves.
function hostedThread(tail: string, extra: object = {}) {
  const path = '/codex/sessions/rollout-h.jsonl'
  const meta = JSON.stringify({
    type: 'session_meta',
    payload: { id: 'h', cwd: '/repo', ...extra }
  })
  const files: Record<string, string | null> = { [path]: `${meta}\n${tail}`, '/repo/.git': null }
  const io = fixtureIo(files)
  const written = { atMs: 0 }
  const stat = io.stat
  // Matched by name: the bridge asks with whichever separator its platform joins with.
  io.stat = async (candidate) =>
    candidate.endsWith('rollout-h.jsonl')
      ? { directory: false, mtimeMs: written.atMs, size: files[path]?.length ?? 0 }
      : stat(candidate)
  io.exec = vi.fn(async (file: string) =>
    file.endsWith('ps')
      ? '43 Sat Oct 10 15:29:12 2026 /Applications/Codex.app/codex app-server'
      : ''
  )
  const keys = async (now: number): Promise<string[]> =>
    (await collectOnMac('/codex', io, undefined, false, now)).sessions.map(({ key }) => key)
  return { path, files, io, written, keys }
}

it('keeps a hosted thread written a moment after the tick began', async () => {
  const { written, keys } = hostedThread(activityRecords([{ type: 'reasoning' }]))
  const now = 1_000_000
  written.atMs = now + 1_500
  expect(await keys(now)).toEqual(['codex:h'])
})

it('keeps a quiet hosted thread live while a tool it opened is still running, up to a cap', async () => {
  const shell = activityRecords([{ type: 'function_call', call_id: 'c1', name: 'exec_command' }])
  const { written, keys } = hostedThread(shell)
  const start = 1_000_000
  written.atMs = start
  expect(await keys(start)).toEqual(['codex:h'])
  expect(await keys(start + 5 * 60_000)).toEqual(['codex:h'])
  expect(await keys(start + 16 * 60_000)).toEqual([])
})

it('lets a quiet hosted thread with no open tool leave after two minutes', async () => {
  const { written, keys } = hostedThread(activityRecords([{ type: 'reasoning' }]))
  written.atMs = 1_000_000
  expect(await keys(1_000_000)).toEqual(['codex:h'])
  expect(await keys(1_000_000 + 3 * 60_000)).toEqual([])
})

it('gives a hosted thread with no start time in its rollout one start time, however often it is written', async () => {
  const { path, files, io, written } = hostedThread(activityRecords([{ type: 'reasoning' }]))
  const startOf = async (now: number): Promise<number | undefined> =>
    (await collectOnMac('/codex', io, undefined, false, now)).sessions[0]?.startedAtMs
  written.atMs = 1_000_000
  const first = await startOf(1_000_000)
  files[path] += `\n${activityRecords([{ type: 'reasoning' }])}`
  written.atMs = 1_005_000
  expect(await startOf(1_005_000)).toBe(first)
})

it('keeps the key a Codex process was first shown under once its rollout appears', async () => {
  const files: Record<string, string | null> = { '/repo/.git': null }
  const io = fixtureIo(files)
  io.exec = async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 /bin/codex' : 'p42\nn/repo\n'
  const [before] = (await collectOnMac('/codex', io)).sessions
  files['/codex/sessions/rollout-a.jsonl'] = JSON.stringify({
    type: 'session_meta',
    payload: { id: 'a', cwd: '/repo' }
  })
  const [after] = (await collectOnMac('/codex', io, undefined, false, Date.now() + 60_000)).sessions
  expect(before.key).toBe(`codex:pid-42-${Date.parse('Sat Oct 10 15:29:12 2026 UTC')}`)
  expect(after).toMatchObject({ key: before.key, sessionId: 'a' })
})

it('lets the newest Codex process claim the newest rollout in a shared folder', async () => {
  const meta = (id: string) =>
    JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/repo' } })
  const io = fixtureIo({
    '/codex/sessions/rollout-old.jsonl': meta('old'),
    '/codex/sessions/rollout-new.jsonl': meta('new'),
    '/repo/.git': null
  })
  const stat = io.stat
  io.stat = async (path) =>
    path.includes('rollout-new') ? { directory: false, mtimeMs: 2000, size: 10 } : stat(path)
  io.exec = async (file, args) =>
    file.endsWith('ps')
      ? '42 Sat Oct 10 15:29:12 2026 /bin/codex\n43 Sat Oct 10 15:39:12 2026 /bin/codex'
      : `p${args[2]}\nn/repo\n`
  const { sessions } = await collectOnMac('/codex', io)
  const owners = Object.fromEntries(sessions.map((session) => [session.pid, session.key]))
  expect(owners).toEqual({ 42: 'codex:old', 43: 'codex:new' })
})

it('strips control and bidi override characters from a name taken from a folder', async () => {
  const cwd = '/x/re\u202Epo\u0007'
  const io = fixtureIo()
  io.exec = async (file) =>
    file.endsWith('ps') ? '42 Sat Oct 10 15:29:12 2026 codex' : `p42\nn${cwd}\n`
  const [session] = (await collectOnMac('/codex', io)).sessions
  expect(session.name).toBe('repo')
})
