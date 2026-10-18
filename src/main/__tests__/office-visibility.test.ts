import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { OfficeWindowController } from '../office-window'

class NativeWindow extends EventEmitter {
  isOnScreen = true
  isMinimized = () => false
  isVisible = () => this.isOnScreen
  isDestroyed = () => false
  focus = vi.fn()
  show = vi.fn()
  restore = vi.fn()
  webContents = { send: vi.fn() }
}

it('reports initial and changed native visibility without stopping monitoring', () => {
  const window = new NativeWindow()
  const snapshot = { rev: 0, generatedAtMs: 1, sessions: [], sources: [] }
  const controller = new OfficeWindowController({
    createWindow: () => window,
    activate: vi.fn(),
    host: { snapshot: () => snapshot, onMessage: () => vi.fn() }
  })
  controller.open()
  controller.ready()
  expect(window.webContents.send).toHaveBeenCalledWith('office:visibility', true)
  window.isOnScreen = false
  window.emit('hide')
  expect(window.webContents.send).toHaveBeenCalledWith('office:visibility', false)
  controller.ready()
  expect(window.webContents.send).toHaveBeenCalledWith('office:feed', {
    type: 'hello',
    v: 1,
    snapshot
  })
})
