import { type BridgeIo, isMissing } from './io'
import { quietFor, SUBAGENT_FRESH_MS } from './liveness'
import {
  forgetExited,
  identityOf,
  keyOf,
  newestFirst,
  placeholderId,
  type ProcessRow,
  type SessionOwner,
  withoutBundledPrograms
} from './process-table'
import type { RegistryEntry } from './registry'
import {
  claudeSessionClaim,
  isNativeClaudeLead,
  locateClaudeClaimOwners,
  uniqueClaudeTranscript
} from './claude-process-claims'
import {
  explicitClaudeTranscript,
  isClaudeSessionId,
  recentClaudeTranscripts,
  type ClaudeTranscript
} from './claude-transcripts'

const MAX_PROCESSES = 128
const SEARCH_AGAIN_MS = 30_000
interface Remembered {
  folders: Map<string, string>
  placeholders: Map<string, string>
  programs: Map<string, string>
  claims: Map<string, ClaudeTranscript>
  searchedAt: Map<string, number>
}
const remembered = new WeakMap<BridgeIo, Remembered>()
function memoryOf(io: BridgeIo): Remembered {
  let memory = remembered.get(io)
  if (!memory) {
    memory = {
      folders: new Map(),
      placeholders: new Map(),
      programs: new Map(),
      claims: new Map(),
      searchedAt: new Map()
    }
    remembered.set(io, memory)
  }
  return memory
}

export function claudeProcessKey(
  io: BridgeIo,
  owner: SessionOwner & Pick<RegistryEntry, 'sessionId'>
): string {
  const sessionId = owner.sessionId === placeholderId(owner) ? undefined : owner.sessionId
  return keyOf(memoryOf(io).placeholders, owner, 'claude', sessionId)
}

// dry-new: registry-less native leads need process identity and cwd, not a fabricated registry file.
export async function discoverClaudeProcesses(options: {
  roots: readonly string[]
  io: BridgeIo
  rows: ProcessRow[]
  claimed: { sessionIds: ReadonlySet<string>; processes: ReadonlySet<string> }
  now: number
  platform: NodeJS.Platform
  onFailure: (root?: string) => void
}): Promise<{ root: string; entry: RegistryEntry; startedAtMs: number; path: string | null }[]> {
  const { io, now, platform, roots, onFailure } = options
  if (platform === 'win32' || !roots.length) return []
  const native = options.rows.filter((process) => isNativeClaudeLead(process, platform))
  const memory = memoryOf(io)
  forgetExited(native, memory.folders, memory.placeholders, memory.claims, memory.searchedAt)
  const taken = new Set(options.claimed.sessionIds)
  const explicitIds = new Map(
    native.map((process) => [identityOf(process), claudeSessionClaim(process.argv)])
  )
  // A registry vouches for a claimed process; only the rest are asked what program they run.
  const unclaimed = await withoutBundledPrograms(
    io,
    memory.programs,
    native.filter((process) => !options.claimed.processes.has(identityOf(process))),
    platform
  )
  const waiting = newestFirst(unclaimed)
    .sort(
      (a, b) =>
        Number(explicitIds.get(identityOf(b)) !== null) -
        Number(explicitIds.get(identityOf(a)) !== null)
    )
    .slice(0, MAX_PROCESSES)
  const reserved = new Set([...taken, ...[...explicitIds.values()].filter(isClaudeSessionId)])
  const owners = unclaimed.filter(
    (process) => !isClaudeSessionId(explicitIds.get(identityOf(process)))
  )
  const folders = await locateClaudeClaimOwners({
    io,
    processes: waiting,
    folders: memory.folders,
    platform,
    onFailure
  })
  const searches = new Map<string, ReturnType<typeof recentClaudeTranscripts>>()
  const found: Awaited<ReturnType<typeof discoverClaudeProcesses>> = []
  for (const process of waiting) {
    try {
      const identity = identityOf(process)
      const cwd = folders.get(identity)
      if (!cwd) continue
      const explicitId = explicitIds.get(identity) ?? null
      let transcript: ClaudeTranscript | null = null
      if (explicitId !== null) {
        if (taken.has(explicitId)) continue
        transcript = await explicitClaudeTranscript({
          io,
          roots,
          cwd,
          sessionId: explicitId,
          onFailure
        })
      } else {
        const kept = memory.claims.get(identity)
        if (kept && !reserved.has(kept.sessionId)) {
          const current = await explicitClaudeTranscript({
            io,
            roots: [kept.root],
            cwd,
            sessionId: kept.sessionId,
            onFailure
          })
          transcript = current ? { ...current, createdAtMs: kept.createdAtMs } : null
        }
        const searchedAt = memory.searchedAt.get(identity)
        if (
          !transcript ||
          searchedAt === undefined ||
          now < searchedAt ||
          now - searchedAt >= SEARCH_AGAIN_MS
        ) {
          let search = searches.get(cwd)
          if (!search) {
            search = recentClaudeTranscripts({
              io,
              roots,
              cwd,
              now,
              platform,
              onFailure,
              startedAtMs: Math.min(...waiting.map((process) => process.startedAtMs))
            })
            searches.set(cwd, search)
          }
          transcript =
            uniqueClaudeTranscript({
              process,
              cwd,
              owners,
              folders,
              search: await search,
              reserved,
              retained: memory.claims,
              previous: kept,
              platform
            }) ?? transcript
          memory.searchedAt.set(identity, now)
        }
      }
      // Keep a prior ownership proof across missing files; PID/start pruning expires it.
      if (transcript) {
        taken.add(transcript.sessionId)
        reserved.add(transcript.sessionId)
        memory.claims.set(identity, transcript)
      }
      const quietMs = transcript ? quietFor(now, transcript.mtimeMs) : null
      found.push({
        root: transcript?.root ?? roots[0],
        startedAtMs: process.startedAtMs,
        path: transcript?.path ?? null,
        entry: {
          pid: process.pid,
          sessionId: transcript?.sessionId ?? placeholderId(process),
          cwd,
          name: '',
          status: quietMs !== null && quietMs < SUBAGENT_FRESH_MS ? 'busy' : 'idle',
          waitingFor: '',
          procStart: process.lstart,
          updatedAtMs: transcript?.mtimeMs ?? process.startedAtMs
        }
      })
    } catch (error) {
      if (!isMissing(error)) options.onFailure()
    }
  }
  return found
}
