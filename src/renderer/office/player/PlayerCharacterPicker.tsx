import { useId } from 'react'
import { FIELD_CLASS } from '../hud/hud-styles'
import { Plate } from '../../components/deck/Plate'
import { cn } from '../../lib/utils'
import { isPlayerCharacterId, PLAYER_CHARACTERS, type PlayerCharacterId } from './character-choice'

export interface PlayerCharacterPickerProps {
  value: PlayerCharacterId
  onChange: (id: PlayerCharacterId) => void
}

// dry-new: existing theme controls choose a world, not an independent owner character.
export function PlayerCharacterPicker({ value, onChange }: PlayerCharacterPickerProps) {
  const id = useId()
  return (
    <Plate faceClassName="flex min-w-0 flex-col gap-2 p-3">
      <label htmlFor={id} className="text-body text-text-primary">
        Player character
      </label>
      <select
        id={id}
        name="player-character"
        autoComplete="off"
        aria-label="Player character"
        value={value}
        className={cn(
          FIELD_CLASS,
          'min-h-11 w-full min-w-0 cursor-pointer touch-manipulation hover:border-border-hover'
        )}
        onChange={(event) => {
          const next = event.currentTarget.value
          if (isPlayerCharacterId(next)) onChange(next)
        }}
      >
        {PLAYER_CHARACTERS.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
    </Plate>
  )
}
