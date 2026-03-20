import { writeFile, mkdir, rename } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import type {
  ClaudeInstance,
  InstanceUpdate,
  UsageStats,
  PromoStatus,
  RateLimits
} from '../renderer/lib/types'

const APP_GROUP_ID = 'group.com.zkidzdev.claudewatch'

/**
 * Known widget extension bundle IDs whose sandbox containers need stats.json.
 * When macOS sandboxes a WidgetKit extension, it redirects ALL file reads through
 * ~/Library/Containers/{bundleID}/Data/. So the widget's Strategy 3 (manual path)
 * looks at ~/Library/Containers/{bundleID}/Data/Library/Group Containers/{groupID}/stats.json
 * instead of ~/Library/Group Containers/{groupID}/stats.json.
 *
 * We write stats.json into each sandbox container so the widget can find it.
 */
const WIDGET_BUNDLE_IDS = [
  'com.zkidzdev.claudewatch.widget',
  'com.zkidzdev.claudewatch.host.widget'
]

export interface WidgetInstanceData {
  pid: number
  projectName: string
  status: 'active' | 'idle' | 'stale' | 'exited'
  cpuPercent: number
  memPercent: number
  elapsedSeconds: number
}

export interface WidgetUsageData {
  totalCostUSD: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  dataAvailable: boolean
}

export interface WidgetPromoData {
  is2x: boolean
  promoActive: boolean
  expiresInSeconds: number | null
  promoPeriod: string
}

export interface WidgetRateLimitData {
  window5hPercent: number
  window7dPercent: number
  window5hResetsAt: string | null
  window7dResetsAt: string | null
  dataAvailable: boolean
}

export interface WidgetStatsPayload {
  updatedAt: string
  stats: {
    total: number
    active: number
    idle: number
    stale: number
    exited: number
  }
  instances: WidgetInstanceData[]
  usage: WidgetUsageData | null
  promo: WidgetPromoData | null
  rateLimits: WidgetRateLimitData | null
}

export class WidgetStatsWriter {
  private containerPath: string
  private statsPath: string
  private containerReady = false
  private writeChain: Promise<void> = Promise.resolve()
  private tempFileCounter = 0
  private lastReloadTime = 0
  private static readonly RELOAD_THROTTLE_MS = 10_000 // Throttle to at most once per 10s

  constructor() {
    this.containerPath = join(homedir(), 'Library/Group Containers', APP_GROUP_ID)
    this.statsPath = join(this.containerPath, 'stats.json')
  }

  getStatsPath(): string {
    return this.statsPath
  }

  getContainerPath(): string {
    return this.containerPath
  }

  async ensureContainer(): Promise<void> {
    if (this.containerReady) return
    try {
      await mkdir(this.containerPath, { recursive: true })
      this.containerReady = true
    } catch {
      // Container may already exist or permissions issue — will fail on write
    }
  }

