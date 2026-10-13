import { expect, it } from 'vitest'
import { toolActivity, toolCategory } from './tool-category'

// OpenCode 2 renamed bash to shell and task to subagent.
it.each([
  ['shell', 'bash'],
  ['subagent', 'task']
])('categorises OpenCode 2’s %s as OpenCode 1.x’s %s', (renamed, original) => {
  expect(toolCategory(renamed)).toBe(toolCategory(original))
  expect(toolActivity(toolCategory(renamed))).toBe(toolActivity(toolCategory(original)))
  expect(toolCategory(renamed)).not.toBe('other')
})
