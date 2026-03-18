import { Bell, BellOff, Volume2, Moon, Sun, Monitor, Power } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSettings } from '../hooks/useSettings'

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
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold text-text-primary">Settings</h2>

      {/* Polling interval */}
      <section className="card p-4" aria-labelledby="polling-heading">
        <h3
          id="polling-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Monitoring
        </h3>

        <SettingRow label="Polling Interval" description="How often to check for Claude processes">
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
      </section>
    </div>
  )
}
