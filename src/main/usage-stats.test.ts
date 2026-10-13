import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockReadFile = vi.hoisted(() => vi.fn())
const mockHomedir = vi.hoisted(() => vi.fn().mockReturnValue('/Users/test'))

vi.mock('fs/promises', () => ({
  readFile: mockReadFile
}))

vi.mock('os', () => ({
  homedir: mockHomedir
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

import { join } from 'path'
import { UsageStatsReader } from './usage-stats'

function makeMockWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() }
  }
}

const validClaudeJson = {
  projects: {
    '/path/to/project-a': {
      lastModelUsage: {
        'claude-opus-4-6': {
          inputTokens: 100,
          outputTokens: 200,
          cacheReadInputTokens: 1000,
          cacheCreationInputTokens: 500,
          costUSD: 1.5
        },
        'claude-sonnet-4-6': {
          inputTokens: 50,
          outputTokens: 30,
          cacheReadInputTokens: 200,
          cacheCreationInputTokens: 100,
          costUSD: 0.5
        }
      },
      lastTotalInputTokens: 1000,
      lastTotalOutputTokens: 2000,
      lastTotalCacheCreationInputTokens: 3000,
      lastTotalCacheReadInputTokens: 4000
    },
    '/path/to/project-b': {
      lastModelUsage: {
        'claude-opus-4-6': {
          inputTokens: 200,
          outputTokens: 300,
          cacheReadInputTokens: 500,
          cacheCreationInputTokens: 250,
          costUSD: 2.0
        }
      },
      lastTotalInputTokens: 500,
      lastTotalOutputTokens: 800,
      lastTotalCacheCreationInputTokens: 1000,
      lastTotalCacheReadInputTokens: 2000
    }
  }
}

