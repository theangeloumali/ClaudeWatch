import { join } from 'node:path'
import { accountKey } from './account-key'
import { type BridgeIo, isForbidden, isLabel, isMissing, jsonObject, object } from './io'
import { isFolderPath } from './process-folders'

export interface Rollout {
  path: string
  id: string
  cwd: string
  mtimeMs: number
  size: number
  // When the thread was first created, however often it has been resumed since.
  startedAtMs: number | null
  // The account the session was created under, hashed here so its id never leaves this file.
  accountKey: string | null
  // The CLI as a terminal or `codex exec` (undefined when Codex recorded no source), or null
  // for an app-server's thread or another thread's subagent.
  startedBy: CodexKind | undefined | null
  isSubagent?: boolean
  parentThreadId?: string | null
  agentName?: string
  agentRole?: string
}
interface CachedRollout {
  mtimeMs: number
  size: number
  derived: boolean
  rollout: Rollout | null
}
export type CodexKind = 'terminal' | 'exec'
// Rollouts written before Codex recorded a source came from the CLI.
function startedBy(source: unknown): Rollout['startedBy'] {
  if (source === 'cli') return 'terminal'
  if (source === 'exec') return 'exec'
  return source === undefined ? undefined : null
}
const THREAD_ID = /^[\w-]{1,128}$/
const caches = new WeakMap<BridgeIo, Map<string, Map<string, CachedRollout>>>()

// Codex files a new thread under the local date it began, sessions/YYYY/MM/DD: one that has just
// begun is in today's folder, or yesterday's just after midnight.
export function recentDayFolders(now: number): string[][] {
  return [now, now - 86_400_000].map((atMs) => {
    const day = new Date(atMs)
    const two = (value: number): string => String(value).padStart(2, '0')
    return [String(day.getFullYear()), two(day.getMonth() + 1), two(day.getDate())]
  })
}

// An account key is derived only when asked for: with accounts unwatched, no identity value is.
// Given `days`, only those day folders are walked, and what the last full walk found is kept.
export async function findRollouts(
  root: string,
  io: BridgeIo,
  derivesAccounts = false,
  platform: NodeJS.Platform = process.platform,
  days?: string[][]
): Promise<Rollout[]> {
  let roots = caches.get(io)
  if (!roots) caches.set(io, (roots = new Map()))
  let cache = roots.get(root)
  if (!cache) roots.set(root, (cache = new Map()))
  const entries = cache
  const seen = new Set<string>()
  const rollouts: Rollout[] = []
  async function walk(directory: string): Promise<void> {
    let files: string[]
    try {
      files = await io.list(directory)
    } catch (error) {
      if (isMissing(error)) return
      throw error
    }
    const found = await Promise.all(
      files.map(async (file) => {
        const path = join(directory, file)
        try {
          return { file, path, info: await io.stat(path) }
        } catch (error) {
          if (isMissing(error)) return null
          throw error
        }
      })
    )
    for (const entry of found) {
      if (!entry) continue
      const { file, path, info } = entry
      try {
        if (info.directory) {
          await walk(path)
          continue
        }
        if (!/^rollout-.*\.jsonl$/.test(file)) continue
        seen.add(path)
        const cached = entries.get(path)
        if (
          cached &&
          cached.mtimeMs === info.mtimeMs &&
          cached.size === info.size &&
          cached.derived === derivesAccounts
        ) {
          if (cached.rollout) rollouts.push(cached.rollout)
          continue
        }
        let firstLine: string
        try {
          firstLine = await io.readFirstLine(path)
        } catch (error) {
          if (!isForbidden(error)) throw error
          // One the bridge may not read (Codex hard-links a rollout it archives) is no rollout
          // here, until it changes: the others are still found.
          entries.set(path, {
            mtimeMs: info.mtimeMs,
            size: info.size,
            derived: derivesAccounts,
            rollout: null
          })
          continue
        }
        const header = jsonObject(firstLine)
        const meta = object(header?.payload)
        let rollout: Rollout | null = null
        if (
          header?.type === 'session_meta' &&
          typeof meta?.cwd === 'string' &&
          isFolderPath(meta.cwd, platform) &&
          typeof meta.id === 'string' &&
          THREAD_ID.test(meta.id)
        ) {
          const creator = meta.creator_account_id
          const created = meta.timestamp ?? header.timestamp
          const startedAtMs = typeof created === 'string' ? Date.parse(created) : Number.NaN
          const source = object(meta.source)
          const subagent = object(source?.subagent)
          const spawn = object(subagent?.thread_spawn)
          const parentId =
            spawn?.parent_thread_id ??
            subagent?.parent_thread_id ??
            object(subagent?.review)?.parent_thread_id
          const isSubagent =
            (source !== null && Object.hasOwn(source, 'subagent')) || meta.source === 'subagent'
          const agentName = meta.agent_nickname ?? spawn?.agent_nickname
          const agentRole = meta.agent_role ?? spawn?.agent_role
          rollout = {
            path,
            id: meta.id,
            cwd: meta.cwd,
            mtimeMs: info.mtimeMs,
            size: info.size,
            startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : null,
            accountKey:
              derivesAccounts && typeof creator === 'string' && creator
                ? accountKey('codex', creator)
                : null,
            startedBy: startedBy(meta.source),
            ...(isSubagent && {
              isSubagent: true,
              parentThreadId:
                typeof parentId === 'string' && THREAD_ID.test(parentId) && parentId !== meta.id
                  ? parentId
                  : null
            }),
            ...(isLabel(agentName) && { agentName }),
            ...(isLabel(agentRole) && { agentRole })
          }
          rollouts.push(rollout)
        }
        entries.set(path, {
          mtimeMs: info.mtimeMs,
          size: info.size,
          derived: derivesAccounts,
          rollout
        })
      } catch (error) {
        if (!isMissing(error)) throw error
      }
    }
  }
  const sessions = join(root, 'sessions')
  if (days) for (const day of days) await walk(join(sessions, ...day))
  else {
    await walk(sessions)
    for (const path of entries.keys()) if (!seen.has(path)) entries.delete(path)
  }
  return rollouts.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
}
