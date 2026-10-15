import { BandedWalls, type WallBand } from '../BandedWalls'
import type { WallsProps } from '../types'
import { CORPORATE_MATERIALS as materials } from './palette'

// dry-new: low mineral partitions keep seated workers visible without transparent materials.
export const CORPORATE_PARTITION_HEIGHT = 0.72
const SKIRT_HEIGHT = 0.06
const CAP_HEIGHT = 0.035
const partitionHeight = (height: number) => Math.min(height, CORPORATE_PARTITION_HEIGHT)

export const CORPORATE_WALL_BANDS: readonly WallBand[] = [
  {
    name: 'corporate-skirt',
    color: materials.frame,
    thickness: 0.12,
    span: () => ({ y: SKIRT_HEIGHT / 2, scaleY: SKIRT_HEIGHT })
  },
  {
    name: 'corporate-panel',
    color: materials.facade,
    thickness: 0.095,
    span: (height) => {
      const scaleY = partitionHeight(height) - SKIRT_HEIGHT - CAP_HEIGHT
      return { y: SKIRT_HEIGHT + scaleY / 2, scaleY }
    }
  },
  {
    name: 'corporate-cap',
    color: materials.frame,
    thickness: 0.13,
    span: (height) => ({ y: partitionHeight(height) - CAP_HEIGHT / 2, scaleY: CAP_HEIGHT })
  }
]

export function CorporateWalls(props: WallsProps) {
  return <BandedWalls {...props} bands={CORPORATE_WALL_BANDS} />
}
