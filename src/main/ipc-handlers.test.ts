import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type ClaudeInstance } from '../renderer/lib/types'
import { session } from '../bridge/__fixtures__/helpers'
import type { FocusResult, OfficeSnapshot } from '../shared/office/types'

const { handle, app, openExternal } = vi.hoisted(() => ({
  handle: vi.fn(),
  app: {
    isQuitting: false,
    isPackaged: false,
    quit: vi.fn(),
    setLoginItemSettings: vi.fn(),
    getAppPath: vi.fn(() => '/repo')
  },
  openExternal: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle }, app, shell: { openExternal } }))
vi.mock('./terminal-opener', () => ({ openTerminal: vi.fn(() => ({ success: true })) }))
import { openTerminal } from './terminal-opener'
import { forwardUpdatesToRenderer, isOpenableFolder, setupIpcHandlers } from './ipc-handlers'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'

const APP_PAGE = pathToFileURL(join(__dirname, '../renderer/index.html')).href
const appEvent = { senderFrame: { parent: null, url: APP_PAGE } }
const stats = { total: 2, active: 1, idle: 1, stale: 0, exited: 0, recentlyCompleted: 0 }
const usage = {
  totalInputTokens: 1,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalCostUSD: 0,
  modelUsage: [],
  dataAvailable: true,
  lastUpdated: null,
  weeklyTokens: 1,
  weeklyTokenTarget: 100_000
}
// Absolute on the host the tests run on: C:\project on Windows.
const PROJECT = resolve('/project')
const CODEX_REPO = resolve('/codex-repo')
const instanceIn = (projectPath: string): ClaudeInstance => ({
  pid: 1234,
  tty: 'console',
  status: 'idle',
  cpuPercent: 0,
  memPercent: 0,
  elapsedTime: '00:01',
  elapsedSeconds: 1,
  projectPath,
  projectName: 'project',
  flags: [],
  startedAt: new Date(0)
})
const tracker = {
  getInstances: vi.fn((): ClaudeInstance[] => []),
  getStats: vi.fn(() => stats),
  setStaleThreshold: vi.fn(),
  setCooldownSeconds: vi.fn(),
  setCpuIdleThreshold: vi.fn(),
  setMaxHistoryEntries: vi.fn(),
  start: vi.fn(),
  on: vi.fn()
}
const store = {
  getSettings: vi.fn(() => structuredClone(DEFAULT_SETTINGS)),
  setSettings: vi.fn(),
  getHistory: vi.fn(() => []),
  clearHistory: vi.fn()
}
const usageReader = {
  getLastData: vi.fn(() => null),
  read: vi.fn(async () => usage),
  setWeeklyTokenTarget: vi.fn()
}
const promoChecker = { getLastData: vi.fn(() => null) }
const rateLimitReader = {
  getLastData: vi.fn(() => null),
  isStatuslineConfigured: vi.fn(async () => true),
  setupStatusline: vi.fn(async () => true)
}
const updater = { checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn() }
const notifications = { isSupported: vi.fn(() => true), sendTest: vi.fn(() => ({ sent: true })) }
const onOpenDashboard = vi.fn()
const onOpenOffice = vi.fn()
const focusSession = vi.fn(async (): Promise<FocusResult> => ({ success: true, target: 'pane' }))
const officeSnapshot: OfficeSnapshot = { rev: 3, generatedAtMs: 1, sessions: [], sources: [] }
const getOfficeSnapshot = vi.fn((): OfficeSnapshot | null => officeSnapshot)
let handlers: Record<string, (...args: unknown[]) => unknown>

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  app.isQuitting = false
  handlers = {}
  handle.mockImplementation((channel: string, listener: (...args: unknown[]) => unknown) => {
    handlers[channel] = listener
  })
  setupIpcHandlers({
    tracker,
    store,
    updater,
    usageReader,
    promoChecker,
    rateLimitReader,
    notifications,
    onOpenDashboard,
    onOpenOffice,
    focusSession,
    getOfficeSnapshot
  })
})

describe('IPC authorization', () => {
  it('registers all 30 handlers', () => expect(Object.keys(handlers)).toHaveLength(30))
  it.each([
    null,
    { senderFrame: null },
    { senderFrame: { parent: {}, url: APP_PAGE } },
    { senderFrame: { parent: null, url: 'file:///tmp/dropped.html' } },
    ...['https://example.com', 'about:blank', 'data:text/html,x', 'invalid'].map((url) => ({
      senderFrame: { parent: null, url }
    }))
  ])('rejects untrusted events before every handler: %j', (event) => {
    for (const listener of Object.values(handlers)) {
      expect(() => listener(event)).toThrow('Untrusted IPC sender')
    }
  })
  it('accepts only the dev server origin', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    expect(
      handlers['instances:get']({
        senderFrame: {
          parent: null,
          url: 'http://localhost:5173/#popover'
        }
      })
    ).toBeDefined()
    expect(() =>
      handlers['instances:get']({
        senderFrame: {
          parent: null,
          url: 'http://localhost:5174'
        }
      })
    ).toThrow('Untrusted IPC sender')
  })
})

