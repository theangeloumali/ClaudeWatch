import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import {
  BUTTON_QUIET_COMPACT_CLASS,
  ICON_BUTTON_CLASS,
  PLATE_TITLE_CLASS
} from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import { SettingRow, ToggleSwitch } from '../../components/settings/controls'
import { officeSettings, useOfficeSettings, type OfficeSettingKey } from '../logic/office-settings'
import { levelInUse, QUALITY_PINS, type QualityPin } from '../logic/quality'
import { pinQuality, useQualityChoice } from '../quality-store'
import { TOWN_SIZES, type TownSize } from '../town/town-grid'
import { BAR_BUTTON_CLASS } from './hud-styles'

interface Feature {
  key: OfficeSettingKey
  label: string
  // What it is, and what switching it off saves.
  description: string
}

const FEATURES: readonly Feature[] = [
  {
    key: 'town',
    label: 'Town buildings',
    description:
      'The buildings, streets and props around the offices. Off draws the floor alone, the largest saving.'
  },
  {
    key: 'citizens',
    label: 'Citizens',
    description:
      'Townsfolk who live in the town and walk its streets; they need the town on. Off removes them and the work of moving them.'
  },
  {
    key: 'vehicles',
    label: 'Vehicles',
    description:
      'A tram, a freight cart and a runabout in each theme’s form; they need the town and citizens on. Off keeps them out.'
  },
  {
    key: 'ambient',
    label: 'Ambient motion',
    description: 'Moving scenery among the town buildings. Off lets a quiet office stop redrawing.'
  },
  {
    key: 'loungeTrips',
    label: 'Game corner',
    description:
      'Idle agents walk to their office’s game corner and play. Off keeps them at their desks.'
  },
  {
    key: 'player',
    label: 'Your character',
    description:
      'The figure you walk through the office. Off removes it, the Walk button and its key.'
  }
]

const HIDE_NAMES: Feature = {
  key: 'hideNames',
  label: 'Hide names',
  description:
    'For recordings: roles such as Company A and Project A-1 stand in for company, project, session, teammate and account names. Your saved layout keeps the real names.'
}

const TOWN_SIZE_CHOICES: Record<TownSize, { label: string; description: string }> = {
  village: {
    label: 'Village',
    description: 'The same streets with a third of the lots built; the rest are gardens. Lightest.'
  },
  town: {
    label: 'Town',
    description: 'Two thirds of the lots built, and more people out on the streets.'
  },
  city: {
    label: 'City',
    description: 'Every lot built, and the busiest streets. The most to draw.'
  }
}

// How built-up the city is round the offices; native radios, so arrows move between them.
function TownSizeChoice({ townSize }: { townSize: TownSize }) {
  const name = useId()
  return (
    <div className="py-2.5">
      <p id={`${name}-title`} className="text-body font-semibold text-text-primary">
        Town size
      </p>
      <div role="radiogroup" aria-labelledby={`${name}-title`} className="mt-1.5 space-y-1.5">
        {TOWN_SIZES.map((size) => (
          <label key={size} className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name={name}
              value={size}
              checked={townSize === size}
              onChange={() => officeSettings.setTownSize(size)}
              aria-labelledby={`${name}-${size}-label`}
              aria-describedby={`${name}-${size}`}
              className="mt-1 accent-accent"
            />
            <span>
              <span id={`${name}-${size}-label`} className="text-body text-text-primary">
                {TOWN_SIZE_CHOICES[size].label}
              </span>
              <span id={`${name}-${size}`} className="block text-xs text-text-secondary">
                {TOWN_SIZE_CHOICES[size].description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

const PIN_LABEL: Record<QualityPin, string> = {
  auto: 'Auto',
  full: 'Full',
  balanced: 'Balanced',
  light: 'Light'
}

function restoreDefaults(): void {
  officeSettings.reset()
  pinQuality('auto')
}

// Every feature of the living world, each with its own switch. The choices are this page's own
// and apply as they are made.
export function OfficeSettingsPanel({
  id,
  onClose,
  isDistributedCity = false,
  mapThemeLabel,
  onOpenThemes
}: {
  id: string
  onClose: () => void
  isDistributedCity?: boolean
  mapThemeLabel?: string
  onOpenThemes?: () => void
}) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const settings = useOfficeSettings()
  const { pin, chosen } = useQualityChoice()
  useEffect(() => titleRef.current?.focus(), [])

  return (
    <div
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute bottom-full left-1/2 z-30 mb-2 w-[25rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <Plate faceClassName="flex max-h-[70vh] flex-col overflow-y-auto p-3">
        <div className="flex items-center gap-2">
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className={`${PLATE_TITLE_CLASS} flex-1`}>
            Office settings
          </h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className={ICON_BUTTON_CLASS}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="divide-y divide-border">
          {onOpenThemes && (
            <div className="space-y-1.5 py-2.5">
              <p className="text-body font-semibold text-text-primary">Map theme</p>
              <p className="text-xs text-text-secondary">
                Change the city and offices following its theme. Individual office choices stay.
              </p>
              <button type="button" className={BUTTON_QUIET_COMPACT_CLASS} onClick={onOpenThemes}>
                Change map theme: {mapThemeLabel}
              </button>
            </div>
          )}
          {[...FEATURES, HIDE_NAMES].map(({ key, label, description }) => (
            <SettingRow key={key} label={label} description={description}>
              <ToggleSwitch
                label={label}
                checked={settings[key]}
                onChange={(isOn) => officeSettings.set(key, isOn)}
              />
            </SettingRow>
          ))}
          {isDistributedCity ? (
            <div className="py-2.5">
              <p className="text-body font-semibold text-text-primary">City layout</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Street blocks follow your saved offices and venues. Use Detail level to reduce
                rendering work. Your campus-size choice is kept for legacy layouts.
              </p>
            </div>
          ) : (
            <TownSizeChoice townSize={settings.townSize} />
          )}
          <div className="py-2.5">
            <p className="text-body font-semibold text-text-primary">Detail level</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              How much of the town is drawn, and how sharply. Auto picks for this machine: now{' '}
              {levelInUse(pin, chosen)}.
            </p>
            <div role="group" aria-label="Detail level" className="mt-1.5 flex gap-1">
              {QUALITY_PINS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={pin === option}
                  className={BAR_BUTTON_CLASS}
                  onClick={() => pinQuality(option)}
                >
                  {PIN_LABEL[option]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-caption text-text-secondary">Kept on this machine.</p>
          <button type="button" className={BUTTON_QUIET_COMPACT_CLASS} onClick={restoreDefaults}>
            Restore defaults
          </button>
        </div>
      </Plate>
    </div>
  )
}
