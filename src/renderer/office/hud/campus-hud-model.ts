import { parseAgentKey } from '../../../shared/office/agent-key'
import type { MinimapCampus } from '../logic/minimap-model'
import { bayForAgent } from '../logic/floor-model'
import { resolveTheme, type ThemeAssignments } from '../logic/office-themes'
import { themeCharacter } from '../themes/registry'
import { campusRoomColors } from '../logic/campus-colors'
import { campusGeometry, type CampusGeometry } from '../logic/campus-geometry'
import { runsOnChips, type ModelChip } from '../logic/model-names'
import { buildRoomCards } from '../logic/room-cards'
import type { CampusCards } from '../scene/RoomCards'
import type { OfficeFrame } from '../scene-model'

export interface CampusHud {
  minimap: MinimapCampus
  // Room chip colour by project key.
  chips: ReadonlyMap<string, string>
  runsOn: ModelChip[]
  cards: CampusCards
}

export interface CastNames {
  themeAssignments: ThemeAssignments
  floorThemeId: string
  // Hide names is on: cast names are real names too, so faces fall back to the masked label.
  isMasked: boolean
}

export function campusMinimap(
  { hub, spokes }: CampusGeometry,
  chips: ReadonlyMap<string, string>
): MinimapCampus {
  const colorByBuilding = new Map(
    spokes.flatMap(({ buildingId, projectKey }) => {
      const chip = projectKey && chips.get(projectKey)
      return chip ? [[buildingId, chip] as const] : []
    })
  )
  return { hub, spokes: spokes.map(({ from, to }) => ({ from, to })), colorByBuilding }
}

export function buildCampusHud(frame: OfficeFrame, cast: CastNames): CampusHud {
  const geometry = campusGeometry(frame.floors)
  const colors = campusRoomColors(geometry.spokes)
  const chips = new Map([...colors].map(([projectKey, color]) => [projectKey, color.chip]))
  return {
    minimap: campusMinimap(geometry, chips),
    chips,
    runsOn: runsOnChips(frame.sessions),
    cards: {
      rooms: buildRoomCards(frame, (agent) => {
        const session = parseAgentKey(agent.agentKey, frame.sessions)?.session
        if (cast.isMasked || !session) return null
        const themeId = resolveTheme(session, cast.themeAssignments, cast.floorThemeId)
        return themeCharacter(themeId, agent, bayForAgent(frame, agent))?.name ?? null
      }),
      colors,
      hub: geometry.hub,
      memory: frame.memory
    }
  }
}
