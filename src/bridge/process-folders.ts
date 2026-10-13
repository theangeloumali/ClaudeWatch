import { windowsFolderKey } from '../shared/office/project-key'
import { isAbsoluteFolder } from '../shared/platform-process'
import { CONTROL_CHARACTER } from '../shared/unsafe-text'
import { identityOf, isInsideAppBundle } from './process-table'

// A recorded folder reaches the feed and, on focus, a terminal: only a plain absolute path may.
export const isFolderPath = (folder: string, platform: NodeJS.Platform): boolean =>
  isAbsoluteFolder(folder, platform) && !CONTROL_CHARACTER.test(folder)

// Windows folders compare without regard to letter case, separator or a trailing separator.
export const folderKey = (folder: string, platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? windowsFolderKey(folder) : folder

// Where Windows installs apps: Program Files, the Store's WindowsApps and %LOCALAPPDATA%\Programs.
const WINDOWS_INSTALL_ROOT =
  /^[a-z]:\\(program files( \(x86\))?|users\\[^\\]+\\appdata\\local\\programs)(\\|$)|\\windowsapps(\\|$)/

// An agent an app bundles (ChatGPT, Orca helpers) runs from inside the app; not a session.
export function isAppFolder(folder: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== 'win32') return isInsideAppBundle(folder)
  return WINDOWS_INSTALL_ROOT.test(folderKey(folder, platform))
}

// `kind`, where known, is what began a conversation and what a process can begin.
export interface WrittenConversation {
  folder: string
  createdAtMs: number | null
  writtenAtMs: number
  kind?: string
}
interface LiveProcess {
  pid: number
  startedAtMs: number
  kind?: string
}

const canBegin = ({ kind }: LiveProcess, conversation: WrittenConversation): boolean =>
  kind === undefined || conversation.kind === undefined || kind === conversation.kind

// Windows names no process's folder, so a process waiting for one is placed in the folder of a
// conversation only it can have begun, or failing that resumed. Two that either could have are
// left for a later look, and nothing is remembered from them.
export function claimFolders(
  processes: LiveProcess[],
  folders: Map<string, string>,
  conversations: WrittenConversation[]
): void {
  const folderOf = (process: LiveProcess): string | undefined => folders.get(identityOf(process))
  const byCreation = [...conversations].sort(
    (a, b) => (a.createdAtMs ?? -Infinity) - (b.createdAtMs ?? -Infinity)
  )
  for (const conversation of byCreation) {
    const key = folderKey(conversation.folder, 'win32')
    // A process placed elsewhere writes there; one placed here may have begun this one too.
    const writers = processes.filter((process) => {
      const folder = folderOf(process)
      if (folder !== undefined && folderKey(folder, 'win32') !== key) return false
      return process.startedAtMs <= conversation.writtenAtMs
    })
    const { createdAtMs } = conversation
    const creators =
      createdAtMs === null
        ? []
        : writers.filter(
            (process) => process.startedAtMs <= createdAtMs && canBegin(process, conversation)
          )
    const candidates = creators.length ? creators : writers
    const [owner] = candidates
    if (candidates.length === 1 && folderOf(owner) === undefined)
      folders.set(identityOf(owner), conversation.folder)
  }
}

// The conversations the processes still waiting for a folder may be writing, newest written first
// and no more than there are of them: each is shown with no process until one is placed.
export function unplacedConversations<Conversation extends WrittenConversation>(
  processes: LiveProcess[],
  folders: Map<string, string>,
  conversations: Conversation[]
): Conversation[] {
  const waiting = processes.filter((process) => !folders.has(identityOf(process)))
  const mayOwn = (conversation: Conversation): boolean =>
    waiting.some(
      (process) =>
        process.startedAtMs <= conversation.writtenAtMs &&
        (conversation.createdAtMs === null ||
          conversation.createdAtMs < process.startedAtMs ||
          canBegin(process, conversation))
    )
  return conversations
    .filter(mayOwn)
    .sort((a, b) => b.writtenAtMs - a.writtenAtMs)
    .slice(0, waiting.length)
}
