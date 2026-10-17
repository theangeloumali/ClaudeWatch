import { app, screen, shell, utilityProcess } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { BridgeHost } from './bridge-host'
import { OfficeWindowController } from './office-window'
import { createAppWindow, handleTrusted } from './window-factory'
import { PaneFocus } from './pane-focus'
import { createOfficeService } from '../office-host/office-service'
import { createHostWorld, SHARED_WORLD_PATH, withWorld } from '../office-host/host-world'
import type { FocusResult, OfficeSnapshot } from '../shared/office/types'
import { execFilePromise } from './platform/exec'
import type { SessionTracker } from './session-tracker'
import type { TerminalResolver } from './terminal-resolver'
import type { SettingsStore } from './store'
import { rememberBounds, restoreBounds } from './window-bounds'
import { officeChrome } from './window-chrome'
import { runInteractivePowerShell } from '../shared/powershell-host'
import { type AccountLedger, type OfficeAccounts, withAccounts, withoutAccounts } from './accounts'
import { createBrowserOffice } from './office-browser'
import { handoverOf } from '../shared/accounts'
import { loadStaticFiles } from '../office-web/static-files'

type OfficeWindowStore = Pick<SettingsStore, 'getOfficeWindowBounds' | 'setOfficeWindowBounds'>

const DEFAULT_SIZE = { width: 1280, height: 820 }
const MINIMUM_SIZE = { width: 800, height: 560 }

function createOfficeWindow(store: OfficeWindowStore): Electron.BrowserWindow {
  const window = createAppWindow({
    ...restoreBounds(
      store.getOfficeWindowBounds(),
      screen.getAllDisplays().map((display) => display.workArea),
      DEFAULT_SIZE,
      MINIMUM_SIZE
    ),
    minWidth: MINIMUM_SIZE.width,
    minHeight: MINIMUM_SIZE.height,
    title: 'ClaudeWatch Office',
    ...officeChrome(),
    webPreferences: { preload: join(__dirname, '../preload/office.js') }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/office.html`)
  } else {
    window.loadFile(join(__dirname, '../renderer/office.html'))
  }
  rememberBounds(window, (bounds) => store.setOfficeWindowBounds(bounds))
  return window
}

export interface Office {
  open: (options?: { isAtStartup?: boolean }) => void
  openBrowser: () => Promise<void>
  hasBrowserWatchers: () => boolean
  // The bridge runs from start to stop, with or without the Office window.
  start: () => void
  stop: () => void
  snapshot: () => OfficeSnapshot | null
  // How often the bridge polls: live while a window shows its data, slowly otherwise.
  setPollInterval: (intervalMs: number) => void
  // Jumps to the terminal of a process the session tracker lists; `pid` may be renderer input.
  focusSession: (pid: unknown) => Promise<FocusResult>
}

export function setupOffice(
  terminalResolver: Pick<TerminalResolver, 'resolve'>,
  store: OfficeWindowStore,
  tracker: Pick<SessionTracker, 'getInstances'>,
  accounts: OfficeAccounts &
    Pick<
      AccountLedger,
      | 'ingestBridgeMessage'
      | 'observeSessions'
      | 'isWatchingAccounts'
      | 'onWatchingChange'
      | 'onUsageDurable'
    >,
  worldPath = SHARED_WORLD_PATH
): Office {
  const bridge = new BridgeHost({
    spawn: () => {
      // The bridge derives a Codex session's account key only while accounts are watched.
      const args = [
        ...(accounts.isWatchingAccounts ? ['--accounts'] : []),
        '--usage-offsets',
        join(app.getPath('userData'), 'usage-offsets.json')
      ]
      const child = utilityProcess.fork(join(__dirname, 'bridge.js'), args, {
        serviceName: 'ClaudeWatch Office Bridge'
      })
      // The bridge saves transcript offsets only up to a hand-over the ledger has on disk.
      let handed = 0
      let answered = 0
      const stopAnswering = accounts.onUsageDurable(() => {
        if (handed <= answered) return
        answered = handed
        child.postMessage({ type: 'usage-durable', handover: handed })
      })
      // Token counts travel beside the feed, as their own message, and only the ledger reads them.
      child.on('message', (message: unknown) => {
        handed = handoverOf(message, 'usage') ?? handed
        accounts.ingestBridgeMessage(message)
      })
      child.on('exit', stopAnswering)
      return child
    }
  })
  bridge.onMessage(() => accounts.observeSessions(bridge.snapshot()?.sessions ?? []))
  accounts.onWatchingChange(() => bridge.restart())
  const host = withAccounts(bridge, accounts)
  // One saved city for the window, the Browser Office and the standalone ports (health-13).
  const world = createHostWorld(worldPath)
  const controller = new OfficeWindowController({
    host: withWorld(host, world),
    createWindow: () => createOfficeWindow(store),
    activate: () => app.focus({ steal: true })
  })

  // The same service the standalone web Office runs; here IPC carries it.
  const service = createOfficeService({
    host,
    run: execFilePromise,
    terminalOf: async (pid) => (await terminalResolver.resolve(pid)).terminalType,
    isInteractive: true,
    runScript: runInteractivePowerShell,
    world
  })
  const browser = createBrowserOffice({
    loadFiles: () => loadStaticFiles(join(__dirname, '../office-web')),
    launchFolder: join(app.getPath('userData'), 'office-browser'),
    service: createOfficeService({
      host: withoutAccounts(bridge),
      run: execFilePromise,
      terminalOf: async (pid) => (await terminalResolver.resolve(pid)).terminalType,
      isInteractive: false,
      world
    }),
    openExternal: (url) => shell.openExternal(url)
  })
  const paneFocus = new PaneFocus({
    instances: () => tracker.getInstances(),
    processStart: service.processStart,
    paneKeyOf: service.paneKeyOf,
    focusProcess: service.focusProcess
  })

  const handle = (channel: string, listener: Parameters<typeof handleTrusted>[2]): void =>
    handleTrusted('office.html', channel, listener)
  handle('office:send', (_event, sessionKey: unknown, text: unknown) =>
    service.send(sessionKey, text)
  )
  handle('office:respond', (_event, sessionKey: unknown, decision: unknown, fingerprint: unknown) =>
    service.respond(sessionKey, decision, fingerprint)
  )
  handle('office:peek', (_event, sessionKey: unknown) => service.peek(sessionKey))
  handle('office:start', (_event, projectKey: unknown, provider: unknown) =>
    service.startAgent(projectKey, provider)
  )
  handle('office:ready', () => controller.ready())
  handle('office:focus', (_event, agentKey: unknown) => service.focus(agentKey))
  handle('office:world-save', (_event, document: unknown) => service.saveWorld(document))

  return {
    open: (options) => controller.open(options),
    openBrowser: () => browser.open(),
    hasBrowserWatchers: () => browser.hasWatchers(),
    start: () => bridge.start(),
    stop: () => {
      void browser.close().catch(() => console.error('Browser Office could not close.'))
      bridge.stop()
    },
    snapshot: () => host.snapshot(),
    setPollInterval: (intervalMs) => bridge.setPollInterval(intervalMs),
    focusSession: (pid) => paneFocus.focus(pid)
  }
}
