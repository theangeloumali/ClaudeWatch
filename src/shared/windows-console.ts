import { isJsonObject } from './json-object'
import { filetimeToMs, checkedPid } from './platform-process'

// Compiled by Add-Type on every run (about 1 s): fine for a click or once per session, never
// for a poll. Inside single quotes in PowerShell, so it holds none. Console() ignores Ctrl+C
// before it attaches: one pressed in that console meanwhile would otherwise end the caller.
const NATIVE = `Add-Type -TypeDefinition '
using System; using System.Text; using System.Runtime.InteropServices;
public static class ClaudeWatchWindows {
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("kernel32.dll")] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
  [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr window, StringBuilder name, int size);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  public static long[] Console(uint pid) {
    FreeConsole();
    SetConsoleCtrlHandler(IntPtr.Zero, true);
    if (!AttachConsole(pid)) return new long[] { 0, 0, 0 };
    IntPtr window = GetConsoleWindow();
    FreeConsole();
    uint first;
    GetWindowThreadProcessId(window, out first);
    IntPtr owner = GetAncestor(window, 3);
    StringBuilder name = new StringBuilder(64);
    GetClassName(window, name, 64);
    bool isClassic = name.ToString() == "ConsoleWindowClass" && IsWindowVisible(window);
    return new long[] { first, owner == window ? 0 : owner.ToInt64(), isClassic ? window.ToInt64() : 0 };
  }
  public static bool Raise(IntPtr window) {
    uint ignored;
    uint front = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
    uint self = GetCurrentThreadId();
    bool isAttached = front != 0 && front != self && AttachThreadInput(self, front, true);
    if (IsIconic(window)) ShowWindow(window, 9);
    BringWindowToTop(window);
    SetForegroundWindow(window);
    if (isAttached) AttachThreadInput(self, front, false);
    return GetForegroundWindow() == window;
  }
}'`

// A script run by PowerShell that returns what it printed: a fresh powershell.exe per script, or
// a host kept running, which then compiles the helper once.
export type RunScript = (script: string) => Promise<string>

// The programs whose main window can show an agent's terminal, by program name.
export const WINDOW_HOSTS = [
  'windowsterminal',
  'mintty',
  'code',
  'cursor',
  'alacritty',
  'wezterm-gui',
  'hyper',
  'orca'
] as const

// Every process with its parent and start: a whole enumeration, so it is read once and shared.
const LIST_PROCESSES = [
  '$processes = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, CreationDate | ForEach-Object {',
  "@{ pid = $_.ProcessId; ppid = $_.ParentProcessId; name = $_.Name; started = $(if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc().ToString() } else { '0' }) } })"
]

export const PROCESS_LIST_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  ...LIST_PROCESSES,
  '@{ processes = $processes } | ConvertTo-Json -Compress -Depth 3'
].join('\n')

// The first process of the console `pid` is attached to; 0 when it has none.
export function consoleRootScript(pid: number): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    NATIVE,
    `[ClaudeWatchWindows]::Console(${checkedPid(pid)})[0]`
  ].join('\n')
}

// Both in one run, for a caller that asks about a single process.
export function processTreeScript(pid: number): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    NATIVE,
    `$console = [ClaudeWatchWindows]::Console(${checkedPid(pid)})[0]`,
    ...LIST_PROCESSES,
    '@{ console = $console; processes = $processes } | ConvertTo-Json -Compress -Depth 3'
  ].join('\n')
}

