import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeFloor, makeZone } from '../__tests__/fixtures'
import { ZonePickers } from './ZonePickers'

interface PlateProps {
  onPointerDown: (event: { clientX: number; clientY: number }) => void
  onClick: (event: { clientX: number; clientY: number; stopPropagation: () => void }) => void
}

// Expands function components by hand: the plates need no canvas to be exercised.
function plates(node: ReactNode): ReactElement<PlateProps>[] {
  if (Array.isArray(node)) return node.flatMap(plates)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  if (typeof node.type === 'function') {
    return plates((node.type as (props: unknown) => ReactNode)(node.props))
  }
  if (node.type === 'mesh') return [node as ReactElement<PlateProps>]
  return plates(node.props.children)
}

const floor = makeFloor({
  floorId: 'hq',
  zones: [
    makeZone({
      id: 'company',
      kind: 'company',
      children: [makeZone({ id: 'project', kind: 'project' })]
    })
  ]
})

describe('ZonePickers', () => {
  it('clears the selection on a click on bare floor inside a zone, but not after a drag', () => {
    const onMiss = vi.fn()
    const stopPropagation = vi.fn()
    const [company, project] = plates(ZonePickers({ floor, onFly: vi.fn(), onMiss }))
    expect(project).toBeDefined()

    company.props.onPointerDown({ clientX: 100, clientY: 100 })
    company.props.onClick({ clientX: 101, clientY: 100, stopPropagation })
    expect(onMiss).toHaveBeenCalledOnce()
    expect(stopPropagation).toHaveBeenCalledOnce()

    // Panning the map ends with a click event on the plate under the pointer.
    project.props.onPointerDown({ clientX: 100, clientY: 100 })
    project.props.onClick({ clientX: 180, clientY: 140, stopPropagation })
    expect(onMiss).toHaveBeenCalledOnce()
    expect(stopPropagation).toHaveBeenCalledOnce()
  })

  it('sends the player to a still click while walking, once, and keeps the selection', () => {
    const onMiss = vi.fn()
    const onWalk = vi.fn()
    const [, project] = plates(ZonePickers({ floor, onFly: vi.fn(), onMiss, onWalk }))
    const stopPropagation = vi.fn()
    const click = { clientX: 50, clientY: 50, point: { x: 1, y: 0, z: 2 }, stopPropagation }

    project.props.onPointerDown(click)
    project.props.onClick(click)
    expect(onWalk).toHaveBeenCalledWith(click.point)
    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(onMiss).not.toHaveBeenCalled()

    project.props.onClick({ ...click, clientX: 150 })
    expect(onWalk).toHaveBeenCalledOnce()
  })
})
