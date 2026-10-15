import type { RoomGeometry } from '../scene-model'
import { listThemes } from '../themes/registry'
import { FIELD_CLASS } from '../hud/hud-styles'

export function NumberField({
  label,
  number,
  onChange
}: {
  label: string
  number: number
  onChange: (number: number) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">
      {label}
      <input
        type="number"
        step="0.25"
        value={Number.isFinite(number) ? number : ''}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className={FIELD_CLASS}
      />
    </label>
  )
}

export function WorldRoomFields({
  room,
  onChange
}: {
  room: RoomGeometry
  onChange: (changes: Partial<RoomGeometry>) => void
}) {
  const updateSeat = (slotId: string, changes: { x?: number; z?: number; heading?: number }) => {
    onChange({
      seats: room.seats.map((seat) => (seat.slotId === slotId ? { ...seat, ...changes } : seat))
    })
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        Room name
        <input
          value={room.label}
          maxLength={120}
          onChange={(event) => onChange({ label: event.target.value })}
          className={FIELD_CLASS}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Room X" number={room.x} onChange={(x) => onChange({ x })} />
        <NumberField label="Room Z" number={room.z} onChange={(z) => onChange({ z })} />
        <NumberField
          label="Room width"
          number={room.width}
          onChange={(width) => onChange({ width })}
        />
        <NumberField
          label="Room depth"
          number={room.depth}
          onChange={(depth) => onChange({ depth })}
        />
        <NumberField
          label="Entrance X"
          number={room.door.x}
          onChange={(x) => onChange({ door: { ...room.door, x } })}
        />
        <NumberField
          label="Entrance Z"
          number={room.door.z}
          onChange={(z) => onChange({ door: { ...room.door, z } })}
        />
      </div>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        Room theme
        <select
          className={FIELD_CLASS}
          value={room.themeId ?? ''}
          onChange={(event) => onChange({ themeId: event.target.value || undefined })}
        >
          <option value="">Follow office</option>
          {listThemes().map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Desk positions</legend>
        {room.seats.map((seat, index) => (
          <div key={seat.slotId} className="grid grid-cols-3 gap-2">
            <NumberField
              label={`Desk ${index + 1} X`}
              number={seat.x}
              onChange={(x) => updateSeat(seat.slotId, { x })}
            />
            <NumberField
              label={`Desk ${index + 1} Z`}
              number={seat.z}
              onChange={(z) => updateSeat(seat.slotId, { z })}
            />
            <NumberField
              label={`Desk ${index + 1} facing`}
              number={(seat.heading * 180) / Math.PI}
              onChange={(degrees) =>
                updateSeat(seat.slotId, { heading: (degrees * Math.PI) / 180 })
              }
            />
          </div>
        ))}
      </fieldset>
      <p className="text-xs text-text-secondary">
        Names and furniture are local. Session identity and reported work are never edited.
      </p>
    </div>
  )
}
