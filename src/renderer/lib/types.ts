export interface ClaudeInstance {
  pid: number
  tty: string
  status: 'active' | 'idle' | 'exited'
  cpuPercent: number
  memPercent: number
  elapsedTime: string
  elapsedSeconds: number
  projectPath: string
  projectName: string
  flags: string[]
  sessionId?: string
  startedAt: Date
  lastStatusChange?: Date
}

export interface SessionHistoryEntry {
  pid: number
  projectPath: string
  projectName: string
  status: 'exited'
  startedAt: Date
  endedAt: Date
  durationSeconds: number
  flags: string[]
}

export interface AppSettings {
  pollingIntervalMs: number
  cpuIdleThreshold: number
  launchAtLogin: boolean
  notifications: {
    onIdle: boolean
    onExited: boolean
    onError: boolean
    sound: boolean
    doNotDisturb: boolean
  }
  theme: 'dark' | 'light' | 'system'
  maxHistoryEntries: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  pollingIntervalMs: 3000,
  cpuIdleThreshold: 1.0,
  launchAtLogin: false,
  notifications: {
    onIdle: true,
    onExited: true,
    onError: true,
    sound: true,
    doNotDisturb: false
  },
  theme: 'dark',
  maxHistoryEntries: 100
}

export interface InstanceUpdate {
  instances: ClaudeInstance[]
  stats: {
    total: number
    active: number
    idle: number
    exited: number
  }
}

export type IpcChannels =
  | 'instances:update'
  | 'instances:get'
  | 'settings:get'
  | 'settings:set'
  | 'history:get'
  | 'history:clear'
  | 'app:open-dashboard'
  | 'app:quit'
  | 'terminal:open'
