import { expect, it } from 'vitest'
import { makeFloor, makeFrame, makeSession, makeZone } from '../fixtures'
import { buildOfficesTree } from '../../logic/zone-model'
import { INITIAL_OFFICE_STATE, officeReducer } from '../../logic/office-reducer'

const sessions = ['north', 'south'].map((label) =>
  makeSession({
    key: `claude:${label}`,
    projectKey: label,
    projectLabel: label,
    companyKey: 'company',
    companyLabel: 'Company'
  })
)
const floors = sessions.map((session, index) =>
  makeFloor({
    floorId: `building:${index}:1`,
    zones: [
      makeZone({
        id: 'company:shared',
        kind: 'company',
        companyKey: 'company',
        label: 'Company',
        children: [
          makeZone({
            id: `project:${session.projectKey}`,
            kind: 'project',
            companyKey: 'company',
            projectKey: session.projectKey,
            label: session.projectLabel
          })
        ]
      })
    ]
  })
)
const frame = makeFrame({ sessions, floors })

it('keeps all projects when a company occupies more than one building or floor', () => {
  const tree = buildOfficesTree(frame)
  expect(tree).toHaveLength(1)
  expect(tree[0].projects.map((project) => project.projectKey)).toEqual(['north', 'south'])
})

it('frames the actual physical floor containing a chosen district zone', () => {
  const current = { ...INITIAL_OFFICE_STATE, frame, focusedFloorId: floors[0].floorId }
  const next = officeReducer(current, { type: 'zone-flown', zoneId: 'project:south' })
  expect(next.focusedFloorId).toBe(floors[1].floorId)
})
