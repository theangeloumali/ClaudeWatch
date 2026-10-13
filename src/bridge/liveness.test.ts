import { describe, expect, it, vi } from 'vitest'
import { POWERSHELL, powershellArgs, startTimeQuery } from '../shared/platform-process'
import { creationTicksScript, liveStartedAt } from './liveness'
import { fixtureIo, missing, registryEntry } from './__fixtures__/helpers'

const isLive = async (...args: Parameters<typeof liveStartedAt>): Promise<boolean> =>
  (await liveStartedAt(...args)) !== null

const startedAtMs = Date.parse('Sat Oct 10 15:29:12 2026 UTC')
const row = (pid: number, lstart: string) => ({ pid, lstart, startedAtMs, argv: ['claude'] })

describe('liveness on macOS', () => {
  const entry = { ...registryEntry(), cwd: '/repo', procStart: 'Sat Oct 10 15:29:12 2026' }

  it('collapses whitespace in a start ps prints and treats a missing pid as dead', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => 'Sat  Oct 10 15:29:12 2026\n')
    io.exec = exec
    expect(await isLive(entry, io, [], 'darwin')).toBe(true)
    expect(exec).toHaveBeenCalledWith('/bin/ps', ['-o', 'lstart=', '-p', '42'])
    io.exec = async () => {
      throw missing()
    }
    expect(await isLive(entry, io, [], 'darwin')).toBe(false)
  })
})

describe('liveness on Windows', () => {
  const entry = { ...registryEntry(), cwd: 'C:\\repo', procStart: '134361197520000000' }

  it('asks PowerShell for the FILETIME of a pid the table lacks', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => '134361197520000000\r\n')
    io.exec = exec
    expect(await isLive(entry, io, [], 'win32')).toBe(true)
    const { file, args } = startTimeQuery(42, 'win32')
    expect(exec).toHaveBeenCalledWith(file, args)
  })
  it('takes a pid another process reuses, under another FILETIME, as dead without asking', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => entry.procStart)
    io.exec = exec
    expect(await isLive(entry, io, [row(42, entry.procStart)], 'win32')).toBe(true)
    expect(await isLive(entry, io, [row(42, '134361197520000001')], 'win32')).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })
  it('remembers a start proven gone, and asks nothing of it again', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => '134361197520000009\r\n')
    io.exec = exec
    expect(await isLive(entry, io, [], 'win32')).toBe(false)
    expect(await isLive(entry, io, [], 'win32')).toBe(false)
    expect(exec).toHaveBeenCalledOnce()
  })
  it('asks again of a start it was answered nothing for, which proves nothing', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => '')
    io.exec = exec
    await isLive(entry, io, [], 'win32')
    await isLive(entry, io, [], 'win32')
    expect(exec).toHaveBeenCalledTimes(2)
  })
  it('takes a pid PowerShell answers no process for as dead', async () => {
    const io = fixtureIo()
    io.exec = async () => {
      throw Object.assign(new Error('Command failed'), { code: 1 })
    }
    expect(await isLive(entry, io, [], 'win32')).toBe(false)
  })
  it('cannot tell when PowerShell does not answer at all', async () => {
    const io = fixtureIo()
    io.exec = async () => {
      throw Object.assign(new Error('timed out'), { killed: true, code: null, signal: 'SIGTERM' })
    }
    await expect(isLive(entry, io, [], 'win32')).rejects.toThrow('timed out')
    io.exec = async () => {
      throw Object.assign(new Error('spawn powershell.exe ENOENT'), { code: 'ENOENT' })
    }
    await expect(isLive(entry, io, [], 'win32')).rejects.toThrow('ENOENT')
  })
})

// Without its native call Claude Code records CIM's CreationDate.Ticks instead of a FILETIME.
describe('liveness on Windows for a record in CreationDate ticks', () => {
  const FILETIME = '134361197520000000'
  const TICKS = '639287565520000000'
  const ticksEntry = { ...registryEntry(), cwd: 'C:\\repo', procStart: TICKS }
  const filetimeEntry = { ...ticksEntry, procStart: FILETIME }
  const listed = (filetime: string, ticks: string) => ({
    ...row(42, filetime),
    creationTicks: ticks
  })

  it('proves either record live from the row of its process, by the start it carries', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => '')
    io.exec = exec
    expect(await isLive(filetimeEntry, io, [listed(FILETIME, TICKS)], 'win32')).toBe(true)
    expect(await isLive(ticksEntry, io, [listed(FILETIME, TICKS)], 'win32')).toBe(true)
    expect(exec).not.toHaveBeenCalled()
  })
  it('takes either record as dead when its pid runs another process, started later', async () => {
    const io = fixtureIo()
    const reused = listed('134361197530000000', '639287565530000000')
    expect(await isLive(filetimeEntry, io, [reused], 'win32')).toBe(false)
    expect(await isLive(ticksEntry, io, [reused], 'win32')).toBe(false)
  })
  it('takes a record that matches neither start as dead', async () => {
    const io = fixtureIo()
    const stranger = { ...ticksEntry, procStart: '123' }
    expect(await isLive(stranger, io, [listed(FILETIME, TICKS)], 'win32')).toBe(false)
  })
  it('takes a ticks record whose pid has gone, which CIM answers with nothing, as dead', async () => {
    const io = fixtureIo()
    io.exec = async () => ''
    expect(await isLive(ticksEntry, io, [], 'win32')).toBe(false)
  })
  it('asks CIM for the ticks of a pid the table lacks, with its start, as Claude Code did', async () => {
    const io = fixtureIo()
    const exec = vi.fn(async () => `${TICKS} ${FILETIME}\r\n`)
    io.exec = exec
    expect(await liveStartedAt(ticksEntry, io, [], 'win32')).toBe(
      Date.parse('Sat Oct 10 15:29:12 2026 UTC')
    )
    expect(exec).toHaveBeenCalledExactlyOnceWith(
      POWERSHELL,
      powershellArgs(creationTicksScript(42))
    )
    expect(creationTicksScript(42)).toContain(
      'Get-CimInstance Win32_Process -Filter "ProcessId=42"'
    )
  })
  it('gives the start of a live process, and null for a dead one, whatever it is asked through', async () => {
    const io = fixtureIo()
    io.exec = async () => '134361197520000000\r\n'
    expect(await liveStartedAt(filetimeEntry, io, [], 'win32')).toBe(startedAtMs)
    expect(await liveStartedAt(filetimeEntry, io, [listed(FILETIME, TICKS)], 'win32')).toBe(
      startedAtMs
    )
    expect(
      await liveStartedAt(filetimeEntry, io, [listed('134361197520000001', TICKS)], 'win32')
    ).toBeNull()
  })
})
