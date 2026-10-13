export function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function parseElapsedTime(elapsed: string): number {
  const trimmed = elapsed.trim()
  if (!trimmed) return 0

  // Handle D-HH:MM:SS format (macOS ps etime for >24h processes)
  let days = 0
  let timePart = trimmed
  const dashIndex = trimmed.indexOf('-')
  if (dashIndex !== -1) {
    days = parseInt(trimmed.substring(0, dashIndex), 10)
    if (isNaN(days)) return 0
    timePart = trimmed.substring(dashIndex + 1)
  }

  const parts = timePart.split(':').map(Number)
  if (parts.some(isNaN)) return 0

  let seconds = days * 86400
  if (parts.length === 3) {
    seconds += parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    seconds += parts[0] * 60 + parts[1]
  } else {
    seconds += parts[0] || 0
  }
  return seconds
}

// Either separator: a Windows cwd arrives with backslashes, and some tools hand over forward ones.
export function pathSegments(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean)
}

export function getProjectName(projectPath: string): string {
  const segments = pathSegments(projectPath)
  if (segments.length >= 2) {
    return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`
  }
  return segments[segments.length - 1] || projectPath
}

// `nowMs` lets a screen measure every age against the one clock it ticks on.
export function timeAgo(date: Date, nowMs = Date.now()): string {
  const diffSeconds = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000))

  if (diffSeconds < 60) return `${diffSeconds}s ago`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
  return `${Math.floor(diffSeconds / 86400)}d ago`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatCompactNumber(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
}

export function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function secondsUntilReset(isoTimestamp: string | null): number {
  if (!isoTimestamp) return 0
  return Math.max(0, Math.floor((new Date(isoTimestamp).getTime() - Date.now()) / 1000))
}
