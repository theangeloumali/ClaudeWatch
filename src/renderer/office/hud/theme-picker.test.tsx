import { act, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { officeThemes } from '../logic/office-themes'
import { officesPanel, resetHud, selectAgent, setupHud } from './hud-test-harness'

vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => false }))

beforeEach(resetHud)

describe('theme picker', () => {
  it('sets a company theme from its row and marks the choice', () => {
    setupHud()
    const offices = officesPanel()
    const toggle = within(offices).getByRole('button', { name: 'Theme for ZKidz: Corporate City' })
    expect(toggle).toHaveTextContent('Corporate City')
    fireEvent.click(toggle)
    const picker = within(offices).getByRole('group', { name: 'Theme for ZKidz' })
    expect(
      within(picker).getByRole('radio', { name: 'Follow the floor (Corporate City)' })
    ).toBeChecked()
    fireEvent.click(within(picker).getByRole('radio', { name: 'Brass Workshop' }))
    expect(officeThemes.getAssignments().companies).toEqual({ c_zk: 'brass-workshop' })
    expect(
      within(offices).getByRole('button', { name: 'Theme for ZKidz: Brass Workshop' })
    ).toBeInTheDocument()
  })

  it('overrides one project, then clears back to the company theme', () => {
    setupHud()
    act(() => officeThemes.setCompanyTheme('c_zk', 'brass-workshop'))
    const offices = officesPanel()
    fireEvent.click(
      within(offices).getByRole('button', { name: 'Theme for PropApp: Brass Workshop' })
    )
    const picker = within(offices).getByRole('group', { name: 'Theme for PropApp' })
    fireEvent.click(within(picker).getByRole('radio', { name: 'Violet Court' }))
    expect(officeThemes.getAssignments().projects).toEqual({ p_pa: 'violet-court' })
    fireEvent.click(within(picker).getByRole('radio', { name: 'Follow ZKidz (Brass Workshop)' }))
    expect(officeThemes.getAssignments().projects).toEqual({})
  })

  it('closes on Escape and returns focus to its row button', () => {
    setupHud()
    const offices = officesPanel()
    const toggle = within(offices).getByRole('button', { name: 'Theme for ZKidz: Corporate City' })
    fireEvent.click(toggle)
    fireEvent.keyDown(within(offices).getByRole('group', { name: 'Theme for ZKidz' }), {
      key: 'Escape'
    })
    expect(within(offices).queryByRole('group', { name: 'Theme for ZKidz' })).toBeNull()
    expect(toggle).toHaveFocus()
  })

  it('cycles the focused office with T and says which office changed', () => {
    setupHud()
    fireEvent.click(within(officesPanel()).getByRole('button', { name: /^PropApp, 1 agent/ }))
    fireEvent.keyDown(window, { key: 't' })
    expect(officeThemes.getAssignments().projects).toEqual({ p_pa: 'neo-edo-steam' })
    expect(
      screen.getByText('PropApp office is now Neo Edo Steam. Other offices keep their themes.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Map theme: Corporate City/ })).toBeInTheDocument()
    expect(localStorage.getItem('claudewatch.office.theme')).toBeNull()
  })

  it('says a row choice changed one office only', () => {
    setupHud()
    const offices = officesPanel()
    fireEvent.click(
      within(offices).getByRole('button', { name: 'Theme for ClaudeWatch: Corporate City' })
    )
    fireEvent.click(within(offices).getByRole('radio', { name: 'Violet Court' }))
    expect(
      screen.getByText('ClaudeWatch office is now Violet Court. Other offices keep their themes.')
    ).toBeInTheDocument()
  })

  it('names the character an agent plays where the theme has a cast', () => {
    setupHud()
    act(() => officeThemes.setCompanyTheme('c_zk', 'violet-court'))
    const inspector = selectAgent('office renderer')
    expect(within(inspector).getByText('Sable Rooke')).toBeInTheDocument()
    expect(within(inspector).getByText(/Ace of the Order/)).toBeInTheDocument()
  })
})
