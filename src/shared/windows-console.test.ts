import { describe, expect, it } from 'vitest'
import { execFile, spawnSync } from 'node:child_process'
import { childEnv, POWERSHELL, powershellArgs } from './platform-process'
import {
  ancestry,
  consoleRootScript,
  focusWindowScript,
  parseConsoleRoot,
  parseProcessList,
  parseProcessTree,
  PROCESS_LIST_SCRIPT,
  processTreeOf,
  processTreeScript,
  WINDOW_HOSTS,
  type ProcessTree
} from './windows-console'

// FILETIME strings one second apart, oldest first.
const at = (second: number): string => String(134363332080000000n + BigInt(second) * 10000000n)

const listing = (consoleRoot: number, processes: [number, number, string, string][]): string =>
  JSON.stringify({
    console: consoleRoot,
    processes: processes.map(([pid, ppid, name, started]) => ({ pid, ppid, name, started }))
  })

// Claude started from Git Bash in an Orca pane: sh's parent (a forked bash) has exited, so the
// chain resumes at the pane's console, whose first process is the pane's shell.
const ORCA_PANE = listing(28964, [
  [55152, 52868, 'claude.exe', at(50)],
  [52868, 54220, 'sh.exe', at(49)],
  [28964, 4404, 'bash.exe', at(10)],
  [4404, 38436, 'Orca.exe', at(5)],
  [38436, 16404, 'Orca.exe', at(1)]
])

const pids = (tree: ProcessTree, pid: number): number[] => ancestry(tree, pid).map((p) => p.pid)

// The cold route, as a test runs it: a fresh powershell.exe per script.
const runCold = (script: string): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(
      POWERSHELL,
      powershellArgs(script),
      { env: childEnv('win32'), timeout: 20_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, out) => (error ? reject(error) : resolve(out))
    )
  )

describe.each([
  ['processTreeScript', processTreeScript],
  ['consoleRootScript', consoleRootScript],
  ['focusWindowScript', focusWindowScript]
])('%s', (_name, script) => {
  it('is one fixed script with only the pid written into it', () => {
    expect(script(55152)).toContain('[ClaudeWatchWindows]::Console(55152)')
    expect(script(424242).replaceAll('424242', 'PID')).toBe(
      script(515151).replaceAll('515151', 'PID')
    )
  })

  it('ignores Ctrl+C before it attaches to another console, so a Ctrl+C there cannot end it', () => {
    const text = script(42)
    const ignore = text.indexOf('SetConsoleCtrlHandler(IntPtr.Zero, true);')
    expect(ignore).toBeGreaterThan(-1)
    expect(ignore).toBeLessThan(text.indexOf('AttachConsole(pid)'))
  })

  it('reads no console handle or encoding, since it gives up its own console', () => {
    expect(script(42)).not.toMatch(/\[Console\]|GetStdHandle|OutputEncoding/)
  })

  it('refuses anything but a positive integer pid', () => {
    for (const pid of [0, -1, 1.5, Number.NaN, 2 ** 53]) {
      expect(() => script(pid)).toThrow('not a pid')
    }
  })
})

