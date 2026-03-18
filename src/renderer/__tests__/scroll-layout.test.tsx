import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { DEFAULT_SETTINGS } from '../lib/types'
import { Header } from '../components/Header'
import { Settings } from '../components/Settings'
import { Dashboard } from '../components/Dashboard'

const { mockUseSettings, mockUseUpdater, mockUseInstances, mockUseUsage, mockUsePromoStatus } =
  vi.hoisted(() => ({
    mockUseSettings: vi.fn(),
    mockUseUpdater: vi.fn(),
    mockUseInstances: vi.fn(),
    mockUseUsage: vi.fn(),
    mockUsePromoStatus: vi.fn()
  }))

vi.mock('../hooks/useSettings', () => ({
  useSettings: mockUseSettings
}))

vi.mock('../hooks/useUpdater', () => ({
  useUpdater: mockUseUpdater
}))

vi.mock('../hooks/useInstances', () => ({
  useInstances: mockUseInstances
}))

vi.mock('../hooks/useUsage', () => ({
  useUsage: mockUseUsage
}))

vi.mock('../hooks/usePromoStatus', () => ({
  usePromoStatus: mockUsePromoStatus
}))

describe('scroll layout contract', () => {
  beforeEach(() => {
    mockUseSettings.mockReturnValue({
      settings: DEFAULT_SETTINGS,
      updateSettings: vi.fn(),
      loading: false
    })

    mockUseUpdater.mockReturnValue({
      status: 'idle',
      updateInfo: null,
      progress: null,
      error: null,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn()
    })

    mockUseInstances.mockReturnValue({
      instances: [],
      stats: {
        total: 0,
        active: 0,
        idle: 0,
        stale: 0,
        exited: 0,
        recentlyCompleted: 0
      },
      filter: 'all',
      setFilter: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      filteredInstances: [],
      groupedInstances: {
        recentlyCompleted: [],
        inProgress: [],
        waiting: [],
        stale: []
      }
    })

    mockUseUsage.mockReturnValue({
      usage: null,
      loading: false,
      refresh: vi.fn(),
      showModelBreakdown: false,
      setShowModelBreakdown: vi.fn()
    })

    mockUsePromoStatus.mockReturnValue({
      promo: null
    })

    Reflect.deleteProperty(window, 'api')
  })

  it('renders settings inside a dedicated no-drag scroll region', () => {
    render(<Settings />)

    const scrollRegion = screen.getByTestId('settings-scroll-region')

    expect(scrollRegion.className).toContain('min-h-0')
    expect(scrollRegion.className).toContain('overflow-y-auto')
    expect(scrollRegion.className).toContain('no-drag')
  })

  it('renders dashboard results inside a dedicated no-drag scroll region', () => {
    render(<Dashboard />)

    const scrollRegion = screen.getByTestId('dashboard-scroll-region')

    expect(scrollRegion.className).toContain('min-h-0')
    expect(scrollRegion.className).toContain('overflow-y-auto')
    expect(scrollRegion.className).toContain('no-drag')
    expect(within(scrollRegion).getByText('Instances')).toBeInTheDocument()
    expect(within(scrollRegion).getByLabelText('Search instances')).toBeInTheDocument()
    expect(within(scrollRegion).getByText('No instances found')).toBeInTheDocument()
  })

  it('makes only the header draggable', () => {
    render(<Header currentView="dashboard" onViewChange={vi.fn()} />)

    expect(screen.getByRole('banner').className).toContain('drag-region')
  })

  it('keeps the app shell non-draggable while switching scrollable views', () => {
    render(<App />)

    expect(screen.getByRole('main').className).toContain('no-drag')
    expect(screen.getByTestId('dashboard-scroll-region')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Settings'))

    expect(screen.getByTestId('settings-scroll-region')).toBeInTheDocument()
  })
})
