import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import type { OfficeFrame } from '../scene-model'
import type { SceneEditTarget } from '../scene/ZonePickers'
import { parseAgentKey } from '../../../shared/office/agent-key'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'

export function WorldTargetMenu({
  frame,
  target,
  onEdit,
  onSelectAgent,
  onClose
}: {
  frame: OfficeFrame
  target: SceneEditTarget
  onEdit: (target: SceneEditTarget, field?: string) => void
  onSelectAgent: (key: string) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [position, setPosition] = useState({ left: target.clientX, top: target.clientY })
  const floor = frame.floors.find((floor) =>
    target.kind === 'building'
      ? floor.buildingId === target.id
      : floor.rooms.some((room) => room.id === target.id)
  )
  const room = floor?.rooms.find((room) => room.id === target.id)
  const label = room?.label ?? floor?.label ?? 'Office'
  const workers = frame.agents.filter((agent) =>
    target.kind === 'room'
      ? agent.roomId === target.id
      : frame.floors.some(
          (candidate) => candidate.buildingId === target.id && candidate.floorId === agent.floorId
        )
  )
  useLayoutEffect(() => {
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog?.setAttribute('open', '')
    const fit = () => {
      const bounds = dialog.getBoundingClientRect()
      const left = Math.max(12, Math.min(target.clientX, window.innerWidth - bounds.width - 12))
      const top = Math.max(12, Math.min(target.clientY, window.innerHeight - bounds.height - 12))
      setPosition((current) =>
        current.left === left && current.top === top ? current : { left, top }
      )
    }
    fit()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    observer?.observe(dialog)
    window.addEventListener('resize', fit)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', fit)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [target.clientX, target.clientY, target.id])
  const dismissOutside = (event: MouseEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const isOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    if (!isOutside) return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }
  const edits =
    target.kind === 'room'
      ? [
          ['Edit room', 'Room name'],
          ['Rename room', 'Room name'],
          ['Move room', 'Room X'],
          ['Resize room', 'Room width'],
          ['Arrange desks', 'Desk 1 X'],
          ['Change room theme', 'Room theme'],
          ['Move to another floor', 'Assigned floor']
        ]
      : [
          ['Edit building', 'Building name'],
          ['Rename building', 'Building name'],
          ['Move building', 'Building X'],
          ['Resize building', 'Building width'],
          ['Change building theme', 'Building theme']
        ]
  return (
    <dialog
      ref={dialogRef}
      aria-label={`${label} actions`}
      data-camera-guard
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onPointerDown={dismissOutside}
      onContextMenu={dismissOutside}
      style={position}
      className="fixed m-0 max-h-[calc(100dvh-24px)] w-[min(280px,calc(100vw-24px))] overflow-auto rounded-xl border border-border-strong bg-surface-raised p-3 text-text-primary shadow-xl backdrop:bg-transparent"
    >
      <header className="sticky top-0 z-10 mb-2 flex items-start justify-between gap-2 bg-surface-raised pb-2">
        <h2 className="min-w-0 break-words text-sm font-semibold">{label}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss menu"
          className={`${BUTTON_QUIET_COMPACT_CLASS} shrink-0`}
        >
          Close
        </button>
      </header>
      <div className="flex flex-col gap-1">
        {edits.map(([name, field]) => (
          <button
            type="button"
            key={name}
            className={`${BUTTON_QUIET_COMPACT_CLASS} min-h-9 justify-start`}
            onClick={() => onEdit(target, field)}
          >
            {name}
          </button>
        ))}
        {workers.map((agent) => {
          const record = parseAgentKey(agent.agentKey, frame.sessions)
          const name =
            record?.member?.name ?? record?.member?.type ?? record?.session.name ?? agent.label
          return (
            <button
              type="button"
              key={agent.agentKey}
              className={`${BUTTON_QUIET_COMPACT_CLASS} min-h-9 justify-start`}
              title={`Inspect ${name}`}
              onClick={() => {
                onSelectAgent(agent.agentKey)
                onClose()
              }}
            >
              <span className="min-w-0 truncate">Inspect {name}</span>
            </button>
          )
        })}
        {!workers.length && (
          <p className="px-2 py-2 text-xs text-text-secondary">No assigned live agents.</p>
        )}
      </div>
    </dialog>
  )
}
