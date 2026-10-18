import { describe, expect, it } from 'vitest'
import { buildOfficeLabels, officeProjectNames } from '../../logic/office-labels'
import { makeAgent, makeFloor, makeZone } from '../fixtures'

const office = makeZone({ id: 'r1', kind: 'office', label: 'Session title' })
const project = makeZone({
  id: 'project:one',
  kind: 'project',
  label: '日本の長いプロジェクト · Infrastructure',
  children: [office]
})
const company = makeZone({
  id: 'company:one',
  kind: 'company',
  label: 'ZKidz',
  children: [project]
})
const floor = makeFloor({ floorId: 'f1', zones: [company] })

describe('office names distinct from session names', () => {
  it('retains complete project/company names, including Unicode', () => {
    expect(buildOfficeLabels(floor)[0]).toMatchObject({
      name: project.label,
      company: 'ZKidz',
      roomIds: ['r1']
    })
    expect(officeProjectNames(floor.zones).get('r1')).toBe(project.label)
  })
  it('identifies the selected office by reserved room, never a duplicate session title', () => {
    const worker = makeAgent({ agentKey: 'claude:one', roomId: 'r1', label: 'Session title' })
    expect(buildOfficeLabels(floor, worker)[0].isSelected).toBe(true)
    expect(buildOfficeLabels(floor, { ...worker, roomId: 'elsewhere' })[0].isSelected).toBe(false)
  })
  it('does not invent labels for missing projects', () => {
    expect(buildOfficeLabels(makeFloor({ floorId: 'f1' }))).toEqual([])
  })
})