describe('UsageStatsReader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads and aggregates usage across multiple projects', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    expect(stats.dataAvailable).toBe(true)
    // Totals: 1000+500=1500 input, 2000+800=2800 output
    expect(stats.totalInputTokens).toBe(1500)
    expect(stats.totalOutputTokens).toBe(2800)
    expect(stats.totalCacheCreationTokens).toBe(4000) // 3000+1000
    expect(stats.totalCacheReadTokens).toBe(6000) // 4000+2000
  })

  it('aggregates cost from per-model usage across projects', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    // opus: 1.5+2.0=3.5, sonnet: 0.5 → total=4.0
    expect(stats.totalCostUSD).toBeCloseTo(4.0)
  })

  it('aggregates per-model usage across projects', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    expect(stats.modelUsage).toHaveLength(2)

    const opus = stats.modelUsage.find((m) => m.model === 'claude-opus-4-6')
    expect(opus).toBeTruthy()
    expect(opus!.inputTokens).toBe(300) // 100+200
    expect(opus!.outputTokens).toBe(500) // 200+300
    expect(opus!.costUSD).toBeCloseTo(3.5) // 1.5+2.0

    const sonnet = stats.modelUsage.find((m) => m.model === 'claude-sonnet-4-6')
    expect(sonnet).toBeTruthy()
    expect(sonnet!.inputTokens).toBe(50)
    expect(sonnet!.costUSD).toBeCloseTo(0.5)
  })

  it('sorts model usage by cost descending', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    expect(stats.modelUsage[0].model).toBe('claude-opus-4-6')
    expect(stats.modelUsage[1].model).toBe('claude-sonnet-4-6')
  })

  it('returns dataAvailable=false when file is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'))

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    expect(stats.dataAvailable).toBe(false)
    expect(stats.totalCostUSD).toBe(0)
    expect(stats.modelUsage).toEqual([])
  })

  it('returns dataAvailable=false for malformed JSON', async () => {
    mockReadFile.mockResolvedValue('not json {{{')

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    expect(stats.dataAvailable).toBe(false)
  })

  it('returns dataAvailable=false when projects key is missing', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ someOtherKey: true }))

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    expect(stats.dataAvailable).toBe(false)
  })

  it('handles single project', async () => {
    const singleProject = {
      projects: {
        '/path/to/only': {
          lastModelUsage: {
            'claude-opus-4-6': {
              inputTokens: 18,
              outputTokens: 1662,
              cacheReadInputTokens: 319709,
              cacheCreationInputTokens: 129761,
              costUSD: 1.01
            }
          },
          lastTotalInputTokens: 1981851,
          lastTotalOutputTokens: 2697252,
          lastTotalCacheCreationInputTokens: 33421405,
          lastTotalCacheReadInputTokens: 455842215
        }
      }
    }
    mockReadFile.mockResolvedValue(JSON.stringify(singleProject))

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    expect(stats.totalInputTokens).toBe(1981851)
    expect(stats.totalOutputTokens).toBe(2697252)
    expect(stats.totalCostUSD).toBeCloseTo(1.01)
    expect(stats.modelUsage).toHaveLength(1)
  })

  it('broadcasts to windows on read', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))
    const win = makeMockWindow()
    const reader = new UsageStatsReader([() => win as unknown as Electron.BrowserWindow])
    await reader.read()

    expect(win.webContents.send).toHaveBeenCalledWith(
      'usage:update',
      expect.objectContaining({ dataAvailable: true })
    )
  })

  it('skips destroyed windows', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))
    const destroyed = makeMockWindow(true)
    const live = makeMockWindow(false)
    const reader = new UsageStatsReader([
      () => destroyed as unknown as Electron.BrowserWindow,
      () => live as unknown as Electron.BrowserWindow
    ])
    await reader.read()

    expect(destroyed.webContents.send).not.toHaveBeenCalled()
    expect(live.webContents.send).toHaveBeenCalled()
  })

  it('skips null windows', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))
    const live = makeMockWindow()
    const reader = new UsageStatsReader([
      () => null,
      () => live as unknown as Electron.BrowserWindow
    ])
    await reader.read()

    expect(live.webContents.send).toHaveBeenCalled()
  })

  it('getLastData returns last read result', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))
    const reader = new UsageStatsReader([])
    await reader.read()

    const last = reader.getLastData()
    expect(last).toBeTruthy()
    expect(last!.dataAvailable).toBe(true)
  })

  it('getLastData returns null before first read', () => {
    const reader = new UsageStatsReader([])
    expect(reader.getLastData()).toBeNull()
  })

  it('startPolling reads periodically', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))
    const win = makeMockWindow()
    const reader = new UsageStatsReader([() => win as unknown as Electron.BrowserWindow])
    reader.startPolling(30_000)

    // Let the initial read complete
    await vi.advanceTimersByTimeAsync(0)
    expect(win.webContents.send).toHaveBeenCalledTimes(1)

    // After interval
    await vi.advanceTimersByTimeAsync(30_000)
    expect(win.webContents.send).toHaveBeenCalledTimes(2)

    reader.stopPolling()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(win.webContents.send).toHaveBeenCalledTimes(2)
  })

  it('notifies update listeners after a successful read', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))

    const reader = new UsageStatsReader([])
    const listener = vi.fn()
    reader.onUpdate(listener)

    await reader.read()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ dataAvailable: true }))
  })

  it('handles projects with missing lastModelUsage gracefully', async () => {
    const data = {
      projects: {
        '/path/to/project': {
          lastTotalInputTokens: 100,
          lastTotalOutputTokens: 200,
          lastTotalCacheCreationInputTokens: 300,
          lastTotalCacheReadInputTokens: 400
        }
      }
    }
    mockReadFile.mockResolvedValue(JSON.stringify(data))

    const reader = new UsageStatsReader([])
    const stats = await reader.read()

    expect(stats.dataAvailable).toBe(true)
    expect(stats.totalInputTokens).toBe(100)
    expect(stats.totalCostUSD).toBe(0)
    expect(stats.modelUsage).toEqual([])
  })

  it('reads from correct file path', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(validClaudeJson))
    const reader = new UsageStatsReader([])
    await reader.read()

    // path.join uses the host separator.
    expect(mockReadFile).toHaveBeenCalledWith(join('/Users/test', '.claude.json'), 'utf-8')
  })
})
