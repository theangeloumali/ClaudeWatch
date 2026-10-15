import { useMemo, useState } from 'react'
import type { OfficeFeed, OfficeFrame } from '../scene-model'
import type { SceneEditTarget } from '../scene/ZonePickers'
import type { WorldDocument } from '../../../shared/office/world-document'
import { buildLayout } from '../../../office/sim/layout'
import { resolveEffectiveWorld } from '../../../office/sim/effective-world'
import { toFloorGeometry } from '../../office-live/layout-geometry'
import { WorldEditor } from './WorldEditor'
import { WorldTargetMenu } from './WorldTargetMenu'

export function useWorldEditing({
  feed,
  frame,
  onSelectAgent
}: {
  feed: OfficeFeed
  frame: OfficeFrame | null
  onSelectAgent: (key: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [target, setTarget] = useState<SceneEditTarget | null>(null)
  const [menuTarget, setMenuTarget] = useState<SceneEditTarget | null>(null)
  const [focusField, setFocusField] = useState<string | undefined>()
  const [previewDocument, setPreviewDocument] = useState<WorldDocument | null>(null)
  const worldStore = feed.getWorldDocumentStore?.()
  const previewFloors = useMemo(() => {
    if (!previewDocument || !frame) return null
    const base = buildLayout(frame.sessions, undefined)
    return toFloorGeometry(
      resolveEffectiveWorld(base, previewDocument, frame.sessions),
      frame.sessions
    )
  }, [previewDocument, frame?.sessions])
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
            frame={frame}
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
