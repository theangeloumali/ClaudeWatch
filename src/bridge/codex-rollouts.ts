import { join } from 'node:path'
import { accountKey } from './account-key'
import { type BridgeIo, isMissing, jsonObject, object } from './io'
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
  // The CLI as a terminal or `codex exec` (just 'cli' when Codex recorded no source), or null
  // for an app-server's thread or another thread's subagent.
  startedBy: CodexKind | 'cli' | null
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
  return source === undefined ? 'cli' : null
}
const caches = new WeakMap<BridgeIo, Map<string, Map<string, CachedRollout>>>()

// An account key is derived only when asked for: with accounts unwatched, no identity value is.
export async function findRollouts(
  root: string,
  io: BridgeIo,
  derivesAccounts = false,
  platform: NodeJS.Platform = process.platform
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
    for (const file of files) {
      const path = join(directory, file)
      try {
        const info = await io.stat(path)
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
          if (isMissing(error)) throw error
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
          typeof meta.id === 'string'
        ) {
          const creator = meta.creator_account_id
          const created = meta.timestamp ?? header.timestamp
          const startedAtMs = typeof created === 'string' ? Date.parse(created) : Number.NaN
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
            startedBy: startedBy(meta.source)
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
  await walk(join(root, 'sessions'))
  for (const path of entries.keys()) {
    if (!seen.has(path)) entries.delete(path)
  }
  return rollouts.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
}
