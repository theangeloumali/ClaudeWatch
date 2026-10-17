import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  DEFAULT_OFFICE_SETTINGS,
  OFFICE_SETTINGS_STORAGE_KEY,
  officeSettings
} from '../logic/office-settings'
import { chooseQuality, pinQuality, readQuality } from '../quality-store'
import { OfficeSettingsPanel } from './OfficeSettings'

const SWITCHES = [
  'Town buildings',
  'Citizens',
  'Vehicles',
  'Ambient motion',
  'Game corner',
  'Your character'
]

beforeEach(() => {
  localStorage.clear()
  officeSettings.reset()
  pinQuality('auto')
  chooseQuality('full')
})

function open() {
  const onClose = vi.fn()
  render(<OfficeSettingsPanel id="settings" onClose={onClose} />)
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Office settings' }) }
}

const feature = (name: string): HTMLElement => screen.getByRole('switch', { name })

it('offers one switch per feature, all on to begin with, then Hide names, off', () => {
  open()
  expect(screen.getAllByRole('switch').map((item) => item.getAttribute('aria-label'))).toEqual([
    ...SWITCHES,
    'Hide names'
  ])
  for (const name of SWITCHES) expect(feature(name)).toHaveAttribute('aria-checked', 'true')
  expect(feature('Hide names')).toHaveAttribute('aria-checked', 'false')
})

it('says in a line what each feature is', () => {
  const { dialog } = open()
  for (const name of SWITCHES) {
    const description = within(dialog).getByText(name).nextElementSibling
    expect(description?.textContent?.length).toBeGreaterThan(20)
  }
  expect(within(dialog).getByText(/tram, a freight cart and a runabout/)).toBeInTheDocument()
})

it('keeps idle agents in the game corner under the setting a saved Off still turns off', () => {
  const { dialog } = open()
  expect(within(dialog).getByText('Game corner').nextElementSibling).toHaveTextContent(
    'Idle agents walk to their office’s game corner and play. Off keeps them at their desks.'
  )
  fireEvent.click(feature('Game corner'))
  expect(officeSettings.get()).toEqual({ ...DEFAULT_OFFICE_SETTINGS, loungeTrips: false })
})

it('switches a feature off at once and remembers it', () => {
  open()
  fireEvent.click(feature('Citizens'))
  expect(feature('Citizens')).toHaveAttribute('aria-checked', 'false')
  expect(officeSettings.get()).toEqual({ ...DEFAULT_OFFICE_SETTINGS, citizens: false })
  expect(JSON.parse(localStorage.getItem(OFFICE_SETTINGS_STORAGE_KEY) ?? 'null')).toMatchObject({
    citizens: false
  })
  fireEvent.click(feature('Citizens'))
  expect(officeSettings.get().citizens).toBe(true)
})

