import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WorldEditor } from '../../editor/WorldEditor'
import {
  createWorldDocumentStore,
  WORLD_DOCUMENT_STORAGE_KEY
} from '../../../office-live/world-document-store'
import { buildLayout } from '../../../../office/sim/layout'
import { session } from '../../../../office/sim/fixtures'
import { makeFrame } from '../fixtures'

const SAVE_MS = 5_000

it('requires a deliberate validated one-floor rebuild and restores the legacy storeys on Undo', async () => {
  const sessions = [
    session('one', 'alpha'),
    { ...session('two', 'beta'), companyKey: 'other', companyLabel: 'Other' }
  ]
  const layout = buildLayout(sessions, undefined)
  const bytes = new Map<string, string>()
  const store = createWorldDocumentStore({
    storage: {
      getItem: (key) => bytes.get(key) ?? null,
      setItem: (key, value) => {
        bytes.set(key, value)
      }
    },
    lock: { runExclusive: async (operation) => operation() },
    getLayout: () => layout,
    getSessions: () => sessions
  })
  const saved = store.get().document
  saved.buildings[0].footprint.x = 350
  saved.buildings[0].floors = 3
  saved.rooms[0].floorNumber = 3
  saved.rooms[0].displayName = 'Upper studio'
  expect((await store.save(saved, 0)).success).toBe(true)
  const before = bytes.get(WORLD_DOCUMENT_STORAGE_KEY)
  const persisted = structuredClone(store.get().document)
  render(
    <WorldEditor
      store={store}
      frame={makeFrame({ sessions })}
      onPreview={vi.fn()}
      onClose={vi.fn()}
    />
  )
  const identities = (document: typeof saved) =>
    document.rooms.map(({ position, floorNumber, ...room }) => {
      void position
      void floorNumber
      return room
    })
  const rebuild = screen.getByRole('button', { name: 'Rebuild city layout' })
  expect(screen.queryByRole('combobox', { name: 'Office placement' })).not.toBeInTheDocument()
  expect(store.get().document.rooms).toEqual(saved.rooms)
  expect(screen.getByRole('button', { name: 'Save locally' })).toBeDisabled()
  fireEvent.click(rebuild)
  expect(bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(before)
  expect(store.get().document).toEqual(persisted)
  expect(store.get().draft).toBeNull()
  expect(screen.getByRole('button', { name: 'Save locally' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  const draft = store.get().draft
  expect(draft).not.toBeNull()
  expect(draft && identities(draft)).toEqual(identities(saved))
  expect(draft?.rooms.every((room) => room.floorNumber === 1)).toBe(true)
  expect(draft?.buildings.every((building) => building.floors === 1)).toBe(true)
  expect(store.get().document).toEqual(persisted)
  expect(bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).toBe(before)
  fireEvent.click(screen.getByRole('button', { name: 'Save locally' }))
  // A save and its undo each await local storage; under a loaded suite they outrun 1 s.
  await waitFor(() => expect(store.get().revision).toBe(2), { timeout: SAVE_MS })
  expect(identities(store.get().document)).toEqual(identities(saved))
  expect(store.get().document.rooms.every((room) => room.floorNumber === 1)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Undo saved edit' }))
  await waitFor(() => expect(store.get().revision).toBe(3), { timeout: SAVE_MS })
  expect(store.get().document.buildings).toEqual(saved.buildings)
  expect(store.get().document.rooms).toEqual(saved.rooms)
  fireEvent.click(rebuild)
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(store.get().draft && identities(store.get().draft!)).toEqual(identities(saved))
  expect(bytes.get(WORLD_DOCUMENT_STORAGE_KEY)).not.toBe(before)
  expect(store.get().document.rooms).toEqual(saved.rooms)
  store.dispose()
})
