import { execFile } from 'node:child_process'
import { win32 } from 'node:path'
import {
  childEnv,
  LOCAL_APP_DATA,
  POWERSHELL,
  POWERSHELL_SPAWN,
  powershellArgs
} from './platform-process'

export interface OrcaBundle {
  platform: NodeJS.Platform
  app: string
  cli: string
}

// The app's own CLI, not whatever `orca` is first on PATH: on macOS Homebrew's is a symlink to
// it, and on Windows `orca.cmd` would hand the arguments to cmd.exe to reparse.
export function orcaBundle(
  platform: NodeJS.Platform = process.platform,
  localAppData = LOCAL_APP_DATA
): OrcaBundle {
  if (platform !== 'win32') {
    const app = '/Applications/Orca.app'
    return { platform, app, cli: `${app}/Contents/Resources/bin/orca` }
  }
  const install = win32.join(localAppData, 'Programs', 'orca')
  return {
    platform,
    app: win32.join(install, 'Orca.exe'),
    cli: win32.join(install, 'resources', 'bin', 'orca.exe')
  }
}

const BUNDLE = orcaBundle()
export const ORCA_CLI = BUNDLE.cli
// The Developer ID team that signs Orca (read from Orca 1.4.224).
export const ORCA_TEAM_ID = '6CX3WHS9HZ'
// The Authenticode signer of Orca's Windows binaries (read from Orca 1.4.221).
export const ORCA_SIGNER =
  'CN=SignPath Foundation, O=SignPath Foundation, L=Lewes, S=Delaware, C=US'

// On Windows the CLI cannot find its runtime without APPDATA.
export function orcaCliEnv(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const base = childEnv(platform)
  return platform === 'win32' && env.APPDATA ? { ...base, APPDATA: env.APPDATA } : base
}

const CODESIGN = '/usr/bin/codesign'
const VERIFY_TIMEOUT_MS = 15_000
// Apple's root, a Developer ID intermediate and leaf, and Orca's team on that leaf. An ad-hoc
// signature has no certificate, so nothing a bundle says about itself can satisfy this.
const SIGNED_BY_ORCA = `anchor apple generic and certificate leaf[subject.OU] = "${ORCA_TEAM_ID}" and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists`
// --deep --strict: the CLI is a script that starts code nested in the bundle.
export const verifyArgs = (bundle: string): string[] => [
  '--verify',
  '--deep',
  '--strict',
  `-R=${SIGNED_BY_ORCA}`,
  bundle
]
// SignPath's certificate signs many projects, and each sets its own version strings, so the
// company and each binary's own names are pinned as well (the CLI says "Stably AI", the app
// "stablyai"; `-ne` ignores case). Residual risk: unlike macOS's --deep --strict, this seals
// only the two binaries. The CLI runs Orca.exe on the unsigned, user-writable
// resources\app.asar.unpacked\out\cli\index.js, which nothing here checks.
const AUTHENTICODE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$expected = @(',
  "  @{ path = $env:CLAUDEWATCH_ORCA_CLI; original = 'orca.exe'; internal = 'orca.exe' },",
  "  @{ path = $env:CLAUDEWATCH_ORCA_APP; original = ''; internal = 'Orca' }",
  ')',
  'foreach ($binary in $expected) {',
  '$signature = Get-AuthenticodeSignature -LiteralPath $binary.path',
  "if ($signature.Status -ne 'Valid') { throw 'not validly signed' }",
  `if ($signature.SignerCertificate.Subject -cne '${ORCA_SIGNER}') { throw 'not signed for Orca' }`,
  '$info = (Get-Item -LiteralPath $binary.path).VersionInfo',
  "if (($info.CompanyName -replace '\\s', '') -ne 'stablyai') { throw 'not Orca' }",
  "if ($info.ProductName -cne 'Orca') { throw 'not Orca' }",
  "if ([string]$info.OriginalFilename -cne $binary.original) { throw 'not Orca' }",
  "if ([string]$info.InternalName -cne $binary.internal) { throw 'not Orca' }",
  '}',
  "'trusted'"
].join('\n')
// One verify (about 0.5 s) covers a burst of calls. The bundle is checked by path and then run
// by path, so a swap inside this window, or between the check and the run, is not caught:
// accepted, since closing it would need the checked file itself to be the one executed.
export const ORCA_TRUST_MS = 3_000

function verifyCodesign(bundle: OrcaBundle): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      CODESIGN,
      verifyArgs(bundle.app),
      { timeout: VERIFY_TIMEOUT_MS, env: { LC_ALL: 'C' } },
      (error) => (error ? reject(error) : resolve())
    )
  })
}

// Paths travel in the environment: `-Command` splices any trailing argument into the script.
function verifyAuthenticode(bundle: OrcaBundle): Promise<void> {
  const env = {
    ...childEnv('win32'),
    CLAUDEWATCH_ORCA_CLI: bundle.cli,
    CLAUDEWATCH_ORCA_APP: bundle.app
  }
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      powershellArgs(AUTHENTICODE_SCRIPT),
      { timeout: VERIFY_TIMEOUT_MS, env, ...POWERSHELL_SPAWN },
      (error, stdout) => {
        if (!error && String(stdout).trim() === 'trusted') resolve()
        else reject(error ?? new Error('Orca is not trusted'))
      }
    )
  })
}

// Resolves when Orca's bundle is sealed and signed by Orca's team; rejects otherwise. A failed
// check is not remembered, so an Orca installed later works without a restart.
// `minLeftMs` is how much of the window a caller needs left: with less, it is checked afresh.
export function createOrcaTrust(
  now: () => number = Date.now,
  bundle: OrcaBundle = BUNDLE
): (minLeftMs?: number) => Promise<void> {
  const verifySignature = bundle.platform === 'win32' ? verifyAuthenticode : verifyCodesign
  let trusted: Promise<void> | null = null
  let checkedAtMs = 0
  return (minLeftMs = 0) => {
    if (!trusted || now() - checkedAtMs > ORCA_TRUST_MS - minLeftMs) {
      checkedAtMs = now()
      const check = verifySignature(bundle)
      trusted = check
      check.catch(() => {
        if (trusted === check) trusted = null
      })
    }
    return trusted
  }
}

// One per process: everything in it that runs the Orca CLI shares a single check per burst.
export const assertOrcaTrusted = createOrcaTrust()
