import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openTerminal, openTerminalRunning, raiseTerminal, assertOrcaTrusted } = vi.hoisted(() => ({
  openTerminal: vi.fn(),
  openTerminalRunning: vi.fn(),
  raiseTerminal: vi.fn(),
  assertOrcaTrusted: vi.fn()
}))
vi.mock('../main/terminal-opener', () => ({ openTerminal, openTerminalRunning, raiseTerminal }))
const raiseProcessWindow = vi.hoisted(() => vi.fn())
vi.mock('../main/windows-terminals', () => ({
  raiseProcessWindow,
  launchWindowsApp: vi.fn()
}))
vi.mock('../shared/orca-bundle', async (original) => ({
  ...(await original<typeof import('../shared/orca-bundle')>()),
  assertOrcaTrusted
}))

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { orcaBundle } from '../shared/orca-bundle'
import { filetimeToMs, startTimeQuery } from '../shared/platform-process'
import { processTreeScript } from '../shared/windows-console'
import type { FeedMessage, OfficeSnapshot, SessionRef } from '../shared/office/types'
import { createOfficeService, type OfficeService } from './office-service'

// The service below is macOS's, whatever this machine is; Windows has its own block at the end.
const ORCA_CLI = orcaBundle('darwin').cli

const STARTED_AT_MS = Date.parse('Sun Oct 11 09:00:00 2026 UTC')

const session = (overrides: Partial<SessionRef> = {}): SessionRef => ({
  key: 'claude:s1',
  provider: 'claude',
  sessionId: 's1',
  pid: 4242,
  name: 'app',
  cwd: '/repo/app',
  projectKey: 'p_app',
  projectLabel: 'app',
  projectRoot: '/repo/app',
  companyKey: 'c_test',
  companyLabel: 'Test Co',
  worktree: null,
  host: 'orca',
  orcaPaneKey: 'tab1:leaf1',
  activity: 'editing',
  attention: 'none',
  currentTool: null,
  subagents: [],
  startedAtMs: STARTED_AT_MS,
  updatedAtMs: 1,
  ...overrides
})

const envelope = (result: unknown): string => JSON.stringify({ id: '1', ok: true, result })
const TERMINALS = [
  {
    handle: 'term_a',
    tabId: 'tab1',
    leafId: 'leaf1',
    worktreePath: '/repo/app',
    incarnationId: 'inc_1',
    agentIdentity: 'claude'
  }
]

// One Claude agent, pid 4242, in the Orca pane tab1:leaf1 of /repo/app, showing `screen`.
let screen: string[]
function answer(program: string, args: string[]): { stdout: string; stderr: string } {
  const stdout = ((): string => {
    if (program === '/bin/ps') return 'Sun Oct 11 09:00:00 2026\n'
    if (program !== ORCA_CLI) return ''
    if (args[1] === 'list') return envelope({ terminals: TERMINALS })
    return envelope(args[1] === 'read' ? { terminal: { tail: screen } } : {})
  })()
  return { stdout, stderr: '' }
}

