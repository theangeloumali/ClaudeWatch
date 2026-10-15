import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  BUTTON_PRIMARY_COMPACT_CLASS,
  BUTTON_QUIET_COMPACT_CLASS,
  ICON_BUTTON_CLASS,
  PLATE_TITLE_CLASS
} from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import {
  EVERY_OFFICE,
  type CompanyThemeRow,
  type ThemeRow,
  type ThemeTarget
} from '../logic/office-themes'
import { getTheme } from '../themes/registry'
import type { OfficeTheme } from '../themes/types'
import { ROW_CLASS } from './hud-styles'
import { ThemeSwatch } from './OfficeRow'
import { OfficeThemePicker, ThemePicker } from './ThemePicker'

type ChooseTheme = (target: ThemeTarget, themeId: string | null) => void

interface ThemesListProps {
  id: string
  companies: readonly CompanyThemeRow[]
  floorTheme: OfficeTheme
  // Company and project choices, which setting every office removes.
  choiceCount: number
  // The office T changes; null while it still changes the floor default.
  cycleScope: string | null
  onChoose: ChooseTheme
  onChooseMapTheme: (themeId: string) => void
  onClose: () => void
}

const COMPANY_LABEL_CLASS = 'pt-[3px] font-plate text-base font-bold leading-none'

interface ListRowProps {
  label: string
  labelClassName?: string
  theme: OfficeTheme
  // In words: whose theme this is, so the row never relies on its swatch.
  status: string
  isOpen: boolean
  onToggle: () => void
  children: (dismiss: () => void) => ReactNode
}

function ListRow(props: ListRowProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dismiss = (): void => {
    props.onToggle()
    buttonRef.current?.focus()
  }
  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        aria-label={`${props.label}: ${props.theme.label}, ${props.status}`}
        aria-expanded={props.isOpen}
        onClick={props.onToggle}
        className={`${ROW_CLASS} w-full py-1`}
      >
        <ThemeSwatch theme={props.theme} />
        <span className={`min-w-0 flex-1 truncate text-text-primary ${props.labelClassName ?? ''}`}>
          {props.label}
        </span>
        <span className="flex flex-col items-end">
          <span className="text-xs text-text-primary">{props.theme.label}</span>
          <span className="text-caption text-text-secondary">{props.status}</span>
        </span>
      </button>
      {props.isOpen && props.children(dismiss)}
    </>
  )
}

function removedChoicesText(choiceCount: number): string {
  return choiceCount === 1
    ? 'the 1 company or project choice'
    : `the ${choiceCount} company and project choices`
}

interface EveryOfficeChoiceProps {
  floorTheme: OfficeTheme
  choiceCount: number
  onChoose: ChooseTheme
  onDismiss: () => void
}

// With choices to lose, picking a theme only arms the button that removes them.
function EveryOfficeChoice({
  floorTheme,
  choiceCount,
  onChoose,
  onDismiss
}: EveryOfficeChoiceProps) {
  const [pendingThemeId, setPendingThemeId] = useState<string | null>(null)
  const hasChoices = choiceCount > 0
  const pendingTheme = pendingThemeId ? getTheme(pendingThemeId) : null
  const pick = (themeId: string | null): void => {
    if (!themeId) return
    if (hasChoices) setPendingThemeId(themeId)
    else onChoose(EVERY_OFFICE, themeId)
  }
  return (
    <>
      <ThemePicker
        zoneLabel="every office"
        themeId={hasChoices ? pendingThemeId : floorTheme.id}
        onChoose={pick}
        onDismiss={onDismiss}
      />
      {hasChoices && (
        <div className="flex flex-col gap-1.5 pb-1.5 pl-3 pr-1">
          <p className="text-caption text-text-secondary">
            Setting every office removes {removedChoicesText(choiceCount)} listed below.
          </p>
          {pendingTheme && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={BUTTON_PRIMARY_COMPACT_CLASS}
                onClick={() => {
                  onChoose(EVERY_OFFICE, pendingTheme.id)
                  setPendingThemeId(null)
                }}
              >
                Set every office to {pendingTheme.label}
              </button>
              <button
                type="button"
                className={BUTTON_QUIET_COMPACT_CLASS}
                onClick={() => setPendingThemeId(null)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// Every office with the theme it uses, in words, and the one place to change any of them.
export function ThemesList({
  id,
  companies,
  floorTheme,
  choiceCount,
  cycleScope,
  onChoose,
  onChooseMapTheme,
  onClose
}: ThemesListProps) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  useEffect(() => titleRef.current?.focus(), [])
  const toggle = (key: string): void => setOpenKey((current) => (current === key ? null : key))

  const officeRow = (row: ThemeRow, key: string, labelClassName: string) => (
    <ListRow
      label={row.target.label}
      labelClassName={labelClassName}
      theme={getTheme(row.themeId)}
      status={row.ownThemeId ? 'its own choice' : `follows ${row.followsLabel}`}
      isOpen={openKey === key}
      onToggle={() => toggle(key)}
    >
      {(dismiss) => <OfficeThemePicker row={row} onChoose={onChoose} onDismiss={dismiss} />}
    </ListRow>
  )

  return (
    <div
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute bottom-full left-1/2 z-30 mb-2 w-[23rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <Plate faceClassName="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto p-3">
        <div className="flex items-center gap-2">
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className={`${PLATE_TITLE_CLASS} flex-1`}>
            Map and office themes
          </h2>
          <button
            type="button"
            aria-label="Close themes"
            onClick={onClose}
            className={ICON_BUTTON_CLASS}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <ul className="flex flex-col gap-0.5">
          <li className="flex flex-col">
            <ListRow
              label="Map theme"
              labelClassName="text-body"
              theme={floorTheme}
              status="city and following offices"
              isOpen={openKey === 'map'}
              onToggle={() => toggle('map')}
            >
              {(dismiss) => (
                <ThemePicker
                  zoneLabel="whole map"
                  themeId={floorTheme.id}
                  onChoose={(themeId) => {
                    if (themeId) onChooseMapTheme(themeId)
                  }}
                  onDismiss={dismiss}
                />
              )}
            </ListRow>
          </li>
          <li className="flex flex-col">
            <ListRow
              label={EVERY_OFFICE.label}
              labelClassName="text-body"
              theme={floorTheme}
              status="replace all office choices"
              isOpen={openKey === 'floor'}
              onToggle={() => toggle('floor')}
            >
              {(dismiss) => (
                <EveryOfficeChoice
                  floorTheme={floorTheme}
                  choiceCount={choiceCount}
                  onChoose={onChoose}
                  onDismiss={dismiss}
                />
              )}
            </ListRow>
          </li>
          {companies.map((company) => (
            <li key={company.target.companyKey} className="flex flex-col">
              {officeRow(company, `company:${company.target.companyKey}`, COMPANY_LABEL_CLASS)}
              <ul className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-1">
                {company.projects.map((project) => (
                  <li key={project.target.projectKey} className="flex flex-col">
                    {officeRow(project, `project:${project.target.projectKey}`, 'text-body')}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="text-caption text-text-secondary">
          {cycleScope
            ? `The T key changes ${cycleScope}, the office the camera last flew to.`
            : 'The T key changes the map default until the camera flies to an office.'}
        </p>
      </Plate>
    </div>
  )
}
