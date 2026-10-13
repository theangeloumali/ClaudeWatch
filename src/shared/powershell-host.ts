import { execFile, spawn } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { childEnv, POWERSHELL, POWERSHELL_SPAWN, powershellArgs } from './platform-process'

// Reads one id and base64 script per line and answers each on one line, so PowerShell starts
// once and not on every poll: a cold start costs around a second of CPU. An output equal to
// the same script's last is answered `same`; both sides remember up to 32 scripts and forget
// them all together. Only the raw std streams are used: a script may free the console.
export const POWERSHELL_HOST_SCRIPT = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object Text.UTF8Encoding $false
$reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), $utf8)
$writer = [IO.StreamWriter]::new([Console]::OpenStandardOutput(), $utf8)
$writer.AutoFlush = $true
$last = [Collections.Generic.Dictionary[string, string]]::new()
while ($null -ne ($request = $reader.ReadLine())) {
  $id, $body = $request.Split(' ')
  try {
    $script = [ScriptBlock]::Create($utf8.GetString([Convert]::FromBase64String($body)))
    $output = [string]((& $script) -join [char]10)
    if ($last.ContainsKey($body) -and $output -ceq $last[$body]) { $reply = $id + ' same' }
    else {
      if ($last.Count -ge 32 -and -not $last.ContainsKey($body)) { $last.Clear() }
      $last[$body] = $output
      $reply = $id + ' ok ' + [Convert]::ToBase64String($utf8.GetBytes($output))
    }
  } catch {
    $reply = $id + ' error ' + [Convert]::ToBase64String($utf8.GetBytes([string]$_))
  }
  $writer.WriteLine($reply)
}`

export interface HostProcess {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  kill(): boolean
  on(event: 'exit' | 'error', listener: (error: unknown) => void): unknown
}

interface HostOptions {
  start?: () => HostProcess
  // A script run in a shell of its own, for when the kept one cannot start.
  runCold?: (script: string, timeoutMs: number) => Promise<string>
  onParentExit?: (stop: () => void) => void
}

interface Pending {
  id: number
  script: string
  timeoutMs: number
  resolve(output: string): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

const DEFAULT_TIMEOUT_MS = 5000
const MAX_REPLY_BYTES = 8 * 1024 * 1024
const MAX_REMEMBERED = 32
const REPLY = /^(\d+) (?:(ok|error) ([A-Za-z0-9+/]*={0,2})|same)$/
const decode = (base64: string): string => Buffer.from(base64, 'base64').toString('utf8')
// What execFile reports: a status for a script that ran and failed, none for a shell that did not.
const failure = (message: string, extra: { code: number | null; killed?: boolean }): Error =>
  Object.assign(new Error(message), extra)

function startShell(): HostProcess {
  const shell = spawn(POWERSHELL, powershellArgs(POWERSHELL_HOST_SCRIPT), {
    env: childEnv('win32'),
    ...POWERSHELL_SPAWN,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  // Nothing reads what PowerShell writes to stderr, and a full pipe would stall it.
  shell.stderr.resume()
  // An idle shell never keeps its parent running; a script waiting on it holds its own timer.
  shell.unref()
  for (const stream of [shell.stdin, shell.stdout, shell.stderr])
    if ('unref' in stream && typeof stream.unref === 'function') stream.unref()
  return shell
}

function runCold(script: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      powershellArgs(script),
      {
        env: childEnv('win32'),
        ...POWERSHELL_SPAWN,
        timeout: timeoutMs,
        maxBuffer: MAX_REPLY_BYTES
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    )
  })
}

export class PowerShellHost {
  private shell: HostProcess | null = null
  private hasAnswered = false
  private buffered = ''
  // Each script's last output, which the shell answers `same` to; kept as the shell keeps it.
  private readonly last = new Map<string, string>()
  private pending: Pending | null = null
  private nextId = 1
  private queue: Promise<unknown> = Promise.resolve()
  private watchesParent = false
  private readonly start: () => HostProcess
  private readonly runCold: (script: string, timeoutMs: number) => Promise<string>
  private readonly onParentExit: (stop: () => void) => void

  constructor({
    start = startShell,
    runCold: cold = runCold,
    onParentExit = (stop) => process.once('exit', stop)
  }: HostOptions = {}) {
    this.start = start
    this.runCold = cold
    this.onParentExit = onParentExit
  }

  run(script: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    const result = this.queue.then(() => this.send(script, timeoutMs))
    this.queue = result.catch(() => undefined)
    return result
  }

  close(): void {
    this.drop(failure('PowerShell host closed', { code: null }))
  }

  private send(script: string, timeoutMs: number): Promise<string> {
    const shell = this.shell ?? this.open()
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const timer = setTimeout(
        () => this.drop(failure('PowerShell did not answer in time', { killed: true, code: null })),
        timeoutMs
      )
      this.pending = { id, script, timeoutMs, resolve, reject, timer }
      shell.stdin.write(`${id} ${Buffer.from(script, 'utf8').toString('base64')}\n`)
    })
  }

  private open(): HostProcess {
    if (!this.watchesParent) this.onParentExit(() => this.close())
    this.watchesParent = true
    const shell = this.start()
    this.shell = shell
    this.hasAnswered = false
    this.buffered = ''
    this.last.clear()
    shell.stdout.on('data', (chunk: Buffer | string) => {
      if (shell === this.shell) this.read(String(chunk))
    })
    // A write to a shell that has just died fails here too; its exit is what reports it.
    shell.stdin.on('error', () => {})
    shell.on('exit', () => this.lost(shell, failure('PowerShell exited', { code: null })))
    shell.on('error', (error) =>
      this.lost(shell, error instanceof Error ? error : failure(String(error), { code: null }))
    )
    return shell
  }

  private read(chunk: string): void {
    this.buffered += chunk
    if (this.buffered.length > MAX_REPLY_BYTES)
      return this.drop(failure('PowerShell reply too large', { code: null }))
    let newline: number
    while (this.shell && (newline = this.buffered.indexOf('\n')) >= 0) {
      // Only the CR goes: an empty output's reply ends in the space before its empty base64.
      const line = this.buffered.slice(0, newline).replace(/\r$/, '')
      this.buffered = this.buffered.slice(newline + 1)
      this.answer(line)
    }
  }

  // A line that is not an answer to the waiting request is something a script printed itself.
  private answer(line: string): void {
    const reply = REPLY.exec(line)
    const pending = this.pending
    if (!reply || !pending || Number(reply[1]) !== pending.id) return
    const [, , kind, base64] = reply
    const known = this.last.get(pending.script)
    if (!kind && known === undefined)
      return this.drop(failure('PowerShell broke protocol', { code: null }))
    this.settle()
    this.hasAnswered = true
    if (kind === 'error') return pending.reject(failure(decode(base64), { code: 1 }))
    if (!kind) return pending.resolve(known ?? '')
    const output = decode(base64)
    if (this.last.size >= MAX_REMEMBERED && !this.last.has(pending.script)) this.last.clear()
    this.last.set(pending.script, output)
    pending.resolve(output)
  }

  private settle(): Pending | null {
    const pending = this.pending
    if (pending) clearTimeout(pending.timer)
    this.pending = null
    return pending
  }

  private drop(error: Error): void {
    const shell = this.shell
    this.shell = null
    shell?.kill()
    this.settle()?.reject(error)
  }

  // A shell that never answered could not start, and the script still deserves its run.
  private lost(shell: HostProcess, error: Error): void {
    if (shell !== this.shell) return
    this.shell = null
    const pending = this.settle()
    if (!pending) return
    if (this.hasAnswered) return pending.reject(error)
    this.runCold(pending.script, pending.timeoutMs).then(pending.resolve, pending.reject)
  }
}

let shared: PowerShellHost | null = null

// One kept PowerShell per process, started on first use; scripts only, run one at a time.
export function runPowerShell(script: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  shared ??= new PowerShellHost()
  return shared.run(script, timeoutMs)
}

export function closePowerShellHost(): void {
  shared?.close()
}

// A click's script compiles a helper on a fresh host's first run, past a poll's 5 s.
const INTERACTIVE_TIMEOUT_MS = 20_000
export const runInteractivePowerShell = (script: string): Promise<string> =>
  runPowerShell(script, INTERACTIVE_TIMEOUT_MS)
