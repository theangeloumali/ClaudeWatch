import { describe, expect, it, vi } from 'vitest'
import { claimPanes, OrcaSource, parseOrcaEnvironment, readOrcaEnvironment } from './orca'
import { ORCA_CLI } from '../shared/orca-bundle'
import { POWERSHELL } from '../shared/platform-process'
import { consoleRootScript, PROCESS_LIST_SCRIPT } from '../shared/windows-console'
import { fixtureIo, missing, session } from './__fixtures__/helpers'
import type { SubagentRef } from '../shared/office/types'

const teammate = (name: string, pid: number, startedAtMs: number): SubagentRef => ({
  id: `${name}@session-a`,
  type: 'lena',
  activity: 'thinking',
  kind: 'teammate',
  name,
  pid,
  startedAtMs,
  orcaPaneKey: null,
  tokens: null
})

it('CLAUDE_JOB_DIR suppresses Orca identifiers and discards other env', () => {
  expect(
    parseOrcaEnvironment(
      'claude SECRET=hidden ORCA_PANE_KEY=p ORCA_WORKTREE_ID=w CLAUDE_JOB_DIR=/job'
    )
  ).toEqual({ jobDir: '/job', paneKey: null, worktreeId: null })
  expect(parseOrcaEnvironment('claude SECRET=hidden ORCA_PANE_KEY=p ORCA_WORKTREE_ID=w')).toEqual({
    jobDir: null,
    paneKey: 'p',
    worktreeId: 'w'
  })
})

// `ps` as the bridge asks it: the arguments alone, or the arguments and then the environment.
const psOf =
  (argv: string, environment: string) =>
  async (_file: string, args: string[]): Promise<string> =>
    args.includes('-E') ? `${argv} ${environment}\n` : `${argv}\n`

describe('a process’s Orca environment', () => {
  const read = (argv: string, environment: string): ReturnType<typeof readOrcaEnvironment> =>
    readOrcaEnvironment(4242, (args) => psOf(argv, environment)('/bin/ps', args))

  it('asks for the arguments alone, then for the arguments with the environment', async () => {
    const ps = vi.fn(async (args: string[]) =>
      args.includes('-E') ? 'claude HOME=/x\n' : 'claude\n'
    )
    await readOrcaEnvironment(4242, ps)
    expect(ps.mock.calls).toEqual([
      [['-o', 'command=', '-p', '4242']],
      [['-E', '-o', 'command=', '-p', '4242']]
    ])
  })

  it('reads the pane key from the environment', async () => {
    expect((await read('claude --resume x', 'HOME=/x ORCA_PANE_KEY=tab1:leaf1')).paneKey).toBe(
      'tab1:leaf1'
    )
  })

  it('never accepts an argument that looks like a pane key', async () => {
    expect((await read('claude ORCA_PANE_KEY=tabX:leafY', 'HOME=/x')).paneKey).toBeNull()
    expect(
      (await read('claude ORCA_PANE_KEY=tabX:leafY', 'HOME=/x ORCA_PANE_KEY=tab1:leaf1')).paneKey
    ).toBe('tab1:leaf1')
  })

  it('reads nothing when the two listings disagree about the arguments', async () => {
    const renamed = async (args: string[]): Promise<string> =>
      args.includes('-E') ? 'renamed ORCA_PANE_KEY=tab1:leaf1\n' : 'claude\n'
    await expect(readOrcaEnvironment(4242, renamed)).rejects.toThrow()
    const longer = async (args: string[]): Promise<string> =>
      args.includes('-E') ? 'claudeORCA_PANE_KEY=x ORCA_PANE_KEY=tab1:leaf1\n' : 'claude\n'
    await expect(readOrcaEnvironment(4242, longer)).rejects.toThrow()
  })
})

