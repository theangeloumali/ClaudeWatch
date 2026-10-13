import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import type { ClaudeInstance, PromoStatus } from '../renderer/lib/types'

const {
  trayListeners,
  popoverListeners,
  popoverState,
  buildFromTemplate,
  trayMock,
  TrayCtor,
  nativeImage,
  popover,
  windows
} = vi.hoisted(() => {
  const popoverListeners = new Map<string, () => void>()
  const popoverState = { visible: false }
  const trayMock = {
    setTitle: vi.fn(),
    setToolTip: vi.fn(),
    popUpContextMenu: vi.fn(),
    destroy: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
    on: vi.fn()
  }
  const popover = {
    on: vi.fn((event: string, listener: () => void) => popoverListeners.set(event, listener)),
    loadFile: vi.fn(),
    isDestroyed: () => false,
    isVisible: () => popoverState.visible,
    setPosition: vi.fn(),
    show: vi.fn(() => {
      popoverState.visible = true
    }),
    hide: vi.fn(() => {
      popoverState.visible = false
    })
  }
  return {
    trayListeners: new Map<string, () => void>(),
    popoverListeners,
    popoverState,
    buildFromTemplate: vi.fn((template: unknown) => template),
    trayMock,
    TrayCtor: vi.fn(() => trayMock),
    nativeImage: {
      createEmpty: vi.fn(() => ({ kind: 'empty' })),
      createFromPath: vi.fn((path: string) => ({ path }))
    },
    popover,
    windows: vi.fn((_options: unknown) => popover)
  }
})
vi.mock('electron', () => ({
  Tray: TrayCtor,
  Menu: { buildFromTemplate },
  nativeImage,
  screen: {
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } })
  }
}))
vi.mock('../../resources/tray/tray.png?asset', () => ({ default: '/res/tray.png' }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('./window-factory', () => ({ createAppWindow: windows }))

import { TrayManager } from './tray'

const instance = (overrides: Partial<ClaudeInstance>): ClaudeInstance => ({
  pid: 1,
  tty: '/dev/ttys001',
  status: 'active',
  cpuPercent: 1,
  memPercent: 1,
  elapsedTime: '00:05:00',
  elapsedSeconds: 300,
  projectPath: '/repo/app',
  projectName: 'app',
  flags: [],
  startedAt: new Date('2026-10-11T09:00:00Z'),
  ...overrides
})
const stats = { total: 2, active: 2, idle: 0, stale: 0, exited: 0, recentlyCompleted: 0 }
const promo = (is2x: boolean): PromoStatus => ({
  is2x,
  promoActive: is2x,
  isWeekend: false,
  currentWindowEnd: null,
  nextWindowStart: null,
  expiresInSeconds: null,
  promoPeriod: '',
  peakHoursLocal: ''
})

const onFocusSession = vi.fn()
const createTray = (platform: NodeJS.Platform = 'darwin'): TrayManager =>
  new TrayManager({
    onOpenDashboard: vi.fn(),
    onFocusSession,
    onQuit: vi.fn(),
    preloadPath: '/preload.js',
    platform,
    store: {
      getPopoverPinned: () => false,
      getPopoverPosition: () => null,
      setPopoverPinned: vi.fn(),
      setPopoverPosition: vi.fn()
    }
  })

beforeEach(() => {
  vi.clearAllMocks()
  trayListeners.clear()
  popoverListeners.clear()
  popoverState.visible = false
  trayMock.on.mockImplementation((event: string, listener: () => void) =>
    trayListeners.set(event, listener)
  )
})

describe('TrayManager context menu', () => {
  let tray: TrayManager

  const openMenu = (): MenuItemConstructorOptions[] => {
    trayListeners.get('right-click')?.()
    return buildFromTemplate.mock.calls.at(-1)?.[0] as MenuItemConstructorOptions[]
  }
  const click = (item: MenuItemConstructorOptions | undefined): void =>
    (item?.click as (() => void) | undefined)?.()

  beforeEach(() => {
    tray = createTray()
  })

  it('jumps to a session when its row is clicked', () => {
    tray.update(
      [instance({ pid: 4242, projectName: 'app' }), instance({ pid: 77, projectName: 'site' })],
      stats
    )
    const menu = openMenu()

    click(menu.find((item) => item.label?.includes('site')))
    expect(onFocusSession).toHaveBeenCalledExactlyOnceWith(77)
    click(menu.find((item) => item.label?.includes('app')))
    expect(onFocusSession).toHaveBeenLastCalledWith(4242)
  })

  it('keeps the headline and the overflow line as plain labels', () => {
    tray.update(
      Array.from({ length: 12 }, (_, index) => instance({ pid: index + 1 })),
      stats
    )
    const labels = openMenu().filter(
      (item) => item.label?.startsWith('ClaudeWatch') || item.label?.includes('more')
    )

    expect(labels).toHaveLength(2)
    for (const label of labels) {
      expect(label.enabled).toBe(false)
      expect(label.click).toBeUndefined()
    }
  })
})

describe('TrayManager on macOS', () => {
  it('shows the live count as the menu bar title, with no icon', () => {
    const tray = createTray('darwin')
    expect(TrayCtor).toHaveBeenCalledWith({ kind: 'empty' })
    expect(trayMock.setTitle).toHaveBeenLastCalledWith('● 0')
    expect(trayMock.setToolTip).toHaveBeenLastCalledWith('ClaudeWatch')

    tray.update([], stats)
    tray.updatePromoStatus(promo(true))
    expect(trayMock.setTitle).toHaveBeenLastCalledWith('2x ● 2')
  })

  it('keeps the popover translucent', () => {
    createTray('darwin')
    expect(windows.mock.calls[0]?.[0]).toMatchObject({ transparent: true, vibrancy: 'popover' })
  })
})

describe('TrayManager on Windows', () => {
  it('shows a real icon, since Windows has no tray title', () => {
    createTray('win32')
    // Electron loads tray@2x.png beside it for high-DPI screens by its suffix.
    expect(nativeImage.createFromPath).toHaveBeenCalledExactlyOnceWith('/res/tray.png')
    expect(TrayCtor).toHaveBeenCalledWith(nativeImage.createFromPath.mock.results[0]?.value)
    expect(trayMock.setTitle).not.toHaveBeenCalled()
  })

  it('carries the live count, and the promo, in the tooltip', () => {
    const tray = createTray('win32')
    expect(trayMock.setToolTip).toHaveBeenLastCalledWith('ClaudeWatch — 0 active')

    tray.update([], stats)
    expect(trayMock.setToolTip).toHaveBeenLastCalledWith('ClaudeWatch — 2 active')
    tray.updatePromoStatus(promo(true))
    expect(trayMock.setToolTip).toHaveBeenLastCalledWith('2x · ClaudeWatch — 2 active')
    expect(trayMock.setTitle).not.toHaveBeenCalled()
  })

  it('opens the popover above a taskbar at the bottom of the screen', () => {
    createTray('win32')
    trayMock.getBounds.mockReturnValue({ x: 1840, y: 1044, width: 24, height: 32 })

    trayListeners.get('click')?.()
    expect(popover.setPosition).toHaveBeenCalledWith(1600, 620)
    expect(popover.show).toHaveBeenCalled()
  })

  it('builds an opaque popover, without the macOS-only material', () => {
    createTray('win32')
    const options = windows.mock.calls[0]?.[0]
    expect(options).toMatchObject({ frame: false, backgroundColor: '#121629' })
    expect(options).not.toHaveProperty('transparent')
    expect(options).not.toHaveProperty('vibrancy')
    expect(options).not.toHaveProperty('visualEffectState')
  })
})

describe('TrayManager tray click while the popover is open', () => {
  const clickTray = (): void => trayListeners.get('click')?.()
  const blurPopover = (): void => popoverListeners.get('blur')?.()

  beforeEach(() => {
    vi.useFakeTimers()
    createTray('win32')
    clickTray()
    expect(popoverState.visible).toBe(true)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes it when the popover loses focus first, as clicking the taskbar does on Windows', () => {
    blurPopover()
    vi.advanceTimersByTime(120)
    clickTray()
    expect(popoverState.visible).toBe(false)
    expect(popover.show).toHaveBeenCalledOnce()
  })

  it('closes it when the click arrives before the popover loses focus', () => {
    clickTray()
    blurPopover()
    expect(popoverState.visible).toBe(false)
    expect(popover.show).toHaveBeenCalledOnce()
  })

  it('opens it again on a later click, once the dismiss has passed', () => {
    blurPopover()
    vi.advanceTimersByTime(400)
    clickTray()
    expect(popoverState.visible).toBe(true)
  })

  it('opens it on the next click after a dismissing one', () => {
    blurPopover()
    clickTray()
    clickTray()
    expect(popoverState.visible).toBe(true)
  })
})
