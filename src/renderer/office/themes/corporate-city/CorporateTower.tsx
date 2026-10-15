import { Parts, type PartSpec } from '../parts'
import type { TowerProps } from '../types'
import { CORPORATE_MATERIALS } from './palette'
import { headquarters } from './town-buildings'

// dry-new: shared normalized headquarters massing replaces the legacy stacked landmark roofs.
export function buildCorporateTower({ floors, plot }: TowerProps): PartSpec[] {
  // Floors tune only the silhouette; the landmark contains no navigable office floors.
  const height = 10 + Math.min(floors.length, 6) * 0.35
  return headquarters({
    width: Math.min(5, plot?.width ?? 5),
    depth: Math.min(5, plot?.depth ?? 5),
    height: Math.min(height, plot?.maxHeight ?? height),
    seed: 41,
    accent: CORPORATE_MATERIALS.civic
  })
}

export function CorporateTower(props: TowerProps) {
  return <Parts parts={buildCorporateTower(props)} />
}
