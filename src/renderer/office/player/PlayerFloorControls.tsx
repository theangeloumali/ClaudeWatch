import type { FloorGeometry } from '../scene-model'
import { travelPlayerToFloor } from './player-floor-routes'
import type { Player } from './walking'

// dry-new: floor focus changes the camera; these explicit actions move the owner's body.
export function PlayerFloorControls({
  player,
  floors
}: {
  player: Player
  floors: readonly FloorGeometry[]
}) {
  return (
    <fieldset
      aria-label="Travel to a floor"
      className="flex max-h-28 flex-wrap items-center gap-2 overflow-auto"
    >
      <legend className="sr-only">Travel to a floor</legend>
      {floors.map((floor) => (
        <button
          key={floor.floorId}
          type="button"
          className="rounded-md bg-surface px-2 py-1 text-xs text-paper focus-visible:outline focus-visible:outline-2"
          onClick={() => travelPlayerToFloor(player, floor, floors)}
        >
          Go to {floor.label}
        </button>
      ))}
    </fieldset>
  )
}
