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
    const isLinux = process.platform === 'linux'

    if (isLinux) {
      return this.buildLinuxTrayImage(activeCount, is2x)
    }

    // macOS: monochrome SVG template image (adapts to light/dark menu bar)
    const size = 18
    const stroke = is2x ? 2.3 : 1.9
    const content =
      activeCount > 0
        ? '<circle cx="9" cy="9" r="5" fill="black" />'
        : `<circle cx="9" cy="9" r="5" fill="none" stroke="black" stroke-width="${stroke}" /><rect x="6.4" y="8.2" width="5.2" height="1.6" rx="0.8" fill="black" />`
    const badge = is2x
      ? '<path d="M13.8 2.4L11.5 6h2l-1.1 3.6 3.1-4.1h-2.1l0.4-3.1z" fill="black" />'
      : ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 18 18">${content}${badge}</svg>`
    const image = nativeImage.createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    )
    image.setTemplateImage(true)
    return image
  }

  /**
   * Linux tray icon built as a raw RGBA PNG using only Node.js built-ins —
   * no native rasterizer needed, no SVG dataURL (unsupported on Linux Electron).
   */
  private buildLinuxTrayImage(activeCount: number, is2x: boolean): NativeImage {
    const SIZE = 22
    const CX = 11
    const CY = 11
    const R = 6

    // RGBA pixel buffer
    const buf = Buffer.alloc(SIZE * SIZE * 4, 0)

    // Color: green when active, amber when idle
    const [fr, fg, fb] =
      activeCount > 0 ? [0x22, 0xc5, 0x5e] : [0xf5, 0x9e, 0x0b]

    const set = (x: number, y: number, r: number, g: number, b: number, a: number): void => {
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
      const i = (y * SIZE + x) * 4
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a
    }

    if (activeCount > 0) {
      // Filled circle
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const dx = x - CX + 0.5
          const dy = y - CY + 0.5
          const dist = Math.sqrt(dx * dx + dy * dy)
          const alpha = Math.max(0, Math.min(1, R + 0.5 - dist))
          set(x, y, fr, fg, fb, Math.round(alpha * 255))
        }
      }
    } else {
      // Outlined ring + horizontal dash (idle)
      const RING = 1.7
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const dx = x - CX + 0.5
          const dy = y - CY + 0.5
          const dist = Math.sqrt(dx * dx + dy * dy)
          // Anti-aliased ring
          const outer = R + 0.5 - dist
          const inner = dist - (R - RING) - 0.5
          const alpha = Math.max(0, Math.min(1, outer), Math.min(1, inner)) > 0
            ? Math.min(Math.max(0, Math.min(1, outer)), Math.max(0, Math.min(1, inner)))
            : 0
          if (alpha > 0) set(x, y, fr, fg, fb, Math.round(alpha * 255))
        }
      }
      // Center dash (3×1 rounded rect)
      for (let x = CX - 3; x <= CX + 3; x++) {
        set(x, CY, fr, fg, fb, 255)
        set(x, CY - 1, fr, fg, fb, 200)
      }
    }

    // 2× badge: small red dot in top-right corner
    if (is2x) {
      const BX = SIZE - 4
      const BY = 3
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const dx = x - BX + 0.5
          const dy = y - BY + 0.5
          const dist = Math.sqrt(dx * dx + dy * dy)
          const alpha = Math.max(0, Math.min(1, 2.8 - dist))
          if (alpha > 0) set(x, y, 0xef, 0x44, 0x44, Math.round(alpha * 255))
        }
      }
    }

    return nativeImage.createFromBuffer(buf, { width: SIZE, height: SIZE })
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