describe('the process listing a whole tick shares', () => {
  it('names no pid and attaches to no console, so one run serves every session', () => {
    expect(PROCESS_LIST_SCRIPT).not.toMatch(/Console\(|Add-Type/)
    expect(processTreeScript(42)).toContain(
      PROCESS_LIST_SCRIPT.split('\n').find((line) => line.includes('Get-CimInstance'))
    )
  })

  it('reads the listing alone, and a console root alone', () => {
    const processes = parseProcessList(ORCA_PANE)
    expect([...processes.keys()]).toEqual([55152, 52868, 28964, 4404, 38436])
    expect(parseConsoleRoot('28964\r\n')).toBe(28964)
    expect(parseConsoleRoot('0')).toBe(0)
    for (const bad of ['', 'x', '-1', '1.5']) expect(() => parseConsoleRoot(bad)).toThrow()
  })

  it('reads one pid’s whole tree through the runner it is given', async () => {
    const runScript = async (script: string): Promise<string> =>
      script === processTreeScript(55152) ? ORCA_PANE : ''
    expect(pids(await processTreeOf(runScript)(55152), 55152)).toEqual([
      55152, 52868, 28964, 4404, 38436
    ])
  })
})

describe('focusWindowScript', () => {
  it('looks only for the host programs it knows, and raises what it finds', () => {
    const script = focusWindowScript(42)
    expect(script).toContain(`@(${WINDOW_HOSTS.map((name) => `'${name}'`).join(', ')})`)
    expect(WINDOW_HOSTS).toEqual(expect.arrayContaining(['windowsterminal', 'code', 'orca']))
    expect(script).toContain('[ClaudeWatchWindows]::Raise(')
  })
})

describe('parseProcessTree', () => {
  it('reads the console and every process', () => {
    const tree = parseProcessTree(ORCA_PANE)
    expect(tree.consoleRoot).toBe(28964)
    expect(tree.processes.get(38436)).toMatchObject({ name: 'Orca.exe', ppid: 16404 })
  })

  it('throws on output that is not the listing', () => {
    expect(() => parseProcessTree('')).toThrow()
    expect(() => parseProcessTree('{"console":1}')).toThrow()
  })

  it('skips malformed rows rather than trusting them', () => {
    const tree = parseProcessTree(
      JSON.stringify({ console: 0, processes: [{ pid: 'x' }, { pid: 7, ppid: 1 }] })
    )
    expect(tree.processes.size).toBe(0)
  })
})

describe('ancestry', () => {
  it('follows parents, then the console when a parent has exited', () => {
    expect(pids(parseProcessTree(ORCA_PANE), 55152)).toEqual([55152, 52868, 28964, 4404, 38436])
  })

  it('does not follow a parent pid that a newer process has taken', () => {
    const tree = parseProcessTree(
      listing(0, [
        [10, 20, 'claude.exe', at(5)],
        [20, 1, 'WindowsTerminal.exe', at(9)]
      ])
    )
    expect(pids(tree, 10)).toEqual([10])
  })

  it('stops on a loop', () => {
    const tree = parseProcessTree(
      listing(11, [
        [10, 11, 'a.exe', at(1)],
        [11, 10, 'b.exe', at(1)]
      ])
    )
    expect(pids(tree, 10)).toEqual([10, 11])
  })

  it('treats console 0 (no console could be attached) as none, not as System Idle Process', () => {
    const tree = parseProcessTree(
      listing(0, [
        [10, 20, 'claude.exe', at(5)],
        [0, 0, 'System Idle Process', '0']
      ])
    )
    expect(pids(tree, 10)).toEqual([10])
    expect(focusWindowScript(10)).toContain('elseif (-not $isConsoleUsed -and $console[0])')
  })

  it('is empty for a process that is not listed', () => {
    expect(pids(parseProcessTree(ORCA_PANE), 1)).toEqual([])
  })
})

describe.runIf(process.platform === 'win32')('the scripts, run by PowerShell itself', () => {
  it('lists this process and its parent, with the console it is attached to', async () => {
    const chain = ancestry(
      parseProcessTree(await runCold(processTreeScript(process.pid))),
      process.pid
    )
    expect(chain[0]).toMatchObject({ pid: process.pid, name: 'node.exe' })
    expect(chain[1]?.pid).toBe(process.ppid)
  }, 30_000)

  it('gives the same ancestry from the shared listing and a console root', async () => {
    const tree = {
      consoleRoot: parseConsoleRoot(await runCold(consoleRootScript(process.pid))),
      processes: parseProcessList(await runCold(PROCESS_LIST_SCRIPT))
    }
    expect(pids(tree, process.pid).slice(0, 2)).toEqual([process.pid, process.ppid])
  }, 30_000)

  it('raises nothing, and says so, for a process that has exited', async () => {
    const exited = spawnSync(process.execPath, ['-e', ''], { windowsHide: true }).pid
    expect((await runCold(focusWindowScript(exited))).trim()).toBe('False')
  }, 30_000)
})