  async write(
    instances: ClaudeInstance[],
    stats: InstanceUpdate['stats'],
    usageStats?: UsageStats | null,
    promoStatus?: PromoStatus | null,
    rateLimitData?: RateLimits | null
  ): Promise<void> {
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        await this.ensureContainer()

        const usage: WidgetUsageData | null = usageStats?.dataAvailable
          ? {
              totalCostUSD: usageStats.totalCostUSD,
              totalInputTokens: usageStats.totalInputTokens,
              totalOutputTokens: usageStats.totalOutputTokens,
              totalCacheReadTokens: usageStats.totalCacheReadTokens,
              dataAvailable: true
            }
          : null

        const promo: WidgetPromoData | null = promoStatus?.promoActive
          ? {
              is2x: promoStatus.is2x,
              promoActive: promoStatus.promoActive,
              expiresInSeconds: promoStatus.expiresInSeconds,
              promoPeriod: promoStatus.promoPeriod
            }
          : null

        const rateLimits: WidgetRateLimitData | null = rateLimitData?.dataAvailable
          ? {
              window5hPercent: rateLimitData.window_5h.used_percentage,
              window7dPercent: rateLimitData.window_7d.used_percentage,
              window5hResetsAt: rateLimitData.window_5h.resets_at,
              window7dResetsAt: rateLimitData.window_7d.resets_at,
              dataAvailable: true
            }
          : null

        const payload: WidgetStatsPayload = {
          updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          stats: {
            total: stats.total,
            active: stats.active,
            idle: stats.idle,
            stale: stats.stale,
            exited: stats.exited
          },
          instances: instances
            .filter((i) => i.status !== 'exited')
            .sort((a, b) => {
              // Active first, then idle
              if (a.status === 'active' && b.status !== 'active') return -1
              if (a.status !== 'active' && b.status === 'active') return 1
              return 0
            })
            .map((i) => ({
              pid: i.pid,
              projectName: i.projectName,
              status: i.status,
              cpuPercent: i.cpuPercent,
              memPercent: i.memPercent,
              elapsedSeconds: i.elapsedSeconds
            })),
          usage,
          promo,
          rateLimits
        }

        const tmpPath = join(
          this.containerPath,
          `.stats-${process.pid}-${this.tempFileCounter++}.tmp`
        )
        const jsonString = JSON.stringify(payload, null, 2)
        await writeFile(tmpPath, jsonString, 'utf-8')
        await rename(tmpPath, this.statsPath)

        // Replicate stats.json into each known widget extension's sandbox container.
        // Sandboxed WidgetKit extensions can only read files inside their own container,
        // so we write directly to ~/Library/Containers/{bundleID}/Data/Library/Group Containers/{groupID}/
        await this.replicateToSandboxContainers(jsonString)

        // Signal WidgetKit to reload timelines via the host app
        this.triggerWidgetReload()
      })

    return this.writeChain
  }

  /**
   * Signal the ClaudeWatchHost app to call WidgetCenter.shared.reloadAllTimelines().
   * Throttled to avoid hammering WidgetKit — at most once per 10 seconds.
   * Fire-and-forget — failures are silently ignored.
   */
  private triggerWidgetReload(): void {
    const now = Date.now()
    if (now - this.lastReloadTime < WidgetStatsWriter.RELOAD_THROTTLE_MS) return
    this.lastReloadTime = now

    // Launch the host app in background with --reload-widget argument.
    // `open -g` opens without bringing to foreground, `--args` passes CLI arguments.
    execFile(
      'open',
      ['-g', '-b', 'com.zkidzdev.claudewatch.host', '--args', '--reload-widget'],
      (err) => {
        // Silently ignore — host app may not be installed
        if (err) {
          // Not fatal — widget will still refresh on its 1-minute timeline
        }
      }
    )
  }

  /**
   * Write stats.json into each known widget extension's sandbox container.
   *
   * When macOS sandboxes a WidgetKit extension, ALL file system access is redirected
   * through ~/Library/Containers/{bundleID}/Data/. So when the widget calls
   * FileManager.homeDirectoryForCurrentUser, it gets:
   *   ~/Library/Containers/com.zkidzdev.claudewatch.widget/Data/
   * And its Strategy 3 (manual path) resolves to:
   *   ~/Library/Containers/{bundleID}/Data/Library/Group Containers/{groupID}/stats.json
   *
   * The Electron app (not sandboxed) can write to these paths directly.
   * Fire-and-forget — failures don't block the primary write.
   */
  private async replicateToSandboxContainers(jsonString: string): Promise<void> {
    const containersDir = join(homedir(), 'Library', 'Containers')

    for (const bundleId of WIDGET_BUNDLE_IDS) {
      const sandboxGroupDir = join(
        containersDir,
        bundleId,
        'Data',
        'Library',
        'Group Containers',
        APP_GROUP_ID
      )
      try {
        await mkdir(sandboxGroupDir, { recursive: true })
        const statsPath = join(sandboxGroupDir, 'stats.json')
        const tmpPath = join(sandboxGroupDir, `.stats-replica-${process.pid}.tmp`)
        await writeFile(tmpPath, jsonString, 'utf-8')
        await rename(tmpPath, statsPath)
      } catch {
        // Sandbox container may not exist (widget not installed) — non-fatal
      }
    }
  }
}

/**
 * Create a WidgetStatsWriter only on macOS.
 * Returns null on other platforms.
 */
export function createWidgetStatsWriter(): WidgetStatsWriter | null {
  if (process.platform !== 'darwin') return null
  return new WidgetStatsWriter()
}
