import type { WorldBuilding } from '../../../shared/office/world-document'
import { FIELD_CLASS } from '../hud/hud-styles'
import { listThemes } from '../themes/registry'
import { NumberField } from './WorldRoomFields'

export function WorldBuildingFields({
  building,
  onChange
}: {
  building: WorldBuilding
  onChange: (building: WorldBuilding) => void
}) {
  const footprint = building.footprint
  const resize = (changes: Partial<typeof footprint>) =>
    onChange({
      ...building,
      footprint: { ...footprint, ...changes },
      entrance:
        changes.depth === undefined
          ? building.entrance
          : {
              ...building.entrance,
              z: (Math.sign(building.entrance.z || -1) * changes.depth) / 2
            }
    })
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 font-semibold">Building settings</legend>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        Building name
        <input
          className={FIELD_CLASS}
          value={building.displayName}
          maxLength={120}
          onChange={(event) => onChange({ ...building, displayName: event.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Building X" number={footprint.x} onChange={(x) => resize({ x })} />
        <NumberField label="Building Z" number={footprint.z} onChange={(z) => resize({ z })} />
        <NumberField
          label="Building width"
          number={footprint.width}
          onChange={(width) => resize({ width })}
        />
        <NumberField
          label="Building depth"
          number={footprint.depth}
          onChange={(depth) => resize({ depth })}
        />
        <p className="text-xs text-text-secondary">
          {building.floors === 1
            ? 'One usable ground floor'
            : `${building.floors} saved floors. Rebuild city layout to consolidate them.`}
        </p>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Building theme
          <select
            className={FIELD_CLASS}
            value={building.themeId ?? ''}
            onChange={(event) =>
              onChange({ ...building, themeId: event.target.value || undefined })
            }
          >
            <option value="">Follow office</option>
            {listThemes().map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        {building.connector && (
          <>
            <NumberField
              label="Lift X"
              number={building.connector.x}
              onChange={(x) => onChange({ ...building, connector: { ...building.connector!, x } })}
            />
            <NumberField
              label="Lift Z"
              number={building.connector.z}
              onChange={(z) => onChange({ ...building, connector: { ...building.connector!, z } })}
            />
          </>
        )}
      </div>
    </fieldset>
  )
}
