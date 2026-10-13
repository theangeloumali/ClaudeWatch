import { isAbsoluteFolder } from '../shared/platform-process'
import { CONTROL_CHARACTER } from '../shared/unsafe-text'
import { isInsideAppBundle } from './process-table'

// A recorded folder reaches the feed and, on focus, a terminal: only a plain absolute path may.
export const isFolderPath = (folder: string, platform: NodeJS.Platform): boolean =>
  isAbsoluteFolder(folder, platform) && !CONTROL_CHARACTER.test(folder)

// Windows folders compare without regard to letter case, separator or a trailing separator.
export const folderKey = (folder: string, platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? folder.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase() : folder

// Where Windows installs apps: Program Files, the Store's WindowsApps and %LOCALAPPDATA%\Programs.
const WINDOWS_INSTALL_ROOT =
  /^[a-z]:\\(program files( \(x86\))?|users\\[^\\]+\\appdata\\local\\programs)(\\|$)|\\windowsapps(\\|$)/

// An agent an app bundles (ChatGPT, Orca helpers) runs from inside the app; not a session.
export function isAppFolder(folder: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== 'win32') return isInsideAppBundle(folder)
  return WINDOWS_INSTALL_ROOT.test(folderKey(folder, platform))
}

// Windows names no process's folder, so it is taken from the conversation the process began, or
// failing that the newest it has written to since it started (a resumed one). `written` holds
// only those written since, newest first.
export function ownConversation<Conversation>(
  written: Conversation[],
  startedAtMs: number,
  createdAtMs: (conversation: Conversation) => number | null
): Conversation | undefined {
  let first: { conversation: Conversation; atMs: number } | undefined
  for (const conversation of written) {
    const atMs = createdAtMs(conversation)
    if (atMs !== null && atMs >= startedAtMs && (!first || atMs < first.atMs))
      first = { conversation, atMs }
  }
  return first?.conversation ?? written[0]
}
