import { beforeEach, expect, it, vi } from 'vitest'

const { execFile, runPowerShell, assertOrcaTrusted } = vi.hoisted(() => ({
  execFile: vi.fn(),
  runPowerShell: vi.fn(),
  assertOrcaTrusted: vi.fn()
}))
vi.mock('node:child_process', () => ({ execFile }))
vi.mock('../shared/powershell-host', () => ({ runPowerShell }))
vi.mock('../shared/orca-bundle', async (original) => ({
  ...(await original<typeof import('../shared/orca-bundle')>()),
  assertOrcaTrusted
}))
import { ORCA_CLI } from '../shared/orca-bundle'
import { childEnv, POWERSHELL, powershellArgs } from '../shared/platform-process'
import { PARSED_OUTPUT_ENV } from '../shared/ps'
import { systemIo } from './io'
import { OrcaSource } from './orca'

beforeEach(() => {
  vi.resetAllMocks()
  execFile.mockImplementation((_file, _args, _options, done) => done(null, '{"ok":true}'))
  assertOrcaTrusted.mockResolvedValue(undefined)
  runPowerShell.mockImplementation(async (script: string) => `ran ${script}`)
})

it('runs Orca from the app bundle, the file the main process runs, and no other copy', async () => {
  expect(await systemIo.exec(ORCA_CLI, ['worktree', 'ps', '--json'])).toBe('{"ok":true}')
  expect(execFile.mock.calls[0].slice(0, 2)).toEqual([ORCA_CLI, ['worktree', 'ps', '--json']])
  await expect(systemIo.exec('/opt/homebrew/bin/orca', ['worktree', 'ps'])).rejects.toThrow(
    'forbidden'
  )
  expect(execFile).toHaveBeenCalledTimes(1)
})

it('has the Orca bundle checked before it runs anything from it, and only then', async () => {
  await systemIo.exec('/bin/ps', ['-o', 'lstart=', '-p', '1'])
  expect(assertOrcaTrusted).not.toHaveBeenCalled()

  await systemIo.exec(ORCA_CLI, ['worktree', 'ps', '--json'])
  expect(assertOrcaTrusted).toHaveBeenCalledOnce()
  expect(assertOrcaTrusted.mock.invocationCallOrder[0]).toBeLessThan(
    execFile.mock.invocationCallOrder[1]
  )
})

it('runs nothing from an Orca bundle whose signature does not hold, and says Orca is unavailable', async () => {
  assertOrcaTrusted.mockRejectedValue(new Error('code failed to satisfy specified requirement'))
  await expect(systemIo.exec(ORCA_CLI, ['worktree', 'ps', '--json'])).rejects.toThrow()

  const installed = { ...systemIo, stat: async () => ({ directory: false, mtimeMs: 0, size: 1 }) }
  expect(await new OrcaSource(installed).poll(0)).toEqual({
    id: 'orca',
    ok: false,
    detail: 'unavailable'
  })
  expect(execFile).not.toHaveBeenCalled()
})

it('runs PowerShell by its absolute path, with nothing of this process’s env but what it needs', async () => {
  const output = await systemIo.exec(POWERSHELL, powershellArgs('$PID'))
  if (process.platform === 'win32') {
    // On Windows one kept shell runs every script; a cold start per poll costs a second of CPU.
    expect(output).toBe('ran $PID')
    expect(runPowerShell).toHaveBeenCalledExactlyOnceWith('$PID', 5000)
    expect(execFile).not.toHaveBeenCalled()
  } else {
    expect(output).toBe('{"ok":true}')
    expect(execFile.mock.calls[0].slice(0, 2)).toEqual([POWERSHELL, powershellArgs('$PID')])
    expect(execFile.mock.calls[0][2].env).toEqual(childEnv())
  }
  await expect(systemIo.exec('powershell.exe', powershellArgs('$PID'))).rejects.toThrow('forbidden')
})

it('refuses PowerShell any argument but the one script, as one after it would run as code', async () => {
  for (const args of [
    [...powershellArgs('$PID'), ';Write-Output INJECTED'],
    ['-Command', '$PID'],
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', 'JABQAEkARAA='],
    []
  ])
    await expect(systemIo.exec(POWERSHELL, args)).rejects.toThrow('forbidden: program')
  expect(runPowerShell).not.toHaveBeenCalled()
  expect(execFile).not.toHaveBeenCalled()
  await expect(systemIo.exec(POWERSHELL, powershellArgs('$PID'))).resolves.toBeTypeOf('string')
})

it('runs every program hidden, so no console window flashes on Windows', async () => {
  await systemIo.exec('/bin/ps', ['-o', 'lstart=', '-p', '1'])
  await systemIo.exec(ORCA_CLI, ['worktree', 'ps', '--json'])
  for (const [, , options] of execFile.mock.calls) expect(options.windowsHide).toBe(true)
})

it('holds a program to the time its caller allows, five seconds unless told', async () => {
  await systemIo.exec('/bin/ps', ['-o', 'lstart=', '-p', '1'])
  await systemIo.exec('/bin/ps', ['-o', 'lstart=', '-p', '1'], { timeoutMs: 1234 })
  expect(execFile.mock.calls.map(([, , options]) => options.timeout)).toEqual([5000, 1234])
  await systemIo.exec(POWERSHELL, powershellArgs('$PID'), { timeoutMs: 1234 })
  if (process.platform === 'win32')
    expect(runPowerShell).toHaveBeenCalledExactlyOnceWith('$PID', 1234)
  else expect(execFile.mock.calls[2][2].timeout).toBe(1234)
})

it('gives ps on macOS the same parsed-output env as before', async () => {
  await systemIo.exec('/bin/ps', ['-o', 'lstart=', '-p', '1'])
  expect(execFile.mock.calls[0][2].env).toEqual(childEnv())
  expect(childEnv('darwin')).toEqual(PARSED_OUTPUT_ENV)
})