it.each([
  ['instances:get', { instances: [], stats }],
  ['settings:get', DEFAULT_SETTINGS],
  ['history:get', []],
  ['usage:get', null],
  ['usage:refresh', usage],
  ['promo:get', null],
  ['ratelimits:get', null],
  ['ratelimits:statusline-status', true],
  ['notifications:check-permission', { supported: true }],
  ['notifications:send-test', { sent: true }],
  ['popover:get-pinned', false],
  ['popover:close', { success: false }],
  ['popover:set-pinned', { success: false }]
])('%s returns its result for a trusted sender', async (channel, expected) => {
  expect(await handlers[channel](appEvent)).toEqual(expected)
})

describe('ratelimits:setup-statusline', () => {
  it('installs the script electron-builder ships at the root of a packaged app', async () => {
    app.isPackaged = true
    Object.defineProperty(process, 'resourcesPath', { value: '/res', configurable: true })
    await handlers['ratelimits:setup-statusline'](appEvent)
    app.isPackaged = false
    expect(rateLimitReader.setupStatusline).toHaveBeenCalledWith(
      join('/res', 'claudewatch-statusline.sh')
    )
  })

  it('installs the repo copy in dev', async () => {
    await handlers['ratelimits:setup-statusline'](appEvent)
    expect(rateLimitReader.setupStatusline).toHaveBeenCalledWith(
      join('/repo', 'resources', 'claudewatch-statusline.sh')
    )
  })
})

it('filters unknown settings keys, including nested keys', () => {
  handlers['settings:set'](appEvent, {
    theme: 'dark',
    injected: true,
    notifications: { sound: true, injected: true }
  })
  expect(store.setSettings).toHaveBeenCalledWith({ theme: 'dark', notifications: { sound: true } })
})
it('retains settings propagation', () => {
  handlers['settings:set'](appEvent, {
    weeklyTokenTarget: 100_000,
    launchAtLogin: true,
    staleThresholdMinutes: 10,
    notifications: { cooldownSeconds: 30 }
  })
  expect(usageReader.setWeeklyTokenTarget).toHaveBeenCalledWith(DEFAULT_SETTINGS.weeklyTokenTarget)
  expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
  expect(tracker.setStaleThreshold).toHaveBeenCalledWith(DEFAULT_SETTINGS.staleThresholdMinutes)
  expect(tracker.setCooldownSeconds).toHaveBeenCalledWith(
    DEFAULT_SETTINGS.notifications.cooldownSeconds
  )
})
it('applies polling, CPU threshold and history size to the running tracker', () => {
  handlers['settings:set'](appEvent, {
    pollingIntervalMs: 5000,
    cpuIdleThreshold: 1.5,
    maxHistoryEntries: 20
  })
  expect(tracker.start).toHaveBeenCalledWith(DEFAULT_SETTINGS.pollingIntervalMs)
  expect(tracker.setCpuIdleThreshold).toHaveBeenCalledWith(DEFAULT_SETTINGS.cpuIdleThreshold)
  expect(tracker.setMaxHistoryEntries).toHaveBeenCalledWith(DEFAULT_SETTINGS.maxHistoryEntries)
})
it('does not restart polling for an unrelated setting', () => {
  handlers['settings:set'](appEvent, { theme: 'dark' })
  expect(tracker.start).not.toHaveBeenCalled()
})
it.each(['bogus', null, 42, {}, 'toString'])('rejects terminal type %j', (type) => {
  expect(handlers['terminal:open'](appEvent, '/project', type)).toEqual({ success: false })
  expect(openTerminal).not.toHaveBeenCalled()
})
describe('terminal:open folders', () => {
  it('refuses a folder no tracked session is in', () => {
    expect(handlers['terminal:open'](appEvent, resolve('/somewhere-else'))).toEqual({
      success: false
    })
    expect(openTerminal).not.toHaveBeenCalled()
  })

  it('refuses a UNC folder even when a tracked session runs there', () => {
    const share = '\\\\attacker\\share'
    tracker.getInstances.mockReturnValueOnce([instanceIn(share)])
    expect(handlers['terminal:open'](appEvent, share)).toEqual({ success: false })
    expect(openTerminal).not.toHaveBeenCalled()
  })

  it("opens the folder of a session the Office shows, such as a Codex session's", () => {
    getOfficeSnapshot.mockReturnValueOnce({
      ...officeSnapshot,
      sessions: [{ ...session('codex-a'), cwd: CODEX_REPO }]
    })
    expect(handlers['terminal:open'](appEvent, CODEX_REPO)).toEqual({ success: true })
    expect(openTerminal).toHaveBeenCalledWith(CODEX_REPO, undefined)
  })
})

