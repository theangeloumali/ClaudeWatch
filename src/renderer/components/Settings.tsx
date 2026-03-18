import { Bell, Moon, Sun, Monitor, Power, Download, RefreshCw, CheckCircle } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSettings } from '../hooks/useSettings'
import { useUpdater } from '../hooks/useUpdater'
import type { UpdateStatus } from '../lib/types'

const pollingOptions = [
  { value: 1000, label: '1s' },
  { value: 3000, label: '3s' },
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' }
]

const themeOptions: { value: 'dark' | 'light' | 'system'; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor }
]

function ToggleSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (val: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-border'
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
          checked && 'translate-x-5'
        )}
        aria-hidden="true"
      />
    </button>
  )
}

function SettingRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Settings() {
  const { settings, updateSettings, loading } = useSettings()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-secondary">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="no-drag flex h-full min-h-0 flex-col overflow-hidden p-4">
      <div
        className="no-drag flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        data-testid="settings-scroll-region"
      >
        <h2 className="text-sm font-semibold text-text-primary">Settings</h2>

        {/* Polling interval */}
        <section className="card p-4" aria-labelledby="polling-heading">
          <h3
            id="polling-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            Monitoring
          </h3>

          <SettingRow
            label="Polling Interval"
            description="How often to check for Claude processes"
          >
            <div className="flex gap-1" role="radiogroup" aria-label="Polling interval">
              {pollingOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={settings.pollingIntervalMs === value}
                  onClick={() => updateSettings({ pollingIntervalMs: value })}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    settings.pollingIntervalMs === value
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface-hover'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow
            label="CPU Idle Threshold"
            description={`Below ${settings.cpuIdleThreshold.toFixed(1)}% CPU is considered idle`}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.5}
                value={settings.cpuIdleThreshold}
                onChange={(e) => updateSettings({ cpuIdleThreshold: parseFloat(e.target.value) })}
                className="h-1.5 w-24 appearance-none rounded-full bg-border accent-accent"
                aria-label="CPU idle threshold"
              />
              <span className="w-10 text-right text-xs tabular-nums text-text-secondary">
                {settings.cpuIdleThreshold.toFixed(1)}%
              </span>
            </div>
          </SettingRow>

          <SettingRow
            label="Stale Threshold"
            description={`Idle instances are marked stale after ${settings.staleThresholdMinutes} min and excluded from counts`}
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={settings.staleThresholdMinutes}
                onChange={(e) =>
                  updateSettings({ staleThresholdMinutes: parseInt(e.target.value, 10) })
                }
                className="h-1.5 w-24 appearance-none rounded-full bg-border accent-accent"
                aria-label="Stale threshold in minutes"
              />
              <span className="w-12 text-right text-xs tabular-nums text-text-secondary">
                {settings.staleThresholdMinutes}m
              </span>
            </div>
          </SettingRow>
        </section>

        {/* Notifications */}
        <section className="card p-4" aria-labelledby="notif-heading">
          <h3
            id="notif-heading"
            className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            Notifications
          </h3>

          <SettingRow
            label="On Task Complete"
            description="Notify when a task finishes (active → idle)"
          >
            <ToggleSwitch
              checked={settings.notifications.onTaskComplete}
              onChange={(val) =>
                updateSettings({
                  notifications: { ...settings.notifications, onTaskComplete: val }
                })
              }
              label="Notify on task complete"
            />
          </SettingRow>

          <SettingRow label="On Idle" description="Notify when an instance becomes idle">
            <ToggleSwitch
              checked={settings.notifications.onIdle}
              onChange={(val) =>
                updateSettings({
                  notifications: { ...settings.notifications, onIdle: val }
                })
              }
              label="Notify on idle"
            />
          </SettingRow>

          <SettingRow label="On Exited" description="Notify when an instance exits">
            <ToggleSwitch
              checked={settings.notifications.onExited}
              onChange={(val) =>
                updateSettings({
                  notifications: { ...settings.notifications, onExited: val }
                })
              }
              label="Notify on exited"
            />
          </SettingRow>

          <SettingRow label="On Error" description="Notify when an error is detected">
            <ToggleSwitch
              checked={settings.notifications.onError}
              onChange={(val) =>
                updateSettings({
                  notifications: { ...settings.notifications, onError: val }
                })
              }
              label="Notify on error"
            />
          </SettingRow>

          <SettingRow label="Ping Sound" description="Play a chime sound on task complete">
            <ToggleSwitch
              checked={settings.notifications.pingSound}
              onChange={(val) =>
                updateSettings({
                  notifications: { ...settings.notifications, pingSound: val }
                })
              }
              label="Ping sound"
            />
          </SettingRow>

          <SettingRow label="Sound" description="Play notification sounds">
            <ToggleSwitch
              checked={settings.notifications.sound}
              onChange={(val) =>
                updateSettings({
                  notifications: { ...settings.notifications, sound: val }
                })
              }
              label="Notification sound"
            />
          </SettingRow>

          <SettingRow label="Do Not Disturb" description="Suppress all notifications">
            <ToggleSwitch
              checked={settings.notifications.doNotDisturb}
              onChange={(val) =>
                updateSettings({
                  notifications: {
                    ...settings.notifications,
                    doNotDisturb: val
                  }
                })
              }
              label="Do not disturb"
            />
          </SettingRow>
        </section>

        {/* Usage */}
        <section className="card p-4" aria-labelledby="usage-heading">
          <h3
            id="usage-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            Usage Limits
          </h3>

          <SettingRow
            label="Weekly Token Target"
            description={`Track usage against ${(settings.weeklyTokenTarget / 1_000_000).toFixed(1)}M tokens/week`}
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={100000}
                max={100000000}
                step={500000}
                value={settings.weeklyTokenTarget}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  if (!isNaN(val)) updateSettings({ weeklyTokenTarget: val })
                }}
                className="h-8 w-24 rounded-md border border-border bg-surface-raised px-2 text-right text-xs tabular-nums text-text-primary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent-ring"
                aria-label="Weekly token target"
              />
              <span className="text-xs text-text-secondary">tokens</span>
            </div>
          </SettingRow>
        </section>

        {/* Appearance */}
        <section className="card p-4" aria-labelledby="appearance-heading">
          <h3
            id="appearance-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            Appearance
          </h3>

          <SettingRow label="Theme">
            <div className="flex gap-1" role="radiogroup" aria-label="Theme selection">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={settings.theme === value}
                  onClick={() => updateSettings({ theme: value })}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    settings.theme === value
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface-hover'
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </SettingRow>
        </section>

        {/* System */}
        <section className="card p-4" aria-labelledby="system-heading">
          <h3
            id="system-heading"
            className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            <Power className="h-3.5 w-3.5" aria-hidden="true" />
            System
          </h3>

          <SettingRow label="Launch at Login" description="Start ClaudeWatch when you log in">
            <ToggleSwitch
              checked={settings.launchAtLogin}
              onChange={(val) => updateSettings({ launchAtLogin: val })}
              label="Launch at login"
            />
          </SettingRow>

          <SettingRow
            label="Minimize to Tray"
            description="Hide window to tray instead of minimizing to dock"
          >
            <ToggleSwitch
              checked={settings.minimizeToTray}
              onChange={(val) => updateSettings({ minimizeToTray: val })}
              label="Minimize to tray"
            />
          </SettingRow>
        </section>

        {/* Updates */}
        <UpdatesSection />
      </div>
    </div>
  )
}

