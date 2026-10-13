import { describe, expect, it, vi } from 'vitest'
import { POWERSHELL, powershellArgs } from '../shared/platform-process'
import {
  identityOf,
  PROCESS_TABLE_ARGS,
  readProcessTable,
  readWorkingFolder,
  rememberedFolder,
  WINDOWS_PROCESS_TABLE_SCRIPT
} from './process-table'
import { fixtureIo, windowsTableLine } from './__fixtures__/helpers'

// 2026-10-10 15:29:12 UTC, as `ps` prints it and as Windows records it.
const LSTART = 'Sat Oct 10 15:29:12 2026'
const FILETIME = '134361197520000000'
const STARTED_AT_MS = Date.parse(`${LSTART} UTC`)

describe('the process table on macOS', () => {
  it('asks ps for every own process with its start time and argv', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => `  42 ${LSTART} /usr/bin/claude --resume\n`)
    io.exec = exec
    expect(await readProcessTable(io, 'darwin')).toEqual([
      { pid: 42, lstart: LSTART, startedAtMs: STARTED_AT_MS, argv: ['/usr/bin/claude', '--resume'] }
    ])
    expect(exec).toHaveBeenCalledWith('/bin/ps', PROCESS_TABLE_ARGS)
  })
  it('asks lsof where a process runs', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => 'p42\nfcwd\nn/repo\n')
    io.exec = exec
    expect(await readWorkingFolder(io, 42, 'darwin')).toBe('/repo')
    expect(exec).toHaveBeenCalledWith('/usr/sbin/lsof', ['-a', '-p', '42', '-d', 'cwd', '-Fn'])
  })
})

describe('the process table on Windows', () => {
  const line = '"C:\\Program Files\\Claude\\claude.exe" --agent-id "lena@team one"'

  it('asks PowerShell for this logon session’s processes, with both starts Claude records', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => windowsTableLine(42, FILETIME, line, '639287565520000000'))
    io.exec = exec
    expect(await readProcessTable(io, 'win32')).toEqual([
      {
        pid: 42,
        lstart: FILETIME,
        startedAtMs: STARTED_AT_MS,
        argv: ['C:\\Program Files\\Claude\\claude.exe', '--agent-id', 'lena@team one'],
        creationTicks: '639287565520000000'
      }
    ])
    expect(exec).toHaveBeenCalledWith(POWERSHELL, powershellArgs(WINDOWS_PROCESS_TABLE_SCRIPT))
  })
  it('reads a row a line, a command line past ASCII whole, and no rows as nothing', async () => {
    const io = fixtureIo()
    const lines = [
      windowsTableLine(7, FILETIME, 'codex.exe'),
      windowsTableLine(8, FILETIME, 'C:\\José\\opencode.exe')
    ]
    io.exec = async () => `${lines.join('\n')}\r\n`
    expect((await readProcessTable(io, 'win32')).map((row) => row.argv[0])).toEqual([
      'codex.exe',
      'C:\\José\\opencode.exe'
    ])
    io.exec = async () => '\r\n'
    expect(await readProcessTable(io, 'win32')).toEqual([])
  })
  it('skips rows that are not a pid, a FILETIME and a command line', async () => {
    const io = fixtureIo()
    const encoded = Buffer.from('c.exe').toString('base64')
    io.exec = async () =>
      [
        windowsTableLine(0, FILETIME, 'a.exe'),
        windowsTableLine(2 ** 53, FILETIME, 'b.exe'),
        `8 Sat 639287565520000000 ${encoded}`,
        `9 ${FILETIME} ${encoded}`,
        windowsTableLine(10, FILETIME, '   '),
        'Get-CimInstance : Access denied',
        windowsTableLine(11, FILETIME, 'kept.exe')
      ].join('\n')
    expect((await readProcessTable(io, 'win32')).map((row) => row.pid)).toEqual([11])
  })
  it('parses a table the kept shell answers unchanged only once', async () => {
    const io = fixtureIo()
    const table = windowsTableLine(12, FILETIME, 'codex.exe')
    io.exec = async () => table
    const [first] = await readProcessTable(io, 'win32')
    const [second] = await readProcessTable(io, 'win32')
    expect(second).toBe(first)
  })
  it('lets go of each process it looks at, rather than holding hundreds of handles a poll', () => {
    expect(WINDOWS_PROCESS_TABLE_SCRIPT).toMatch(
      /foreach \(\$process in \[Diagnostics\.Process\]::GetProcesses\(\)\) \{[^]*?finally \{ \$process\.Dispose\(\) \}/
    )
  })
  it('names no working folder, and runs nothing to find one', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => 'n/repo\n')
    io.exec = exec
    expect(await readWorkingFolder(io, 42, 'win32')).toBeUndefined()
    expect(await rememberedFolder(io, new Map(), { pid: 42, startedAtMs: 1 }, 'win32')).toBe(
      undefined
    )
    expect(exec).not.toHaveBeenCalled()
  })
})

describe('remembered folders', () => {
  it('asks as the platform it runs on when no platform is named', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => 'n/repo\n')
    io.exec = exec
    const folder = await rememberedFolder(io, new Map(), { pid: 42, startedAtMs: 1 })
    // Only lsof can name another process's folder; Windows has no such question to ask.
    if (process.platform === 'win32') {
      expect(folder).toBeUndefined()
      expect(exec).not.toHaveBeenCalled()
    } else
      expect(exec).toHaveBeenCalledWith('/usr/sbin/lsof', ['-a', '-p', '42', '-d', 'cwd', '-Fn'])
  })
  it('asks the platform it is told where a process runs, once per pid and start', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => 'n/repo\n')
    io.exec = exec
    const folders = new Map<string, string>()
    const owner = { pid: 42, startedAtMs: 1 }
    expect(await rememberedFolder(io, folders, owner, 'darwin')).toBe('/repo')
    expect(await rememberedFolder(io, folders, owner, 'darwin')).toBe('/repo')
    expect(await rememberedFolder(io, folders, { pid: 42, startedAtMs: 2 }, 'darwin')).toBe('/repo')
    expect(exec).toHaveBeenCalledTimes(2)
    expect(identityOf(owner)).toBe('42:1')
  })
})