describe('isOpenableFolder', () => {
  const folders = [
    'C:\\repo',
    '\\\\host\\share\\repo',
    '\\\\?\\C:\\repo',
    '\\\\.\\pipe\\x',
    '/repo'
  ]

  it('opens a tracked folder', () => {
    expect(isOpenableFolder('C:\\repo', folders, 'win32')).toBe(true)
    expect(isOpenableFolder('/repo', folders, 'darwin')).toBe(true)
  })

  // A UNC folder makes the terminal reach out over SMB, which hands the host an NTLM response.
  it.each(['\\\\host\\share\\repo', '\\\\?\\C:\\repo', '\\\\.\\pipe\\x', '//host/share/repo'])(
    'refuses %s on Windows even when a session is in it',
    (path) => {
      expect(isOpenableFolder(path, [...folders, path], 'win32')).toBe(false)
    }
  )

  it('refuses a folder that is not tracked', () => {
    expect(isOpenableFolder('C:\\other', folders, 'win32')).toBe(false)
  })
})

it.each(['', 'relative/path', undefined, null, 42, {}])('rejects path %j', (path) => {
  expect(handlers['terminal:open'](appEvent, path)).toEqual({ success: false })
  expect(openTerminal).not.toHaveBeenCalled()
})
it.each([
  undefined,
  'terminal-app',
  'iterm2',
  'warp',
  'alacritty',
  'kitty',
  'wezterm',
  'hyper',
  'ghostty',
  'vscode',
  'cursor',
  'tmux',
  'screen',
  'unknown'
])('accepts terminal %s', (type) => {
  tracker.getInstances.mockReturnValueOnce([instanceIn(PROJECT)])
  expect(handlers['terminal:open'](appEvent, PROJECT, type)).toEqual({ success: true })
  expect(openTerminal).toHaveBeenCalledWith(PROJECT, type)
})
it.each([
  ['history:clear', store.clearHistory],
  ['app:open-dashboard', onOpenDashboard],
  ['app:open-office', onOpenOffice],
  ['app:quit', app.quit],
  ['updater:check', updater.checkForUpdates],
  ['updater:download', updater.downloadUpdate],
  ['updater:install', updater.quitAndInstall]
])('%s calls its dependency', (channel, callback) => {
  if (channel === 'app:quit' || channel === 'updater:install') {
    callback.mockImplementationOnce(() => expect(app.isQuitting).toBe(true))
  }
  handlers[channel](appEvent)
  expect(callback).toHaveBeenCalledOnce()
  if (channel === 'app:quit' || channel === 'updater:install') expect(app.isQuitting).toBe(true)
})
it('does not begin quitting without an updater', () => {
  setupIpcHandlers({
    tracker,
    store,
    onOpenDashboard,
    onOpenOffice,
    focusSession,
    getOfficeSnapshot
  })
  handlers['updater:install'](appEvent)
  expect(app.isQuitting).toBe(false)
  expect(handlers['ratelimits:get'](appEvent)).toBeNull()
})
it('gives the dashboard the bridge’s snapshot, or null while there is none', () => {
  expect(handlers['office:snapshot'](appEvent)).toEqual(officeSnapshot)
  getOfficeSnapshot.mockReturnValueOnce(null)
  expect(handlers['office:snapshot'](appEvent)).toBeNull()
})
it('refuses the snapshot to the Office page, which has its own feed', () => {
  const officePage = pathToFileURL(join(__dirname, '../renderer/office.html')).href
  expect(() =>
    handlers['office:snapshot']({ senderFrame: { parent: null, url: officePage } })
  ).toThrow('Untrusted IPC sender')
})
it('opens the Office and reports it', () => {
  expect(handlers['app:open-office'](appEvent)).toEqual({ success: true })
})
it.each([4242, -1, 1.5, '4242', null, undefined, {}])(
  'leaves judging pid %j to the focus routine and returns its answer',
  async (pid) => {
    expect(await handlers['session:focus'](appEvent, pid)).toEqual({
      success: true,
      target: 'pane'
    })
    expect(focusSession).toHaveBeenCalledWith(pid)
  }
)
it('opens only the fixed notification settings destination', () => {
  handlers['notifications:open-settings'](appEvent)
  expect(openExternal).toHaveBeenCalledWith(
    'x-apple.systempreferences:com.apple.preference.notifications'
  )
})
it.each(['mute', 'unmute'])('updates the %s project list', (action) => {
  handlers[`notifications:${action}-project`](appEvent, '/project')
  expect(store.setSettings).toHaveBeenCalledWith({
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      mutedProjects: action === 'mute' ? ['/project'] : []
    }
  })
})
it('mutes a project without changing the settings it read', () => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  store.getSettings.mockReturnValueOnce(settings)
  handlers['notifications:mute-project'](appEvent, '/project')
  expect(settings.notifications.mutedProjects).toEqual([])
})
it.each([false, true, null])('forwards updates only to live windows: %s', (destroyed) => {
  const send = vi.fn()
  const window = destroyed === null ? null : { isDestroyed: () => destroyed, webContents: { send } }
  forwardUpdatesToRenderer(tracker, vi.fn(() => window) as () => Electron.BrowserWindow | null)
  const listener = tracker.on.mock.calls.at(-1)?.[1]
  listener({ instances: [], stats: { total: 2 } })
  expect(send).toHaveBeenCalledTimes(destroyed === false ? 1 : 0)
})
