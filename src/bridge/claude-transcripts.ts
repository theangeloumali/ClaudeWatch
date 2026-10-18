import { join } from 'node:path'
import { type BridgeIo, isForbidden, isMissing, jsonObject } from './io'
import { quietFor, SUBAGENT_FRESH_MS } from './liveness'
import { folderKey } from './process-folders'
import { projectSlug } from './transcript-tail'

// A strict end check also rejects the trailing newline that JavaScript's $ permits.
export const CLAUDE_SESSION_ID = /^[\w-]+(?![\s\S])/
const MAX_SESSION_ID_LENGTH = 128
const MAX_CANDIDATES = 512
// Team labels can follow an 80 KB attachment, as in teammate discovery.
const HEAD_BYTES = 256 * 1024
const MAX_HEADERS = 512

// dry-new: native leads have no roster; only their cwd's bounded transcript metadata is searched.
export interface ClaudeTranscript {
  root: string
  path: string
  sessionId: string
  mtimeMs: number
  createdAtMs: number | null
}
interface Header {
  sessionId: string
  cwd: string
  createdAtMs: number
}
type HeaderResult = Header | 'other' | null
const headers = new WeakMap<
  BridgeIo,
  Map<string, { size: number; mtimeMs: number; header: HeaderResult }>
>()
// Per folder, each transcript's mtime when last stat'ed.
const seenFolders = new WeakMap<BridgeIo, Map<string, Map<string, number>>>()

export const isClaudeSessionId = (sessionId: unknown): sessionId is string =>
  typeof sessionId === 'string' &&
  sessionId.length <= MAX_SESSION_ID_LENGTH &&
  CLAUDE_SESSION_ID.test(sessionId)

function headerOf(head: string): HeaderResult {
  let header: Header | null = null
  for (const line of head.split('\n')) {
    const record = jsonObject(line)
    if (record?.isSidechain === true || record?.teamName || record?.agentId) return 'other'
    if (
      header ||
      !record ||
      !isClaudeSessionId(record.sessionId) ||
      typeof record.cwd !== 'string' ||
      typeof record.timestamp !== 'string'
    )
      continue
    const createdAtMs = Date.parse(record.timestamp)
    if (Number.isFinite(createdAtMs))
      header = { sessionId: record.sessionId, cwd: record.cwd, createdAtMs }
  }
  return header
}

async function readHeader(
  io: BridgeIo,
  file: { path: string; size: number; mtimeMs: number }
): Promise<HeaderResult> {
  let cache = headers.get(io)
  if (!cache) headers.set(io, (cache = new Map()))
  const cached = cache.get(file.path)
  if (cached?.size === file.size && cached.mtimeMs === file.mtimeMs) return cached.header
  const header = headerOf((await io.readFrom(file.path, 0, HEAD_BYTES)).text)
  if (cache.size >= MAX_HEADERS) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, header })
  return header
}

export async function explicitClaudeTranscript(options: {
  io: BridgeIo
  roots: readonly string[]
  cwd: string
  sessionId: string
  onFailure: (root?: string) => void
}): Promise<ClaudeTranscript | null> {
  if (!isClaudeSessionId(options.sessionId)) return null
  for (const root of options.roots) {
    const path = join(root, 'projects', projectSlug(options.cwd), `${options.sessionId}.jsonl`)
    try {
      const { directory, mtimeMs } = await options.io.stat(path)
      if (!directory)
        return { root, path, sessionId: options.sessionId, mtimeMs, createdAtMs: null }
    } catch (error) {
      if (!isMissing(error) && !isForbidden(error)) options.onFailure(root)
    }
  }
  return null
}

// Unseen names and those written since `startedAtMs`; one last written before it cannot hold a
// conversation begun since. So a large folder completes once each name is stat'ed (health-3).
function namesDue(seen: Map<string, number>, names: string[], startedAtMs: number): string[] {
  const listed = new Set(names)
  for (const name of seen.keys()) if (!listed.has(name)) seen.delete(name)
  return names.filter((name) => (seen.get(name) ?? Infinity) >= startedAtMs)
}

export async function recentClaudeTranscripts(options: {
  io: BridgeIo
  roots: readonly string[]
  cwd: string
  startedAtMs: number
  now: number
  platform: NodeJS.Platform
  onFailure: (root?: string) => void
}): Promise<{ candidates: ClaudeTranscript[]; isComplete: boolean }> {
  const { io, cwd, now, platform } = options
  let folders = seenFolders.get(io)
  if (!folders) seenFolders.set(io, (folders = new Map()))
  const candidates: ClaudeTranscript[] = []
  let isComplete = true
  for (const root of options.roots) {
    const folder = join(root, 'projects', projectSlug(cwd))
    try {
      const names = (await io.list(folder)).filter(
        (name) => name.endsWith('.jsonl') && isClaudeSessionId(name.slice(0, -6))
      )
      if (folders.size >= MAX_HEADERS && !folders.has(folder)) folders.clear()
      let seen = folders.get(folder)
      if (!seen) folders.set(folder, (seen = new Map()))
      const due = namesDue(seen, names, options.startedAtMs)
      if (due.length > MAX_CANDIDATES) isComplete = false
      for (const name of due.slice(0, MAX_CANDIDATES)) {
        const path = join(folder, name)
        try {
          const info = await io.stat(path)
          seen.set(name, info.mtimeMs)
          const quietMs = quietFor(now, info.mtimeMs)
          if (
            info.directory ||
            info.mtimeMs < options.startedAtMs ||
            quietMs === null ||
            quietMs >= SUBAGENT_FRESH_MS
          )
            continue
          const header = await readHeader(io, { path, ...info })
          if (header === 'other') continue
          if (!header || header.sessionId !== name.slice(0, -6)) {
            isComplete = false
            continue
          }
          if (
            header.createdAtMs < options.startedAtMs ||
            quietFor(now, header.createdAtMs) === null ||
            folderKey(header.cwd, platform) !== folderKey(cwd, platform)
          )
            continue
          candidates.push({
            root,
            path,
            sessionId: header.sessionId,
            createdAtMs: header.createdAtMs,
            mtimeMs: info.mtimeMs
          })
        } catch (error) {
          if (!isMissing(error)) {
            isComplete = false
            if (!isForbidden(error)) options.onFailure(root)
          }
        }
      }
    } catch (error) {
      if (!isMissing(error)) {
        isComplete = false
        if (!isForbidden(error)) options.onFailure(root)
      }
    }
  }
  return {
    isComplete,
    candidates: candidates.sort(
      (a, b) =>
        (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0) ||
        b.mtimeMs - a.mtimeMs ||
        a.path.localeCompare(b.path)
    )
  }
}
