import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POWERSHELL_HOST_SCRIPT, PowerShellHost, type HostProcess } from './powershell-host'

const encode = (text: string): string => Buffer.from(text, 'utf8').toString('base64')
const decode = (text: string): string => Buffer.from(text, 'base64').toString('utf8')

// A stand-in for the kept PowerShell: it hears framed requests and is told what to answer.
class FakeShell extends EventEmitter implements HostProcess {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly requests: { id: string; script: string }[] = []
  killed = false
  constructor() {
    super()
    this.stdin.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n').filter(Boolean)) {
        const [id, body] = line.split(' ')
        this.requests.push({ id, script: decode(body) })
      }
    })
  }
  private get lastId(): string {
    return this.requests.at(-1)?.id ?? '0'
  }
  reply(text: string, id = this.lastId): void {
    this.stdout.write(`${id} ok ${encode(text)}\r\n`)
  }
  same(id = this.lastId): void {
    this.stdout.write(`${id} same\r\n`)
  }
  fail(message: string): void {
    this.stdout.write(`${this.lastId} error ${encode(message)}\r\n`)
  }
  kill(): boolean {
    this.killed = true
    this.emit('exit')
    return true
  }
}

interface Harness {
  host: PowerShellHost
  shells: FakeShell[]
  cold: ReturnType<typeof vi.fn<(script: string, timeoutMs: number) => Promise<string>>>
  exitHooks: (() => void)[]
}
function harness(): Harness {
  const shells: FakeShell[] = []
  const exitHooks: (() => void)[] = []
  const cold = vi.fn(async (script: string) => `cold ${script}`)
  const host = new PowerShellHost({
    start: () => {
      const shell = new FakeShell()
      shells.push(shell)
      return shell
    },
    runCold: cold,
    onParentExit: (stop) => exitHooks.push(stop)
  })
  return { host, shells, cold, exitHooks }
}
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

afterEach(() => vi.useRealTimers())

