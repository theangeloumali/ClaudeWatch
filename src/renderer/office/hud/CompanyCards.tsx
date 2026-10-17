import { memo } from 'react'
import { PLATE_TITLE_CLASS } from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import { formatTokens } from '../../deck/tokens'
import { citySignalStore, type CitySignalStore } from '../logic/city-signal-store'
import type { CompanyCounts } from '../logic/city-signals'
import { companyHues, useCompanyLens } from '../logic/company-lens'
import type { OfficeCompanyRow } from '../logic/zone-model'
import type { ThemePalette } from '../themes/types'

const CARD_CLASS =
  'flex min-h-11 w-full min-w-0 touch-manipulation flex-col justify-center gap-1 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-hover'
const NO_COUNTS: CompanyCounts = { working: 0, waiting: 0, errors: 0, tokensToday: null }

// A null value is unknown, and says so: never a 0.
function Stat({ value, label }: { value: string | null; label: string }) {
  return (
    <span className="min-w-0 truncate text-xs text-text-secondary">
      {value === null ? (
        `${label} unknown`
      ) : (
        <>
          <span className="tabular-nums text-text-primary">{value}</span> {label}
        </>
      )}
    </span>
  )
}

interface CardProps {
  company: OfficeCompanyRow
  counts: CompanyCounts
  hue: string | undefined
  onFlyToZone: (zoneId: string) => void
}

function CompanyCard({ company, counts, hue, onFlyToZone }: CardProps) {
  const { tokensToday } = counts
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {hue && (
          <span
            aria-hidden="true"
            data-company-hue={hue}
            className="size-2.5 shrink-0 rounded-sm ring-1 ring-border-strong"
            style={{ backgroundColor: hue }}
          />
        )}
        <span translate="no" className="min-w-0 truncate text-body text-text-primary">
          {company.label}
        </span>
      </span>
      <span className="grid grid-cols-3 gap-x-2">
        <Stat value={String(counts.working)} label="working" />
        <Stat value={String(counts.waiting)} label="needs you" />
        <Stat value={String(counts.errors)} label={counts.errors === 1 ? 'error' : 'errors'} />
      </span>
      <Stat value={tokensToday === null ? null : formatTokens(tokensToday)} label="tokens today" />
    </>
  )
  const { zoneId } = company
  if (!zoneId) return <div className={CARD_CLASS}>{body}</div>
  return (
    <button type="button" className={CARD_CLASS} onClick={() => onFlyToZone(zoneId)}>
      {body}
    </button>
  )
}

interface CompanyCardsProps {
  // Bumps only when a count changes, so the cards follow evidence, not the clock.
  version: number
  // From the shown frame: with names hidden their labels are roles.
  companies: readonly OfficeCompanyRow[]
  palette: ThemePalette
  onFlyToZone: (zoneId: string) => void
  store?: CitySignalStore
}

// One card per company while the lens is on. Counts and hues come from the signals the offices
// are tinted by, so a card's swatch matches its offices.
export const CompanyCards = memo(function CompanyCards(props: CompanyCardsProps) {
  const { companies, palette, onFlyToZone, store = citySignalStore } = props
  const isOn = useCompanyLens()
  if (!isOn) return null
  const counts = store.current().companies
  const hues = companyHues(counts.keys(), palette)
  return (
    <nav aria-label="Companies">
      <Plate faceClassName="flex min-w-0 flex-col gap-1 p-3">
        <h2 className={PLATE_TITLE_CLASS}>Companies</h2>
        {companies.length === 0 ? (
          <p className="text-body text-text-tertiary">No offices yet</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {companies.map((company) => (
              <li key={company.companyKey} className="min-w-0">
                <CompanyCard
                  company={company}
                  counts={counts.get(company.companyKey) ?? NO_COUNTS}
                  hue={hues.get(company.companyKey)}
                  onFlyToZone={onFlyToZone}
                />
              </li>
            ))}
          </ul>
        )}
      </Plate>
    </nav>
  )
})
