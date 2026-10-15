import { useId, useState } from 'react'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import { cn } from '../../lib/utils'
import { buildMinimapModel, type MinimapInput } from '../logic/minimap-model'
import { FIELD_CLASS } from './hud-styles'
import { MinimapSurface } from './MinimapSurface'

export interface MinimapProps extends MinimapInput {
  isNarrow: boolean
  onChooseFloor: (floorId: string | null) => void
  onChooseRoom: (roomId: string) => void
  onChooseWorker: (agentKey: string) => void
}

// dry-new: physical navigation has no existing spatial, collapsible map surface.
export function Minimap(props: MinimapProps) {
  const contentId = useId()
  const descriptionId = useId()
  const [disclosure, setDisclosure] = useState({
    isNarrow: props.isNarrow,
    isExpanded: !props.isNarrow
  })
  const isExpanded =
    disclosure.isNarrow === props.isNarrow ? disclosure.isExpanded : !props.isNarrow
  const model = isExpanded ? buildMinimapModel(props) : null
  return (
    <section aria-label="Minimap" className="min-w-0">
      <button
        type="button"
        className={cn(
          BUTTON_QUIET_COMPACT_CLASS,
          'min-h-11 touch-manipulation focus-visible:ring-2 focus-visible:ring-brass'
        )}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setDisclosure({ isNarrow: props.isNarrow, isExpanded: !isExpanded })}
      >
        {isExpanded ? 'Collapse Minimap' : 'Expand Minimap'}
      </button>
      <div id={contentId} hidden={!isExpanded} className="min-w-0 pt-2">
        {model && (
          <Plate faceClassName="flex min-w-0 flex-col gap-2 p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span aria-hidden="true" className="text-xs text-text-secondary">
                N ↑
              </span>
              <button
                type="button"
                className={cn(
                  BUTTON_QUIET_COMPACT_CLASS,
                  'min-h-11 touch-manipulation focus-visible:ring-2 focus-visible:ring-brass'
                )}
                onClick={() => props.onChooseFloor(null)}
              >
                All offices
              </button>
            </div>
            {model.bounds ? (
              <MinimapSurface
                model={model}
                viewMode={props.viewMode}
                descriptionId={descriptionId}
                onChooseFloor={props.onChooseFloor}
                onChooseRoom={props.onChooseRoom}
                onChooseWorker={props.onChooseWorker}
              />
            ) : (
              <p className="text-xs text-text-secondary">
                No map geometry available. Choose an office above.
              </p>
            )}
            {props.viewMode === 'city' && model.floors.length > 1 && (
              <select
                aria-label="Minimap floor"
                name="minimap-floor"
                autoComplete="off"
                className={cn(
                  FIELD_CLASS,
                  'min-h-11 w-full min-w-0 touch-manipulation focus-visible:ring-2 focus-visible:ring-brass'
                )}
                value={
                  model.floors.some((floor) => floor.floorId === props.focusedFloorId)
                    ? (props.focusedFloorId ?? '')
                    : ''
                }
                onChange={(event) => {
                  if (event.currentTarget.value) props.onChooseFloor(event.currentTarget.value)
                }}
              >
                <option value="" disabled>
                  Choose a physical floor
                </option>
                {model.floors.map((floor) => (
                  <option key={floor.floorId} value={floor.floorId}>
                    {floor.label}
                  </option>
                ))}
              </select>
            )}
            {props.viewMode === 'office' && model.rooms.length > 0 && (
              <select
                aria-label="Minimap work area"
                name="minimap-work-area"
                autoComplete="off"
                className={cn(FIELD_CLASS, 'min-h-11 w-full min-w-0 touch-manipulation')}
                value={
                  model.rooms.some((room) => room.id === props.focusedRoomId)
                    ? (props.focusedRoomId ?? '')
                    : ''
                }
                onChange={(event) => {
                  if (event.currentTarget.value) props.onChooseRoom(event.currentTarget.value)
                }}
              >
                <option value="" disabled>
                  Choose a work area
                </option>
                {model.rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.label}
                  </option>
                ))}
              </select>
            )}
            {model.workers.length > 0 && (
              <select
                aria-label="Minimap worker"
                name="minimap-worker"
                autoComplete="off"
                className={cn(FIELD_CLASS, 'min-h-11 w-full min-w-0 touch-manipulation')}
                value={
                  model.workers.some((worker) => worker.agentKey === props.selectedAgentKey)
                    ? (props.selectedAgentKey ?? '')
                    : ''
                }
                onChange={(event) => {
                  if (event.currentTarget.value) props.onChooseWorker(event.currentTarget.value)
                }}
              >
                <option value="" disabled>
                  Choose a worker
                </option>
                {model.workers.map((worker) => (
                  <option key={worker.agentKey} value={worker.agentKey}>
                    {worker.label}
                  </option>
                ))}
              </select>
            )}
            <p
              id={descriptionId}
              aria-live="polite"
              className="text-xs text-text-secondary [overflow-wrap:anywhere]"
            >
              Focus highlights are not a camera viewport. Dots: supplied worker positions; ring:
              selected worker.{model.player ? ' Accent dot: you.' : ''}
              {props.isPreview
                ? ' Layout preview — live markers hidden.'
                : !props.frame.connected
                  ? ' Disconnected — last-known worker positions.'
                  : ''}
            </p>
          </Plate>
        )}
      </div>
    </section>
  )
}