describe('a PowerShell kept running', () => {
  it('runs a script and returns what it printed, starting the shell once', async () => {
    const { host, shells } = harness()
    const first = host.run('$PID')
    await settle()
    shells[0].reply('4242')
    expect(await first).toBe('4242')
    const second = host.run('Get-Date')
    await settle()
    shells[0].reply('tuesday')
    expect(await second).toBe('tuesday')
    expect(shells).toHaveLength(1)
    expect(shells[0].requests.map((request) => request.script)).toEqual(['$PID', 'Get-Date'])
    expect(new Set(shells[0].requests.map((request) => request.id)).size).toBe(2)
  })
  it('sends one script at a time, the next only once the last has answered', async () => {
    const { host, shells } = harness()
    const first = host.run('one')
    const second = host.run('two')
    await settle()
    expect(shells[0].requests.map((request) => request.script)).toEqual(['one'])
    shells[0].reply('1')
    expect(await first).toBe('1')
    await settle()
    expect(shells[0].requests.map((request) => request.script)).toEqual(['one', 'two'])
    shells[0].reply('2')
    expect(await second).toBe('2')
  })
  it('reads an answer that arrives in pieces, and keeps text past ASCII whole', async () => {
    const { host, shells } = harness()
    const run = host.run('x')
    await settle()
    const line = `${shells[0].requests[0].id} ok ${encode('C:\\Users\\José\\claude.exe')}\n`
    shells[0].stdout.write(line.slice(0, 5))
    await settle()
    shells[0].stdout.write(line.slice(5))
    expect(await run).toBe('C:\\Users\\José\\claude.exe')
  })
  it('passes over a stray line, and an answer to a request it is not waiting on', async () => {
    const { host, shells } = harness()
    const run = host.run('x')
    await settle()
    shells[0].stdout.write('WARNING: something\n')
    shells[0].reply('stale', '999')
    shells[0].reply('fresh')
    expect(await run).toBe('fresh')
    expect(shells[0].killed).toBe(false)
  })
  it('returns a script that printed nothing as an empty answer, keeping the shell', async () => {
    const { host, shells } = harness()
    const run = host.run('$null')
    await settle()
    shells[0].reply('')
    expect(await run).toBe('')
    expect(shells[0].killed).toBe(false)
  })
  it('answers a reply the shell marks unchanged with its last output', async () => {
    const { host, shells } = harness()
    const first = host.run('table')
    await settle()
    shells[0].reply('x'.repeat(1000))
    const output = await first
    const again = host.run('table')
    await settle()
    shells[0].same()
    expect(await again).toBe(output)
  })
  it('remembers the last output of each script, so another script between leaves it unchanged', async () => {
    const { host, shells } = harness()
    const answer = async (script: string, respond: () => void): Promise<string> => {
      const run = host.run(script)
      await settle()
      respond()
      return run
    }
    const table = await answer('table', () => shells[0].reply('x'.repeat(1000)))
    expect(await answer('$PID', () => shells[0].reply('42'))).toBe('42')
    expect(await answer('table', () => shells[0].same())).toBe(table)
    expect(await answer('$PID', () => shells[0].same())).toBe('42')
  })
  it('takes an unchanged mark for a script never answered as the shell having failed', async () => {
    const { host, shells } = harness()
    const first = host.run('table')
    await settle()
    shells[0].reply('x')
    await first
    const run = host.run('other')
    await settle()
    shells[0].same()
    await expect(run).rejects.toMatchObject({ code: null })
  })
  it('takes an unchanged mark before any output as the shell having failed', async () => {
    const { host, shells } = harness()
    const run = host.run('table')
    await settle()
    shells[0].same()
    await expect(run).rejects.toMatchObject({ code: null })
    expect(shells[0].killed).toBe(true)
  })
  it('fails a script that threw with exit status 1, as a shell of its own would have', async () => {
    const { host, shells } = harness()
    const run = host.run('[Diagnostics.Process]::GetProcessById(7)')
    await settle()
    shells[0].fail('Process with an Id of 7 is not running.')
    await expect(run).rejects.toMatchObject({ code: 1, message: expect.stringContaining('7') })
  })
  it('kills a shell that does not answer in the time a call allows, and starts afresh', async () => {
    vi.useFakeTimers()
    const { host, shells } = harness()
    const run = host.run('Start-Sleep 60', 1000)
    const failed = expect(run).rejects.toMatchObject({ killed: true, code: null })
    await vi.advanceTimersByTimeAsync(1000)
    await failed
    expect(shells[0].killed).toBe(true)
    const next = host.run('$PID')
    await vi.advanceTimersByTimeAsync(0)
    shells[1].reply('7')
    expect(await next).toBe('7')
  })
  it('fails what was asked of a shell that died after answering, and starts afresh', async () => {
    const { host, shells, cold } = harness()
    const first = host.run('$PID')
    await settle()
    shells[0].reply('1')
    await first
    const run = host.run('$PID')
    await settle()
    shells[0].emit('exit')
    await expect(run).rejects.toMatchObject({ code: null })
    const next = host.run('$PID')
    await settle()
    shells[1].reply('8')
    expect(await next).toBe('8')
    expect(cold).not.toHaveBeenCalled()
  })
  it('runs a script cold when the shell cannot start, or exits before its first answer', async () => {
    const { host, shells, cold } = harness()
    const run = host.run('$PID', 2000)
    await settle()
    shells[0].emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }))
    expect(await run).toBe('cold $PID')
    const next = host.run('Get-Date')
    await settle()
    shells[1].emit('exit')
    expect(await next).toBe('cold Get-Date')
    expect(cold.mock.calls).toEqual([
      ['$PID', 2000],
      ['Get-Date', 5000]
    ])
  })
  it('kills its shell when the process it serves exits, and when it is closed', async () => {
    const { host, shells, exitHooks } = harness()
    const first = host.run('$PID')
    await settle()
    shells[0].reply('1')
    await first
    expect(exitHooks).toHaveLength(1)
    exitHooks[0]()
    expect(shells[0].killed).toBe(true)
    const next = host.run('$PID')
    await settle()
    shells[1].reply('2')
    await next
    host.close()
    expect(shells[1].killed).toBe(true)
    expect(exitHooks).toHaveLength(1)
  })
})

describe('the script the shell runs', () => {
  it('uses no double quotes, so it reaches PowerShell intact through Windows quoting', () => {
    expect(POWERSHELL_HOST_SCRIPT).not.toContain('"')
  })
  it('reads and writes the raw standard streams as UTF-8, never the console', () => {
    expect(POWERSHELL_HOST_SCRIPT).toContain('[Console]::OpenStandardInput()')
    expect(POWERSHELL_HOST_SCRIPT).toContain('[Console]::OpenStandardOutput()')
    expect(POWERSHELL_HOST_SCRIPT).not.toMatch(/\[Console\]::(In|Out|ReadLine|OutputEncoding)\b/)
  })
})
