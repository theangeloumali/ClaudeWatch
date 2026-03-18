import { useState, useEffect, useMemo } from 'react'
import type { ClaudeInstance, InstanceUpdate } from '../lib/types'

export type StatusFilter = 'all' | 'active' | 'idle' | 'exited'

const RECENT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

export interface GroupedInstances {
  recentlyCompleted: ClaudeInstance[]
  inProgress: ClaudeInstance[]
  waiting: ClaudeInstance[]
  stale: ClaudeInstance[]
}

interface UseInstancesReturn {
  instances: ClaudeInstance[]
  stats: InstanceUpdate['stats']
  filter: StatusFilter
  setFilter: (filter: StatusFilter) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  filteredInstances: ClaudeInstance[]
  groupedInstances: GroupedInstances
}

const emptyStats: InstanceUpdate['stats'] = {
  total: 0,
  active: 0,
  idle: 0,
  stale: 0,
  exited: 0,
  recentlyCompleted: 0
}

export function useInstances(): UseInstancesReturn {
  const [instances, setInstances] = useState<ClaudeInstance[]>([])
  const [stats, setStats] = useState<InstanceUpdate['stats']>(emptyStats)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) return

    window.api.getInstances().then((data) => {
      setInstances(data.instances)
      setStats(data.stats)
    })

    const unsubscribe = window.api.onInstancesUpdate((data) => {
      setInstances(data.instances)
      setStats(data.stats)
    })

    return unsubscribe
  }, [])

  const filteredInstances = useMemo(() => {
    let result = instances

    if (filter !== 'all') {
      result = result.filter((i) => i.status === filter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (i) =>
          i.projectName.toLowerCase().includes(q) ||
          i.projectPath.toLowerCase().includes(q) ||
          i.flags.some((f) => f.toLowerCase().includes(q))
      )
    }

    // Sort by activity: active (by CPU desc) → idle (by CPU desc) → stale → exited
    const statusOrder: Record<string, number> = { active: 0, idle: 1, stale: 2, exited: 3 }
    result = [...result].sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
      if (statusDiff !== 0) return statusDiff
      return b.cpuPercent - a.cpuPercent
    })

    return result
  }, [instances, filter, searchQuery])

  // Tick every 30s so items age out of "Recently Completed" without waiting for a poll
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const groupedInstances = useMemo((): GroupedInstances => {
    const recentlyCompleted: ClaudeInstance[] = []
    const inProgress: ClaudeInstance[] = []
    const waiting: ClaudeInstance[] = []
    const stale: ClaudeInstance[] = []

    for (const inst of filteredInstances) {
      if (inst.status === 'stale') {
        stale.push(inst)
      } else if (inst.status === 'active') {
        inProgress.push(inst)
      } else if (
        inst.status === 'idle' &&
        inst.lastBecameIdleAt &&
        now - new Date(inst.lastBecameIdleAt).getTime() < RECENT_WINDOW_MS
      ) {
        recentlyCompleted.push(inst)
      } else {
        waiting.push(inst)
      }
    }

    return { recentlyCompleted, inProgress, waiting, stale }
  }, [filteredInstances, now])

  return {
    instances,
    stats,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    filteredInstances,
    groupedInstances
  }
}
