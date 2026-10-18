import { isAppFolder } from './process-folders'

// One rule for every provider: a program an app bundles is the app's helper, never an agent.
// A spaced bundle path split by `ps` (`…/Frameworks/Codex`) still lies inside the bundle (health-2).
export const isAgentCli = (argv0: string, platform: NodeJS.Platform): boolean =>
  !isAppFolder(argv0, platform)
