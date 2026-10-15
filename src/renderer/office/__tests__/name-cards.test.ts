import { describe, expect, it } from 'vitest'
import { buildNameCards, buildProjectStacks, MAX_NAME_CARDS } from '../logic/name-cards'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from './fixtures'

const floor = makeFloor({
  floorId: 'f1',
  rooms: [makeRoom({ id: 'r1', sessionKey: 'a' }), makeRoom({ id: 'r2', sessionKey: 'b' })]
})

const frame = makeFrame({
  floors: [floor, makeFloor({ floorId: 'f2' })],
  sessions: [
    makeSession({
      key: 'a',
      name: 'office renderer',
      activity: 'editing',
      currentTool: { name: 'Bash', category: 'run' },
      subagents: [{ id: 's', type: 'Explore', activity: 'idle' }]
    }),
    makeSession({ key: 'b', name: 'auth migration', attention: 'permission' })
  ],
  agents: [
    makeAgent({ agentKey: 'a', roomId: 'r1', activity: 'editing', x: 1, z: 2, heading: 0 }),
    makeAgent({ agentKey: 'a#s', roomId: 'r1', isSubagent: true, label: 'Explore' }),
    makeAgent({ agentKey: 'b', roomId: 'r2', attention: 'permission' }),
    makeAgent({ agentKey: 'elsewhere', floorId: 'f2', roomId: 'x' })
  ]
})

describe('buildNameCards', () => {
  const cards = buildNameCards(frame, 'f1', null)

  it('gives main agents a card with name, role line and status, and subagents a pill', () => {
    const office = cards.find((card) => card.agentKey === 'a')
    expect(office).toMatchObject({
      kind: 'card',
      title: 'office renderer',
      detail: 'Editing · Bash',
      status: 'working'
    })
    expect(cards.find((card) => card.agentKey === 'a#s')).toMatchObject({
      kind: 'pill',
      title: 'Explore'
    })
    expect(cards.find((card) => card.agentKey === 'b')).toMatchObject({
      status: 'permission',
      detail: 'Needs permission'
    })
  })

  it('floats the card over the desk in front of the agent', () => {
    const office = cards.find((card) => card.agentKey === 'a')
    expect(office?.x).toBeCloseTo(1)
    expect(office?.z).toBeGreaterThan(2)
  })

  it('keeps the card over an agent that is in the lounge, where there is no desk', () => {
    const lounging = makeFrame({
      floors: [floor],
      sessions: [makeSession({ key: 'a', name: 'office renderer', attention: 'done' })],
      agents: [makeAgent({ agentKey: 'a', roomId: 'r1', x: 9, z: 4, heading: 0, place: 'lounge' })]
    })
    const card = buildNameCards(lounging, 'f1', null).find((entry) => entry.agentKey === 'a')
    expect(card).toMatchObject({ x: 9, z: 4 })
  })

  it('shows only the focused floor and puts waiting agents first', () => {
    expect(cards.some((card) => card.agentKey === 'elsewhere')).toBe(false)
    expect(cards[0].agentKey).toBe('b')
  })

  it('clamps how many cards are drawn', () => {
    const crowd = makeFrame({
      floors: [floor],
      agents: Array.from({ length: 40 }, (_, index) =>
        makeAgent({ agentKey: `bot-${index}`, roomId: 'r1' })
      )
    })
    expect(buildNameCards(crowd, 'f1', null).length).toBeLessThanOrEqual(MAX_NAME_CARDS)
  })

  it('keeps every agent with something wrong when the cap drops quiet ones', () => {
    const agents = [
      ...Array.from({ length: 60 }, (_, index) =>
        makeAgent({ agentKey: `bot-${index}`, roomId: 'r1', activity: 'editing' })
      ),
      makeAgent({ agentKey: 'broken', roomId: 'r1', attention: 'error' }),
      makeAgent({ agentKey: 'limited', roomId: 'r1', attention: 'limited' })
    ]
    const crowd = makeFrame({
      floors: [floor],
      agents,
      sessions: agents.map((agent) =>
        makeSession({ key: agent.agentKey, activity: agent.activity, attention: agent.attention })
      )
    })
    const keys = buildNameCards(crowd, 'f1', null).map((card) => card.agentKey)
    expect(keys).toEqual(expect.arrayContaining(['broken', 'limited']))
  })

  it('carries the project and last update so ties go to the most recent', () => {
    const office = buildNameCards(frame, 'f1', null).find((card) => card.agentKey === 'a')
    expect(office).toMatchObject({ projectKey: 'p_1', updatedAtMs: 0 })
  })

  it('uses physical presence for scoped cards and retains actual transit positions globally', () => {
    const visitor = makeAgent({
      agentKey: 'visitor',
      floorId: 'f1',
      physicalFloorId: 'f2',
      roomId: 'r1',
      x: 20,
      z: 30,
      elevation: 11,
      place: 'lounge'
    })
    const transit = { ...visitor, agentKey: 'transit', physicalFloorId: null, elevation: 2.75 }
    const visiting = makeFrame({ ...frame, agents: [visitor, transit, visitor] })
    expect(buildNameCards(visiting, 'f1', null)).toEqual([])
    expect(buildNameCards(visiting, 'f2', null).map((card) => card.agentKey)).toEqual(['visitor'])
    const global = buildNameCards(visiting, null, 'transit')
    expect(global).toHaveLength(2)
    expect(global[0]).toMatchObject({ agentKey: 'transit', x: 20, z: 30 })
    expect(global[1]).toMatchObject({ agentKey: 'visitor', x: 20, z: 30 })
    expect(visiting.agents).toEqual([visitor, transit, visitor])
  })
})

describe('buildProjectStacks', () => {
  it('counts a split project globally once without duplicate actors or DOM keys', () => {
    const project = makeZone({ id: 'project:lower', kind: 'project', projectKey: 'p_1' })
    const company = makeZone({ id: 'company', kind: 'company', children: [project] })
    const zoned = makeFrame({
      ...frame,
      floors: frame.floors.map((floor, index) => ({
        ...floor,
        zones: [{ ...company, children: [{ ...project, id: `project:${index}` }] }]
      })),
      agents: [...frame.agents, frame.agents[0]]
    })
    const stacks = buildProjectStacks(zoned, null)
    expect(stacks).toHaveLength(1)
    expect(stacks[0]).toMatchObject({ projectKey: 'p_1', zoneId: 'project:0' })
    expect(stacks[0].text).toContain('3 agents')
  })

  it('summarises a project for its stacked badge and anchors it on the project office', () => {
    const zoned = makeFrame({
      ...frame,
      floors: [
        makeFloor({
          ...floor,
          zones: [
            makeZone({
              id: 'c',
              kind: 'company',
              children: [
                makeZone({
                  id: 'p-zone',
                  kind: 'project',
                  label: 'PropApp',
                  projectKey: 'p_1',
                  x: 7,
                  z: -3
                })
              ]
            })
          ]
        })
      ]
    })
    expect(buildProjectStacks(zoned, 'f1')).toEqual([
      expect.objectContaining({
        projectKey: 'p_1',
        zoneId: 'p-zone',
        x: 7,
        z: -3,
        text: 'PropApp · 3 agents · 1 Working · 1 Needs you · 1 Idle/Done'
      })
    ])
  })
})
