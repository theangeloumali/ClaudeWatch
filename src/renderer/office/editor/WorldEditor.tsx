import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { WorldDocumentStore } from '../../office-live/world-document-store'
import type { WorldBuilding, WorldDocument, WorldRoom } from '../../../shared/office/world-document'
import { arrangeWorldDocument } from '../../../shared/office/world-document-placement'
import { singleFloorWorldDocument } from '../../../shared/office/world-document-single-floor'
import { buildLayout } from '../../../office/sim/layout'
import type { OfficeFrame } from '../scene-model'
import type { SceneEditTarget } from '../scene/ZonePickers'
import {
  BUTTON_PRIMARY_COMPACT_CLASS,
  BUTTON_QUIET_COMPACT_CLASS
} from '../../components/deck/deck-styles'
import { FIELD_CLASS } from '../hud/hud-styles'
import { WorldRoomFields } from './WorldRoomFields'
import { WorldBuildingFields } from './WorldBuildingFields'
import { editableRoomGeometry, editedWorldRoom } from './world-editor-room'
import { worldTargetRole, type RoleBook } from '../logic/role-names'

export function WorldEditor({
  store,
  frame,
  roles = null,
  target,
  onPreview,
  onClose,
  focusField
}: {
  store: WorldDocumentStore
  frame: OfficeFrame
  // Names hidden: the dialog shows roles and locks the name fields; the draft keeps real names.
  roles?: RoleBook | null
  target?: SceneEditTarget | null
  onPreview: (document: WorldDocument | null) => void
  onClose: () => void
  focusField?: string
}) {
  const [state, setState] = useState(() => store.get())
  const [draft, setDraft] = useState(() => store.get().document)
  const targetRoom = frame.floors
    .flatMap((floor) => floor.rooms)
    .find((room) => room.id === target?.id)
  const [roomId, setRoomId] = useState(
    () =>
      draft.rooms.find(
        (room) =>
          (targetRoom?.worldTarget && room.target === targetRoom.worldTarget) ||
          (targetRoom?.sessionKey && room.target === `session:${targetRoom.sessionKey}`)
      )?.id ??
      draft.rooms.find(
        (candidate) => target?.kind === 'building' && candidate.buildingId === target.id
      )?.id ??
      draft.rooms[0]?.id ??
      ''
  )
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('Unsaved draft. Preview does not move live agents.')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const room = draft.rooms.find((candidate) => candidate.id === roomId)
  const building =
    draft.buildings.find((candidate) => candidate.id === room?.buildingId) ?? draft.buildings[0]
  const roomName = (candidate: WorldRoom): string =>
    roles ? worldTargetRole(candidate.target, roles) : (candidate.displayName ?? candidate.target)
  const buildingName = (candidate: WorldBuilding): string =>
    roles ? roles.project(candidate.companyKey, candidate.projectKey) : candidate.displayName
  const canSaveDraft = state.draft !== null && JSON.stringify(state.draft) === JSON.stringify(draft)
  useEffect(
    () =>
      store.subscribe((next) => {
        setState(next)
        setDraft((current) => ({
          ...current,
          rooms: [
            ...current.rooms,
            ...next.document.rooms.filter(
              (room) => !current.rooms.some((candidate) => candidate.target === room.target)
            )
          ],
          buildings: [
            ...current.buildings,
            ...next.document.buildings.filter(
              (building) => !current.buildings.some((candidate) => candidate.id === building.id)
            )
          ]
        }))
      }),
    [store]
  )
  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    if (typeof dialog?.showModal === 'function') dialog.showModal()
    else dialog?.setAttribute('open', '')
    if (focusField && dialog) {
      const label = [...dialog.querySelectorAll('label')].find(
        (label) => label.firstChild?.textContent?.trim() === focusField
      )
      const input = label?.querySelector('input,select')
      if (input instanceof HTMLElement) input.focus()
    }
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])
  const close = () => {
    store.cancel()
    onPreview(null)
    onClose()
  }
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
    close()
  }
  const preview = () => {
    const validation = store.preview(draft)
    if (validation.success) {
      onPreview(validation.document)
      setNotice('Layout preview only. Nothing saved.')
    } else {
      onPreview(null)
      setNotice('Invalid draft. Correct the fields below before saving.')
    }
  }
  const save = async () => {
    setIsSaving(true)
    try {
      const outcome = await store.save(draft, draft.revision)
      if (outcome.success) {
        setDraft(store.get().document)
        onPreview(null)
        setNotice(`Saved locally — revision ${outcome.revision}.`)
      } else setNotice(`Not saved: ${outcome.reason}. Your draft is retained.`)
    } finally {
      setIsSaving(false)
    }
  }
  const undo = async () => {
    setIsSaving(true)
    try {
      const outcome = await store.undo(state.revision)
      if (outcome.success) {
        setDraft(store.get().document)
        onPreview(null)
        setNotice('Saved edit undone against the current live roster.')
      } else setNotice(`Undo unavailable: ${outcome.reason}.`)
    } finally {
      setIsSaving(false)
    }
  }
  const changeRoom = (updated: NonNullable<typeof room>) => {
    setDraft((current) => ({
      ...current,
      rooms: current.rooms.map((candidate) => (candidate.id === updated.id ? updated : candidate))
    }))
  }
  const rebuildCity = () => {
    store.cancel()
    onPreview(null)
    try {
      const baseline = buildLayout([...frame.sessions], undefined)
      setDraft(arrangeWorldDocument(singleFloorWorldDocument(draft, baseline)))
      setNotice('Single-floor city draft ready. Preview it, then Save locally to apply.')
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'The current offices could not fit this city draft.'
      )
    }
  }
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="world-editor-heading"
      data-camera-guard
      onPointerDown={dismissOutside}
      onContextMenu={dismissOutside}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      className="m-auto max-h-[90vh] w-[min(720px,calc(100vw-24px))] overflow-auto rounded-xl border border-border-strong bg-surface-raised p-5 text-text-primary shadow-xl backdrop:bg-black/60"
    >
      <header className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-3 bg-surface-raised pb-3">
        <h2 id="world-editor-heading" className="font-plate text-title">
          Edit layout
        </h2>
        <button type="button" onClick={close} className={BUTTON_QUIET_COMPACT_CLASS}>
          Close editor
        </button>
      </header>
      <p role="status" className="mb-4 text-sm text-text-secondary">
        {notice}
      </p>
      {roles && (
        <p className="mb-4 text-sm text-text-secondary">
          Names are hidden, so name fields are locked. Turn off Hide names in Settings to rename.
        </p>
      )}
      <label className="mb-4 flex flex-col gap-1 text-xs text-text-secondary">
        Room to edit
        <select
          className={FIELD_CLASS}
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
        >
          {draft.rooms.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {roomName(candidate)}
            </option>
          ))}
        </select>
      </label>
      {room && (
        <>
          <label className="mb-3 flex flex-col gap-1 text-xs text-text-secondary">
            Assigned building
            <select
              className={FIELD_CLASS}
              value={room.buildingId}
              onChange={(event) =>
                changeRoom({ ...room, buildingId: event.target.value, floorNumber: 1 })
              }
            >
              {draft.buildings.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {buildingName(candidate)}
                </option>
              ))}
            </select>
          </label>
          <p className="mb-3 text-xs text-text-secondary">
            Working floor:{' '}
            {building?.floors === 1
              ? 'Ground floor'
              : `Floor ${room.floorNumber} in the saved layout. Rebuild city layout to consolidate every room.`}
          </p>
          <WorldRoomFields
            room={editableRoomGeometry(
              room,
              frame.sessions.find((session) => room.target === `session:${session.key}`)?.name ??
                room.target
            )}
            maskedName={roles ? roomName(room) : undefined}
            onChange={(changes) => changeRoom(editedWorldRoom(room, changes))}
          />
          <p className="my-3 text-xs text-text-secondary">
            Room position is building-local; entrance and desk positions are room-local, in metres.
          </p>
        </>
      )}
      {building && (
        <WorldBuildingFields
          building={building}
          maskedName={roles ? buildingName(building) : undefined}
          onChange={(updated) =>
            setDraft((current) => ({
              ...current,
              buildings: current.buildings.map((candidate) =>
                candidate.id === updated.id ? updated : candidate
              )
            }))
          }
        />
      )}
      {state.errors.length > 0 && (
        <ul role="alert" className="my-4 space-y-1 text-sm text-text-primary">
          {state.errors.map((error, index) => (
            <li key={index} className="break-all">
              {error.field}: {error.reason} ({error.target})
            </li>
          ))}
        </ul>
      )}
      <footer className="sticky bottom-0 mt-5 flex flex-wrap gap-2 bg-surface-raised py-3">
        <button
          type="button"
          disabled={isSaving}
          onClick={rebuildCity}
          className={BUTTON_QUIET_COMPACT_CLASS}
        >
          Rebuild city layout
        </button>
        <button
          type="button"
          onClick={preview}
          disabled={isSaving}
          className={BUTTON_QUIET_COMPACT_CLASS}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => {
            store.cancel()
            onPreview(null)
            setDraft(store.get().document)
            setNotice('Draft cancelled. Saved layout unchanged.')
          }}
          className={BUTTON_QUIET_COMPACT_CLASS}
          disabled={isSaving}
        >
          Cancel preview
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving || !canSaveDraft}
          className={BUTTON_PRIMARY_COMPACT_CLASS}
          title={
            canSaveDraft
              ? 'Save this validated preview locally'
              : 'Preview the current draft before saving'
          }
        >
          Save locally
        </button>
        <button
          type="button"
          onClick={() => void undo()}
          disabled={isSaving}
          className={BUTTON_QUIET_COMPACT_CLASS}
        >
          Undo saved edit
        </button>
      </footer>
    </dialog>
  )
}
