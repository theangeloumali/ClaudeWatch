import {
  Tray,
  BrowserWindow,
  Menu,
  nativeImage,
  type NativeImage,
  screen,
  MenuItemConstructorOptions
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { ClaudeInstance, InstanceUpdate, PromoStatus } from '../renderer/lib/types'

interface TrayManagerOptions {
  onOpenDashboard: () => void
  onQuit: () => void
  onCheckForUpdates?: () => void
  preloadPath: string
}

const STATUS_EMOJI: Record<ClaudeInstance['status'], string> = {
  active: '\uD83D\uDFE2',
  idle: '\uD83D\uDFE1',
  stale: '\u26AA',
  exited: '\uD83D\uDD34'
}

const POPOVER_WIDTH = 320
const POPOVER_HEIGHT = 420

export class TrayManager {
  private tray: Tray | null = null
  private popover: BrowserWindow | null = null
  private onOpenDashboard: () => void
  private onQuit: () => void
  private onCheckForUpdates?: () => void
  private preloadPath: string
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
    this.onQuit = options.onQuit
    this.onCheckForUpdates = options.onCheckForUpdates
    this.preloadPath = options.preloadPath
    this.createTray()
    this.createPopover()
  }

  private createTray(): void {
    const icon = this.buildTrayImage(0, false)
    this.tray = new Tray(icon)
    this.tray.setTitle('\u25CB 0')
    this.tray.setToolTip('ClaudeWatch')

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

  private buildTrayImage(activeCount: number, is2x: boolean): NativeImage {
    const size = 20
    const isLinux = process.platform === 'linux'

    const activeColor = isLinux ? '#22c55e' : 'black'
    const idleColor = isLinux ? '#f59e0b' : 'black'
    const staleColor = isLinux ? '#ef4444' : 'black'

    const content =
      activeCount > 0
        ? `<circle cx="10" cy="10" r="5.4" fill="${activeColor}" />`
        : `<circle cx="10" cy="10" r="5.4" fill="none" stroke="${idleColor}" stroke-width="2.1" /><rect x="6.6" y="9.1" width="6.8" height="1.8" rx="0.9" fill="${idleColor}" />`

    const boostBadge = is2x
      ? `<circle cx="15.6" cy="4.4" r="2.7" fill="${staleColor}" /><path d="M15.7 2.3L14.7 4.1h1l-0.6 1.9 1.7-2.1h-1.1l0.1-1.6z" fill="white" />`
      : ''

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20">${content}${boostBadge}</svg>`
    const image = nativeImage.createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    )

    if (process.platform === 'darwin') {
      image.setTemplateImage(true)
    }

    return image
  }

  private createPopover(): void {
    const isMac = process.platform === 'darwin'
    this.popover = new BrowserWindow({
      width: POPOVER_WIDTH,
      height: POPOVER_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      transparent: true,
      ...(isMac && {
        vibrancy: 'popover' as const,
        visualEffectState: 'active' as const,
        roundedCorners: true
      }),
      webPreferences: {
        preload: this.preloadPath,
        sandbox: false,
        contextIsolation: true
      }
    })

    // Hide on blur
    this.popover.on('blur', () => {
      this.hidePopover()
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

    if (this.popover.isVisible()) {
      this.hidePopover()
    } else {
      this.showPopover()
    }
  }

  private showPopover(): void {
    if (!this.popover || this.popover.isDestroyed() || !this.tray) return

    const trayBounds = this.tray.getBounds()
    const display = screen.getDisplayNearestPoint({
      x: trayBounds.x,
      y: trayBounds.y
    })

    // Position below tray icon, centered horizontally
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - POPOVER_WIDTH / 2)
    const y = trayBounds.y + trayBounds.height + 4

    // Clamp to screen bounds
    const clampedX = Math.max(
      display.workArea.x,
      Math.min(x, display.workArea.x + display.workArea.width - POPOVER_WIDTH)
    )

    this.popover.setPosition(clampedX, y)
    this.popover.show()
  }

  private hidePopover(): void {
    if (this.popover && !this.popover.isDestroyed() && this.popover.isVisible()) {
      this.popover.hide()
    }
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
        enabled: false
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

    this.tray.setImage(this.buildTrayImage(this.stats.active, Boolean(this.promoStatus?.is2x)))

    const prefix = this.promoStatus?.is2x ? '2x ' : ''
    if (this.stats.active > 0) {
      this.tray.setTitle(`${prefix}\u25CF ${this.stats.active}`)
      return
    }

    this.tray.setTitle(`${prefix}\u25CB 0`)
  }

  getPopoverWindow(): BrowserWindow | null {
    return this.popover
  }

  destroy(): void {
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
