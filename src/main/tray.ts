import { createAppWindow } from './window-factory'
import {
  Tray,
  BrowserWindow,
  Menu,
  nativeImage,
  screen,
  MenuItemConstructorOptions
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { ClaudeInstance, InstanceUpdate, PromoStatus } from '../renderer/lib/types'
import type { SettingsStore } from './store'
import { isOnAnyDisplay, popoverPosition } from './window-bounds'
import { popoverChrome } from './window-chrome'
import trayIconPath from '../../resources/tray/tray.png?asset'

interface TrayManagerOptions {
  onOpenDashboard: () => void
  onOpenOffice?: () => void
  onFocusSession: (pid: number) => void
  onQuit: () => void
  onCheckForUpdates?: () => void
  preloadPath: string
  platform?: NodeJS.Platform
  store: Pick<
    SettingsStore,
    'getPopoverPinned' | 'getPopoverPosition' | 'setPopoverPinned' | 'setPopoverPosition'
  >
}

const STATUS_EMOJI: Record<ClaudeInstance['status'], string> = {
  active: '\uD83D\uDFE2',
  idle: '\uD83D\uDFE1',
  stale: '\u26AA',
  exited: '\uD83D\uDD34'
}

const POPOVER_WIDTH = 320
const POPOVER_HEIGHT = 420
// Clicking the tray blurs the popover before the click event arrives (Windows); a click this
// soon after a blur-hide is that same gesture, so it dismisses instead of reopening.
const BLUR_CLICK_WINDOW_MS = 300

export class TrayManager {
  private tray: Tray | null = null
  private popover: BrowserWindow | null = null
  private onOpenDashboard: () => void
  private onOpenOffice?: () => void
  private onFocusSession: (pid: number) => void
  private onQuit: () => void
  private onCheckForUpdates?: () => void
  private preloadPath: string
  private platform: NodeJS.Platform
  private store: TrayManagerOptions['store']
  private pinned = false
  private blurHiddenAt: number | null = null
  private positionSaveTimeout: ReturnType<typeof setTimeout> | null = null
  private instances: ClaudeInstance[] = []
  private stats: InstanceUpdate['stats'] = {
    total: 0,
    active: 0,
    idle: 0,
    stale: 0,
    exited: 0,
    recentlyCompleted: 0
  }
  private promoStatus: PromoStatus | null = null

  constructor(options: TrayManagerOptions) {
    this.onOpenDashboard = options.onOpenDashboard
    this.onOpenOffice = options.onOpenOffice
    this.onFocusSession = options.onFocusSession
    this.onQuit = options.onQuit
    this.onCheckForUpdates = options.onCheckForUpdates
    this.preloadPath = options.preloadPath
    this.platform = options.platform ?? process.platform
    this.store = options.store
    this.pinned = this.store.getPopoverPinned()
    this.createTray()
    this.createPopover()
  }

  // macOS shows the count as the menu bar title; Windows has no tray title, so it needs a real icon.
  private hasTitle(): boolean {
    return this.platform === 'darwin'
  }

  private createTrayIcon(): Electron.NativeImage {
    if (this.hasTitle()) return nativeImage.createEmpty()
    // resources/ is electron-vite's public dir, so names are kept and tray@2x.png loads by suffix.
    return nativeImage.createFromPath(trayIconPath)
  }

  private createTray(): void {
    this.tray = new Tray(this.createTrayIcon())
    if (this.hasTitle()) this.tray.setToolTip('ClaudeWatch')
    this.updateTrayTitle()

    // Hover → show popover
    this.tray.on('mouse-enter', () => {
      this.showPopover()
    })

    // Click → toggle popover (fallback for accessibility)
    this.tray.on('click', () => {
      this.togglePopover()
    })

    // Right click → context menu
    this.tray.on('right-click', () => {
      this.showContextMenu()
    })
  }

  private createPopover(): void {
    this.popover = createAppWindow({
      width: POPOVER_WIDTH,
      height: POPOVER_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: this.pinned,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      ...popoverChrome(this.platform),
      roundedCorners: true,
      alwaysOnTop: this.pinned,
      webPreferences: {
        preload: this.preloadPath
      }
    })

    if (this.pinned) {
      this.popover.setAlwaysOnTop(true, 'floating')
    }

    // Hide on blur (only when not pinned)
    this.popover.on('blur', () => {
      if (!this.pinned && this.popover?.isVisible()) {
        this.blurHiddenAt = Date.now()
        this.hidePopover()
      }
    })

    // Save position when moved (debounced, only when pinned)
    this.popover.on('moved', () => {
      if (!this.pinned || !this.popover || this.popover.isDestroyed()) return
      if (this.positionSaveTimeout) clearTimeout(this.positionSaveTimeout)
      this.positionSaveTimeout = setTimeout(() => {
        if (this.popover && !this.popover.isDestroyed()) {
          const [x, y] = this.popover.getPosition()
          this.store.setPopoverPosition({ x, y })
        }
      }, 300)
    })

    // Load the renderer with #popover hash
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.popover.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#popover`)
    } else {
      this.popover.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'popover' })
    }
  }

  private togglePopover(): void {
    if (!this.popover || this.popover.isDestroyed()) return

    const hiddenByThisClick =
      this.blurHiddenAt !== null && Date.now() - this.blurHiddenAt < BLUR_CLICK_WINDOW_MS
    this.blurHiddenAt = null
    if (hiddenByThisClick) return

    if (this.popover.isVisible()) {
      this.hidePopover()
    } else {
      this.showPopover()
    }
  }

  private showPopover(): void {
    if (!this.popover || this.popover.isDestroyed() || !this.tray) return

    if (this.pinned) {
      const savedPos = this.store.getPopoverPosition()
      if (savedPos && this.isPositionOnScreen(savedPos.x, savedPos.y)) {
        this.popover.setPosition(savedPos.x, savedPos.y)
        this.popover.show()
        return
      }
    }

    this.positionPopoverAtTray()
    this.popover.show()
  }

  private hidePopover(): void {
    if (this.popover && !this.popover.isDestroyed() && this.popover.isVisible()) {
      this.popover.hide()
    }
  }

  private positionPopoverAtTray(): void {
    if (!this.popover || this.popover.isDestroyed() || !this.tray) return

    const trayBounds = this.tray.getBounds()
    const display = screen.getDisplayNearestPoint({
      x: trayBounds.x,
      y: trayBounds.y
    })
    const { x, y } = popoverPosition(trayBounds, display.workArea, {
      width: POPOVER_WIDTH,
      height: POPOVER_HEIGHT
    })
    this.popover.setPosition(x, y)
  }

  private isPositionOnScreen(x: number, y: number): boolean {
    // On screen means at least a 50 px corner of the popover can be grabbed.
    return isOnAnyDisplay(
      { x, y, width: 50, height: 50 },
      screen.getAllDisplays().map((display) => display.workArea)
    )
  }

  setPinned(pinned: boolean): void {
    if (!this.popover || this.popover.isDestroyed()) return

    this.pinned = pinned
    this.popover.setAlwaysOnTop(pinned, pinned ? 'floating' : 'normal')
    this.popover.setMovable(pinned)
    this.store.setPopoverPinned(pinned)
    this.popover.webContents.send('popover:pin-changed', pinned)

    if (!pinned) {
      this.store.setPopoverPosition(null)
      if (this.popover.isVisible()) {
        this.positionPopoverAtTray()
      }
    }
  }

  isPinned(): boolean {
    return this.pinned
  }

  /** Close the popover (unpin + hide) */
  closePopover(): void {
    this.setPinned(false)
    this.hidePopover()
  }

  private showContextMenu(): void {
    if (!this.tray) return

    const menuItems: MenuItemConstructorOptions[] = []

    if (this.promoStatus?.is2x && this.promoStatus.expiresInSeconds != null) {
      const h = Math.floor(this.promoStatus.expiresInSeconds / 3600)
      const m = Math.floor((this.promoStatus.expiresInSeconds % 3600) / 60)
      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`
      menuItems.push({
        label: `2x Active \u2014 expires in ${timeStr}`,
        enabled: false
      })
      menuItems.push({ type: 'separator' })
    }

    menuItems.push({
      label: `ClaudeWatch \u2014 ${this.stats.total} instance${this.stats.total !== 1 ? 's' : ''}`,
      enabled: false
    })
    menuItems.push({ type: 'separator' })

    const maxShown = 10
    const shown = this.instances.slice(0, maxShown)
    for (const inst of shown) {
      const emoji = STATUS_EMOJI[inst.status] ?? '\u26AA'
      menuItems.push({
        label: `${emoji} ${inst.projectName} \u2014 ${inst.elapsedTime}`,
        click: () => this.onFocusSession(inst.pid)
      })
    }
    if (this.instances.length > maxShown) {
      menuItems.push({
        label: `  +${this.instances.length - maxShown} more`,
        enabled: false
      })
    }

    if (this.instances.length > 0) {
      menuItems.push({ type: 'separator' })
    }

    menuItems.push({
      label: 'Open Dashboard',
      click: () => this.onOpenDashboard()
    })
    if (this.onOpenOffice) {
      menuItems.push({
        label: 'Open Office',
        click: () => this.onOpenOffice?.()
      })
    }
    if (this.onCheckForUpdates) {
      menuItems.push({
        label: 'Check for Updates',
        click: () => this.onCheckForUpdates?.()
      })
    }
    menuItems.push({ type: 'separator' })
    menuItems.push({
      label: 'Quit',
      click: () => this.onQuit()
    })

    const contextMenu = Menu.buildFromTemplate(menuItems)
    this.tray.popUpContextMenu(contextMenu)
  }

  update(instances: ClaudeInstance[], stats: InstanceUpdate['stats']): void {
    if (!this.tray) return

    this.instances = instances
    this.stats = stats

    this.updateTrayTitle()
  }

  updatePromoStatus(promo: PromoStatus): void {
    this.promoStatus = promo
    this.updateTrayTitle()
  }

  private updateTrayTitle(): void {
    if (!this.tray) return

    const is2x = this.promoStatus?.is2x === true
    if (this.hasTitle()) {
      this.tray.setTitle(`${is2x ? '2x ' : ''}\u25CF ${this.stats.active}`)
      return
    }
    const prefix = is2x ? '2x \u00B7 ' : ''
    this.tray.setToolTip(`${prefix}ClaudeWatch \u2014 ${this.stats.active} active`)
  }

  /** Show the popover programmatically (e.g., on dashboard minimize) */
  show(): void {
    this.showPopover()
  }

  getPopoverWindow(): BrowserWindow | null {
    return this.popover
  }

  destroy(): void {
    if (this.positionSaveTimeout) {
      clearTimeout(this.positionSaveTimeout)
      this.positionSaveTimeout = null
    }
    if (this.popover) {
      this.popover.destroy()
      this.popover = null
    }
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
