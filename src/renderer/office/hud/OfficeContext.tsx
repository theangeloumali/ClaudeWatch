import { X } from 'lucide-react'
import { Plate } from '../../components/deck/Plate'
import { PLATE_TITLE_CLASS } from '../../components/deck/deck-styles'
import { cn } from '../../lib/utils'
import type { OperationsOffice } from '../logic/operations-model'
import { ROW_CLASS } from './hud-styles'
import { OperationsWorkerRow } from './operations-components'

export interface OfficeContextProps {
  office: OperationsOffice | null
  offices: readonly OperationsOffice[]
  themeLabel: string
  focusedRoomId: string | null
  onSelectWorker: (agentKey: string) => void
  onFocusOffice: (floorId: string) => void
  // The owner restores focus when closing its rail or sheet.
  onClose?: () => void
}

// dry-new: Inspector describes one worker; this plate describes supplied office scope.
export function OfficeContext({
  office,
  offices,
  themeLabel,
  focusedRoomId,
  onSelectWorker,
  onFocusOffice,
  onClose
}: OfficeContextProps) {
  const selectedArea = office?.workAreas.find((area) => area.room.id === focusedRoomId)
  const visibleWorkers = selectedArea?.workers ?? office?.workers ?? []
  return (
    <section
      aria-label={office ? 'Office context' : 'Office network'}
      className="h-full min-h-0 min-w-0"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !onClose) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      <Plate
        className="h-full min-h-0"
        faceClassName="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-3"
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className={cn(PLATE_TITLE_CLASS, 'break-words [overflow-wrap:anywhere]')}>
              {office?.floor.label ?? 'Office network'}
            </h2>
            <p className="break-words text-body text-text-secondary [overflow-wrap:anywhere]">
              World: {themeLabel}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              aria-label="Close office context"
              onClick={onClose}
              className={cn(ROW_CLASS, 'shrink-0 justify-center text-text-secondary')}
              style={{ width: 44, height: 44, flex: 'none' }}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        {office ? (
          <>
            <p className="break-words text-body text-text-primary [overflow-wrap:anywhere]">
              {office.projectLabels.length > 0
                ? office.projectLabels.join(' · ')
                : 'No assigned project records'}
            </p>
            <OfficeCounts office={office} />
            <p className="text-xs text-text-secondary">
              Assignment and presence are distinct. Working and attention counts require fresh own
              evidence; zero confirmed attention is not an all-clear.
            </p>
            <section
              className="space-y-2 border-t border-border pt-3"
              aria-label="Office work areas"
            >
              <h3 className="text-heading text-text-primary">Work areas</h3>
              {office.workAreas.length === 0 ? (
                <p className="text-body text-text-secondary">No physical rooms in this floor.</p>
              ) : (
                <ul className="max-h-36 space-y-2 overflow-y-auto overscroll-contain">
                  {office.workAreas.map((area) => (
                    <li
                      key={area.room.id}
                      aria-current={area.room.id === focusedRoomId ? 'true' : undefined}
                      className="min-w-0 text-body text-text-primary"
                    >
                      <span className="break-words [overflow-wrap:anywhere]">
                        {area.room.label}
                      </span>
                      {area.room.id === focusedRoomId && (
                        <span className="ml-2 text-xs text-accent">Current</span>
                      )}
                      <span className="block text-xs text-text-secondary">
                        {area.workers.length} assigned · {area.freshWorkingCount} confirmed working
                        · {area.attentionCount} confirmed attention
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section
              className="min-h-0 space-y-2 border-t border-border pt-3"
              aria-label="Assigned workers"
            >
              <h3 className="break-words text-heading text-text-primary [overflow-wrap:anywhere]">
                {selectedArea ? `${selectedArea.room.label} workers` : 'Assigned workers'} (
                {visibleWorkers.length})
              </h3>
              {visibleWorkers.length === 0 ? (
                <p className="text-body text-text-secondary">No worker records in this scope.</p>
              ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto overscroll-contain">
                  {visibleWorkers.map((worker) => (
                    <OperationsWorkerRow
                      key={worker.key}
                      worker={worker}
                      onChooseWorker={onSelectWorker}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <p className="text-body text-text-secondary">
              All offices · {offices.length} physical {offices.length === 1 ? 'floor' : 'floors'}.
              Choose a floor to inspect its real rooms and workers.
            </p>
            {offices.length === 0 ? (
              <p className="text-body text-text-secondary">
                No office records are available. Check the connection and source health in the
                office navigation.
              </p>
            ) : (
              <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain">
                {offices.map((networkOffice) => (
                  <button
                    key={networkOffice.floor.floorId}
                    type="button"
                    aria-label={`${networkOffice.floor.label}, ${networkOffice.summary.assignedAgentKeys.length} assigned workers`}
                    onClick={() => onFocusOffice(networkOffice.floor.floorId)}
                    className={cn(ROW_CLASS, 'w-full py-2 text-body text-text-primary')}
                    style={{ minHeight: 44 }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold [overflow-wrap:anywhere]">
                        {networkOffice.floor.label}
                      </span>
                      <span className="block break-words text-xs text-text-secondary [overflow-wrap:anywhere]">
                        {networkOffice.projectLabels.join(' · ') || 'No assigned project records'}
                      </span>
                      <span className="block text-xs text-text-secondary">
                        {networkOffice.summary.assignedAgentKeys.length} assigned ·{' '}
                        {networkOffice.summary.workingAgentKeys.length} confirmed working ·{' '}
                        {networkOffice.summary.attentionAgentKeys.length} confirmed attention
                      </span>
                      <span className="block text-xs text-text-secondary">
                        {networkOffice.summary.unknownAgentKeys.length} unknown ·{' '}
                        {networkOffice.summary.staleAgentKeys.length} stale
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-text-secondary">
              No confirmed attention does not establish an all-clear. Unknown and stale evidence
              remains qualified.
            </p>
          </>
        )}
      </Plate>
    </section>
  )
}

function OfficeCounts({ office }: { office: OperationsOffice }) {
  const summary = office.summary
  const counts = [
    { label: 'Assigned', count: summary.assignedAgentKeys.length },
    { label: 'Present', count: summary.presentAgentKeys.length },
    { label: 'Fresh working', count: summary.workingAgentKeys.length },
    { label: 'Confirmed attention', count: summary.attentionAgentKeys.length },
    { label: 'Unknown', count: summary.unknownAgentKeys.length },
    { label: 'Stale', count: summary.staleAgentKeys.length }
  ]
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-body">
      {counts.map(({ label, count }) => (
        <div key={label} className="contents">
          <dt className="text-text-secondary">{label}</dt>
          <dd className="font-semibold tabular-nums text-text-primary">{count}</dd>
        </div>
      ))}
    </dl>
  )
}
