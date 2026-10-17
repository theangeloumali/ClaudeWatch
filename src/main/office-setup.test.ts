import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

const { handle, execFilePromise, openTerminal, fork, assertOrcaTrusted } = vi.hoisted(() => ({
  handle: vi.fn(),
  execFilePromise: vi.fn(),
  openTerminal: vi.fn(),
  fork: vi.fn(),
  assertOrcaTrusted: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle },
  app: { isPackaged: false, getPath: () => '/unused-user-data', getAppPath: () => '/unused-app' },
  shell: { openExternal: vi.fn() },
  screen: { getAllDisplays: () => [] },
  utilityProcess: { fork },
  BrowserWindow: vi.fn()
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('./platform/exec', () => ({ execFilePromise }))
vi.mock('./terminal-opener', () => ({
  openTerminal,
  openTerminalRunning: vi.fn(),
  raiseTerminal: vi.fn()
}))
vi.mock('../shared/orca-bundle', async (original) => ({
  ...(await original<typeof import('../shared/orca-bundle')>()),
  assertOrcaTrusted
}))

import { orcaBundle } from '../shared/orca-bundle'
import { buildLayout } from '../office/sim/layout'
import { session } from '../office/sim/fixtures'
import { createHostWorld } from '../office-host/host-world'
import { createWorldDocument } from '../shared/office/world-document'
import { setupOffice } from './office-setup'

// The Office below is macOS's, whatever this machine is.
const { app: ORCA_APP, cli: ORCA_CLI } = orcaBundle('darwin')
const machinePlatform = process.platform
beforeAll(() => Object.defineProperty(process, 'platform', { value: 'darwin' }))
afterAll(() => Object.defineProperty(process, 'platform', { value: machinePlatform }))

const pageEvent = (page: string): unknown => ({
  senderFrame: { parent: null, url: pathToFileURL(join(__dirname, '../renderer', page)).href }
})
const officeEvent = pageEvent('office.html')
const envelope = (result: unknown): string => JSON.stringify({ id: '1', ok: true, result })

// One Claude agent, pid 4242, in the Orca pane tab1:leaf1 of /repo/app.
function answer(program: string, args: string[]): { stdout: string; stderr: string } {
  const stdout = ((): string => {
    if (program === '/bin/ps' && args.includes('lstart=')) return 'Sun Oct 11 09:00:00 2026\n'
    if (program === '/bin/ps' && !args.includes('-E')) return 'claude --resume x\n'
    // Shaped like `ps -E`: the command line, then the environment, secrets included.
    if (program === '/bin/ps')
      return 'claude --resume x ANTHROPIC_API_KEY=sk-not-kept ORCA_PANE_KEY=tab1:leaf1 HOME=/Users/dev\n'
    if (program !== ORCA_CLI) return ''
    if (args[1] === 'list')
      return envelope({
        terminals: [
          {
            handle: 'term_a',
            tabId: 'tab1',
            leafId: 'leaf1',
            worktreePath: '/repo/app',
            incarnationId: 'inc_1',
            agentIdentity: 'claude'
          }
        ]
      })
    return envelope({ focus: { handle: 'term_a', navigated: true } })
  })()
  return { stdout, stderr: '' }
}

describe('setupOffice', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>
  let office: ReturnType<typeof setupOffice>
  const tracker = { getInstances: vi.fn() }
  const terminalResolver = { resolve: vi.fn() }
  const store = { getOfficeWindowBounds: vi.fn(), setOfficeWindowBounds: vi.fn() }
  // Accounts have their own file, office-setup.accounts.test.ts; here they add nothing.
  const unchanged = <Value>(value: Value): Value => value
  const accounts = {
    ingestBridgeMessage: vi.fn(),
    observeSessions: vi.fn(),
    decorate: unchanged,
    decorateSession: unchanged,
    onOfficeChange: () => () => {},
    isWatchingAccounts: false,
    onWatchingChange: () => () => {},
    onUsageDurable: () => () => {}
  }
  const commands = (): [string, string[]][] =>
    execFilePromise.mock.calls.map(([program, args]) => [program, args])

  // A tracked agent outside Orca, in a folder that exists: only such a folder is opened.
  const folders: string[] = []
  const trackedFolder = (): string => {
    const folder = mkdtempSync(join(tmpdir(), 'office-setup-'))
    folders.push(folder)
    tracker.getInstances.mockReturnValue([{ pid: 4242, projectPath: folder }])
    return folder
  }
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
    handle.mockImplementation((channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers[channel] = listener
    })
    execFilePromise.mockImplementation(async (program: string, args: string[]) =>
      answer(program, args)
    )
    assertOrcaTrusted.mockResolvedValue(undefined)
    openTerminal.mockResolvedValue({ success: true })
    terminalResolver.resolve.mockResolvedValue({ terminalType: 'iterm2' })
    tracker.getInstances.mockReturnValue([{ pid: 4242, projectPath: '/repo/app' }])
    worldFolder = mkdtempSync(join(tmpdir(), 'office-world-'))
    office = setupOffice(
      terminalResolver,
      store,
      tracker,
      accounts,
      join(worldFolder, 'world-document.json')
    )
  })
  let worldFolder: string
  afterEach(() => rmSync(worldFolder, { recursive: true, force: true }))

  it('office:world-save keeps the Office page’s city where every Office reads it', async () => {
    const sessions = [session('claude:a')]
    const city = { ...createWorldDocument(buildLayout(sessions, undefined), sessions), revision: 1 }
    expect(() => handlers['office:world-save'](pageEvent('index.html'), city)).toThrow(
      'Untrusted IPC sender'
    )
    expect(await handlers['office:world-save'](officeEvent, city)).toEqual({
      success: true,
      document: city
    })
    expect(createHostWorld(join(worldFolder, 'world-document.json')).current()).toEqual(city)
  })

  describe('the bridge', () => {
    const bridge = { on: vi.fn(), kill: vi.fn() }
    const snapshot = { rev: 3, generatedAtMs: 1, sessions: [], sources: [] }
    const bridgeSays = (message: unknown): void => {
      // The feed and the accounts ledger each listen to the bridge.
      for (const [event, listener] of bridge.on.mock.calls)
        if (event === 'message') listener(message)
    }

    beforeEach(() => fork.mockReturnValue(bridge))

    it('is not running, and has nothing to report, until the app starts it', () => {
      expect(fork).not.toHaveBeenCalled()
      expect(office.snapshot()).toBeNull()
    })

    it('runs from start to stop with no Office window, serving its latest snapshot', () => {
      office.start()
      // Saved offsets spare the 1.9 GB usage catch-up on every bridge start (health-4).
      expect(fork).toHaveBeenCalledExactlyOnceWith(
        join(__dirname, 'bridge.js'),
        ['--usage-offsets', join('/unused-user-data', 'usage-offsets.json')],
        { serviceName: 'ClaudeWatch Office Bridge' }
      )
      bridgeSays({ type: 'hello', v: 1, snapshot })
      expect(office.snapshot()).toEqual(snapshot)

      office.stop()
      expect(bridge.kill).toHaveBeenCalledOnce()
      expect(office.snapshot()).toBeNull()
    })
  })

  it('office:focus answers the Office page only', async () => {
    const channel = 'office:focus'
    for (const event of [pageEvent('index.html'), { senderFrame: null }, null]) {
      expect(() => handlers[channel](event, 'claude:s1')).toThrow('Untrusted IPC sender')
    }
    expect(await handlers[channel](officeEvent, 'claude:s1')).toEqual({
      success: false,
      reason: 'unknown-session'
    })
  })

  it('office:focus runs no program for a key the bridge never reported', async () => {
    for (const agentKey of ['claude:nope', 'claude:nope#lena', 4242, null, { key: 'x' }]) {
      expect(await handlers['office:focus'](officeEvent, agentKey)).toEqual({
        success: false,
        reason: 'unknown-session'
      })
    }
    expect(execFilePromise).not.toHaveBeenCalled()
  })

  it('runs no program for a pid the tracker does not list', async () => {
    expect(await office.focusSession(1)).toEqual({ success: false, reason: 'unknown-session' })
    expect(execFilePromise).not.toHaveBeenCalled()
  })

  it('focuses a tracked Orca agent’s pane with fixed commands and no input', async () => {
    expect(await office.focusSession(4242)).toEqual({ success: true, target: 'pane' })

    expect(commands()).toEqual([
      ['/bin/ps', ['-o', 'lstart=', '-p', '4242']],
      ['/bin/ps', ['-o', 'command=', '-p', '4242']],
      ['/bin/ps', ['-E', '-o', 'command=', '-p', '4242']],
      ['/bin/ps', ['-o', 'lstart=', '-p', '4242']],
      [ORCA_CLI, ['terminal', 'list', '--json']],
      [ORCA_CLI, ['terminal', 'switch', '--terminal', 'term_a', '--json']],
      ['/usr/bin/open', ['-a', ORCA_APP]]
    ])
    expect(openTerminal).not.toHaveBeenCalled()
  })

  it('runs nothing from Orca, and opens no terminal, when its signature does not check out', async () => {
    assertOrcaTrusted.mockRejectedValue(new Error('code failed to satisfy its requirement'))

    expect(await office.focusSession(4242)).toEqual({
      success: false,
      reason: 'orca-unavailable'
    })
    const programs = commands().map(([program]) => program)
    expect(programs).not.toContain(ORCA_CLI)
    expect(programs).not.toContain('/usr/bin/open')
    expect(openTerminal).not.toHaveBeenCalled()
  })

  it('opens the tracked folder in the agent’s own terminal app outside Orca', async () => {
    const folder = trackedFolder()
    execFilePromise.mockImplementation(async (program: string, args: string[]) =>
      args.includes('-E')
        ? { stdout: 'claude HOME=/Users/dev\n', stderr: '' }
        : answer(program, args)
    )

    expect(await office.focusSession(4242)).toEqual({ success: true, target: 'terminal' })
    expect(terminalResolver.resolve).toHaveBeenCalledWith(4242)
    expect(openTerminal).toHaveBeenCalledWith(folder, 'iterm2')
    expect(commands().map(([program]) => program)).toEqual(['/bin/ps', '/bin/ps', '/bin/ps'])
  })

  it('does not take a pane key from the tracked process’s arguments', async () => {
    trackedFolder()
    execFilePromise.mockImplementation(async (program: string, args: string[]) =>
      args.includes('command=')
        ? {
            stdout: `claude ORCA_PANE_KEY=tab1:leaf1${args.includes('-E') ? ' HOME=/Users/dev' : ''}\n`,
            stderr: ''
          }
        : answer(program, args)
    )

    expect(await office.focusSession(4242)).toEqual({ success: true, target: 'terminal' })
    expect(commands().map(([program]) => program)).not.toContain(ORCA_CLI)
  })
})
