import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useInstances } from '../hooks/useInstances'
import type { ClaudeInstance, InstanceUpdate } from '../lib/types'

const mockInstance = (overrides: Partial<ClaudeInstance> = {}): ClaudeInstance => ({
  pid: 1234,
  tty: '/dev/ttys001',
  status: 'active',
  cpuPercent: 12.5,
  memPercent: 3.2,
  elapsedTime: '5:30',
  elapsedSeconds: 330,
  projectPath: '/Users/test/projects/my-app',
  projectName: 'projects/my-app',
  flags: ['--model', 'opus'],
  sessionId: 'abc-123',
  startedAt: new Date('2026-03-18T10:00:00'),
  lastStatusChange: new Date('2026-03-18T10:05:00'),
  ...overrides
})

const mockUpdate: InstanceUpdate = {
  instances: [
    mockInstance(),
    mockInstance({
      pid: 5678,
      status: 'idle',
      projectPath: '/Users/test/projects/other',
      projectName: 'projects/other'
    }),
    mockInstance({
      pid: 9999,
      status: 'exited',
      projectPath: '/Users/test/projects/done',
      projectName: 'projects/done'
    })
  ],
  stats: { total: 3, active: 1, idle: 1, exited: 1, recentlyCompleted: 0 }
}

describe('useInstances', () => {
  let unsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    unsubscribe = vi.fn()
    window.api = {
      getInstances: vi.fn().mockResolvedValue(mockUpdate),
      getSettings: vi.fn(),
      setSettings: vi.fn(),
      getHistory: vi.fn(),
      clearHistory: vi.fn(),
      openDashboard: vi.fn(),
      quit: vi.fn(),
      onInstancesUpdate: vi.fn().mockReturnValue(unsubscribe)
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error -- cleanup
    delete window.api
  })

  it('fetches initial instances on mount', async () => {
    const { result } = renderHook(() => useInstances())

    await waitFor(() => {
      expect(result.current.instances.length).toBe(3)
    })
    expect(result.current.stats.total).toBe(3)
    expect(window.api.getInstances).toHaveBeenCalledOnce()
  })

  it('subscribes to instance updates on mount and unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useInstances())

    await waitFor(() => {
      expect(window.api.onInstancesUpdate).toHaveBeenCalledOnce()
    })

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('updates instances when onInstancesUpdate fires', async () => {
    const { result } = renderHook(() => useInstances())

    await waitFor(() => {
      expect(result.current.instances.length).toBe(3)
    })

    const newUpdate: InstanceUpdate = {
      instances: [mockInstance({ pid: 1111, status: 'active' })],
      stats: { total: 1, active: 1, idle: 0, exited: 0, recentlyCompleted: 0 }
    }

    const callback = (window.api.onInstancesUpdate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    act(() => {
      callback(newUpdate)
    })

    expect(result.current.instances.length).toBe(1)
    expect(result.current.stats.total).toBe(1)
  })

  it('filters instances by status', async () => {
    const { result } = renderHook(() => useInstances())

    await waitFor(() => {
      expect(result.current.instances.length).toBe(3)
    })

    act(() => {
      result.current.setFilter('active')
    })

    expect(result.current.filteredInstances.length).toBe(1)
    expect(result.current.filteredInstances[0].status).toBe('active')
  })

  it('filters instances by search query', async () => {
    const { result } = renderHook(() => useInstances())

    await waitFor(() => {
      expect(result.current.instances.length).toBe(3)
    })

    act(() => {
      result.current.setSearchQuery('other')
    })

    expect(result.current.filteredInstances.length).toBe(1)
    expect(result.current.filteredInstances[0].projectName).toBe('projects/other')
  })

  it('combines filter and search', async () => {
    const { result } = renderHook(() => useInstances())

    await waitFor(() => {
      expect(result.current.instances.length).toBe(3)
    })

    act(() => {
      result.current.setFilter('idle')
      result.current.setSearchQuery('other')
    })

    expect(result.current.filteredInstances.length).toBe(1)

    act(() => {
      result.current.setFilter('active')
    })

    // active + "other" search = no match
    expect(result.current.filteredInstances.length).toBe(0)
  })

  it("returns all instances when filter is 'all'", async () => {
    const { result } = renderHook(() => useInstances())

    await waitFor(() => {
      expect(result.current.instances.length).toBe(3)
    })

    act(() => {
      result.current.setFilter('all')
    })

    expect(result.current.filteredInstances.length).toBe(3)
  })

  describe('groupedInstances', () => {
    it('groups active instances as inProgress', async () => {
      const { result } = renderHook(() => useInstances())

      await waitFor(() => {
        expect(result.current.instances.length).toBe(3)
      })

      expect(result.current.groupedInstances.inProgress.length).toBe(1)
      expect(result.current.groupedInstances.inProgress[0].status).toBe('active')
    })

    it('groups idle instances without lastBecameIdleAt as waiting', async () => {
      const { result } = renderHook(() => useInstances())

      await waitFor(() => {
        expect(result.current.instances.length).toBe(3)
      })

      // The idle instance has no lastBecameIdleAt, so it goes to waiting
      const waitingIdle = result.current.groupedInstances.waiting.filter((i) => i.status === 'idle')
      expect(waitingIdle.length).toBe(1)
    })

    it('groups idle instances with recent lastBecameIdleAt as recentlyCompleted', async () => {
      const recentUpdate: InstanceUpdate = {
        instances: [
          mockInstance({
            pid: 2222,
            status: 'idle',
            lastBecameIdleAt: new Date() // just now
          })
        ],
        stats: { total: 1, active: 0, idle: 1, exited: 0, recentlyCompleted: 1 }
      }

      ;(window.api.getInstances as ReturnType<typeof vi.fn>).mockResolvedValue(recentUpdate)

      const { result } = renderHook(() => useInstances())

      await waitFor(() => {
        expect(result.current.instances.length).toBe(1)
      })

      expect(result.current.groupedInstances.recentlyCompleted.length).toBe(1)
      expect(result.current.groupedInstances.waiting.length).toBe(0)
    })

    it('groups idle instances with old lastBecameIdleAt as waiting', async () => {
      const oldDate = new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
      const oldUpdate: InstanceUpdate = {
        instances: [
          mockInstance({
            pid: 3333,
            status: 'idle',
            lastBecameIdleAt: oldDate
          })
        ],
        stats: { total: 1, active: 0, idle: 1, exited: 0, recentlyCompleted: 0 }
      }

      ;(window.api.getInstances as ReturnType<typeof vi.fn>).mockResolvedValue(oldUpdate)

      const { result } = renderHook(() => useInstances())

      await waitFor(() => {
        expect(result.current.instances.length).toBe(1)
      })

      expect(result.current.groupedInstances.recentlyCompleted.length).toBe(0)
      expect(result.current.groupedInstances.waiting.length).toBe(1)
    })
  })

  it('handles missing window.api gracefully', async () => {
    // @ts-expect-error -- cleanup
    delete window.api

    const { result } = renderHook(() => useInstances())

    expect(result.current.instances).toEqual([])
    expect(result.current.stats).toEqual({
      total: 0,
      active: 0,
      idle: 0,
      stale: 0,
      exited: 0,
      recentlyCompleted: 0
    })
  })
})
