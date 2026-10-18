import { programName } from '../shared/platform-process'
import { type BridgeIo, isMissing } from './io'
import { folderKey, isAppFolder, isFolderPath } from './process-folders'
import { identityOf, rememberedFolder, type ProcessRow } from './process-table'
import {
  isClaudeSessionId,
  type ClaudeTranscript,
  type recentClaudeTranscripts
} from './claude-transcripts'

const SESSION_FLAG = /^(?:--resume|--session-id|-r)(?:=(.*))?$/
const HOST_ARGUMENT = /^--(?:chrome-native-host|agent-id|parent-session-id)(?:=|$)/
const UTILITY_COMMAND =
  /^(?:--help|--version|-h|-v|help|update|install|uninstall|doctor|auth|mcp|setup-token)$/

export function isNativeClaudeLead(
  { pid, startedAtMs, argv }: ProcessRow,
  platform: NodeJS.Platform
): boolean {
  return (
    Number.isSafeInteger(pid) &&
    pid > 0 &&
    Number.isFinite(startedAtMs) &&
    programName(argv[0] ?? '') === 'claude' &&
    !/\.(?:cmd|bat)$/i.test(argv[0] ?? '') &&
    !isAppFolder(argv[0] ?? '', platform) &&
    !argv.slice(1).some((argument) => HOST_ARGUMENT.test(argument)) &&
    !UTILITY_COMMAND.test(argv[1] ?? '')
  )
}

// null means no claim; an invalid or value-less flag must not borrow another session.
export function claudeSessionClaim(argv: string[]): string | null {
  for (let index = 1; index < argv.length && argv[index] !== '--'; index++) {
    const flag = SESSION_FLAG.exec(argv[index])
    if (!flag) continue
    const sessionId = flag[1] ?? argv[index + 1]
    return isClaudeSessionId(sessionId) ? sessionId : ''
  }
  return null
}

export async function locateClaudeClaimOwners(options: {
  io: BridgeIo
  processes: ProcessRow[]
  folders: Map<string, string>
  platform: NodeJS.Platform
  onFailure: (root?: string) => void
}): Promise<Map<string, string | null>> {
  const provenFolders = new Map<string, string | null>()
  for (const process of options.processes) {
    try {
      const cwd = await rememberedFolder(options.io, options.folders, process, options.platform)
      if (cwd && isAppFolder(cwd, options.platform)) provenFolders.set(identityOf(process), null)
      else if (cwd && isFolderPath(cwd, options.platform))
        provenFolders.set(identityOf(process), cwd)
    } catch (error) {
      if (!isMissing(error)) options.onFailure()
    }
  }
  return provenFolders
}

// dry-new: folder placement alone proves neither a unique owner nor a unique conversation.
export function uniqueClaudeTranscript(options: {
  process: ProcessRow
  cwd: string
  owners: ProcessRow[]
  folders: ReadonlyMap<string, string | null>
  search: Awaited<ReturnType<typeof recentClaudeTranscripts>>
  reserved: ReadonlySet<string>
  retained: ReadonlyMap<string, ClaudeTranscript>
  previous: ClaudeTranscript | undefined
  platform: NodeJS.Platform
}): ClaudeTranscript | null {
  if (!options.search.isComplete || options.previous?.createdAtMs === null) return null
  const identity = identityOf(options.process)
  const owners = options.owners.filter((process) => {
    const cwd = options.folders.get(identityOf(process))
    // An unlocated process remains a possible owner, not proof of a different cwd.
    return (
      cwd === undefined ||
      (cwd !== null &&
        folderKey(cwd, options.platform) === folderKey(options.cwd, options.platform))
    )
  })
  if (owners.length !== 1 || identityOf(owners[0]) !== identity) return null
  const retainedIds = new Set(
    [...options.retained]
      .filter(([owner]) => owner !== identity)
      .map(([, claim]) => claim.sessionId)
  )
  const choices = new Map<string, ClaudeTranscript>()
  for (const candidate of options.search.candidates) {
    if (
      options.reserved.has(candidate.sessionId) ||
      retainedIds.has(candidate.sessionId) ||
      candidate.sessionId === options.previous?.sessionId ||
      candidate.createdAtMs === null ||
      candidate.createdAtMs < options.process.startedAtMs ||
      candidate.createdAtMs <= (options.previous?.createdAtMs ?? -Infinity)
    )
      continue
    if (!choices.has(candidate.sessionId)) choices.set(candidate.sessionId, candidate)
  }
  return choices.size === 1 ? (choices.values().next().value ?? null) : null
}
