import { describe, expect, it } from 'vitest'
import { campusPanelStep } from '../logic/campus-panel-default'

describe('campusPanelStep', () => {
  it('hides shown panels on entering Campus and remembers they were shown', () => {
    expect(campusPanelStep({ wasCampus: false, isCampus: true, arePanelsHidden: false })).toEqual({
      shouldToggle: true,
      wereHiddenBefore: false
    })
  })

  it('leaves already hidden panels alone on entering Campus', () => {
    expect(campusPanelStep({ wasCampus: false, isCampus: true, arePanelsHidden: true })).toEqual({
      shouldToggle: false,
      wereHiddenBefore: true
    })
  })

  it('restores the panels on leaving Campus, even after the toggle showed them', () => {
    const leave = (arePanelsHidden: boolean, wereHiddenBefore: boolean) =>
      campusPanelStep({ wasCampus: true, isCampus: false, arePanelsHidden, wereHiddenBefore })
    expect(leave(true, false).shouldToggle).toBe(true)
    expect(leave(false, false).shouldToggle).toBe(false)
    expect(leave(false, true).shouldToggle).toBe(true)
  })

  it('does nothing while staying in or out of Campus, so the toggle still works', () => {
    for (const isCampus of [true, false])
      expect(
        campusPanelStep({ wasCampus: isCampus, isCampus, arePanelsHidden: false }).shouldToggle
      ).toBe(false)
  })
})