// Finds the window showing the process and brings it forward, in one run; prints whether it is
// in front. The window is its Windows Terminal tab's, its classic console, or the nearest host up
// the chain, walked as `ancestry` walks it.
export function focusWindowScript(pid: number): string {
  const checked = checkedPid(pid)
  return [
    "$ErrorActionPreference = 'Stop'",
    NATIVE,
    `$console = [ClaudeWatchWindows]::Console(${checked})`,
    '$window = $console[1]',
    'if (-not $window) { $window = $console[2] }',
    'if (-not $window) {',
    `  $hosts = @(${WINDOW_HOSTS.map((name) => `'${name}'`).join(', ')})`,
    '  $rows = @{}',
    '  Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, CreationDate | ForEach-Object { $rows[[long]$_.ProcessId] = $_ }',
    '  $seen = @{}',
    `  $id = [long]${checked}`,
    '  $isConsoleUsed = $false',
    '  while ($rows.ContainsKey($id) -and -not $seen.ContainsKey($id) -and $seen.Count -lt 32) {',
    '    $seen[$id] = $true',
    '    $row = $rows[$id]',
    "    if ($hosts -contains ($row.Name.ToLowerInvariant() -replace '\\.(exe|cmd|bat)$', '')) {",
    '      $main = (Get-Process -Id $id -ErrorAction SilentlyContinue).MainWindowHandle',
    '      if ($main -and $main.ToInt64() -ne 0) { $window = $main.ToInt64(); break }',
    '    }',
    '    $parent = $rows[[long]$row.ParentProcessId]',
    '    if ($parent -and $parent.CreationDate -le $row.CreationDate) { $id = [long]$row.ParentProcessId }',
    '    elseif (-not $isConsoleUsed -and $console[0]) { $isConsoleUsed = $true; $id = [long]$console[0] }',
    '    else { break }',
    '  }',
    '}',
    'if ($window) { [ClaudeWatchWindows]::Raise([IntPtr]$window) } else { $false }'
  ].join('\n')
}

// The same, for the main window of whichever process runs the program at $env:CLAUDEWATCH_APP.
export const RAISE_APP_SCRIPT = [
  NATIVE,
  '$window = Get-Process | Where-Object { $_.Path -eq $env:CLAUDEWATCH_APP -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1 -ExpandProperty MainWindowHandle',
  'if ($window) { [ClaudeWatchWindows]::Raise($window) } else { $false }'
].join('\n')

export interface ProcessNode {
  pid: number
  ppid: number
  name: string
  startedMs: number
}

export interface ProcessTree {
  consoleRoot: number
  processes: Map<number, ProcessNode>
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value)

function processNode(value: unknown): ProcessNode | null {
  if (!isJsonObject(value)) return null
  const { pid, ppid, name, started } = value
  if (!isCount(pid) || !isCount(ppid) || typeof name !== 'string' || typeof started !== 'string')
    return null
  return { pid, ppid, name, startedMs: filetimeToMs(started) }
}

function processesOf(rows: unknown): Map<number, ProcessNode> {
  if (!Array.isArray(rows)) throw new Error('not a process listing')
  const processes = new Map<number, ProcessNode>()
  for (const node of rows.map(processNode)) if (node) processes.set(node.pid, node)
  return processes
}

export function parseProcessList(stdout: string): Map<number, ProcessNode> {
  const listing: unknown = JSON.parse(stdout)
  return processesOf(isJsonObject(listing) ? listing.processes : null)
}

export function parseConsoleRoot(stdout: string): number {
  const text = stdout.trim()
  if (!/^\d+$/.test(text) || !isCount(Number(text))) throw new Error('not a console root')
  return Number(text)
}

export function parseProcessTree(stdout: string): ProcessTree {
  const listing: unknown = JSON.parse(stdout)
  const consoleRoot = isJsonObject(listing) ? listing.console : null
  if (!isCount(consoleRoot)) throw new Error('not a process listing')
  return { consoleRoot, processes: processesOf(isJsonObject(listing) ? listing.processes : null) }
}

// One process's tree in one run of `runScript`.
export const processTreeOf =
  (runScript: RunScript) =>
  async (pid: number): Promise<ProcessTree> =>
    parseProcessTree(await runScript(processTreeScript(pid)))

const MAX_DEPTH = 32

// The process and its ancestors, nearest first. A parent that exited (Git Bash's forked shells)
// or whose pid a newer process took ends the parent chain; it resumes once at the console.
// Console 0 means none was attached: pid 0 is System Idle Process, never an ancestor.
export function ancestry(tree: ProcessTree, pid: number): ProcessNode[] {
  const chain: ProcessNode[] = []
  let node = tree.processes.get(pid)
  let isConsoleUsed = tree.consoleRoot === 0
  while (node && !chain.includes(node) && chain.length < MAX_DEPTH) {
    chain.push(node)
    const parent = tree.processes.get(node.ppid)
    if (parent && parent.startedMs <= node.startedMs) node = parent
    else if (isConsoleUsed) node = undefined
    else {
      isConsoleUsed = true
      node = tree.processes.get(tree.consoleRoot)
    }
  }
  return chain
}