function statusLabel(status: UpdateStatus): string {
  switch (status) {
    case 'idle':
      return 'Up to date'
    case 'checking':
      return 'Checking for updates...'
    case 'available':
      return 'Update available'
    case 'not-available':
      return 'You\u2019re on the latest version'
    case 'downloading':
      return 'Downloading update...'
    case 'downloaded':
      return 'Update ready to install'
    case 'error':
      return 'Update check failed'
  }
}

function UpdatesSection() {
  const { status, updateInfo, progress, error, checkForUpdates, downloadUpdate, installUpdate } =
    useUpdater()

  return (
    <section className="card p-4" aria-labelledby="updates-heading">
      <h3
        id="updates-heading"
        className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Updates
      </h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">
              {statusLabel(status)}
              {updateInfo && status === 'available' && (
                <span className="ml-1.5 text-xs text-accent">v{updateInfo.version}</span>
              )}
            </p>
            {error && <p className="mt-0.5 text-xs text-red-400">{error}</p>}
          </div>

          <div className="shrink-0">
            {(status === 'idle' || status === 'not-available' || status === 'error') && (
              <button
                type="button"
                onClick={checkForUpdates}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                aria-label="Check for updates"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Check
              </button>
            )}

            {status === 'checking' && (
              <RefreshCw
                className="h-3.5 w-3.5 animate-spin text-text-secondary"
                aria-hidden="true"
              />
            )}

            {status === 'available' && (
              <button
                type="button"
                onClick={downloadUpdate}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/25 transition-colors"
                aria-label="Download update"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Download
              </button>
            )}

            {status === 'downloaded' && (
              <button
                type="button"
                onClick={installUpdate}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/25 transition-colors"
                aria-label="Install update and restart"
              >
                <CheckCircle className="h-3 w-3" aria-hidden="true" />
                Install & Restart
              </button>
            )}
          </div>
        </div>

        {status === 'downloading' && progress && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round(progress.percent))}%` }}
                role="progressbar"
                aria-valuenow={Math.round(progress.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Download progress"
              />
            </div>
            <p className="text-right text-[10px] tabular-nums text-text-secondary">
              {Math.round(progress.percent)}%
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
