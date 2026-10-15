import { isValidElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { makeFloor, makeRoom } from '../fixtures'
import { ZonePickers, trackPress } from '../../scene/ZonePickers'

interface ContextHit {
  clientX: number
  clientY: number
  nativeEvent: MouseEvent
  stopPropagation: () => void
}

function contextMeshes(node: ReactNode): Array<{
  position: number[]
  onContextMenu: (event: ContextHit) => void
}> {
  if (Array.isArray(node)) return node.flatMap(contextMeshes)
  if (
    !isValidElement<{
      children?: ReactNode
      position?: number[]
      onContextMenu?: (event: ContextHit) => void
    }>(node)
  )
    return []
  const { position, onContextMenu } = node.props
  if (node.type === 'mesh' && position && onContextMenu) return [{ position, onContextMenu }]
  return contextMeshes(node.props.children)
}

it('targets the actual elevated room or building and consumes only its native context event', () => {
  const floor = {
    ...makeFloor({ floorId: 'f:3', rooms: [makeRoom({ id: 'room:actual', x: 30, z: -12 })] }),
    buildingId: 'building:actual',
    elevation: 11
  }
  const onEditTarget = vi.fn()
  const hits = contextMeshes(ZonePickers({ floor, onFly: vi.fn(), onMiss: vi.fn(), onEditTarget }))
  expect(hits.map((hit) => hit.position[1])).toEqual([11.01, 11.04])
  const nativeEvent = new MouseEvent('contextmenu', {
    clientX: 80,
    clientY: 120,
    cancelable: true,
    button: 2,
    shiftKey: true
  })
  const stopPropagation = vi.fn()
  const event = { nativeEvent, stopPropagation, clientX: 80, clientY: 120 }
  trackPress(event)
  hits[1].onContextMenu(event)
  expect(onEditTarget).toHaveBeenLastCalledWith({
    kind: 'room',
    id: 'room:actual',
    clientX: 80,
    clientY: 120
  })
  hits[0].onContextMenu(event)
  expect(onEditTarget).toHaveBeenLastCalledWith({
    kind: 'building',
    id: 'building:actual',
    clientX: 80,
    clientY: 120
  })
  expect(nativeEvent.defaultPrevented).toBe(true)
  expect(stopPropagation).toHaveBeenCalledTimes(2)
})

it('does not open a target menu after a dragged context gesture', () => {
  const floor = makeFloor({ floorId: 'f1' })
  const onEditTarget = vi.fn()
  const hits = contextMeshes(ZonePickers({ floor, onFly: vi.fn(), onMiss: vi.fn(), onEditTarget }))
  trackPress({ clientX: 40, clientY: 40 })
  hits[0].onContextMenu({
    clientX: 80,
    clientY: 40,
    nativeEvent: new MouseEvent('contextmenu', { button: 2, shiftKey: true }),
    stopPropagation: vi.fn()
  })
  expect(onEditTarget).not.toHaveBeenCalled()
})

it('leaves a plain right-click to camera orbit without opening an editor target', () => {
  const onEditTarget = vi.fn()
  const hits = contextMeshes(
    ZonePickers({
      floor: makeFloor({ floorId: 'f1' }),
      onFly: vi.fn(),
      onMiss: vi.fn(),
      onEditTarget
    })
  )
  const stopPropagation = vi.fn()
  const event = {
    clientX: 40,
    clientY: 40,
    nativeEvent: new MouseEvent('contextmenu', { button: 2, cancelable: true }),
    stopPropagation
  }
  trackPress(event)
  hits[0].onContextMenu(event)
  expect(onEditTarget).not.toHaveBeenCalled()
  expect(stopPropagation).not.toHaveBeenCalled()
})
