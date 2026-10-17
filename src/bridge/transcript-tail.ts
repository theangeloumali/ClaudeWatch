import { join } from 'node:path'
import type { CurrentTool } from '../shared/office/types'
import { type BridgeIo, isLabel, isMissing, jsonObject, object } from './io'
import { toolCategory } from './tool-category'

interface UsageLimit {
  resetsAtMs: number | null
}

export interface TranscriptState {
  tool: CurrentTool | null
  error: boolean
  // Set while the latest reply is a usage or rate limit.
  limit: UsageLimit | null
}

// The CLI writes a limit as a synthetic API-error reply; any real reply after it proceeded.
function limitAfter(reply: Record<string, unknown>, held: UsageLimit | null): UsageLimit | null {
  if (reply.isApiErrorMessage !== true) return null
  if (reply.error !== 'rate_limit') return held
  const resetsAt = object(reply.quotaLimits)?.resetsAt
  return {
    resetsAtMs: typeof resetsAt === 'number' && Number.isFinite(resetsAt) ? resetsAt * 1000 : null
  }
}

// A limit past its reset no longer holds the session back.
export function dropExpiredLimit<State extends TranscriptState>(state: State, now: number): State {
  const resetsAtMs = state.limit?.resetsAtMs
  return resetsAtMs != null && now >= resetsAtMs ? { ...state, limit: null } : state
}

export function parseTranscript(text: string): TranscriptState {
  const tools: { id: string; name: string }[] = []
  const results = new Map<string, boolean>()
  let limit: UsageLimit | null = null
  for (const line of text.split('\n')) {
    const record = jsonObject(line)
    if (record?.type === 'assistant') limit = limitAfter(record, limit)
    const content = object(record?.message)?.content
    if (!Array.isArray(content)) continue
    for (const value of content) {
      const block = object(value)
      if (
        record?.type === 'assistant' &&
        block?.type === 'tool_use' &&
        typeof block.id === 'string' &&
        isLabel(block.name)
      ) {
        tools.push({ id: block.id, name: block.name })
      }
      if (
        record?.type === 'user' &&
        block?.type === 'tool_result' &&
        typeof block.tool_use_id === 'string'
      ) {
        results.set(block.tool_use_id, block.is_error === true)
      }
    }
  }
  const current = tools.findLast((tool) => !results.has(tool.id))
  const latest = tools.at(-1)
  return {
    tool: current
      ? { name: current.name, category: toolCategory(current.name), callId: current.id }
      : null,
    error: !!latest && results.get(latest.id) === true,
    limit
  }
}

interface ReadTail {
  size: number
  mtimeMs: number
  state: TranscriptState
}
interface Remembered {
  read: Map<string, ReadTail>
  // A subagent's type, by its transcript path: its meta file is written once, when it starts.
  agentTypes: Map<string, string>
  seen: Set<string>
}
const remembered = new WeakMap<BridgeIo, Remembered>()

function memoryOf(io: BridgeIo): Remembered {
  let memory = remembered.get(io)
  if (!memory)
    remembered.set(io, (memory = { read: new Map(), agentTypes: new Map(), seen: new Set() }))
  return memory
}

// A transcript's parsed tail and when the file was last written. The tail is read and parsed
// again only when the file's size or time moved; a caller that has just listed it passes both.
export async function readTranscript(
  path: string,
  io: BridgeIo,
  listed?: { size: number; mtimeMs: number }
): Promise<TranscriptState & { mtimeMs: number }> {
  const memory = memoryOf(io)
  memory.seen.add(path)
  const { size, mtimeMs } = listed ?? (await io.stat(path))
  let tail = memory.read.get(path)
  if (tail?.size !== size || tail.mtimeMs !== mtimeMs) {
    tail = { size, mtimeMs, state: parseTranscript(await io.readTail(path)) }
    memory.read.set(path, tail)
  }
  return { ...tail.state, mtimeMs }
}

// A subagent's type, read once and kept as long as its transcript is.
export async function rememberedAgentType(
  path: string,
  io: BridgeIo,
  read: () => Promise<string | null>
): Promise<string | null> {
  const { agentTypes } = memoryOf(io)
  const known = agentTypes.get(path)
  if (known) return known
  const agentType = await read()
  if (agentType) agentTypes.set(path, agentType)
  return agentType
}

// Forgets every transcript not read since the last call: its session has left.
export function pruneTranscripts(io: BridgeIo): void {
  const memory = remembered.get(io)
  if (!memory) return
  for (const memo of [memory.read, memory.agentTypes]) {
    for (const path of memo.keys()) if (!memory.seen.has(path)) memo.delete(path)
  }
  memory.seen.clear()
}

// The folder name Claude Code gives a working directory under `projects/`.
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

const paths = new WeakMap<BridgeIo, Map<string, string>>()

export async function transcriptPath(
  root: string,
  cwd: string,
  sessionId: string,
  io: BridgeIo
): Promise<string | null> {
  let cache = paths.get(io)
  if (!cache) paths.set(io, (cache = new Map()))
  const key = JSON.stringify([root, cwd, sessionId])
  const cached = cache.get(key)
  if (cached) return cached
  const remember = (path: string): string => {
    // Bound discovery state even when the bridge runs across many sessions.
    if (cache.size >= 1024) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, path)
    return path
  }
  const projects = join(root, 'projects')
  const direct = join(projects, projectSlug(cwd), `${sessionId}.jsonl`)
  try {
    await io.stat(direct)
    return remember(direct)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  let slugs: string[]
  try {
    slugs = await io.list(projects)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
  for (const slug of slugs) {
    const candidate = join(projects, slug, `${sessionId}.jsonl`)
    try {
      await io.stat(candidate)
      return remember(candidate)
    } catch (error) {
      if (!isMissing(error)) throw error
    }
  }
  return null
}
