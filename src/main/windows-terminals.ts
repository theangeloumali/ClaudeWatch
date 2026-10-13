import { spawn } from 'child_process'
import { access } from 'fs/promises'
import { homedir } from 'os'
import { win32 } from 'path'
import type { TerminalInfo, TerminalType } from '../renderer/lib/types'
import { childEnv, POWERSHELL, powershellArgs, programName } from '../shared/platform-process'
import { runInteractivePowerShell } from '../shared/powershell-host'
import {
  ancestry,
  focusWindowScript,
  parseProcessTree,
  processTreeScript,
  RAISE_APP_SCRIPT,
  type RunScript
} from '../shared/windows-console'
import type { AgentCommand } from './orca-terminals'
import { execFilePromise } from './platform/exec'

// Windows hosts by program name: `C:\…\WindowsTerminal.exe` is `windowsterminal`.
const WINDOWS_TERMINALS: Record<string, { terminalType: TerminalType; displayName: string }> = {
  windowsterminal: { terminalType: 'terminal-app', displayName: 'Windows Terminal' },
  mintty: { terminalType: 'terminal-app', displayName: 'Git Bash' },
  code: { terminalType: 'vscode', displayName: 'VS Code' },
  cursor: { terminalType: 'cursor', displayName: 'Cursor' },
  alacritty: { terminalType: 'alacritty', displayName: 'Alacritty' },
  'wezterm-gui': { terminalType: 'wezterm', displayName: 'WezTerm' },
  hyper: { terminalType: 'hyper', displayName: 'Hyper' }
}

// The scripts that carry a path run in a fresh PowerShell, which takes seconds to start.
const POWERSHELL_TIMEOUT_MS = 20_000

const LOCAL_APP_DATA = process.env.LOCALAPPDATA ?? win32.join(homedir(), 'AppData', 'Local')
// The App Execution Alias Windows Terminal installs; absent when it is not installed.
export const WINDOWS_TERMINAL = win32.join(LOCAL_APP_DATA, 'Microsoft', 'WindowsApps', 'wt.exe')

// Started detached and left running; a missing program or folder is an `error` event.
function spawnDetached(program: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = spawn(program, args, { cwd, detached: true, stdio: 'ignore' })
    started.once('error', reject)
    started.once('spawn', () => {
      started.unref()
      resolve()
    })
  })
}

// ShellExecute gives cmd.exe a console of its own (a spawned one would have none). The values
// travel in the environment and are read literally: no wildcard, no quoting.
const OPEN_CMD_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$start = New-Object Diagnostics.ProcessStartInfo "$env:SystemRoot\\System32\\cmd.exe"',
  '$start.WorkingDirectory = $env:CLAUDEWATCH_FOLDER',
  '$start.Arguments = $env:CLAUDEWATCH_ARGUMENTS',
  '$start.UseShellExecute = $true',
  '[void][Diagnostics.Process]::Start($start)'
].join('\n')

// `-d .` with the folder as the working folder: Windows Terminal splits its own argv on `;`.
async function startInFolder(folder: string, command?: AgentCommand): Promise<void> {
  const runs = command ? ['cmd.exe', '/k', command] : []
  const hasWindowsTerminal = await access(WINDOWS_TERMINAL).then(
    () => true,
    () => false
  )
  if (hasWindowsTerminal) return spawnDetached(WINDOWS_TERMINAL, ['-d', '.', ...runs], folder)
  const env = {
    ...childEnv('win32'),
    CLAUDEWATCH_FOLDER: folder,
    CLAUDEWATCH_ARGUMENTS: command ? `/k ${command}` : ''
  }
  await execFilePromise(POWERSHELL, powershellArgs(OPEN_CMD_SCRIPT), {
    timeout: POWERSHELL_TIMEOUT_MS,
    env
  })
}

// A terminal window in the folder, running `command` when one is given.
export function openWindowsFolder(
  folder: string,
  command?: AgentCommand
): Promise<{ success: boolean }> {
  return startInFolder(folder, command).then(
    () => ({ success: true }),
    () => ({ success: false })
  )
}

// Brings forward the window showing this process; false when none could be, or Windows kept
// another in front.
export async function raiseProcessWindow(
  pid: number,
  runScript: RunScript = runInteractivePowerShell
): Promise<boolean> {
  try {
    return (await runScript(focusWindowScript(pid))).trim() === 'True'
  } catch {
    return false
  }
}

// A running single-instance app hands a second start to its window, but Windows keeps that
// window behind the foreground one, so it is raised here too. Started is enough to succeed:
// on a first start there is no window yet.
export async function launchWindowsApp(program: string): Promise<void> {
  await spawnDetached(program, [], win32.dirname(program))
  const env = { ...childEnv('win32'), CLAUDEWATCH_APP: program }
  await execFilePromise(POWERSHELL, powershellArgs(RAISE_APP_SCRIPT), {
    timeout: POWERSHELL_TIMEOUT_MS,
    env
  }).catch(() => undefined)
}

// The nearest terminal host above `pid`, or null when none is.
export async function resolveWindowsTerminal(
  pid: number,
  runScript: RunScript = runInteractivePowerShell
): Promise<TerminalInfo | null> {
  const tree = parseProcessTree(await runScript(processTreeScript(pid)))
  for (const node of ancestry(tree, pid).slice(1)) {
    const host = WINDOWS_TERMINALS[programName(node.name)]
    if (host) {
      return {
        terminalApp: host.displayName,
        terminalType: host.terminalType,
        terminalPid: node.pid
      }
    }
  }
  return null
}
