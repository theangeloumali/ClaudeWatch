import { useState } from 'react'
import type { OfficeFrame } from '../scene-model'
import { parseAgentKey } from '../../../shared/office/agent-key'
import { Plate } from '../../components/deck/Plate'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'

export function VenuesPanel({
  frame,
  selectedVenueId,
  onSelectVenue,
  onSelectAgent
}: {
  frame: OfficeFrame
  selectedVenueId: string | null
  onSelectVenue: (id: string | null) => void
  onSelectAgent: (key: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = frame.venues?.find((venue) => venue.id === selectedVenueId)
  const visitors = selected ? frame.agents.filter((agent) => agent.venueId === selected.id) : []
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
                  {venue.displayName} · {venue.kind}
                </button>
              ))}
              {selected && (
                <div className="mt-2 border-t border-border pt-2">
                  <p className="text-xs text-text-secondary">
                    {frame.connected ? 'Present' : 'Last known'}: {visitors.length} · Capacity{' '}
                    {selected.capacity}
                  </p>
                  {visitors.map((agent) => {
                    const source = parseAgentKey(agent.agentKey, frame.sessions)
                    const name = source?.member?.type ?? source?.session.name ?? agent.label
                    return (
                      <button
                        type="button"
                        key={agent.agentKey}
                        className={`${BUTTON_QUIET_COMPACT_CLASS} mt-1 min-h-9 w-full justify-start`}
                        onClick={() => onSelectAgent(agent.agentKey)}
                      >
                        Inspect {name}
                      </button>
                    )
                  })}
                  <p className="mt-1 text-xs text-text-secondary">
                    Visiting is physical presence, not a work report.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </Plate>
    </section>
  )
}
