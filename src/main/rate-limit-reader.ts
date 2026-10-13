import { readFile, copyFile, chmod } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { RateLimits, RateLimitWindow } from '../renderer/lib/types'
import { readJsonObject, writeJsonAtomic } from './settings-file'

interface RateLimitWindowData {
  used_percentage?: number
  resets_at?: string
}

interface RateLimitsFileData {
  window_5h?: RateLimitWindowData
  window_7d?: RateLimitWindowData
  five_hour?: RateLimitWindowData
  seven_day?: RateLimitWindowData
  updated_at?: string
}

const claudeSettingsPath = (): string => join(homedir(), '.claude', 'settings.json')

// Claude Code runs the statusLine through Git Bash on Windows, which reads `C:/x` but not `C:\x`.
export function statuslineCommand(
  scriptPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const shellPath = platform === 'win32' ? scriptPath.replaceAll('\\', '/') : scriptPath
  return `bash "${shellPath}"`
}

const EMPTY_WINDOW: RateLimitWindow = { used_percentage: 0, resets_at: null }

const EMPTY_RATE_LIMITS: RateLimits = {
  window_5h: { ...EMPTY_WINDOW },
  window_7d: { ...EMPTY_WINDOW },
  updated_at: null,
  dataAvailable: false,
  isStale: false,
  isVeryStale: false
}

/** Maximum age (in ms) before cached rate-limit data is considered stale. */
const STALENESS_THRESHOLD_MS = 5 * 60 * 1000

/** Maximum age (in ms) before data is too old to be useful. */
const VERY_STALE_THRESHOLD_MS = 60 * 60 * 1000

/** If a window's reset time has passed, usage must be 0 (the window has reset). */
function resolveWindow(
  win: { used_percentage?: number; resets_at?: string } | undefined,
  now: number
): RateLimitWindow {
  const resetsAt = win?.resets_at ?? null
  const rawPercent = win?.used_percentage ?? 0
  const hasExpired = resetsAt ? new Date(resetsAt).getTime() < now : false
  return {
    used_percentage: hasExpired ? 0 : rawPercent,
    resets_at: resetsAt
  }
}

export class RateLimitReader {
  private getWindows: (() => BrowserWindow | null)[]
  private interval: NodeJS.Timeout | null = null
  private lastData: RateLimits | null = null
  private listeners = new Set<(data: RateLimits) => void>()
  private filePath: string

  constructor(getWindows: (() => BrowserWindow | null)[]) {
    this.getWindows = getWindows
    this.filePath = join(homedir(), '.claude', 'cache', 'rate-limits.json')
  }

  async read(): Promise<RateLimits> {
    let result: RateLimits
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const data: RateLimitsFileData = JSON.parse(raw)

      // Check staleness
      const updatedAt = data.updated_at ?? null
      if (updatedAt) {
        const now = Date.now()
        const age = now - new Date(updatedAt).getTime()
        result = {
          window_5h: resolveWindow(data.window_5h ?? data.five_hour, now),
          window_7d: resolveWindow(data.window_7d ?? data.seven_day, now),
          updated_at: updatedAt,
          dataAvailable: true,
          isStale: age > STALENESS_THRESHOLD_MS,
          isVeryStale: age > VERY_STALE_THRESHOLD_MS
        }
      } else {
        result = { ...EMPTY_RATE_LIMITS }
      }
    } catch {
      result = { ...EMPTY_RATE_LIMITS }
    }

    this.lastData = result
    this.send(result)
    return result
  }

  getLastData(): RateLimits | null {
    return this.lastData
  }

  onUpdate(listener: (data: RateLimits) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  startPolling(intervalMs = 15_000): void {
    this.read()
    this.interval = setInterval(() => this.read(), intervalMs)
  }

  stopPolling(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  async isStatuslineConfigured(): Promise<boolean> {
    const settings = await readJsonObject(claudeSettingsPath()).catch(() => null)
    return settings?.status === 'ok' && !!settings.data.statusLine
  }

  async setupStatusline(scriptSource: string): Promise<boolean> {
    try {
      const settingsPath = claudeSettingsPath()
      const destPath = join(homedir(), '.claude', 'claudewatch-statusline.sh')

      const existing = await readJsonObject(settingsPath)
      if (existing.status === 'unparseable') return false
      const settings = existing.status === 'ok' ? existing.data : {}

      // Another statusline owns the slot; leave both it and its script alone.
      if (settings.statusLine) {
        return true
      }

      await copyFile(scriptSource, destPath)
      await chmod(destPath, 0o755)

      settings.statusLine = {
        type: 'command',
        command: statuslineCommand(destPath)
      }

      await writeJsonAtomic(settingsPath, settings)
      return true
    } catch {
      return false
    }
  }

  private send(data: RateLimits): void {
    for (const listener of this.listeners) {
      listener(data)
    }

    for (const getWin of this.getWindows) {
      const win = getWin()
      if (win && !win.isDestroyed()) {
        win.webContents.send('ratelimits:update', data)
      }
    }
  }
}
