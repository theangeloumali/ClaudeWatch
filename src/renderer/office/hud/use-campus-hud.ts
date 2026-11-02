import { useEffect, useMemo, useState } from 'react'
import type { ThemeAssignments } from '../logic/office-themes'
import type { OfficeFrame } from '../scene-model'
import type { buildCampusHud, CampusHud } from './campus-hud-model'

// Everything the Campus HUD draws, once per frame while Campus is shown. The builder loads on
// first use so the Office bundle stays inside its size budget.
export function useCampusHud(
  frame: OfficeFrame | null,
  isCampus: boolean,
  themeAssignments: ThemeAssignments,
  floorThemeId: string,
  isMasked: boolean
): CampusHud | null {
  const [build, setBuild] = useState<typeof buildCampusHud | null>(null)
  useEffect(() => {
    if (!isCampus || build) return
    let isCurrent = true
    void import('./campus-hud-model').then((module) => {
      if (isCurrent) setBuild(() => module.buildCampusHud)
    })
    return () => {
      isCurrent = false
    }
  }, [isCampus, build])
  return useMemo(() => {
    if (!isCampus || !frame || !build) return null
    return build(frame, { themeAssignments, floorThemeId, isMasked })
  }, [build, frame, isCampus, themeAssignments, floorThemeId, isMasked])
}
