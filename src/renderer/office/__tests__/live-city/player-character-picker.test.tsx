import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PlayerCharacterPicker } from '../../player/PlayerCharacterPicker'

afterEach(cleanup)

it('exposes a labeled native selection without saving or rewriting identity', () => {
  const choices: string[] = []
  const view = render(<PlayerCharacterPicker value="theme" onChange={(id) => choices.push(id)} />)
  const select = screen.getByRole('combobox', { name: 'Player character' })
  expect(screen.getAllByRole('option')).toHaveLength(7)
  fireEvent.change(select, { target: { value: 'scoutrobo' } })
  expect(choices).toEqual(['scoutrobo'])
  view.rerender(<PlayerCharacterPicker value="scoutrobo" onChange={(id) => choices.push(id)} />)
  expect(screen.getByRole('option', { name: 'Scout robot' }).getAttribute('value')).toBe(
    'scoutrobo'
  )
})
