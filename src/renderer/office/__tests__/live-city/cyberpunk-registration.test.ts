import { expect, it } from 'vitest'
import { getTheme, listThemes } from '../../themes/registry'

it('adds a distinct Cyberpunk City without changing any existing world identity', () => {
  const themes = listThemes()
  expect(themes.map((theme) => theme.id)).toEqual(
    expect.arrayContaining([
      'neo-edo-steam',
      'brass-workshop',
      'violet-court',
      'orbital-garrison',
      'quiet-grove',
      'samurai-empire',
      'corporate-city',
      'cyberpunk-city'
    ])
  )
  const cyberpunk = getTheme('cyberpunk-city')
  expect(cyberpunk.id).toBe('cyberpunk-city')
  expect(cyberpunk.label).toBe('Cyberpunk City')
  expect(cyberpunk.robot.Model).toBeDefined()
  expect(cyberpunk.town).toBeDefined()
})