it('offers three town sizes above the detail level, each saying what it changes', () => {
  const { dialog } = open()
  const group = screen.getByRole('radiogroup', { name: 'Town size' })
  const sizes = within(group).getAllByRole('radio')
  expect(sizes.map((size) => size.getAttribute('value'))).toEqual(['village', 'town', 'city'])
  expect(within(group).getByRole('radio', { name: 'Village' })).toHaveAccessibleDescription(
    'The same streets with a third of the lots built; the rest are gardens. Lightest.'
  )
  expect(within(group).getByRole('radio', { name: 'City' })).toHaveAccessibleDescription(
    'Every lot built, and the busiest streets. The most to draw.'
  )
  for (const size of sizes) expect(size).toHaveAccessibleDescription(/\w{20,}|.{40,}/)
  expect(within(group).getByRole('radio', { name: 'City' })).toBeChecked()
  const detail = within(dialog).getByRole('group', { name: 'Detail level' })
  expect(group.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('changes the town size at once and remembers it', () => {
  open()
  fireEvent.click(screen.getByRole('radio', { name: 'Village' }))
  expect(screen.getByRole('radio', { name: 'Village' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'City' })).not.toBeChecked()
  expect(officeSettings.get().townSize).toBe('village')
  expect(JSON.parse(localStorage.getItem(OFFICE_SETTINGS_STORAGE_KEY) ?? 'null')).toMatchObject({
    townSize: 'village'
  })
  fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))
  expect(screen.getByRole('radio', { name: 'City' })).toBeChecked()
})

it('holds the detail level control, with the level in use marked', () => {
  open()
  const group = screen.getByRole('group', { name: 'Detail level' })
  const levels = within(group).getAllByRole('button')
  expect(levels.map((level) => level.textContent)).toEqual(['Auto', 'Full', 'Balanced', 'Light'])
  expect(within(group).getByRole('button', { name: 'Auto' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  fireEvent.click(within(group).getByRole('button', { name: 'Light' }))
  expect(readQuality().pin).toBe('light')
  expect(within(group).getByRole('button', { name: 'Light' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(localStorage.getItem('claudewatch.office.quality')).toBe('light')
})

it('restores every switch and the detail level to their defaults', () => {
  open()
  for (const name of SWITCHES) fireEvent.click(feature(name))
  fireEvent.click(screen.getByRole('button', { name: 'Light' }))
  expect(readQuality().pin).toBe('light')
  expect(Object.values(officeSettings.get())).not.toContain(true)

  fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))
  expect(officeSettings.get()).toEqual(DEFAULT_OFFICE_SETTINGS)
  expect(readQuality().pin).toBe('auto')
  for (const name of SWITCHES) expect(feature(name)).toHaveAttribute('aria-checked', 'true')
})

it('can be worked from the keyboard: focus lands on the title and every control is a tab stop', () => {
  const { dialog } = open()
  expect(screen.getByRole('heading', { name: 'Office settings' })).toHaveFocus()
  const controls = within(dialog).getAllByRole('button')
  const switches = within(dialog).getAllByRole('switch')
  // Seven switches, four levels, restore and close: native buttons, so Tab, Space and Enter work.
  expect(controls.length + switches.length).toBe(13)
  // The sizes are native radios: one tab stop, arrow keys between them.
  const sizes = within(dialog).getAllByRole('radio')
  expect(sizes).toHaveLength(3)
  for (const size of sizes) expect(size).toHaveAttribute('name', sizes[0].getAttribute('name'))
  for (const control of [...controls, ...switches]) {
    expect(control.tagName).toBe('BUTTON')
    expect(control).not.toHaveAttribute('tabindex', '-1')
    expect(control).not.toBeDisabled()
  }
})

it('closes on Escape from anywhere inside, and from its close button', () => {
  const { onClose } = open()
  fireEvent.keyDown(feature('Game corner'), { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
  expect(onClose).toHaveBeenCalledTimes(2)
})

it('does not offer ineffective campus-size controls for a distributed city or rewrite its saved choice', () => {
  officeSettings.setTownSize('village')
  const before = localStorage.getItem(OFFICE_SETTINGS_STORAGE_KEY)
  render(<OfficeSettingsPanel id="city-settings" onClose={vi.fn()} isDistributedCity />)
  expect(screen.queryByRole('radiogroup', { name: 'Town size' })).not.toBeInTheDocument()
  expect(screen.getByText(/Street blocks follow your saved offices/)).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Detail level' })).toBeInTheDocument()
  expect(localStorage.getItem(OFFICE_SETTINGS_STORAGE_KEY)).toBe(before)
  expect(officeSettings.get().townSize).toBe('village')
})

it('follows a change made on another page while it is open', () => {
  open()
  localStorage.setItem(
    OFFICE_SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...DEFAULT_OFFICE_SETTINGS, town: false })
  )
  fireEvent(window, new StorageEvent('storage', { key: OFFICE_SETTINGS_STORAGE_KEY }))
  expect(feature('Town buildings')).toHaveAttribute('aria-checked', 'false')
})
