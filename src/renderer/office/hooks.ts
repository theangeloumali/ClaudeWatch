import { useCallback, useEffect, useState } from 'react'

import { readStored, writeStored } from '../office-live/browser-storage'
import {
  countThemeChoices,
  everyOfficeNotice,
  officeThemes,
  resolveTheme,
  themeChangeNotice,
  useThemeAssignments,
  type ThemeTarget
} from './logic/office-themes'
import type { ZoneGeometry } from './scene-model'
import { getTheme, listThemes, themeForTeam } from './themes/registry'
import type { OfficeTheme } from './themes/types'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const update = (): void => setIsReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isReduced
}

const THEME_STORAGE_KEY = 'claudewatch.office.theme'
const NOTICE_MS = 8000

function themeAfter(themeId: string): OfficeTheme {
  const themes = listThemes()
  return themes[(themes.findIndex((candidate) => candidate.id === themeId) + 1) % themes.length]
}

// A project target carries its company's key too, so the project key decides which it is.
function assignTheme(target: ThemeTarget, themeId: string | null): void {
  if (target.projectKey) {
    if (themeId) officeThemes.setProjectTheme(target.projectKey, themeId)
    else officeThemes.clearProjectTheme(target.projectKey)
  } else if (target.companyKey) {
    if (themeId) officeThemes.setCompanyTheme(target.companyKey, themeId)
    else officeThemes.clearCompanyTheme(target.companyKey)
  }
}

// `theme` is the floor's theme, which an office without a choice of its own follows. Every
// change, by any route, leaves a notice naming what changed.
export function useOfficeTheme(focusedZone?: ZoneGeometry) {
  const assignments = useThemeAssignments()
  const [hasChosenTheme, setHasChosenTheme] = useState(false)
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState(() => {
    const stored = readStored(THEME_STORAGE_KEY)
    return stored === null ? themeForTeam() : getTheme(stored)
  })
  useEffect(() => {
    if (!hasChosenTheme) return
    writeStored(THEME_STORAGE_KEY, theme.id)
  }, [theme.id, hasChosenTheme])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const chooseMapTheme = useCallback((themeId: string): void => {
    const chosenTheme = getTheme(themeId)
    setHasChosenTheme(true)
    setTheme(chosenTheme)
    setNotice(`Map theme is now ${chosenTheme.label}. Offices with their own theme keep it.`)
  }, [])

  // A null theme puts a company or project back to following its parent.
  const chooseTheme = useCallback(
    (target: ThemeTarget, themeId: string | null) => {
      if (target.projectKey || target.companyKey) {
        assignTheme(target, themeId)
        const resolved = resolveTheme(target, officeThemes.getAssignments(), theme.id)
        return setNotice(themeChangeNotice(target, getTheme(resolved).label, themeId === null))
      }
      if (!themeId) return
      const removedCount = countThemeChoices(officeThemes.getAssignments())
      officeThemes.clearAll()
      setHasChosenTheme(true)
      setTheme(getTheme(themeId))
      setNotice(everyOfficeNotice(getTheme(themeId).label, removedCount))
    },
    [theme.id]
  )

  const zoneThemeId = focusedZone ? resolveTheme(focusedZone, assignments, theme.id) : null
  // T changes the office the camera last flew to, and the floor default before any flight.
  const cycleTheme = useCallback(() => {
    if (focusedZone && zoneThemeId) return chooseTheme(focusedZone, themeAfter(zoneThemeId).id)
    chooseMapTheme(themeAfter(theme.id).id)
  }, [focusedZone, zoneThemeId, chooseTheme, chooseMapTheme, theme.id])
  const dismissNotice = useCallback(() => setNotice(''), [])

  return {
    theme,
    chooseTheme,
    chooseMapTheme,
    cycleTheme,
    cycleScope: focusedZone?.label ?? null,
    notice,
    dismissNotice
  }
}
