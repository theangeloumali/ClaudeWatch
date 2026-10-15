import type { FeedMessage, OfficeSnapshot } from '../shared/office/types'
import type { AppSettings } from '../renderer/lib/types'

export function opensOfficeOnStart(
  settings: Pick<AppSettings, 'openOfficeOnLaunch'>,
  argv: readonly string[]
): boolean {
  return settings.openOfficeOnLaunch === true || argv.includes('--open-office')
}

export interface OfficeWindowLike {
  webContents: { send(channel: string, message: FeedMessage | boolean): void }
  focus(): void
  show(): void
  restore(): void
  isMinimized(): boolean
  isVisible?(): boolean
  isDestroyed(): boolean
  on(
    event: 'closed' | 'show' | 'hide' | 'minimize' | 'restore' | 'ready-to-show',
    listener: () => void
  ): unknown
}

interface OfficeWindowDeps {
  host: {
    snapshot(): OfficeSnapshot | null
    onMessage(listener: (message: FeedMessage) => void): () => void
  }
  createWindow: () => OfficeWindowLike
  // Brings the app in front of other apps: a tray app's window otherwise opens behind them.
  activate: () => void
}

// The window only listens to the bridge. The app runs it, because the dashboard reads the
// same data with the Office closed.
export class OfficeWindowController {
  private window: OfficeWindowLike | null = null
  private unsubscribe: (() => void) | null = null

  constructor(private readonly deps: OfficeWindowDeps) {}

  open({ isAtStartup = false } = {}): void {
    // At start-up the window appears without taking the keyboard from the app in use.
    if (!isAtStartup) this.deps.activate()
    if (this.window && !this.window.isDestroyed()) {
      // focus() alone leaves a minimized or hidden window where it is.
      if (this.window.isMinimized()) this.window.restore()
      this.window.show()
      this.window.focus()
      return
    }
    const window = this.deps.createWindow()
    this.window = window
    this.unsubscribe = this.deps.host.onMessage((message) => this.send(message))
    for (const event of ['show', 'hide', 'minimize', 'restore', 'ready-to-show'] as const) {
      window.on(event, () => {
        if (this.window === window) this.sendVisibility()
      })
    }
    window.on('closed', () => {
      if (this.window !== window) return
      this.unsubscribe?.()
      this.unsubscribe = null
      this.window = null
    })
  }

  // The renderer asks for state once it has subscribed, so no hello is lost to a load race.
  ready(): void {
    this.sendVisibility()
    const snapshot = this.deps.host.snapshot()
    if (snapshot) this.send({ type: 'hello', v: 1, snapshot })
  }

  private sendVisibility(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    window.webContents.send(
      'office:visibility',
      (window.isVisible?.() ?? true) && !window.isMinimized()
    )
  }

  private send(message: FeedMessage): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('office:feed', message)
    }
  }
}
