import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import type { BodyFootprint } from '../../../shared/office/body-footprints'
import type { SceneBodies } from './BodySpace'

export function BodyObstacleSync({
  bodies,
  onChange
}: {
  bodies: SceneBodies
  onChange?: (bodies: readonly BodyFootprint[]) => void
}) {
  useEffect(() => () => onChange?.([]), [onChange])
  useFrame(() => onChange?.(bodies.external()))
  return null
}
