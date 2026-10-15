// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const exposed = vi.hoisted(() => ({ api: null as unknown }))
const ipcRenderer = vi.hoisted(() => ({
  on: vi.fn(),
  removeListener: vi.fn(),
  invoke: vi.fn().mockResolvedValue({ success: true })
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      if (key === 'officeBridge') exposed.api = api
    }
  },
  ipcRenderer
}))

import type { OfficeBridgeApi } from './office'

describe('office preload', () => {
  let api: OfficeBridgeApi

  beforeEach(async () => {
    vi.clearAllMocks()
    await import('./office')
    api = exposed.api as OfficeBridgeApi
  })

  it('forwards feed messages from main to the subscriber and unsubscribes cleanly', () => {
    const listener = vi.fn()
    const unsubscribe = api.onFeedMessage(listener)
    const registration = ipcRenderer.on.mock.calls.find(([channel]) => channel === 'office:feed')
    const handler = registration?.[1]
    if (typeof handler !== 'function') throw new Error('Feed subscription absent')
    handler({}, { type: 'resync' })
    unsubscribe()

    expect(registration?.[0]).toBe('office:feed')
    expect(listener).toHaveBeenCalledWith({ type: 'resync' })
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('office:feed', handler)
  })

  it('asks main to focus an agent, a teammate included, and returns where it landed', async () => {
    ipcRenderer.invoke.mockResolvedValueOnce({ success: true, target: 'pane' })

    expect(await api.focus('claude:abc#lena')).toEqual({ success: true, target: 'pane' })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('office:focus', 'claude:abc#lena')
  })

  it('routes talk, respond, peek and start to their own channels', async () => {
    await api.send('claude:a', 'hi')
    await api.respond('claude:a', 'approve', 'fp')
    await api.peek('claude:a')
    await api.start('p_app', 'claude')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('office:send', 'claude:a', 'hi')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('office:respond', 'claude:a', 'approve', 'fp')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('office:peek', 'claude:a')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('office:start', 'p_app', 'claude')
  })

  it('asks main for the current snapshot on load', async () => {
    await api.ready()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('office:ready')
  })
})
