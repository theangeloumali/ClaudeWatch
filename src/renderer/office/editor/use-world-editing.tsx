import { useMemo, useState } from 'react'
import type { OfficeFeed, OfficeFrame } from '../scene-model'
import type { SceneEditTarget } from '../scene/ZonePickers'
import type { WorldDocument } from '../../../shared/office/world-document'
import { buildLayout } from '../../../office/sim/layout'
import { resolveEffectiveWorld } from '../../../office/sim/effective-world'
import { toFloorGeometry } from '../../office-live/layout-geometry'
import { maskFloors, maskFrame, type RoleBook } from '../logic/role-names'
import { WorldEditor } from './WorldEditor'
import { WorldTargetMenu } from './WorldTargetMenu'

export function useWorldEditing({
  feed,
  frame,
  roles,
  onSelectAgent
}: {
  feed: OfficeFeed
  // The real frame: a rebuilt city is saved from it, so it never saves a role.
  frame: OfficeFrame | null
  // Set while names are hidden: the dialog, its menu and the preview show roles.
  roles: RoleBook | null
  onSelectAgent: (key: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [target, setTarget] = useState<SceneEditTarget | null>(null)
  const [menuTarget, setMenuTarget] = useState<SceneEditTarget | null>(null)
  const [focusField, setFocusField] = useState<string | undefined>()
  const [previewDocument, setPreviewDocument] = useState<WorldDocument | null>(null)
  const worldStore = feed.getWorldDocumentStore?.()
  const realPreviewFloors = useMemo(() => {
    if (!previewDocument || !frame) return null
    const base = buildLayout(frame.sessions, undefined)
    return toFloorGeometry(
      resolveEffectiveWorld(base, previewDocument, frame.sessions),
      frame.sessions
    )
  }, [previewDocument, frame?.sessions])
  const previewFloors = useMemo(
    () =>
      realPreviewFloors && roles && frame
        ? maskFloors(realPreviewFloors, frame.sessions, roles)
        : realPreviewFloors,
    [realPreviewFloors, roles, frame?.sessions]
  )
  const open = () => {
    setTarget(null)
    setFocusField(undefined)
    setIsOpen(true)
  }
  return {
    worldStore,
    previewDocument,
    previewFloors,
    open,
    openMenu: setMenuTarget,
    overlays: (
      <>
        {isOpen && worldStore && frame && (
          <WorldEditor
            store={worldStore}
            frame={frame}
            roles={roles}
            target={target}
            focusField={focusField}
            onPreview={setPreviewDocument}
            onClose={() => {
              setPreviewDocument(null)
              setIsOpen(false)
            }}
          />
        )}
        {menuTarget && frame && worldStore && (
          <WorldTargetMenu
            frame={roles ? maskFrame(frame, roles) : frame}
            target={menuTarget}
            onClose={() => setMenuTarget(null)}
            onSelectAgent={onSelectAgent}
            onEdit={(next, field) => {
              setMenuTarget(null)
              setTarget(next)
              setFocusField(field)
              setIsOpen(true)
            }}
          />
        )}
      </>
    )
  }
}
