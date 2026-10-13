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
import { ORCA_CLI, orcaCliEnv } from '../shared/orca-bundle'
import {
  childEnv,
  POWERSHELL,
  powershellArgs,
  powershellScriptOf,
  startTimeQuery
} from '../shared/platform-process'
import {
  consoleRootScript,
  PROCESS_LIST_SCRIPT,
  processTreeScript
} from '../shared/windows-console'
import { PARSED_OUTPUT_ENV } from '../shared/ps'
import { systemIo } from './io'
import { creationTicksScript } from './liveness'
import { OrcaSource } from './orca'
import { WINDOWS_PROCESS_TABLE_SCRIPT } from './process-table'

const START_TIME = powershellScriptOf(startTimeQuery(42, 'win32').args)

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

it("gives Orca the env its CLI needs and nothing more of this process's", async () => {
  vi.stubEnv('APPDATA', 'C:\\Users\\ada\\AppData\\Roaming')
  vi.stubEnv('CLAUDEWATCH_SECRET', 'canary')
  try {
    await systemIo.exec(ORCA_CLI, ['worktree', 'ps', '--json'])
    expect(execFile.mock.calls[0][2].env).toEqual(orcaCliEnv())
    expect(JSON.stringify(execFile.mock.calls[0][2].env)).not.toContain('canary')
  } finally {
    vi.unstubAllEnvs()
  }
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
  const output = await systemIo.exec(POWERSHELL, powershellArgs(START_TIME))
  // One kept shell runs every script; a cold start per poll costs a second of CPU.
  expect(output).toBe(`ran ${START_TIME}`)
  expect(runPowerShell).toHaveBeenCalledExactlyOnceWith(START_TIME, 5000)
  expect(execFile).not.toHaveBeenCalled()
  await expect(systemIo.exec('powershell.exe', powershellArgs(START_TIME))).rejects.toThrow(
    'forbidden'
  )
})

it('refuses PowerShell any argument but the one script, as one after it would run as code', async () => {
  for (const args of [
    [...powershellArgs(START_TIME), ';Write-Output INJECTED'],
    ['-Command', START_TIME],
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', 'JABQAEkARAA='],
    []
  ])
    await expect(systemIo.exec(POWERSHELL, args)).rejects.toThrow('forbidden: program')
  expect(runPowerShell).not.toHaveBeenCalled()
  expect(execFile).not.toHaveBeenCalled()
  await expect(systemIo.exec(POWERSHELL, powershellArgs(START_TIME))).resolves.toBeTypeOf('string')
})

it('runs only the bridge’s own PowerShell scripts, each for one integer pid at most', async () => {
  for (const script of [
    WINDOWS_PROCESS_TABLE_SCRIPT,
    START_TIME,
    powershellScriptOf(startTimeQuery(7, 'win32').args),
    creationTicksScript(55152),
    consoleRootScript(1234),
    PROCESS_LIST_SCRIPT
  ])
    await expect(systemIo.exec(POWERSHELL, powershellArgs(script))).resolves.toBeTypeOf('string')
  for (const script of [
    'arbitrary',
    'Get-Content C:\\Users\\me\\.claude\\.credentials.json',
    '$PID',
    START_TIME.replace('42', '42; Get-Content x'),
    START_TIME.replace('42', '-1'),
    START_TIME.replace('42', '042'),
    creationTicksScript(55152).replace('55152', '55152 OR 1=1'),
    `${consoleRootScript(1234)}\nGet-Content x`,
    `${PROCESS_LIST_SCRIPT}\nGet-Content x`,
    // A single tree is the main process's; the bridge reads the shared list instead.
    processTreeScript(1234)
  ])
    await expect(systemIo.exec(POWERSHELL, powershellArgs(script))).rejects.toThrow(
      'forbidden: program'
    )
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
  await systemIo.exec(POWERSHELL, powershellArgs(START_TIME), { timeoutMs: 1234 })
  expect(runPowerShell).toHaveBeenCalledExactlyOnceWith(START_TIME, 1234)
})

it('gives ps on macOS the same parsed-output env as before', async () => {
  await systemIo.exec('/bin/ps', ['-o', 'lstart=', '-p', '1'])
  expect(execFile.mock.calls[0][2].env).toEqual(childEnv())
  expect(childEnv('darwin')).toEqual(PARSED_OUTPUT_ENV)
})
