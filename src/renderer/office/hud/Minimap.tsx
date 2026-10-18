import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import { officePoses } from '../../office-live/pose-store'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import { cn } from '../../lib/utils'
import { buildMinimapModel, type MinimapInput, type MinimapModel } from '../logic/minimap-model'
import type { MapPoint } from '../logic/office-view'
import { shownRailway } from '../town/railway-plan'
import { FIELD_CLASS } from './hud-styles'
import { MinimapSurface } from './MinimapSurface'

export interface MinimapProps extends MinimapInput {
  isNarrow: boolean
  onChooseFloor: (floorId: string | null) => void
  onChooseRoom: (roomId: string) => void
  onChooseWorker: (agentKey: string) => void
  // Set where a camera can move: a tap or arrow key pans the view to that ground.
  onPan?: (point: MapPoint) => void
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
  const model = useMinimapModel(props, isExpanded)
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
        data-canvas-obstacle=""
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
                onPan={props.onPan}
              />
            ) : (
              <p className="text-xs text-text-secondary">
                No map geometry available. Choose an office above.
              </p>
            )}
            {props.viewMode === 'city' && model.floors.length > 1 && (
              <PickList
                label="Minimap floor"
                name="minimap-floor"
                placeholder="Choose a physical floor"
                options={model.floors.map((floor) => ({
                  value: floor.floorId,
                  label: floor.label
                }))}
                selected={props.focusedFloorId}
                onPick={props.onChooseFloor}
              />
            )}
            {props.viewMode === 'office' && model.rooms.length > 0 && (
              <PickList
                label="Minimap work area"
                name="minimap-work-area"
                placeholder="Choose a work area"
                options={model.rooms.map((room) => ({ value: room.id, label: room.label }))}
                selected={props.focusedRoomId}
                onPick={props.onChooseRoom}
              />
            )}
            {model.workers.length > 0 && (
              <PickList
                label="Minimap worker"
                name="minimap-worker"
                placeholder="Choose a worker"
                options={model.workers.map((worker) => ({
                  value: worker.agentKey,
                  label: worker.label
                }))}
                selected={props.selectedAgentKey}
                onPick={props.onChooseWorker}
              />
            )}
            <p
              id={descriptionId}
              aria-live="polite"
              className="text-xs text-text-secondary [overflow-wrap:anywhere]"
            >
              {props.onPan
                ? 'Tap the map, or use the arrow keys, to move the view there; the outline is what the camera sees.'
                : 'Focus highlights are not a camera viewport.'}{' '}
              Dots: supplied worker positions; ring: selected worker.
              {model.player ? ' Accent dot: you.' : ''}
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

// Rebuilt only when something the map draws changed. Dots read live poses, so the pose store's
// version and the shown railway are keys too.
function useMinimapModel(input: MinimapInput, isExpanded: boolean): MinimapModel | null {
  const { frame, viewMode, focusedFloorId, focusedRoomId, selectedAgentKey, isPreview } = input
  const [x, z, physicalFloorId] = [input.player?.x, input.player?.z, input.player?.physicalFloorId]
  const poseVersion = officePoses.version()
  const railway = useSyncExternalStore(shownRailway.subscribe, shownRailway.current)
  return useMemo(() => {
    if (!isExpanded) return null
    const player =
      x === undefined || z === undefined || physicalFloorId === undefined
        ? undefined
        : { x, z, physicalFloorId }
    return buildMinimapModel({
      frame,
      viewMode,
      focusedFloorId,
      focusedRoomId,
      selectedAgentKey,
      isPreview,
      player
    })
  }, [
    isExpanded,
    frame,
    viewMode,
    focusedFloorId,
    focusedRoomId,
    selectedAgentKey,
    isPreview,
    x,
    z,
    physicalFloorId,
    poseVersion,
    railway
  ])
}

interface PickListProps {
  label: string
  name: string
  placeholder: string
  options: readonly { value: string; label: string }[]
  selected: string | null
  onPick: (value: string) => void
}

// A full-size chooser beside the map, for targets too small or crowded to tap.
function PickList({ label, name, placeholder, options, selected, onPick }: PickListProps) {
  const value = options.some((option) => option.value === selected) ? (selected ?? '') : ''
  return (
    <select
      aria-label={label}
      name={name}
      autoComplete="off"
      className={cn(
        FIELD_CLASS,
        'min-h-11 w-full min-w-0 touch-manipulation focus-visible:ring-2 focus-visible:ring-brass'
      )}
      value={value}
      onChange={(event) => {
        if (event.currentTarget.value) onPick(event.currentTarget.value)
      }}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
