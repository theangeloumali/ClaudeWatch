import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockReadFile = vi.hoisted(() => vi.fn())
const mockCopyFile = vi.hoisted(() => vi.fn())
const mockChmod = vi.hoisted(() => vi.fn())
const mockHomedir = vi.hoisted(() => vi.fn().mockReturnValue('/Users/test'))
const mockReadJsonObject = vi.hoisted(() => vi.fn())
const mockWriteJsonAtomic = vi.hoisted(() => vi.fn())

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  copyFile: mockCopyFile,
  chmod: mockChmod
}))

vi.mock('./settings-file', () => ({
  readJsonObject: mockReadJsonObject,
  writeJsonAtomic: mockWriteJsonAtomic
}))

vi.mock('os', () => ({
  homedir: mockHomedir
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

import { join } from 'path'
import { RateLimitReader, statuslineCommand } from './rate-limit-reader'

// path.join uses the host separator, so expected paths are built the same way.
const claudePath = (name: string): string => join('/Users/test', '.claude', name)

function makeMockWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() }
  }
}

function freshRateLimitsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    window_5h: { used_percentage: 45, resets_at: '2026-03-20T20:00:00Z' },
    window_7d: { used_percentage: 62, resets_at: '2026-03-27T00:00:00Z' },
    updated_at: new Date().toISOString(),
    ...overrides
  })
}

