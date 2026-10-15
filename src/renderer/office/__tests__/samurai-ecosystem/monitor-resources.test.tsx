import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { WorkstationScreens } from '../../scene/WorkstationScreens'
import type { WorkstationDisplay } from '../../logic/workstation-displays'

const textures = vi.hoisted(() => ({ created: [] as Texture[] }))
vi.mock('../../scene/monitor-texture', () => ({
  monitorTexture: () => {
    const texture = new Texture()
    vi.spyOn(texture, 'dispose')
    textures.created.push(texture)
    return texture
  }
}))

const display: WorkstationDisplay = {
  agentKey: 'claude:lead',
  x: 0,
  y: 1,
  z: 2,
  width: 1,
  height: 0.5,
  rotationY: Math.PI,
  title: 'Editing',
  detail: 'Edit',
  color: '#5FD3C4'
}
afterEach(() => {
  textures.created.length = 0
})

it('reuses activity textures on movement and disposes replaced/unmounted resources', () => {
  // DOM test renderer does not understand R3F host tags; only those expected warnings are silenced.
  const originalError = console.error
  const consoleSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((message: unknown, ...arguments_: unknown[]) => {
      if (
        typeof message === 'string' &&
        (message.includes('incorrect casing') ||
          message.includes('unrecognized in this browser') ||
          message.includes('does not recognize') ||
          message.includes('non-boolean attribute'))
      )
        return
      originalError(message, ...arguments_)
    })
  const view = render(<WorkstationScreens displays={[display]} />)
  expect(textures.created).toHaveLength(1)
  view.rerender(<WorkstationScreens displays={[{ ...display, x: 3 }]} />)
  expect(textures.created).toHaveLength(1)
  view.rerender(
    <WorkstationScreens displays={[{ ...display, title: 'Reading', detail: 'Read' }]} />
  )
  expect(textures.created).toHaveLength(2)
  expect(textures.created[0].dispose).toHaveBeenCalledOnce()
  view.unmount()
  expect(textures.created[1].dispose).toHaveBeenCalledOnce()
  consoleSpy.mockRestore()
})