describe('Orca polling', () => {
  it.each(['missing', 'bad-json', 'not-ok'])(
    'backs off on %s and caps retry delay at 60s',
    async (failure) => {
      const io = fixtureIo({ [ORCA_CLI]: '' })
      io.exec = vi.fn(async () => {
        if (failure === 'missing') throw missing()
        return failure === 'bad-json' ? 'invalid' : '{"ok":false}'
      })
      const source = new OrcaSource(io, 'darwin')
      expect((await source.poll(0)).ok).toBe(false)
      await source.poll(9999)
      expect(io.exec).toHaveBeenCalledTimes(1)
      await source.poll(10000)
      await source.poll(29999)
      expect(io.exec).toHaveBeenCalledTimes(2)
      await source.poll(30000)
      await source.poll(69999)
      expect(io.exec).toHaveBeenCalledTimes(3)
      await source.poll(70000)
      await source.poll(129999)
      expect(io.exec).toHaveBeenCalledTimes(4)
      await source.poll(130000)
      expect(io.exec).toHaveBeenCalledTimes(5)
    }
  )
  it('asks a healthy Orca at most once in five minutes, since each ask checks its whole bundle', async () => {
    const io = fixtureIo({ [ORCA_CLI]: '' })
    io.exec = vi.fn(async () => '{"ok":true,"data":[]}')
    const source = new OrcaSource(io, 'darwin')
    expect((await source.poll(0)).ok).toBe(true)
    await source.poll(299_999)
    expect(io.exec).toHaveBeenCalledTimes(1)
    await source.poll(300_000)
    expect(io.exec).toHaveBeenCalledTimes(2)
  })
  it.each([
    ['a failing Orca again at once', false, 2],
    ['a healthy Orca no sooner', true, 1]
  ])('asks %s when a session first shows a pane key', async (_case, isUp, asks) => {
    const io = fixtureIo({ [ORCA_CLI]: '' })
    const ps = psOf('claude', 'ORCA_PANE_KEY=p')
    const exec = vi.fn(async (file: string, args: string[]) => {
      if (file !== ORCA_CLI) return ps(file, args)
      if (!isUp) throw missing()
      return '{"ok":true,"data":[]}'
    })
    io.exec = exec
    const source = new OrcaSource(io, 'darwin')
    await source.poll(0)
    await source.enrich(session('a'), 1000)
    await source.poll(2000)
    // The same pane key seen again tells nothing new.
    await source.enrich(session('a'), 3000)
    await source.poll(4000)
    expect(exec.mock.calls.filter(([file]) => file === ORCA_CLI)).toHaveLength(asks)
  })
  it('reads each new pid’s environment once', async () => {
    const io = fixtureIo({ [ORCA_CLI]: '' })
    const ps = psOf('claude', 'ORCA_PANE_KEY=p SECRET=hidden')
    io.exec = vi.fn(async (file, args) =>
      file === ORCA_CLI ? '{"ok":true,"data":[]}' : ps(file, args)
    )
    const source = new OrcaSource(io, 'darwin')
    expect((await source.poll(0)).ok).toBe(true)
    expect(io.exec).toHaveBeenCalledWith(ORCA_CLI, ['worktree', 'ps', '--json'])
    await source.poll(9000)
    const ref = session('a')
    expect(await source.enrich(ref)).toMatchObject({ host: 'orca', orcaPaneKey: 'p' })
    await source.enrich(ref)
    expect(io.exec).toHaveBeenCalledTimes(3)
    await source.enrich({ ...ref, startedAtMs: 1 })
    expect(io.exec).toHaveBeenCalledTimes(5)
  })
  it('keeps jobs in terminal hosts', async () => {
    const io = fixtureIo()
    io.exec = psOf('claude', 'ORCA_PANE_KEY=p CLAUDE_JOB_DIR=/job')
    expect(await new OrcaSource(io, 'darwin').enrich(session('a'))).toMatchObject({
      host: 'terminal',
      orcaPaneKey: null
    })
  })
})

it('retries failed environment reads after 30 seconds', async () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(0)
    const io = fixtureIo()
    const ps = psOf('claude', 'ORCA_PANE_KEY=p')
    io.exec = vi.fn(ps).mockRejectedValueOnce(new Error('timeout'))
    const source = new OrcaSource(io, 'darwin')
    expect((await source.enrich(session('a'))).orcaPaneKey).toBeNull()
    vi.setSystemTime(29999)
    await source.enrich(session('a'))
    expect(io.exec).toHaveBeenCalledTimes(1)
    vi.setSystemTime(30000)
    expect((await source.enrich(session('a'))).orcaPaneKey).toBe('p')
    expect(io.exec).toHaveBeenCalledTimes(3)
  } finally {
    vi.useRealTimers()
  }
})

it('reads each teammate’s pane from its own process, once, and forgets it when it leaves', async () => {
  const io = fixtureIo()
  io.exec = vi.fn(async (file, args) =>
    psOf('claude', `ORCA_PANE_KEY=pane-of-${args.at(-1)} SECRET=x`)(file, args)
  )
  const source = new OrcaSource(io, 'darwin')
  const lead = { ...session('a'), subagents: [teammate('lena', 77, 5), teammate('ravi', 78, 6)] }
  const plain = { id: 'abc', type: 'Explore', activity: 'thinking' as const }
  const enriched = await source.enrich({ ...lead, subagents: [...lead.subagents, plain] })
  expect(enriched.orcaPaneKey).toBe('pane-of-42')
  expect(enriched.subagents.map((agent) => agent.orcaPaneKey)).toEqual([
    'pane-of-77',
    'pane-of-78',
    undefined
  ])
  source.prune([lead])
  await source.enrich(lead)
  expect(io.exec).toHaveBeenCalledTimes(6)
  source.prune([{ ...lead, subagents: [lead.subagents[0]] }])
  await source.enrich(lead)
  expect(io.exec).toHaveBeenCalledTimes(8)
})

