import { folderKey } from './process-folders'
import { isInsideAppBundle } from './process-table'

// Where Windows desktop apps run their own programs: Store packages (ChatGPT, Claude), Claude's
// install and ChatGPT's copy of Codex. CLI installers also use Program Files and Programs.
const WINDOWS_APP_PROGRAM =
  /\\windowsapps\\|\\appdata\\local\\(anthropicclaude|openai\\codex\\bin)\\/

export const isWindowsAppProgram = (program: string): boolean =>
  WINDOWS_APP_PROGRAM.test(folderKey(program, 'win32'))

// One rule for every provider: a program an app bundles is the app's helper, never an agent.
// A spaced bundle path split by `ps` (`…/Frameworks/Codex`) still lies inside the bundle (health-2).
export const isAgentCli = (argv0: string, platform: NodeJS.Platform): boolean =>
  platform === 'win32' ? !isWindowsAppProgram(argv0) : !isInsideAppBundle(argv0)
