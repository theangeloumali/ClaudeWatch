import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WorldEditor } from '../../editor/WorldEditor'
import { createWorldDocumentStore } from '../../../office-live/world-document-store'
import { buildLayout } from '../../../../office/sim/layout'
import { session } from '../../../../office/sim/fixtures'
import { makeFrame } from '../fixtures'

it('previews, saves and undoes a local label without renaming the source session', async () => {
  const sessions = [session('claude:one')]
  const layout = buildLayout(sessions, undefined)
  const bytes = new Map<string, string>()
  const storage = {
    getItem: (key: string) => bytes.get(key) ?? null,
    setItem: (key: string, content: string) => {
      bytes.set(key, content)
    }
  }
  const store = createWorldDocumentStore({
    storage,
    lock: { runExclusive: async (operation) => operation() },
    getLayout: () => layout,
    getSessions: () => sessions
  })
  const onPreview = vi.fn()
  render(
    <WorldEditor
      store={store}
      frame={makeFrame({ sessions })}
      onPreview={onPreview}
      onClose={vi.fn()}
    />
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Room name' }), {
    target: { value: 'Window study' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(onPreview).toHaveBeenCalledWith(
    expect.objectContaining({
      rooms: expect.arrayContaining([expect.objectContaining({ displayName: 'Window study' })])
    })
  )
  expect(store.get().document.rooms[0].displayName).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Save locally' }))
  await waitFor(() => expect(store.get().document.rooms[0].displayName).toBe('Window study'))
  expect(sessions[0].name).toBe('claude:one')
  fireEvent.click(screen.getByRole('button', { name: 'Undo saved edit' }))
  await waitFor(() => expect(store.get().document.rooms[0].displayName).toBeUndefined())
  store.dispose()
})