describe('createOfficeService', () => {
  let snapshot: OfficeSnapshot | null
  let feedListeners: Set<(message: FeedMessage) => void>
  const run = vi.fn()
  const terminalOf = vi.fn()
  let service: OfficeService
  const host = {
    snapshot: () => snapshot,
    onMessage: (listener: (message: FeedMessage) => void) => {
      feedListeners.add(listener)
      return () => {
        feedListeners.delete(listener)
      }
    }
  }
  const commands = (): [string, string[]][] =>
    run.mock.calls.map(([program, args]) => [program, args])

  beforeEach(() => {
    vi.clearAllMocks()
    screen = ['⏺ Done.', '─'.repeat(40), '❯', '─'.repeat(40)]
    assertOrcaTrusted.mockResolvedValue(undefined)
    snapshot = { rev: 4, generatedAtMs: 1, sessions: [session()], sources: [] }
    feedListeners = new Set()
    run.mockImplementation(async (program: string, args: string[]) => answer(program, args))
    terminalOf.mockResolvedValue('iterm2')
    openTerminal.mockResolvedValue({ success: true })
    openTerminalRunning.mockResolvedValue({ success: true })
    raiseTerminal.mockResolvedValue({ success: true })
    service = createOfficeService({
      host,
      run,
      terminalOf,
      isInteractive: true,
      platform: 'darwin'
    })
  })

  describe('the feed', () => {
    it('gives a new subscriber the current state first, then what the bridge sends', () => {
      const listener = vi.fn()
      service.subscribe(listener)
      for (const deliver of feedListeners) deliver({ type: 'resync' })

      expect(listener.mock.calls).toEqual([
        [{ type: 'hello', v: 1, snapshot }],
        [{ type: 'resync' }]
      ])
    })

    it('sends no hello while the bridge has reported nothing', () => {
      snapshot = null
      const listener = vi.fn()
      service.subscribe(listener)

      expect(listener).not.toHaveBeenCalled()
    })

    it('stops delivering once the subscriber leaves', () => {
      const unsubscribe = service.subscribe(vi.fn())
      unsubscribe()

      expect(feedListeners.size).toBe(0)
    })
  })

  describe('actions', () => {
    it('types a message into the agent’s pane only after proving the pane is its own', async () => {
      expect(await service.send('claude:s1', 'run the tests')).toEqual({ success: true })

      expect(commands()).toEqual([
        ['/bin/ps', ['-o', 'lstart=', '-p', '4242']],
        [ORCA_CLI, ['terminal', 'list', '--json']],
        [ORCA_CLI, ['terminal', 'read', '--terminal', 'term_a', '--screen', '--json']],
        [
          ORCA_CLI,
          [
            'terminal',
            'send',
            '--terminal',
            'term_a',
            '--text',
            'run the tests',
            '--enter',
            '--json'
          ]
        ]
      ])
    })

    it('types nothing into a pane that is showing a prompt', async () => {
      screen = ['Do you want to proceed?', '❯ 1. Yes', '  2. No']

      expect(await service.send('claude:s1', 'no, wait')).toEqual({
        success: false,
        reason: 'prompt-on-screen'
      })
      expect(commands().some(([, args]) => args[1] === 'send')).toBe(false)
    })

    it('reads process start times in the C locale and UTC', async () => {
      expect(await service.processStart(4242)).toBe(STARTED_AT_MS)
      expect(run).toHaveBeenCalledWith('/bin/ps', ['-o', 'lstart=', '-p', '4242'], {
        timeout: 5000,
        env: { LC_ALL: 'C', TZ: 'UTC' }
      })
    })

    it('reports no start time for a process that is gone', async () => {
      run.mockRejectedValue(new Error('no such process'))
      expect(await service.processStart(4242)).toBeNull()
    })

    it.each([
      ['send', () => service.send({ key: 'claude:s1' }, 'hello')],
      ['send', () => service.send('claude:s1', ['hello'])],
      ['respond', () => service.respond('claude:s1', 'yes', 'abc')],
      ['respond', () => service.respond('claude:s1', 'approve', 7)],
      ['startAgent', () => service.startAgent('p_app', 'gemini')],
      ['startAgent', () => service.startAgent('p_app', null)]
    ])('%s refuses input of the wrong shape and runs no program', async (_name, act) => {
      expect((await act()).success).toBe(false)
      expect(run).not.toHaveBeenCalled()
      expect(openTerminalRunning).not.toHaveBeenCalled()
    })

    it.each([
      ['focus', () => service.focus(4242)],
      ['focus', () => service.focus('claude:nope')],
      ['peek', () => service.peek(null)],
      ['send', () => service.send('claude:nope', 'hello')]
    ])('%s runs no program for a session the bridge never reported', async (_name, act) => {
      expect(await act()).toMatchObject({ success: false, reason: 'unknown-session' })
      expect(run).not.toHaveBeenCalled()
    })

    it('starts an agent in the project folder through Orca', async () => {
      expect(await service.startAgent('p_app', 'codex')).toEqual({ success: true })
      expect(commands().at(-1)?.[1].slice(0, 6)).toEqual([
        'terminal',
        'create',
        '--worktree',
        'path:/repo/app',
        '--command',
        'codex'
      ])
    })

    it('runs nothing from Orca when its signature does not check out', async () => {
      assertOrcaTrusted.mockRejectedValue(new Error('code failed to satisfy its requirement'))

      expect(await service.send('claude:s1', 'run the tests')).toEqual({
        success: false,
        reason: 'orca-unavailable'
      })
      expect(commands().map(([program]) => program)).not.toContain(ORCA_CLI)
    })

    it('opens the folder in the hosting terminal app for an agent outside Orca', async () => {
      const folder = mkdtempSync(join(tmpdir(), 'office-focus-'))
      snapshot = {
        rev: 5,
        generatedAtMs: 1,
        sessions: [session({ host: 'terminal', orcaPaneKey: null, cwd: folder })],
        sources: []
      }

      try {
        expect(await service.focus('claude:s1')).toEqual({ success: true, target: 'terminal' })
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
      expect(terminalOf).toHaveBeenCalledWith(4242)
      expect(openTerminal).toHaveBeenCalledWith(folder, 'iterm2')
      expect(raiseTerminal).not.toHaveBeenCalled()
      expect(run).not.toHaveBeenCalled()
    })

    it.each([
      ['a folder that does not exist', () => '/no/such/folder'],
      ['a file', () => fileURLToPath(import.meta.url)]
    ])('opens nothing for %s', async (_case, cwdOf) => {
      snapshot = {
        rev: 5,
        generatedAtMs: 1,
        sessions: [session({ host: 'terminal', orcaPaneKey: null, cwd: cwdOf() })],
        sources: []
      }

      expect(await service.focus('claude:s1')).toEqual({ success: false })
      expect(openTerminal).not.toHaveBeenCalled()
    })

    it('only brings that app forward when it may not type: no new tab, no cd', async () => {
      const viewOnly = createOfficeService({
        host,
        run,
        terminalOf,
        isInteractive: false,
        platform: 'darwin'
      })
      snapshot = {
        rev: 5,
        generatedAtMs: 1,
        sessions: [session({ host: 'terminal', orcaPaneKey: null })],
        sources: []
      }

      expect(await viewOnly.focus('claude:s1')).toEqual({ success: true, target: 'terminal-app' })
      expect(raiseTerminal).toHaveBeenCalledExactlyOnceWith('iterm2')
      expect(openTerminal).not.toHaveBeenCalled()
      expect(run).not.toHaveBeenCalled()
    })
  })
})

describe('createOfficeService on Windows', () => {
  const WINDOWS_CLI = orcaBundle('win32').cli
  const FILETIME = '134363332085558530'
  let snapshot: OfficeSnapshot | null
  const run = vi.fn()
  const runScript = vi.fn()
  const terminalOf = vi.fn()
  const host = { snapshot: () => snapshot, onMessage: () => () => {} }
  const windows = (isInteractive: boolean): OfficeService =>
    createOfficeService({ host, run, terminalOf, isInteractive, platform: 'win32', runScript })
  const outside = (cwd: string): OfficeSnapshot => ({
    rev: 5,
    generatedAtMs: 1,
    sessions: [session({ host: 'terminal', orcaPaneKey: null, cwd })],
    sources: []
  })

  beforeEach(() => {
    vi.clearAllMocks()
    assertOrcaTrusted.mockResolvedValue(undefined)
    run.mockResolvedValue({ stdout: '', stderr: '' })
    runScript.mockResolvedValue(`${FILETIME}\r\n`)
    openTerminal.mockResolvedValue({ success: true })
    raiseProcessWindow.mockResolvedValue(true)
  })

  it('reads a start time as Windows records it, through the PowerShell runner it is given', async () => {
    expect(await windows(true).processStart(4242)).toBe(filetimeToMs(FILETIME))
    expect(runScript).toHaveBeenCalledExactlyOnceWith(startTimeQuery(4242, 'win32').args.at(-1))
    expect(run).not.toHaveBeenCalled()
  })

  it('brings the session’s own window forward rather than opening another', async () => {
    snapshot = outside('C:\\repo\\app')
    expect(await windows(true).focus('claude:s1')).toEqual({
      success: true,
      target: 'terminal-app'
    })
    expect(raiseProcessWindow).toHaveBeenCalledExactlyOnceWith(4242, runScript)
    expect(openTerminal).not.toHaveBeenCalled()
  })

  it('opens a terminal in the folder when no window could be raised, unless it may not', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'office-focus-'))
    snapshot = outside(folder)
    raiseProcessWindow.mockResolvedValue(false)
    try {
      expect(await windows(true).focus('claude:s1')).toEqual({ success: true, target: 'terminal' })
      expect(openTerminal).toHaveBeenCalledExactlyOnceWith(folder, undefined)
      openTerminal.mockClear()
      expect(await windows(false).focus('claude:s1')).toEqual({ success: false })
      expect(openTerminal).not.toHaveBeenCalled()
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('finds a pane key through the verified Orca CLI and the PowerShell runner, nothing else', async () => {
    run.mockResolvedValue({
      stdout: JSON.stringify({
        ok: true,
        result: { worktrees: [{ sessions: [{ pid: 7, paneKey: 't:l' }] }] }
      }),
      stderr: ''
    })
    runScript.mockResolvedValue(
      JSON.stringify({
        console: 7,
        processes: [
          { pid: 4242, ppid: 7, name: 'claude.exe', started: '2' },
          { pid: 7, ppid: 8, name: 'bash.exe', started: '1' },
          { pid: 8, ppid: 1, name: 'Orca.exe', started: '0' }
        ]
      })
    )
    expect(await windows(true).paneKeyOf(4242)).toBe('t:l')
    expect(assertOrcaTrusted).toHaveBeenCalled()
    expect(run.mock.calls.map(([program]) => program)).toEqual([WINDOWS_CLI])
    expect(runScript).toHaveBeenCalledExactlyOnceWith(processTreeScript(4242))
  })

  it('checks no Orca signature and runs no Orca CLI for a session with no Orca above it', async () => {
    runScript.mockResolvedValue(
      JSON.stringify({
        console: 7,
        processes: [
          { pid: 4242, ppid: 7, name: 'claude.exe', started: '2' },
          { pid: 7, ppid: 1, name: 'WindowsTerminal.exe', started: '1' }
        ]
      })
    )
    expect(await windows(true).paneKeyOf(4242)).toBeNull()
    expect(assertOrcaTrusted).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('still names the Orca CLI when Orca is above the session', async () => {
    run.mockResolvedValue({
      stdout: JSON.stringify({ ok: true, result: { worktrees: [] } }),
      stderr: ''
    })
    runScript.mockResolvedValue(
      JSON.stringify({
        console: 7,
        processes: [
          { pid: 4242, ppid: 7, name: 'claude.exe', started: '2' },
          { pid: 7, ppid: 1, name: 'Orca.exe', started: '1' }
        ]
      })
    )
    expect(await windows(true).paneKeyOf(4242)).toBeNull()
    expect(assertOrcaTrusted).toHaveBeenCalled()
    expect(run.mock.calls.map(([program]) => program)).toEqual([WINDOWS_CLI])
    expect(runScript).toHaveBeenCalledExactlyOnceWith(processTreeScript(4242))
  })
})
