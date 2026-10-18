import type { LayoutMap, ZoneLayout } from '../../office/sim/layout'
import { bounds } from '../../office/sim/rooms'
import { WORLD_DOCUMENT_LIMITS as LIMITS } from './world-document-limits'
import type { WorldAllocation } from './world-document-types'

export function allocationFromLayout(layout: LayoutMap): WorldAllocation {
  const companies = new Map<string, ZoneLayout>()
  for (const floor of layout.floors)
    for (const zone of floor.zones ?? []) {
      if (zone.kind === 'company' && !companies.has(zone.companyKey))
        companies.set(zone.companyKey, zone)
    }
  return {
    reservations: Object.entries(layout.reservations)
      .slice(0, LIMITS.allocation)
      .map(([sessionKey, held]) => ({
        sessionKey,
        floorId: held.floorId,
        plate: held.plate,
        bay: held.bay,
        companyKey: held.companyKey,
        projectKey: held.projectKey
      })),
    order: [...companies.values()]
      .flatMap((company) => [
        { companyKey: company.companyKey, index: company.index },
        ...company.children.map((project) => ({
          companyKey: company.companyKey,
          projectKey: project.projectKey ?? '',
          index: project.index
        }))
      ])
      .slice(0, LIMITS.allocation)
  }
}

export function allocationLayout(
  allocation: WorldAllocation | undefined,
  fallback: LayoutMap
): LayoutMap {
  if (!allocation) return structuredClone(fallback)
  const zone = (companyKey: string, projectKey: string | undefined, index: number): ZoneLayout => ({
    ...bounds(0, 0, 1, 1),
    id: projectKey ? `company:${companyKey}:project:${projectKey}` : `company:${companyKey}`,
    kind: projectKey ? 'project' : 'company',
    label: '',
    companyKey,
    projectKey: projectKey ?? null,
    sessionKey: null,
    capacity: 0,
    index,
    children: []
  })
  const companies = allocation.order
    .filter((order) => order.projectKey === undefined)
    .map((order) => ({
      ...zone(order.companyKey, undefined, order.index),
      children: allocation.order
        .filter(
          (project) => project.companyKey === order.companyKey && project.projectKey !== undefined
        )
        .map((project) => zone(project.companyKey, project.projectKey, project.index))
    }))
  return {
    version: 1,
    floors: [
      {
        id: 'hq',
        label: 'Headquarters',
        x: 0,
        z: 0,
        width: 12,
        depth: 12,
        rooms: [],
        zones: companies,
        elevator: { id: 'entrance', x: 0, z: 0, heading: 0 }
      }
    ],
    reservations: {
      ...fallback.reservations,
      ...Object.fromEntries(
        allocation.reservations.map(({ sessionKey, ...held }) => [sessionKey, held])
      )
    }
  }
}