it('takes a pane away from a teammate that only inherited it', () => {
  const pane = (agent: SubagentRef, orcaPaneKey: string): SubagentRef => ({ ...agent, orcaPaneKey })
  const lead = {
    ...session('lead'),
    host: 'orca' as const,
    orcaPaneKey: 't:l',
    startedAtMs: 10,
    subagents: [
      pane(teammate('inherited', 77, 20), 't:l'),
      pane(teammate('own', 78, 30), 't:own'),
      pane(teammate('shared-later', 79, 50), 't:shared'),
      pane(teammate('shared-first', 80, 40), 't:shared')
    ]
  }
  const [claimed] = claimPanes([lead])
  expect(claimed.orcaPaneKey).toBe('t:l')
  expect(claimed.subagents.map((agent) => [agent.name, agent.orcaPaneKey])).toEqual([
    ['inherited', null],
    ['own', 't:own'],
    ['shared-later', null],
    ['shared-first', 't:shared']
  ])
})

it('lets only the earliest session keep a pane that several sessions report', () => {
  const parent = {
    ...session('parent'),
    host: 'orca' as const,
    orcaPaneKey: 't:l',
    startedAtMs: 10
  }
  const child = { ...session('child'), host: 'orca' as const, orcaPaneKey: 't:l', startedAtMs: 20 }
  const other = { ...session('other'), host: 'orca' as const, orcaPaneKey: 't:m', startedAtMs: 30 }
  expect(claimPanes([child, other, parent]).map((s) => [s.sessionId, s.orcaPaneKey])).toEqual([
    ['child', null],
    ['other', 't:m'],
    ['parent', 't:l']
  ])
})

