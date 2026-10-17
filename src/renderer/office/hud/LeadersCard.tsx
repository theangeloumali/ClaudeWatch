import { memo } from 'react'
import type { SessionRef } from '../../../shared/office/types'
import { PLATE_TITLE_CLASS } from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import { formatTokens } from '../../deck/tokens'
import { citySignalStore, type CitySignalStore } from '../logic/city-signal-store'
import { buildingIdOf, type LeaderRow, type Leaders } from '../logic/city-signals'
import type { OfficeCompanyRow } from '../logic/zone-model'

const LEADER_ROW_CLASS =
  'flex min-h-11 w-full min-w-0 touch-manipulation flex-col justify-center gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-hover'
const STARTED = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

interface Board {
  title: string
  // Absent while nobody leads it.
  leader?: { label: string; value: string; zoneId: string | null }
}

type Offices = readonly OfficeCompanyRow[]

const projectRow = (companies: Offices, companyKey: string, projectKey: string) =>
  companies
    .find((company) => company.companyKey === companyKey)
    ?.projects.find((project) => project.projectKey === projectKey)

const projectOfBuilding = (companies: Offices, buildingId: string) =>
  companies
    .flatMap((company) =>
      company.projects.filter(
        (project) => buildingIdOf(company.companyKey, project.projectKey) === buildingId
      )
    )
    .at(0)

const helpers = (count: number): string => `${count} ${count === 1 ? 'helper' : 'helpers'}`

// Words come from the shown (masked) sessions and offices; keys only find them.
function boardsOf(leaders: Leaders, sessions: readonly SessionRef[], companies: Offices): Board[] {
  const bySession = (
    title: string,
    row: LeaderRow | null,
    value: (session: SessionRef, row: LeaderRow) => string
  ): Board => {
    const session = row && sessions.find((candidate) => candidate.key === row.key)
    if (!row || !session) return { title }
    const zoneId = projectRow(companies, session.companyKey, session.projectKey)?.zoneId ?? null
    const label = `${session.projectLabel} › ${session.name}`
    return { title, leader: { label, value: value(session, row), zoneId } }
  }
  const busiest = leaders.busiestProject
  const project = busiest && projectOfBuilding(companies, busiest.key)
  return [
    bySession('Top spender', leaders.topSpender, (_, row) => `${formatTokens(row.value)} tokens`),
    {
      title: 'Busiest project',
      leader:
        busiest && project
          ? { label: project.label, value: `${busiest.value} working`, zoneId: project.zoneId }
          : undefined
    },
    // A start time, not an age: it stays true between signal versions.
    bySession(
      'Longest running',
      leaders.longestRunning,
      (session) => `since ${STARTED.format(session.threadStartedAtMs ?? session.startedAtMs)}`
    ),
    bySession('Most crew', leaders.mostCrew, (_, row) => helpers(row.value))
  ]
}

function BoardRow({ board, onFlyToZone }: { board: Board; onFlyToZone: (id: string) => void }) {
  const { leader } = board
  const body = (
    <>
      <span className="flex min-w-0 items-baseline justify-between gap-2 text-xs text-text-secondary">
        <span>{board.title}</span>
        <span className="shrink-0 tabular-nums text-accent">{leader?.value}</span>
      </span>
      {leader ? (
        <span translate="no" className="min-w-0 truncate text-body text-text-primary">
          {leader.label}
        </span>
      ) : (
        <span className="text-body text-text-tertiary">No agents yet</span>
      )}
    </>
  )
  const zoneId = leader?.zoneId
  if (!zoneId) return <div className={LEADER_ROW_CLASS}>{body}</div>
  return (
    <button type="button" className={LEADER_ROW_CLASS} onClick={() => onFlyToZone(zoneId)}>
      {body}
    </button>
  )
}

interface LeadersCardProps {
  // Bumps only when a leader or its value changes, so the card follows it, not the clock.
  version: number
  sessions: readonly SessionRef[] | undefined
  companies: Offices
  onFlyToZone: (zoneId: string) => void
  store?: CitySignalStore
}

// The four races of the city, read at a glance; a row flies to its office as the Offices panel does.
export const LeadersCard = memo(function LeadersCard(props: LeadersCardProps) {
  const { sessions = [], companies, onFlyToZone, store = citySignalStore } = props
  const boards = boardsOf(store.current().leaders, sessions, companies)
  return (
    <nav aria-label="Leaders">
      <Plate faceClassName="flex min-w-0 flex-col gap-1 p-3">
        <h2 className={PLATE_TITLE_CLASS}>Leaders</h2>
        <ul className="flex flex-col gap-0.5">
          {boards.map((board) => (
            <li key={board.title} className="min-w-0">
              <BoardRow board={board} onFlyToZone={onFlyToZone} />
            </li>
          ))}
        </ul>
      </Plate>
    </nav>
  )
})
