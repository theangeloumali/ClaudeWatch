interface CampusPanelInput {
  wasCampus: boolean
  isCampus: boolean
  arePanelsHidden: boolean
  wereHiddenBefore?: boolean
}

interface CampusPanelStep {
  shouldToggle: boolean
  wereHiddenBefore?: boolean
}

// Campus opens with the side panels hidden; leaving it puts back whatever was showing before.
export function campusPanelStep(input: CampusPanelInput): CampusPanelStep {
  const { wasCampus, isCampus, arePanelsHidden, wereHiddenBefore } = input
  if (!wasCampus && isCampus)
    return { shouldToggle: !arePanelsHidden, wereHiddenBefore: arePanelsHidden }
  if (wasCampus && !isCampus)
    return { shouldToggle: arePanelsHidden !== (wereHiddenBefore ?? false) }
  return { shouldToggle: false, wereHiddenBefore }
}
