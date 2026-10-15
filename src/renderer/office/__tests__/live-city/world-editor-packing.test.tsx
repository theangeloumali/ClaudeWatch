import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WorldEditor } from '../../editor/WorldEditor'
import { createWorldDocumentStore } from '../../../office-live/world-document-store'
import { WORLD_DOCUMENT_STORAGE_KEY } from '../../../office-live/world-document-storage'
import { buildLayout } from '../../../../office/sim/layout'
import { session } from '../../../../office/sim/fixtures'
import { makeFrame } from '../fixtures'

it('rebuilds only a draft, then previews, saves, reloads and undoes preserved room and desk identities', async () => {
  const sessions = [session('claude:one', 'first-project'), session('claude:two', 'second-project')]
  const layout = buildLayout(sessions, undefined)
  const savedBytes = new Map<string, string>()
  const options = {
    storage: {
      getItem: (key: string) => savedBytes.get(key) ?? null,
      setItem: (key: string, content: string) => savedBytes.set(key, content)
    },
    lock: { runExclusive: async <Output,>(operation: () => Promise<Output>) => operation() },
    getLayout: () => layout,
    getSessions: () => sessions
  }
  const store = createWorldDocumentStore(options)
  const initial = store.get().document
  initial.buildings[0].footprint.x = 500
  initial.buildings[0].floors = 3
  initial.rooms[0].floorNumber = 3
  initial.rooms[0].displayName = 'Preserved study'
  initial.rooms[0].themeId = 'cyberpunk-city'
  expect((await store.save(initial, 0)).success).toBe(true)
  const previous = store.get().document
  const previousBytes = savedBytes.get(WORLD_DOCUMENT_STORAGE_KEY)
  const onPreview = vi.fn()
  const view = render(
    <WorldEditor
      store={store}
      frame={makeFrame({ sessions })}
      onPreview={onPreview}
      onClose={vi.fn()}
    />
  )

  expect(screen.getByRole('button', { name: 'Save locally' })).toBeDisabled()
  expect(store.get().document.buildings[0].floors).toBe(3)
  expect(store.get().document.rooms[0].floorNumber).toBe(3)
  fireEvent.click(screen.getByRole('button', { name: 'Rebuild city layout' }))
  expect(savedBytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(previousBytes)
  expect(store.get().document).toEqual(previous)
  expect(store.get().draft).toBeNull()
  expect(screen.getByRole('button', { name: 'Save locally' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent(/draft.*Preview.*Save/i)
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  const draft = store.get().draft
  expect(draft).not.toBeNull()
  expect(draft?.buildings.map((building) => building.footprint)).not.toEqual(
    previous.buildings.map((building) => building.footprint)
  )
  expect(draft?.buildings.every((building) => building.floors === 1)).toBe(true)
  expect(draft?.rooms.every((room) => room.floorNumber === 1)).toBe(true)
  const identities = (document: typeof previous) =>
    document.rooms.map(({ position, floorNumber, ...room }) => {
      void position
      void floorNumber
      return room
    })
  expect(draft && identities(draft)).toEqual(identities(previous))
  expect(onPreview).toHaveBeenLastCalledWith(draft)
  expect(store.get().document).toEqual(previous)
  expect(screen.getByRole('button', { name: 'Save locally' })).toBeEnabled()
  expect(savedBytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(previousBytes)

  fireEvent.click(screen.getByRole('button', { name: 'Save locally' }))
  await waitFor(() => expect(store.get().revision).toBe(previous.revision + 1))
  const reloaded = createWorldDocumentStore(options)
  expect(reloaded.get().document).toEqual(store.get().document)
  expect(identities(reloaded.get().document)).toEqual(identities(previous))
  expect(reloaded.get().document.rooms.every((room) => room.floorNumber === 1)).toBe(true)
  reloaded.dispose()

  fireEvent.click(screen.getByRole('button', { name: 'Undo saved edit' }))
  await waitFor(() =>
    expect(store.get().document.buildings.map((building) => building.footprint)).toEqual(
      previous.buildings.map((building) => building.footprint)
    )
  )
  expect(store.get().document.rooms).toEqual(previous.rooms)
  view.unmount()
  store.dispose()
})
