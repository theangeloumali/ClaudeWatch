import { join } from 'path'
import { childEnv } from '../../shared/platform-process'
import { createOrcaCli } from '../orca-cli'
import { execFilePromise } from '../platform/exec'
import { AccountLedger } from './account-ledger'
import { readDefaultIdentity, readOrcaIdentities } from './identity'
import { loadLedger, saveLedger } from './ledger-file'
import { listOrcaAccounts } from './orca-accounts'

export { AccountLedger } from './account-ledger'
export { type OfficeAccounts, withAccounts, withoutAccounts } from './office-feed'

interface AccountLedgerPlaces {
  isWatching: boolean
  home: string
  // ClaudeWatch's own data folder, where the ledger is kept.
  userData: string
  platform?: NodeJS.Platform
  // Windows' roaming app-data folder (%APPDATA%), where Orca keeps its data there.
  appData?: string
}

// Orca keeps the same claude-accounts/ layout in its platform's app-data folder.
export function orcaDataFolder({
  home,
  platform = process.platform,
  appData = process.env.APPDATA
}: Pick<AccountLedgerPlaces, 'home' | 'platform' | 'appData'>): string {
  if (platform !== 'win32') return join(home, 'Library', 'Application Support', 'orca')
  return join(appData || join(home, 'AppData', 'Roaming'), 'orca')
}

// The ledger wired to the real files: the default login, Orca's identity files and its
// signature-checked command line, and ClaudeWatch's own ledger file.
export function createAccountLedger(places: AccountLedgerPlaces): AccountLedger {
  const { isWatching, home, userData } = places
  // The CLI's own env wins: on Windows it carries the APPDATA Orca cannot start without.
  const orca = createOrcaCli(
    (program, args, options) => execFilePromise(program, args, { env: childEnv(), ...options }),
    undefined,
    places.platform
  )
  const orcaData = orcaDataFolder(places)
  const ledgerFile = join(userData, 'accounts-ledger.json')
  return new AccountLedger({
    isWatching,
    readDefaultIdentity: () => readDefaultIdentity(home),
    readOrcaIdentities: () => readOrcaIdentities(orcaData),
    listOrcaAccounts: () => listOrcaAccounts(orca.exec),
    load: () => loadLedger(ledgerFile),
    save: (state) => saveLedger(ledgerFile, state)
  })
}
