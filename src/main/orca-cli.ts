import { assertOrcaTrusted, orcaBundle, orcaCliEnv } from '../shared/orca-bundle'
import type { OrcaExec } from './orca-terminals'
import { launchWindowsApp } from './windows-terminals'

const ORCA_TIMEOUT_MS = 15_000
// Keystrokes follow a screen read and rely on what it showed. The read renews a check with
// under this long left, so no codesign run lands between the two and widens that gap.
const READ_TO_SEND_MS = 1000
const isScreenRead = (args: string[]): boolean => args[0] === 'terminal' && args[1] === 'read'

type RunProgram = (
  program: string,
  args: string[],
  options: { timeout: number; env?: NodeJS.ProcessEnv }
) => Promise<{ stdout: string; stderr: string }>

type LaunchApp = (program: string) => Promise<void>

interface OrcaCli {
  exec: OrcaExec
  // Brings Orca's window forward; false when it could not, or when the bundle is not trusted.
  raise: () => Promise<boolean>
}

// Nothing in the bundle runs until its seal and signing team have been checked.
export function createOrcaCli(
  run: RunProgram,
  assertTrusted: (minLeftMs?: number) => Promise<void> = assertOrcaTrusted,
  platform: NodeJS.Platform = process.platform,
  launch: LaunchApp = launchWindowsApp
): OrcaCli {
  const bundle = orcaBundle(platform)
  const isWindows = platform === 'win32'
  const options = isWindows
    ? { timeout: ORCA_TIMEOUT_MS, env: orcaCliEnv(platform) }
    : { timeout: ORCA_TIMEOUT_MS }
  return {
    exec: async (args) => {
      await assertTrusted(isScreenRead(args) ? READ_TO_SEND_MS : 0)
      return (await run(bundle.cli, args, options)).stdout
    },
    // By the path that was verified: a name or a bundle id could resolve to another copy.
    raise: async () => {
      try {
        await assertTrusted()
        if (isWindows) await launch(bundle.app)
        else await run('/usr/bin/open', ['-a', bundle.app], { timeout: ORCA_TIMEOUT_MS })
        return true
      } catch {
        return false
      }
    }
  }
}
