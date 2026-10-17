import { useState } from 'react'
import type { OfficeFrame } from '../scene-model'
import { Plate } from '../../components/deck/Plate'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'

export function VenuesPanel({
  frame,
  selectedVenueId,
  onSelectVenue
}: {
  frame: OfficeFrame
  selectedVenueId: string | null
  onSelectVenue: (id: string | null) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = frame.venues?.find((venue) => venue.id === selectedVenueId)
  if (!frame.venues?.length) return null
  return (
    <section aria-label="City venues">
      <Plate>
        <div className="p-3">
          <button
            type="button"
            aria-expanded={isOpen || !!selected}
            className={`${BUTTON_QUIET_COMPACT_CLASS} min-h-9 w-full justify-between`}
            onClick={() => {
              if (selected) onSelectVenue(null)
              setIsOpen(!isOpen)
            }}
          >
            City venues · {frame.venues.length}
          </button>
          {(isOpen || selected) && (
            <div className="mt-2 flex flex-col gap-1">
              {frame.venues.map((venue) => (
                <button
                  type="button"
                  key={venue.id}
                  className={`${BUTTON_QUIET_COMPACT_CLASS} min-h-9 justify-start`}
                  aria-pressed={selected?.id === venue.id}
                  onClick={() => onSelectVenue(venue.id)}
                >
                  {venue.displayName ? `${venue.displayName} · ${venue.kind}` : venue.kind}
                </button>
              ))}
            </div>
          )}
        </div>
      </Plate>
    </section>
  )
}
