import { describe, expect, it } from 'vitest'
import { buildNameCards, buildProjectStacks, MAX_NAME_CARDS } from '../../logic/name-cards'
import { makeAgent } from '../fixtures'
import { activityCountPattern, makeActivityFrame } from './activity-fixtures'

describe('uncapped project activity summaries', () => {
  it.each([20, 40, 60])(
    'reports working, attention and idle workers at %i-worker density',
    (workerCount) => {
      const frame = makeActivityFrame(
        Array.from({ length: workerCount }, (_, index) =>
          makeAgent({
            agentKey: `worker-${index}`,
            activity: index < workerCount - 5 ? 'editing' : 'idle',
            attention: index >= workerCount - 2 ? 'permission' : 'none'
          })
        )
      )
      const cards = buildNameCards(frame, 'f1', null)
      expect(cards).toHaveLength(Math.min(workerCount, MAX_NAME_CARDS))
      const stacks = buildProjectStacks(frame, 'f1')
      expect(stacks).toHaveLength(1)
      expect(stacks[0].text).toContain('Project')
      expect(stacks[0].text).toContain(`${workerCount} agents`)
      expect(stacks[0].text).toMatch(activityCountPattern(workerCount - 5, 'working'))
      expect(stacks[0].text).toMatch(activityCountPattern(2, 'needs you'))
      expect(stacks[0].text).toMatch(activityCountPattern(3, 'idle\\s*/\\s*done'))
    }
  )
})