describe('RateLimitReader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T15:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads fresh data and sets dataAvailable=true, isStale=false', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.dataAvailable).toBe(true)
    expect(result.isStale).toBe(false)
    expect(result.window_5h.used_percentage).toBe(45)
    expect(result.window_7d.used_percentage).toBe(62)
    expect(result.window_7d.resets_at).toBe('2026-03-27T00:00:00Z')
  })

  it('returns dataAvailable=false when file is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.dataAvailable).toBe(false)
    expect(result.isStale).toBe(false)
    expect(result.window_5h.used_percentage).toBe(0)
  })

  it('returns dataAvailable=true and isStale=true when data is stale (>5 min)', async () => {
    const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    mockReadFile.mockResolvedValue(freshRateLimitsJson({ updated_at: staleTime }))
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.dataAvailable).toBe(true)
    expect(result.isStale).toBe(true)
    expect(result.window_5h.used_percentage).toBe(45)
    expect(result.window_7d.used_percentage).toBe(62)
  })

  it('returns dataAvailable=false for malformed JSON', async () => {
    mockReadFile.mockResolvedValue('not json {{{')
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.dataAvailable).toBe(false)
    expect(result.isStale).toBe(false)
  })

  it('returns dataAvailable=false when updated_at is missing', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        window_5h: { used_percentage: 10 },
        window_7d: { used_percentage: 20 }
      })
    )
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.dataAvailable).toBe(false)
    expect(result.isStale).toBe(false)
  })

  it('broadcasts to BrowserWindows on read', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const win = makeMockWindow()
    const reader = new RateLimitReader([() => win as never])
    await reader.read()

    expect(win.webContents.send).toHaveBeenCalledWith(
      'ratelimits:update',
      expect.objectContaining({ dataAvailable: true })
    )
  })

  it('skips destroyed windows', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const win = makeMockWindow(true)
    const reader = new RateLimitReader([() => win as never])
    await reader.read()

    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('calls registered listeners on read', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const listener = vi.fn()
    const reader = new RateLimitReader([])
    reader.onUpdate(listener)
    await reader.read()

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        dataAvailable: true,
        window_5h: expect.objectContaining({ used_percentage: 45 })
      })
    )
  })

  it('unsubscribe removes listener', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const listener = vi.fn()
    const reader = new RateLimitReader([])
    const unsub = reader.onUpdate(listener)

    await reader.read()
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    await reader.read()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('getLastData returns null before first read', () => {
    const reader = new RateLimitReader([])
    expect(reader.getLastData()).toBeNull()
  })

  it('getLastData returns last read result', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const reader = new RateLimitReader([])
    await reader.read()

    const last = reader.getLastData()
    expect(last?.dataAvailable).toBe(true)
    expect(last?.window_5h.used_percentage).toBe(45)
  })

  it('startPolling reads immediately then on interval', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const win = makeMockWindow()
    const reader = new RateLimitReader([() => win as never])

    reader.startPolling(15_000)

    // Initial read happens synchronously (returns promise)
    await vi.advanceTimersByTimeAsync(0)
    expect(win.webContents.send).toHaveBeenCalledTimes(1)

    // After interval
    await vi.advanceTimersByTimeAsync(15_000)
    expect(win.webContents.send).toHaveBeenCalledTimes(2)

    reader.stopPolling()
  })

  it('stopPolling stops interval', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const win = makeMockWindow()
    const reader = new RateLimitReader([() => win as never])

    reader.startPolling(15_000)
    await vi.advanceTimersByTimeAsync(0)

    reader.stopPolling()
    await vi.advanceTimersByTimeAsync(30_000)

    // Only the initial read
    expect(win.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('handles null window getters gracefully', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const reader = new RateLimitReader([() => null])
    // Should not throw
    await reader.read()
  })

  it('resets used_percentage to 0 when 5h window resets_at is in the past', async () => {
    mockReadFile.mockResolvedValue(
      freshRateLimitsJson({
        window_5h: { used_percentage: 41, resets_at: '2026-03-20T10:00:00Z' },
        window_7d: { used_percentage: 19, resets_at: '2026-03-27T00:00:00Z' }
      })
    )
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.window_5h.used_percentage).toBe(0)
    expect(result.window_7d.used_percentage).toBe(19)
  })

  it('resets used_percentage to 0 when 7d window resets_at is in the past', async () => {
    mockReadFile.mockResolvedValue(
      freshRateLimitsJson({
        window_5h: { used_percentage: 30, resets_at: '2026-03-20T20:00:00Z' },
        window_7d: { used_percentage: 62, resets_at: '2026-03-19T00:00:00Z' }
      })
    )
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.window_5h.used_percentage).toBe(30)
    expect(result.window_7d.used_percentage).toBe(0)
  })

  it('resets both windows when both resets_at are in the past', async () => {
    mockReadFile.mockResolvedValue(
      freshRateLimitsJson({
        window_5h: { used_percentage: 80, resets_at: '2026-03-20T10:00:00Z' },
        window_7d: { used_percentage: 50, resets_at: '2026-03-19T00:00:00Z' }
      })
    )
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.window_5h.used_percentage).toBe(0)
    expect(result.window_7d.used_percentage).toBe(0)
  })

  it('does not reset percentage when resets_at is in the future', async () => {
    mockReadFile.mockResolvedValue(
      freshRateLimitsJson({
        window_5h: { used_percentage: 45, resets_at: '2026-03-20T20:00:00Z' },
        window_7d: { used_percentage: 62, resets_at: '2026-03-27T00:00:00Z' }
      })
    )
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.window_5h.used_percentage).toBe(45)
    expect(result.window_7d.used_percentage).toBe(62)
  })

  it('sets isVeryStale=true when data is older than 1 hour', async () => {
    const veryStaleTime = new Date(Date.now() - 61 * 60 * 1000).toISOString()
    mockReadFile.mockResolvedValue(freshRateLimitsJson({ updated_at: veryStaleTime }))
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.dataAvailable).toBe(true)
    expect(result.isStale).toBe(true)
    expect(result.isVeryStale).toBe(true)
  })

  it('sets isVeryStale=false when data is less than 1 hour old', async () => {
    const recentTime = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    mockReadFile.mockResolvedValue(freshRateLimitsJson({ updated_at: recentTime }))
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.isStale).toBe(true)
    expect(result.isVeryStale).toBe(false)
  })

  it('reads five_hour/seven_day keys as fallback for window_5h/window_7d', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        five_hour: { used_percentage: 33, resets_at: '2026-03-20T20:00:00Z' },
        seven_day: { used_percentage: 55, resets_at: '2026-03-27T00:00:00Z' },
        updated_at: new Date().toISOString()
      })
    )
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.dataAvailable).toBe(true)
    expect(result.window_5h.used_percentage).toBe(33)
    expect(result.window_7d.used_percentage).toBe(55)
  })

  it('prefers window_5h/window_7d over five_hour/seven_day', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        window_5h: { used_percentage: 10, resets_at: '2026-03-20T20:00:00Z' },
        five_hour: { used_percentage: 99, resets_at: '2026-03-20T20:00:00Z' },
        window_7d: { used_percentage: 20, resets_at: '2026-03-27T00:00:00Z' },
        seven_day: { used_percentage: 88, resets_at: '2026-03-27T00:00:00Z' },
        updated_at: new Date().toISOString()
      })
    )
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.window_5h.used_percentage).toBe(10)
    expect(result.window_7d.used_percentage).toBe(20)
  })

  it('sets isVeryStale=false when data is fresh', async () => {
    mockReadFile.mockResolvedValue(freshRateLimitsJson())
    const reader = new RateLimitReader([])
    const result = await reader.read()

    expect(result.isStale).toBe(false)
    expect(result.isVeryStale).toBe(false)
  })

  describe('isStatuslineConfigured', () => {
    it('returns true when statusLine is configured', async () => {
      mockReadJsonObject.mockResolvedValue({
        status: 'ok',
        data: { statusLine: { type: 'command', command: 'bash foo.sh' } }
      })
      const reader = new RateLimitReader([])
      const result = await reader.isStatuslineConfigured()
      expect(result).toBe(true)
      expect(mockReadJsonObject).toHaveBeenCalledWith(claudePath('settings.json'))
    })

    it('returns false when statusLine is not in settings', async () => {
      mockReadJsonObject.mockResolvedValue({ status: 'ok', data: { permissions: {} } })
      const reader = new RateLimitReader([])
      const result = await reader.isStatuslineConfigured()
      expect(result).toBe(false)
    })

    it('returns false when settings.json is missing', async () => {
      mockReadJsonObject.mockResolvedValue({ status: 'missing' })
      const reader = new RateLimitReader([])
      const result = await reader.isStatuslineConfigured()
      expect(result).toBe(false)
    })
  })

  describe('setupStatusline', () => {
    beforeEach(() => {
      mockCopyFile.mockResolvedValue(undefined)
      mockChmod.mockResolvedValue(undefined)
      mockWriteJsonAtomic.mockResolvedValue(undefined)
    })

    it('copies script, sets permissions, and updates settings atomically', async () => {
      mockReadJsonObject.mockResolvedValue({ status: 'ok', data: { permissions: {} } })

      const reader = new RateLimitReader([])
      const result = await reader.setupStatusline('/app/resources/claudewatch-statusline.sh')

      expect(result).toBe(true)
      expect(mockCopyFile).toHaveBeenCalledWith(
        '/app/resources/claudewatch-statusline.sh',
        claudePath('claudewatch-statusline.sh')
      )
      expect(mockChmod).toHaveBeenCalledWith(claudePath('claudewatch-statusline.sh'), 0o755)
      expect(mockWriteJsonAtomic).toHaveBeenCalledWith(claudePath('settings.json'), {
        permissions: {},
        statusLine: {
          type: 'command',
          command: 'bash "/Users/test/.claude/claudewatch-statusline.sh"'
        }
      })
    })

    it('creates settings when the file does not exist yet', async () => {
      mockReadJsonObject.mockResolvedValue({ status: 'missing' })

      const result = await new RateLimitReader([]).setupStatusline('/app/resources/s.sh')

      expect(result).toBe(true)
      expect(mockWriteJsonAtomic).toHaveBeenCalledWith(
        claudePath('settings.json'),
        expect.objectContaining({ statusLine: expect.any(Object) })
      )
    })

    it('leaves an unparseable settings.json untouched and reports failure', async () => {
      mockReadJsonObject.mockResolvedValue({ status: 'unparseable' })

      const result = await new RateLimitReader([]).setupStatusline('/app/resources/s.sh')

      expect(result).toBe(false)
      expect(mockWriteJsonAtomic).not.toHaveBeenCalled()
      expect(mockCopyFile).not.toHaveBeenCalled()
    })

    it('does not overwrite existing statusLine config', async () => {
      mockReadJsonObject.mockResolvedValue({
        status: 'ok',
        data: { statusLine: { type: 'command', command: 'bash existing.sh' } }
      })

      const reader = new RateLimitReader([])
      const result = await reader.setupStatusline('/app/resources/claudewatch-statusline.sh')

      expect(result).toBe(true)
      expect(mockCopyFile).not.toHaveBeenCalled()
      expect(mockWriteJsonAtomic).not.toHaveBeenCalled()
    })

    it('returns false on failure', async () => {
      mockReadJsonObject.mockResolvedValue({ status: 'missing' })
      mockCopyFile.mockRejectedValue(new Error('Permission denied'))
      const reader = new RateLimitReader([])
      const result = await reader.setupStatusline('/app/resources/claudewatch-statusline.sh')
      expect(result).toBe(false)
    })
  })
})

describe('statuslineCommand', () => {
  it('runs the script through bash by its own path on darwin', () => {
    expect(statuslineCommand('/Users/a/.claude/claudewatch-statusline.sh', 'darwin')).toBe(
      'bash "/Users/a/.claude/claudewatch-statusline.sh"'
    )
  })

  it('gives Git Bash a forward-slash path on win32', () => {
    expect(statuslineCommand('C:\\Users\\a b\\.claude\\claudewatch-statusline.sh', 'win32')).toBe(
      'bash "C:/Users/a b/.claude/claudewatch-statusline.sh"'
    )
  })
})
