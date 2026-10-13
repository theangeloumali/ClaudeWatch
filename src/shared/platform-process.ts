import { PARSED_OUTPUT_ENV, startTimeArgs } from './ps'

const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows'
// The inbox Windows PowerShell by absolute path, never whichever `powershell` is first on PATH.
export const POWERSHELL = `${SYSTEM_ROOT}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`

// PowerShell does not start without SystemRoot; nothing else of this process's env is passed on.
export function childEnv(platform: NodeJS.Platform = process.platform): Record<string, string> {
  if (platform !== 'win32') return { ...PARSED_OUTPUT_ENV }
  return {
    ...PARSED_OUTPUT_ENV,
    SystemRoot: SYSTEM_ROOT,
    windir: process.env.windir ?? SYSTEM_ROOT
  }
}

export const powershellArgs = (script: string): string[] => [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  script
]

// A pid is the only value ever written into a script, so it is checked before it gets there.
function checkedPid(pid: number): number {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`not a pid: ${pid}`)
  return pid
}

// The command printing when `pid` started, in the form the session registry records it.
export function startTimeQuery(
  pid: number,
  platform: NodeJS.Platform = process.platform
): { file: string; args: string[] } {
  const checked = checkedPid(pid)
  if (platform !== 'win32') return { file: '/bin/ps', args: startTimeArgs(checked) }
  return {
    file: POWERSHELL,
    args: powershellArgs(
      `[Diagnostics.Process]::GetProcessById(${checked}).StartTime.ToFileTimeUtc()`
    )
  }
}

// FILETIME counts 100 ns ticks from 1601; BigInt keeps the 18 digits exact.
const FILETIME_UNIX_EPOCH_MS = 11644473600000n
export function filetimeToMs(filetime: string): number {
  if (!/^\d+$/.test(filetime)) return Number.NaN
  return Number(BigInt(filetime) / 10000n - FILETIME_UNIX_EPOCH_MS)
}

function splitProgram(commandLine: string): [string, number] {
  // CommandLineToArgvW reads the program name by quotes alone: backslashes there are literal.
  if (commandLine.startsWith('"')) {
    const close = commandLine.indexOf('"', 1)
    return close < 0
      ? [commandLine.slice(1), commandLine.length]
      : [commandLine.slice(1, close), close + 1]
  }
  const end = commandLine.search(/[ \t]/)
  return end < 0 ? [commandLine, commandLine.length] : [commandLine.slice(0, end), end]
}

// Splits a Windows command line the way CommandLineToArgvW does.
export function splitCommandLine(commandLine: string): string[] {
  if (!commandLine.trim()) return []
  const [program, start] = splitProgram(commandLine)
  const argv = [program]
  let current: string | null = null
  let isQuoted = false
  for (let index = start; index < commandLine.length; index++) {
    const char = commandLine[index]
    if (!isQuoted && (char === ' ' || char === '\t')) {
      if (current !== null) argv.push(current)
      current = null
      continue
    }
    current ??= ''
    if (char === '\\') {
      let slashes = 0
      while (commandLine[index] === '\\') {
        slashes++
        index++
      }
      if (commandLine[index] === '"') {
        current += '\\'.repeat(Math.floor(slashes / 2))
        if (slashes % 2) current += '"'
        else isQuoted = !isQuoted
      } else {
        current += '\\'.repeat(slashes)
        index--
      }
    } else if (char === '"') {
      // Inside quotes `""` is a literal quote, as the C runtime has read it since 2008.
      if (isQuoted && commandLine[index + 1] === '"') {
        current += '"'
        index++
      } else isQuoted = !isQuoted
    } else current += char
  }
  if (current !== null) argv.push(current)
  return argv
}

// The program a command line runs, comparable across platforms: `C:\x\Codex.EXE` is `codex`.
export function programName(argv0: string): string {
  const base = argv0.split(/[\\/]/).pop() ?? ''
  return base.toLowerCase().replace(/\.(exe|cmd|bat)$/, '')
}

export function isAbsoluteFolder(
  path: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (platform !== 'win32') return path.startsWith('/')
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}
