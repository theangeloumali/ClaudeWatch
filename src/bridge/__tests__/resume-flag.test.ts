import { expect, it } from 'vitest'
import { claudeSessionClaim } from '../claude-process-claims'

// health-6: a value-less --resume followed by a flag claims no session, and never borrows one.
it('reads a bare --resume followed by a flag as no explicit session', () => {
  expect(claudeSessionClaim(['claude', '--resume', '--dangerously-skip-permissions'])).toBe('')
})

it('still reads a --resume session id', () => {
  const id = 'a1b2c3d4-0000-4000-8000-000000000001'
  expect(claudeSessionClaim(['claude', '--resume', id, '--verbose'])).toBe(id)
})
