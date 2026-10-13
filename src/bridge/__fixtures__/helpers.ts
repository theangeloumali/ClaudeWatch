import { POWERSHELL } from '../../shared/platform-process'
import type { BridgeIo } from '../io'
import { OpencodeDbError } from '../opencode-db'
import { WINDOWS_PROCESS_TABLE_SCRIPT } from '../process-table'
import type { RegistryEntry } from '../registry'
import type { SessionRef } from '../../shared/office/types'

export function missing(): Error {
  return Object.assign(new Error('missing'), { code: 'ENOENT' })
}
// '\' and '/' are one separator here, so a fixture resolves whichever platform's path module
// built the path it is asked for: a POSIX fixture under an injected 'darwin' on a Windows host.
const normalized = (path: string): string => path.replaceAll('\\', '/')

export function fixtureIo(files: Record<string, string | null> = {}): BridgeIo {
  const keyOf = (path: string): string | undefined =>
    Object.keys(files).find((file) => normalized(file) === normalized(path))
  const below = (path: string): string[] => {
    const prefix = `${normalized(path)}/`
    return Object.keys(files)
      .map(normalized)
      .filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length).split('/')[0])
  }
  const read = async (path: string): Promise<string> => {
    const content = files[keyOf(path) ?? '']
    if (typeof content !== 'string') throw missing()
    return content
  }
  return {
    readText: read,
    readTail: read,
    readFirstLine: async (path) => (await read(path)).split('\n')[0],
    readFrom: async (path, offset, maxBytes) => {
      const window = Buffer.from(await read(path)).subarray(offset, offset + maxBytes)
      const end = window.lastIndexOf(10) + 1
      return { text: window.subarray(0, end).toString('utf8'), nextOffset: offset + end }
    },
    list: async (path) => {
      const children = below(path)
      if (!children.length) throw missing()
      return [...new Set(children)]
    },
    stat: async (path) => {
      const key = keyOf(path)
      if (key === undefined) {
        if (below(path).length) return { directory: true, mtimeMs: 1000, size: 0 }
        throw missing()
      }
      return {
        directory: files[key] === null,
        mtimeMs: 1000,
        size: Buffer.byteLength(files[key] ?? '')
      }
    },
    exec: async () => '',
    readOpencode: async () => {
      throw new OpencodeDbError('missing')
    }
  }
}
const isWindowsHost = process.platform === 'win32'
// node:path joins with the host's separator, so a fixture read through the whole pipeline is
// written in the host's paths: `/repo/a` is `C:\repo\a` on Windows.
export const hostPath = (posixPath: string): string =>
  isWindowsHost ? `C:${posixPath.replaceAll('/', '\\')}` : posixPath

// git writes the paths in a worktree's files with forward slashes on Windows too.
export const gitPath = (path: string): string => path.replaceAll('\\', '/')

const filetimeOf = (lstart: string): string =>
  ((BigInt(Date.parse(`${lstart} UTC`)) + 11644473600000n) * 10000n).toString()

// A `ps` start time as the host's registry records it: verbatim, or as a FILETIME on Windows.
export const hostStart = (lstart: string): string => (isWindowsHost ? filetimeOf(lstart) : lstart)

interface TableRow {
  pid: number
  start: string
  command: string
}
// One row as the Windows table prints it: pid, FILETIME, CreationDate ticks (by default the
// same instant counted from year 1, as at UTC) and the base64 of the command line.
export const windowsTableLine = (
  pid: number,
  start: string,
  commandLine: string,
  creationTicks = (BigInt(start) + 504911232000000000n).toString()
): string =>
  `${pid} ${start} ${creationTicks} ${Buffer.from(commandLine, 'utf8').toString('base64')}`

// What the host's process-table program prints for these rows.
export function hostTable(rows: TableRow[]): string {
  if (isWindowsHost)
    return rows.map(({ pid, start, command }) => windowsTableLine(pid, start, command)).join('\n')
  return rows.map(({ pid, start, command }) => `${pid} ${start} ${command}\n`).join('')
}
export const isTableQuery = (file: string, args: string[]): boolean =>
  isWindowsHost
    ? file === POWERSHELL && args.at(-1) === WINDOWS_PROCESS_TABLE_SCRIPT
    : args[0] === '-xo'

// A macOS record unless a test names the platform, such as the one it runs on.
export function registryEntry(platform: NodeJS.Platform = 'darwin'): RegistryEntry {
  const lstart = 'Sat Oct 10 15:29:12 2026'
  const onWindows = platform === 'win32'
  return {
    pid: 42,
    sessionId: 'a',
    cwd: onWindows ? 'C:\\repo' : '/repo',
    name: '',
    status: 'busy',
    waitingFor: '',
    procStart: onWindows ? filetimeOf(lstart) : lstart,
    updatedAtMs: 1000
  }
}
export function session(id: string): SessionRef {
  return {
    key: `claude:${id}`,
    provider: 'claude',
    sessionId: id,
    pid: 42,
    name: id,
    cwd: '/repo',
    projectKey: 'p_repo',
    projectLabel: 'repo',
    projectRoot: '/repo/app',
    companyKey: 'c_test',
    companyLabel: 'Test Co',
    worktree: null,
    host: 'terminal',
    orcaPaneKey: null,
    activity: 'idle',
    attention: 'none',
    currentTool: null,
    subagents: [],
    startedAtMs: 0,
    updatedAtMs: 1000
  }
}
