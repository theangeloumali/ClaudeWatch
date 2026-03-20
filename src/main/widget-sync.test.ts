import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { setupWidgetSync } from './widget-sync'

describe('setupWidgetSync', () => {
  it('rewrites widget data when usage updates arrive', async () => {
    const tracker = new EventEmitter() as EventEmitter & {
      getInstances: () => []
      getStats: () => { total: number; active: number; idle: number; stale: number; exited: number }
    }
    tracker.getInstances = () => []
    tracker.getStats = () => ({ total: 0, active: 0, idle: 0, stale: 0, exited: 0 })

    let usageListener: ((data: { dataAvailable: boolean }) => void) | null = null
    const usageReader = {
      getLastData: vi.fn(() => null),
      onUpdate: vi.fn((listener: (data: { dataAvailable: boolean }) => void) => {
        usageListener = listener
        return () => {
          usageListener = null
        }
      })
    }

    const promoChecker = {
      getLastData: vi.fn(() => null)
    }

    const rateLimitReader = {
      getLastData: vi.fn(() => null),
      onUpdate: vi.fn(() => () => {})
    }

    const writer = {
      write: vi.fn().mockResolvedValue(undefined)
    }

    setupWidgetSync({ tracker, usageReader, promoChecker, rateLimitReader, writer })

    usageListener?.({ dataAvailable: true })
    await Promise.resolve()

    expect(writer.write).toHaveBeenCalledTimes(1)
    expect(writer.write).toHaveBeenCalledWith(
      [],
      tracker.getStats(),
      { dataAvailable: true },
      null,
      null
    )
  })
})
