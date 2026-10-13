// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFilePromise, assertOrcaTrusted } = vi.hoisted(() => ({
  execFilePromise: vi.fn(),
  assertOrcaTrusted: vi.fn()
}))
vi.mock('../platform/exec', () => ({ execFilePromise }))
vi.mock('../../shared/orca-bundle', async (original) => ({
  ...(await original<typeof import('../../shared/orca-bundle')>()),
  assertOrcaTrusted
}))

import { ORCA_CLI, orcaBundle } from '../../shared/orca-bundle'
import { childEnv } from '../../shared/platform-process'
import { createAccountLedger, orcaDataFolder } from './index'

const CANARY = 'CANARY_SECRET_VALUE'
// A ledger runs the CLI of the platform it is given, not the host's.
const MAC_ORCA_CLI = orcaBundle('darwin').cli
const oauthAccount = (name: string): Record<string, unknown> => ({
  accountUuid: `uuid-${name}`,
  organizationUuid: `org-${name}`,
  emailAddress: `${name}@example.test`,
  organizationName: `${name} Labs`,
  organizationRateLimitTier: 'max',
  accessToken: CANARY
})

let home: string
let userData: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'cw-home-'))
  userData = await mkdtemp(join(tmpdir(), 'cw-userdata-'))
  await writeFile(
    join(home, '.claude.json'),
    JSON.stringify({ oauthAccount: oauthAccount('ada'), mcpServers: { x: { env: { K: CANARY } } } })
  )
  const auth = join(home, 'Library', 'Application Support', 'orca', 'claude-accounts', 'a1', 'auth')
  await mkdir(auth, { recursive: true })
  await writeFile(join(auth, 'oauth-account.json'), JSON.stringify(oauthAccount('grace')))
  await writeFile(join(auth, '.orca-managed-claude-auth'), CANARY)
  execFilePromise.mockReset()
  assertOrcaTrusted.mockReset()
  assertOrcaTrusted.mockResolvedValue(undefined)
  execFilePromise.mockImplementation(async (program: string) => ({
    stdout:
      program === ORCA_CLI || program === MAC_ORCA_CLI
        ? JSON.stringify({ ok: true, result: { claude: { accounts: [] }, token: CANARY } })
        : '',
    stderr: ''
  }))
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(home, { recursive: true, force: true })
  await rm(userData, { recursive: true, force: true })
})

const everyFile = async (folder: string): Promise<string[]> =>
  (await readdir(folder, { recursive: true })).sort()

it('watches the real files with one fixed, scrubbed Orca command, and keeps its ledger private', async () => {
  const before = await everyFile(home)
  const ledger = createAccountLedger({ isWatching: true, home, userData, platform: 'darwin' })
  ledger.start()
  await vi.waitFor(() => expect(execFilePromise).toHaveBeenCalledTimes(1))
  await vi.waitFor(async () =>
    expect(await ledger.dashboardState()).toMatchObject({
      status: 'on',
      accounts: [{ email: 'ada@example.test', isActive: true }, { email: 'grace@example.test' }]
    })
  )
  ledger.stop()

  // Only what the CLI needs to start: the C locale and UTC, and SystemRoot on Windows.
  const scrubbed = { timeout: 15_000, env: childEnv() }
  // The bundle check is the one the whole process shares, not a second one of the ledger's.
  expect(assertOrcaTrusted).toHaveBeenCalledOnce()
  expect(execFilePromise.mock.calls).toEqual([
    [MAC_ORCA_CLI, ['account', 'list', '--json'], scrubbed]
  ])
  const file = join(userData, 'accounts-ledger.json')
  // Windows has no POSIX mode bits: there the profile folder's ACL keeps the ledger private.
  if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600)
  expect(await readFile(file, 'utf8')).not.toContain(CANARY)
  expect(await readFile(file, 'utf8')).not.toMatch(/uuid-ada|uuid-grace/)
  // Nothing is ever written beside the files it reads.
  expect(await everyFile(home)).toEqual(before)
})

it('touches no file and runs no program while accounts are not watched', async () => {
  const ledger = createAccountLedger({ isWatching: false, home, userData, platform: 'darwin' })
  ledger.start()
  expect(await ledger.dashboardState()).toEqual({ status: 'off' })
  ledger.stop()
  expect(execFilePromise).not.toHaveBeenCalled()
  expect(await readdir(userData)).toEqual([])
})

it("finds Orca's accounts under the roaming app-data folder on Windows", async () => {
  const appData = join(home, 'Roaming')
  const auth = join(appData, 'orca', 'claude-accounts', 'b2', 'auth')
  await mkdir(auth, { recursive: true })
  await writeFile(join(auth, 'oauth-account.json'), JSON.stringify(oauthAccount('hopper')))
  const ledger = createAccountLedger({
    isWatching: true,
    home,
    userData,
    platform: 'win32',
    appData
  })
  ledger.start()
  await vi.waitFor(async () =>
    expect(await ledger.dashboardState()).toMatchObject({
      accounts: [{ email: 'ada@example.test' }, { email: 'hopper@example.test' }]
    })
  )
  ledger.stop()
})

it('hands the Orca CLI the app-data folder it cannot start without on Windows', async () => {
  const appData = join(home, 'Roaming')
  vi.stubEnv('APPDATA', appData)
  const ledger = createAccountLedger({
    isWatching: true,
    home,
    userData,
    platform: 'win32',
    appData
  })
  ledger.start()
  await vi.waitFor(() => expect(execFilePromise).toHaveBeenCalledTimes(1))
  ledger.stop()
  expect(execFilePromise.mock.calls[0][2].env).toEqual({ ...childEnv('win32'), APPDATA: appData })
})

describe('orcaDataFolder', () => {
  it('is under Application Support on macOS', () => {
    expect(orcaDataFolder({ home: '/Users/ada', platform: 'darwin' })).toBe(
      join('/Users/ada', 'Library', 'Application Support', 'orca')
    )
  })

  it('is in %APPDATA% on Windows', () => {
    expect(
      orcaDataFolder({ home: 'C:\\Users\\ada', platform: 'win32', appData: 'D:\\Roaming' })
    ).toBe(join('D:\\Roaming', 'orca'))
  })

  it("falls back to the profile's roaming folder when %APPDATA% is unset", () => {
    vi.stubEnv('APPDATA', '')
    expect(orcaDataFolder({ home: 'C:\\Users\\ada', platform: 'win32' })).toBe(
      join('C:\\Users\\ada', 'AppData', 'Roaming', 'orca')
    )
  })
})
