import type { AgentView } from '../../../shared/office/types'
import type { FloorGeometry, ZoneGeometry } from '../scene-model'

export interface OfficeLabel {
  id: string
  name: string
  company: string
  x: number
  z: number
  roomIds: string[]
  isSelected: boolean
  kind?: 'room'
  context?: string
  y?: number
}

function leafRoomIds(zone: ZoneGeometry): string[] {
  return zone.children.length ? zone.children.flatMap(leafRoomIds) : [zone.id]
}

// dry-new: project summary badges count activity; office identification needs full names at desk zoom.
export function buildOfficeLabels(
  floor: FloorGeometry,
  selected?: Pick<AgentView, 'roomId'>
): OfficeLabel[] {
  const projects = floor.zones.flatMap((company) =>
    company.children
      .filter((project) => project.kind === 'project')
      .map((project) => {
        const roomIds = leafRoomIds(project)
        return {
          id: project.id,
          name: project.label,
          company: company.label,
          x: project.door?.x ?? project.x,
          z: project.door?.z ?? project.z + project.depth / 2,
          roomIds,
          isSelected: !!selected && roomIds.includes(selected.roomId)
        }
      })
  )
  const elevation =
    'elevation' in floor && typeof floor.elevation === 'number' ? floor.elevation : 0
  const rooms = floor.rooms.map((room): OfficeLabel => {
    const project = projects.find((label) => label.roomIds.includes(room.id))
    return {
      id: room.id,
      name: room.label,
      company: project?.company ?? floor.label,
      context: project?.name,
      x: room.door.x,
      z: room.door.z,
      y: elevation + 2.6,
      roomIds: [room.id],
      isSelected: selected?.roomId === room.id,
      kind: 'room'
    }
  })
  return [...projects, ...rooms]
}

export function officeProjectNames(zones: readonly ZoneGeometry[]): Map<string, string> {
  return new Map(
    zones.flatMap((company) =>
      company.children
        .filter((project) => project.kind === 'project')
        .flatMap((project) =>
          leafRoomIds(project).map((id): [string, string] => [id, project.label])
        )
    )
  )
}
