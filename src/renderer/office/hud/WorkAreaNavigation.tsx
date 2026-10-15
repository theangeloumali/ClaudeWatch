import { PLATE_TITLE_CLASS } from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import { cn } from '../../lib/utils'
import type { OperationsOffice } from '../logic/operations-model'
import { FIELD_CLASS, ROW_CLASS } from './hud-styles'
import { OperationsWorkerRow } from './operations-components'

export interface WorkAreaNavigationProps {
  office: OperationsOffice | null
  focusedRoomId: string | null
  onChooseRoom: (roomId: string) => void
  onChooseWorker: (agentKey: string) => void
}

// dry-new: the office tree selects projects, not supplied physical room destinations.
export function WorkAreaNavigation({
  office,
  focusedRoomId,
  onChooseRoom,
  onChooseWorker
}: WorkAreaNavigationProps) {
  const hasWorkAreas = Boolean(office?.workAreas.length)
  return (
    <nav aria-label="Physical work areas" className="min-w-0">
      <div className="min-[1100px]:hidden">
        <select
          aria-label="Choose physical work area"
          disabled={!hasWorkAreas}
          value={focusedRoomId ?? ''}
          onChange={(event) => {
            if (event.currentTarget.value) onChooseRoom(event.currentTarget.value)
          }}
          className={cn(
            FIELD_CLASS,
            'h-11 w-full min-w-0 cursor-pointer disabled:cursor-not-allowed'
          )}
        >
          <option value="" disabled>
            {!office
              ? 'Choose an office first'
              : hasWorkAreas
                ? 'Choose work area'
                : 'No physical work areas'}
          </option>
          {office?.workAreas.map((area) => (
            <option key={area.room.id} value={area.room.id}>
              {area.room.label} · {area.workers.length} assigned · {area.freshWorkingCount}{' '}
              confirmed working · {area.attentionCount} confirmed attention
            </option>
          ))}
        </select>
      </div>
      <section className="hidden min-[1100px]:block">
        <Plate faceClassName="space-y-2 p-3">
          <h2 className={PLATE_TITLE_CLASS}>Work areas</h2>
          {!office ? (
            <p className="text-body text-text-secondary">
              Choose an office to see its physical rooms.
            </p>
          ) : !hasWorkAreas ? (
            <p className="text-body text-text-secondary">No physical rooms in this floor.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain">
              {office.workAreas.map((area) => (
                <div key={area.room.id} className="min-w-0">
                  <button
                    type="button"
                    aria-current={focusedRoomId === area.room.id ? 'true' : undefined}
                    onClick={() => onChooseRoom(area.room.id)}
                    title={area.room.label}
                    className={cn(ROW_CLASS, 'w-full py-1.5 text-body text-text-primary')}
                    style={{ minHeight: 44 }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold [overflow-wrap:anywhere]">
                        {area.room.label}
                      </span>
                      <span className="block text-xs text-text-secondary">
                        {area.workers.length} assigned · {area.freshWorkingCount} confirmed working
                        · {area.attentionCount} confirmed attention
                      </span>
                    </span>
                    {focusedRoomId === area.room.id && (
                      <span className="shrink-0 text-caption text-accent">Current</span>
                    )}
                  </button>
                  {area.workers.length > 0 && (
                    <details className="min-w-0 px-1.5 text-xs text-text-secondary">
                      <summary className="flex min-h-11 cursor-pointer items-center">
                        Workers ({area.workers.length})
                      </summary>
                      <div className="max-h-48 overflow-y-auto overscroll-contain">
                        {area.workers.map((worker) => (
                          <OperationsWorkerRow
                            key={worker.key}
                            worker={worker}
                            onChooseWorker={onChooseWorker}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-text-secondary">
            Counts reflect fresh own observations. Missing or stale reports are not an all-clear.
          </p>
        </Plate>
      </section>
    </nav>
  )
}
