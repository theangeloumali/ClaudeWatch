import { useMemo } from 'react'
import type { WorldVenue } from '../../../shared/office/world-document'
import type { OfficeTheme, ThemePalette } from '../themes/types'
import { FURNITURE_SCALE } from '../../../shared/office/figure-scale'
import { loungeAsDrawn } from './FloorView'
import { getTheme } from '../themes/registry'
import { BatchedScene } from './BatchedScene'
import { isStillClick, trackPress } from './ZonePickers'

export function VenueLayer({
  venues,
  palette,
  theme,
  areRoofsVisible = true,
  onSelect
}: {
  venues: readonly WorldVenue[]
  palette: ThemePalette
  theme?: OfficeTheme
  areRoofsVisible?: boolean
  onSelect?: (id: string) => void
}) {
  const revision = useMemo(
    () => JSON.stringify([venues, palette, theme?.id, areRoofsVisible]),
    [venues, palette, theme?.id, areRoofsVisible]
  )
  const Lounge = (theme ?? getTheme('corporate-city')).kit.zone.Lounge
  return (
    <BatchedScene revision={revision}>
      {venues.map((venue) => (
        <group
          key={venue.id}
          position={[venue.footprint.x, 0, venue.footprint.z]}
          onPointerDown={trackPress}
          onClick={(event) => {
            if (!isStillClick(event)) return
            event.stopPropagation()
            onSelect?.(venue.id)
          }}
        >
          <mesh
            position={[0, 0.08, 0]}
            scale={[venue.footprint.width, 0.16, venue.footprint.depth]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={palette.stone} />
          </mesh>
          {areRoofsVisible && (
            <mesh
              position={[0, 2.5, 2.8]}
              scale={[venue.footprint.width, 0.18, venue.footprint.depth / 2]}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color={palette.lacquer} />
            </mesh>
          )}
          {[-venue.footprint.width / 2 + 0.4, venue.footprint.width / 2 - 0.4].map((x) => (
            <mesh key={x} position={[x, 1.3, 3]} scale={[0.25, 2.5, 0.25]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color={palette.brass} />
            </mesh>
          ))}
          {venue.kind === 'lounge' && Lounge && (
            <group scale={FURNITURE_SCALE}>
              <Lounge
                lounge={loungeAsDrawn({
                  id: venue.id,
                  x: 0,
                  z: 0,
                  width: venue.footprint.width,
                  depth: venue.footprint.depth,
                  door: venue.entrance,
                  seats: venue.slots.map((slot) => ({ ...slot, slotId: slot.id }))
                })}
              />
            </group>
          )}
          {venue.slots
            .filter(() => venue.kind !== 'lounge')
            .map((slot) => (
              <group key={slot.id} position={[slot.x, 0.2, slot.z + 1.2]}>
                <mesh
                  position={[0, venue.kind === 'arcade' ? 0.7 : 0.35, 0]}
                  scale={
                    venue.kind === 'arcade'
                      ? [0.9, 1.4, 0.7]
                      : venue.kind === 'garage'
                        ? [1.3, 0.7, 2]
                        : [1.2, 0.7, 0.7]
                  }
                >
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={venue.kind === 'garage' ? palette.copper : palette.wood}
                  />
                </mesh>
                {venue.kind === 'arcade' && (
                  <mesh position={[0, 1.15, -0.36]} scale={[0.65, 0.4, 0.02]}>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshBasicMaterial color={palette.glow} toneMapped={false} />
                  </mesh>
                )}
                {areRoofsVisible && venue.kind === 'market' && (
                  <mesh position={[0, 1.7, 0]} scale={[1.8, 0.18, 1.2]}>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial color={palette.paper} />
                  </mesh>
                )}
              </group>
            ))}
        </group>
      ))}
    </BatchedScene>
  )
}
