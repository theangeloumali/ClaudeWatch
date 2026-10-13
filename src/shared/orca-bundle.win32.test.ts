import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile }))

import { createOrcaTrust, orcaBundle, orcaCliEnv, ORCA_SIGNER } from './orca-bundle'
import { POWERSHELL, POWERSHELL_CWD } from './platform-process'

type Done = (error: Error | null, stdout: string) => void

const LOCAL = 'C:\\Users\\dev\\AppData\\Local'
const bundle = orcaBundle('win32', LOCAL)

describe('the Orca install on Windows', () => {
  it('is the per-user install, and the CLI is the native launcher, never orca.cmd', () => {
    expect(bundle).toEqual({
      platform: 'win32',
      app: 'C:\\Users\\dev\\AppData\\Local\\Programs\\orca\\Orca.exe',
      cli: 'C:\\Users\\dev\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca.exe'
    })
  })

  it('keeps the macOS bundle on darwin', () => {
    expect(orcaBundle('darwin')).toEqual({
      platform: 'darwin',
      app: '/Applications/Orca.app',
      cli: '/Applications/Orca.app/Contents/Resources/bin/orca'
    })
  })

  it('runs the CLI with APPDATA, where it finds its runtime, and nothing else of this process', () => {
    expect(
      orcaCliEnv('win32', { APPDATA: 'C:\\Users\\dev\\AppData\\Roaming', SECRET: 'x' })
    ).toEqual(expect.objectContaining({ APPDATA: 'C:\\Users\\dev\\AppData\\Roaming', LC_ALL: 'C' }))
    expect(orcaCliEnv('win32', { SECRET: 'x' })).not.toHaveProperty('SECRET')
    expect(orcaCliEnv('darwin', { APPDATA: 'x' })).toEqual({ LC_ALL: 'C', TZ: 'UTC' })
  })
})

describe('the Orca signature check on Windows', () => {
  let stdout: string
  let error: Error | null

  beforeEach(() => {
    execFile.mockReset()
    stdout = 'trusted\r\n'
    error = null
    execFile.mockImplementation((_file: string, _args: string[], _options: object, done: Done) =>
      done(error, stdout)
    )
  })

  it('runs one fixed PowerShell script, with both paths passed in the environment', async () => {
    await createOrcaTrust(Date.now, bundle)()

    expect(execFile).toHaveBeenCalledOnce()
    const [program, args, options] = execFile.mock.calls[0]
    expect(program).toBe(POWERSHELL)
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command'])
    expect(args).toHaveLength(4)
    expect(args[3]).not.toContain('Programs')
    expect(options).toMatchObject({
      windowsHide: true,
      // A planted module beside the launch folder must not load into the very check that trusts Orca.
      cwd: POWERSHELL_CWD,
      env: { CLAUDEWATCH_ORCA_CLI: bundle.cli, CLAUDEWATCH_ORCA_APP: bundle.app }
    })
  })

  it('requires a valid Authenticode signature by the pinned signer, and Orca as the company', async () => {
    await createOrcaTrust(Date.now, bundle)()
    const script: string = execFile.mock.calls[0][1][3]
    expect(ORCA_SIGNER).toBe(
      'CN=SignPath Foundation, O=SignPath Foundation, L=Lewes, S=Delaware, C=US'
    )
    expect(script).toContain(`-cne '${ORCA_SIGNER}'`)
    expect(script).toContain("Status -ne 'Valid'")
    expect(script).toContain('-LiteralPath')
    expect(script).toContain("'stablyai'")
  })

  it('pins each binary’s own names, which a SignPath-signed program of another project lacks', async () => {
    await createOrcaTrust(Date.now, bundle)()
    const script: string = execFile.mock.calls[0][1][3]
    // Read from Orca 1.4.221: the app's OriginalFilename is empty.
    expect(script).toContain(
      "@{ path = $env:CLAUDEWATCH_ORCA_CLI; original = 'orca.exe'; internal = 'orca.exe' }"
    )
    expect(script).toContain(
      "@{ path = $env:CLAUDEWATCH_ORCA_APP; original = ''; internal = 'Orca' }"
    )
    expect(script).toContain("$info.ProductName -cne 'Orca'")
    expect(script).toContain('[string]$info.OriginalFilename -cne $binary.original')
    expect(script).toContain('[string]$info.InternalName -cne $binary.internal')
  })

  it('rejects when PowerShell fails, and when it does not say the bundle is trusted', async () => {
    error = new Error('unsigned')
    await expect(createOrcaTrust(Date.now, bundle)()).rejects.toThrow()
    error = null
    stdout = ''
    await expect(createOrcaTrust(Date.now, bundle)()).rejects.toThrow()
  })

  it('keeps the trust window: one check for a burst, a fresh one after a failure', async () => {
    let now = 1_000
    const assertTrusted = createOrcaTrust(() => now, bundle)
    await Promise.all([assertTrusted(), assertTrusted()])
    expect(execFile).toHaveBeenCalledOnce()
    error = new Error('unsigned')
    now += 10_000
    await expect(assertTrusted()).rejects.toThrow()
    error = null
    await expect(assertTrusted()).resolves.toBeUndefined()
    expect(execFile).toHaveBeenCalledTimes(3)
  })
})
