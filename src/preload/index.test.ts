// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const exposed = vi.hoisted(() => ({ api: null as unknown }))
const ipcRenderer = vi.hoisted(() => ({
  on: vi.fn(),
  removeListener: vi.fn(),
  invoke: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      if (key === 'api') exposed.api = api
    }
  },
  ipcRenderer
}))

import type { ElectronAPI } from './index'

describe('dashboard preload', () => {
  let api: ElectronAPI

  beforeEach(async () => {
    vi.clearAllMocks()
    await import('./index')
    api = exposed.api as ElectronAPI
  })

  it('tells the renderer which platform it runs on, for its window chrome', () => {
    expect(api.platform).toBe(process.platform)
  })

  it('asks main to focus a session by pid and returns where it landed', async () => {
    const landedOnApp = { success: false, reason: 'terminal-not-found', target: 'app' }
    ipcRenderer.invoke.mockResolvedValue(landedOnApp)

    expect(await api.focusSession(4242)).toEqual(landedOnApp)
    expect(ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith('session:focus', 4242)
  })

  it('asks main for the Office snapshot, which is null until the bridge reports', async () => {
    ipcRenderer.invoke.mockResolvedValue(null)

    expect(await api.getOfficeSnapshot()).toBeNull()
    expect(ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith('office:snapshot')
  })

  it('asks main to open the Office', async () => {
    ipcRenderer.invoke.mockResolvedValue({ success: true })

    expect(await api.openOffice()).toEqual({ success: true })
    expect(ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith('app:open-office')
  })

  it('asks main for the accounts and their totals', async () => {
    ipcRenderer.invoke.mockResolvedValue({ status: 'off' })

    expect(await api.getAccounts()).toEqual({ status: 'off' })
    expect(ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith('accounts:get')
  })

  it('asks main to name an account, or to clear its name', async () => {
    ipcRenderer.invoke.mockResolvedValue({ success: true })

    expect(await api.setAccountAlias('claude:aaaaaaaaaaaa', 'Work')).toEqual({ success: true })
    await api.setAccountAlias('claude:aaaaaaaaaaaa', null)
    expect(ipcRenderer.invoke.mock.calls).toEqual([
      ['accounts:set-alias', 'claude:aaaaaaaaaaaa', 'Work'],
      ['accounts:set-alias', 'claude:aaaaaaaaaaaa', null]
    ])
  })

  it('hears every change to the accounts until it stops listening', () => {
    const listener = vi.fn()
    const stop = api.onAccountsUpdate(listener)
    const [channel, handler] = ipcRenderer.on.mock.calls[0]
    expect(channel).toBe('accounts:update')

    handler({}, { status: 'off' })
    expect(listener).toHaveBeenCalledExactlyOnceWith({ status: 'off' })

    stop()
    expect(ipcRenderer.removeListener).toHaveBeenCalledExactlyOnceWith('accounts:update', handler)
  })
})
