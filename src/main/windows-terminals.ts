import { spawn } from 'child_process'
import { access, stat } from 'fs/promises'
import { win32 } from 'path'
import type { TerminalInfo, TerminalType } from '../renderer/lib/types'
import type { InteractionResult } from '../shared/office/types'
import {
  childEnv,
  LOCAL_APP_DATA,
  POWERSHELL,
  POWERSHELL_CWD,
  powershellArgs,
  programName
} from '../shared/platform-process'
import { runInteractivePowerShell } from '../shared/powershell-host'
import {
  ancestry,
  focusWindowScript,
  processTreeOf,
  RAISE_APP_SCRIPT,
  type RunScript,
  WINDOW_HOSTS
} from '../shared/windows-console'
import type { AgentCommand } from './orca-terminals'
import { execFilePromise } from './platform/exec'

type WindowsTerminal = { terminalType: TerminalType; displayName: string }
// Windows hosts by program name: `C:\…\WindowsTerminal.exe` is `windowsterminal`. Every host
// focus can raise, but Orca, which has its own route, must be listed.
const WINDOWS_TERMINALS: Record<string, WindowsTerminal> = {
  windowsterminal: { terminalType: 'terminal-app', displayName: 'Windows Terminal' },
  mintty: { terminalType: 'terminal-app', displayName: 'Git Bash' },
  code: { terminalType: 'vscode', displayName: 'VS Code' },
  cursor: { terminalType: 'cursor', displayName: 'Cursor' },
  alacritty: { terminalType: 'alacritty', displayName: 'Alacritty' },
  'wezterm-gui': { terminalType: 'wezterm', displayName: 'WezTerm' },
  hyper: { terminalType: 'hyper', displayName: 'Hyper' }
} satisfies Record<Exclude<(typeof WINDOW_HOSTS)[number], 'orca'>, WindowsTerminal>

// The scripts that carry a path run in a fresh PowerShell, which takes seconds to start.
const POWERSHELL_TIMEOUT_MS = 20_000

// The App Execution Alias Windows Terminal installs; absent when it is not installed.
export const WINDOWS_TERMINAL = win32.join(LOCAL_APP_DATA, 'Microsoft', 'WindowsApps', 'wt.exe')

// Started detached and left running; a missing program or folder is an `error` event.
function spawnDetached(
  program: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = { cwd, detached: true, stdio: 'ignore' } as const
    const started = spawn(program, args, env ? { ...options, env } : options)
    started.once('error', reject)
    started.once('spawn', () => {
      started.unref()
      resolve()
    })
  })
}

export const WINDOWS_CMD = win32.join(POWERSHELL_CWD, 'cmd.exe')

// ShellExecute gives cmd.exe a console of its own (a spawned one would have none). The values
// travel in the environment and are read literally: no wildcard, no quoting.
const OPEN_CMD_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$start = New-Object Diagnostics.ProcessStartInfo $env:CLAUDEWATCH_SHELL',
  '$start.WorkingDirectory = $env:CLAUDEWATCH_FOLDER',
  '$start.Arguments = $env:CLAUDEWATCH_ARGUMENTS',
  '$start.UseShellExecute = $true',
  '[void][Diagnostics.Process]::Start($start)'
].join('\n')

// cmd.exe's own order for a bare name.
const AGENT_EXTENSIONS = ['.com', '.exe', '.bat', '.cmd']
// cmd.exe reads none of these characters as syntax, even unquoted: a path made of them alone
// stays one quoted argument and is never split, expanded or turned into a second command.
const PLAIN_PATH = /^[A-Za-z]:\\[\p{L}\p{N} _.\\+~#$'{}[\]-]+$/u

const isFile = (path: string): Promise<boolean> =>
  stat(path).then(
    (info) => info.isFile(),
    () => false
  )

// The agent by absolute path, from the absolute PATH entries alone: cmd.exe looks in the working
// folder first, which is the project, so a repo shipping `claude.cmd` would otherwise run it.
async function resolveAgent(command: AgentCommand): Promise<string | null> {
  // Drive paths only: a share (UNC) entry would make cmd.exe reach out to the network.
  const folders = (process.env.PATH ?? '').split(';').filter((entry) => /^[A-Za-z]:\\/.test(entry))
  for (const folder of folders) {
    for (const extension of AGENT_EXTENSIONS) {
      const candidate = win32.join(folder, `${command}${extension}`)
      if (PLAIN_PATH.test(candidate) && (await isFile(candidate))) return candidate
    }
  }
  return null
}

// The user's own environment, so the agent finds its tools; cmd.exe then searches no working
// folder for what the agent's own script starts.
const terminalEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  NoDefaultCurrentDirectoryInExePath: '1'
})

// `-d .` with the folder as the working folder: Windows Terminal splits its own argv on `;`.
async function startInFolder(folder: string, agent: string | null): Promise<void> {
  const runs = agent ? [WINDOWS_CMD, '/k', agent] : []
  const hasWindowsTerminal = await access(WINDOWS_TERMINAL).then(
    () => true,
    () => false
  )
  if (hasWindowsTerminal) {
    return spawnDetached(WINDOWS_TERMINAL, ['-d', '.', ...runs], folder, terminalEnv())
  }
  const env = {
    ...terminalEnv(),
    CLAUDEWATCH_SHELL: WINDOWS_CMD,
    CLAUDEWATCH_FOLDER: folder,
    CLAUDEWATCH_ARGUMENTS: agent ? `/k "${agent}"` : ''
  }
  await execFilePromise(POWERSHELL, powershellArgs(OPEN_CMD_SCRIPT), {
    timeout: POWERSHELL_TIMEOUT_MS,
    env
  })
}

// A terminal window in the folder, running the agent when one is named; refused when that agent
// is not on PATH.
export async function openWindowsFolder(
  folder: string,
  command?: AgentCommand
): Promise<InteractionResult> {
  const agent = command ? await resolveAgent(command) : null
  if (command && !agent) return { success: false, reason: 'agent-not-found' }
  return startInFolder(folder, agent).then(
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
  const tree = await processTreeOf(runScript)(pid)
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