describe('Orca panes on Windows, where no process environment can be read', () => {
  // FILETIME strings one second apart, oldest first.
  const at = (second: number): string => String(134363332080000000n + BigInt(second) * 10000000n)
  // Sessions 42 and 44 run under Git Bash in the Orca pane whose shell is 7; sh's parent has
  // exited, so each one's ancestry resumes at its console.
  const PROCESSES = [
    { pid: 42, ppid: 43, name: 'claude.exe', started: at(50) },
    { pid: 43, ppid: 999, name: 'sh.exe', started: at(49) },
    { pid: 44, ppid: 999, name: 'claude.exe', started: at(51) },
    { pid: 7, ppid: 8, name: 'bash.exe', started: at(10) },
    { pid: 8, ppid: 1, name: 'Orca.exe', started: at(5) }
  ]
  const diagnostics = (sessions: { pid: number; paneKey: string }[]): string =>
    JSON.stringify({ ok: true, result: { worktrees: [{ sessions }] } })

  // PowerShell as the bridge asks it: the shared listing, or one pid's console.
  const answerScript = (script: string, processes = PROCESSES): string =>
    script === PROCESS_LIST_SCRIPT ? JSON.stringify({ processes }) : '7'
  const runner = (processes = PROCESSES): ReturnType<typeof vi.fn> =>
    vi.fn(async (script: string) => answerScript(script, processes))
  const listings = (runScript: ReturnType<typeof vi.fn>): number =>
    runScript.mock.calls.filter(([script]) => script === PROCESS_LIST_SCRIPT).length

  const windowsIo = (panes: { pid: number; paneKey: string }[]): ReturnType<typeof fixtureIo> => {
    const io = fixtureIo({ [ORCA_CLI]: '' })
    io.exec = vi.fn(async (file: string, args: string[]) => {
      if (file === POWERSHELL) return answerScript(args.at(-1) ?? '')
      if (file === ORCA_CLI && args[0] === 'diagnostics') return diagnostics(panes)
      if (file === ORCA_CLI) return '{"ok":true,"result":{"worktrees":[]}}'
      throw new Error(`not allowed: ${file}`)
    })
    return io
  }

  it('finds the pane whose shell is the session’s console, from Orca’s own listing', async () => {
    const io = windowsIo([
      { pid: 5, paneKey: 'tab:other' },
      { pid: 7, paneKey: 'tab:leaf' }
    ])
    expect(await new OrcaSource(io, 'win32').enrich(session('a'))).toMatchObject({
      host: 'orca',
      orcaPaneKey: 'tab:leaf'
    })
    const calls = vi.mocked(io.exec).mock.calls
    expect(calls.map(([file]) => file)).toEqual([POWERSHELL, POWERSHELL, ORCA_CLI])
    expect(calls.map(([, args]) => args.at(-1))).toEqual(
      expect.arrayContaining([PROCESS_LIST_SCRIPT, consoleRootScript(42), '--json'])
    )
  })

  it('reads the process list once per tick, however many new sessions it brings', async () => {
    const io = windowsIo([{ pid: 7, paneKey: 'tab:leaf' }])
    const runScript = runner()
    const source = new OrcaSource(io, 'win32', runScript)
    const [first, second] = await Promise.all([
      source.enrich(session('a'), 1000),
      source.enrich({ ...session('b'), pid: 44 }, 1000)
    ])
    expect([first.orcaPaneKey, second.orcaPaneKey]).toEqual(['tab:leaf', 'tab:leaf'])
    expect(listings(runScript)).toBe(1)
    expect(runScript).toHaveBeenCalledWith(consoleRootScript(42))
    expect(runScript).toHaveBeenCalledWith(consoleRootScript(44))
    await source.enrich({ ...session('c'), pid: 44, startedAtMs: 5 }, 2000)
    expect(listings(runScript)).toBe(2)
  })

  it('does not take a process missing from the listing for one outside Orca', async () => {
    const io = windowsIo([{ pid: 7, paneKey: 'tab:leaf' }])
    const runScript = runner(PROCESSES.filter(({ pid }) => pid !== 42))
    const source = new OrcaSource(io, 'win32', runScript)
    expect((await source.enrich(session('a'), 0)).orcaPaneKey).toBeNull()
    runScript.mockImplementation(async (script: string) => answerScript(script))
    expect((await source.enrich(session('a'), 30_000)).orcaPaneKey).toBe('tab:leaf')
  })

  it('asks Orca nothing, and checks no signature, for a session with no Orca above it', async () => {
    const io = windowsIo([{ pid: 7, paneKey: 'tab:leaf' }])
    const outsideOrca = PROCESSES.map((row) =>
      row.name === 'Orca.exe' ? { ...row, name: 'WindowsTerminal.exe' } : row
    )
    const source = new OrcaSource(io, 'win32', runner(outsideOrca))
    expect(await source.enrich(session('a'))).toMatchObject({ host: 'terminal', orcaPaneKey: null })
    expect(io.exec).not.toHaveBeenCalled()
  })

  it('leaves a session in Orca without a pane of its own where it is', async () => {
    const io = windowsIo([{ pid: 5, paneKey: 'tab:other' }])
    expect(await new OrcaSource(io, 'win32').enrich(session('a'))).toMatchObject({
      host: 'terminal',
      orcaPaneKey: null
    })
  })

  it('asks again in 30 seconds when Orca’s listing is a failure, rather than remember no pane', async () => {
    const io = windowsIo([{ pid: 7, paneKey: 'tab:leaf' }])
    vi.mocked(io.exec).mockResolvedValueOnce('{"ok":false,"error":{"code":"runtime_unavailable"}}')
    const source = new OrcaSource(io, 'win32', runner())
    expect((await source.enrich(session('a'), 0)).orcaPaneKey).toBeNull()
    expect((await source.enrich(session('a'), 30_000)).orcaPaneKey).toBe('tab:leaf')
  })

  it('keeps a known pane while one Orca poll fails, without asking again', async () => {
    const io = windowsIo([{ pid: 7, paneKey: 'tab:leaf' }])
    const source = new OrcaSource(io, 'win32', runner())
    expect((await source.enrich(session('a'), 0)).orcaPaneKey).toBe('tab:leaf')
    vi.mocked(io.exec).mockRejectedValueOnce(new Error('signature check timed out'))
    expect((await source.poll(1)).ok).toBe(false)
    vi.mocked(io.exec).mockClear()
    expect(await source.enrich(session('a'), 2)).toMatchObject({
      host: 'orca',
      orcaPaneKey: 'tab:leaf'
    })
    expect(io.exec).not.toHaveBeenCalled()
  })

  it('asks a failing Orca again at once when a new session turns out to be in a pane', async () => {
    const io = windowsIo([{ pid: 7, paneKey: 'tab:leaf' }])
    const source = new OrcaSource(io, 'win32', runner())
    vi.mocked(io.exec).mockRejectedValueOnce(new Error('runtime unavailable'))
    expect((await source.poll(0)).ok).toBe(false)
    expect((await source.enrich(session('a'), 1)).orcaPaneKey).toBe('tab:leaf')
    expect((await source.poll(2)).ok).toBe(true)
  })
})
