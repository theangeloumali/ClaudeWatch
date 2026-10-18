import type { WorkstationDisplay } from '../logic/workstation-displays'

export const AUTHORED_WORKER_LIMIT = 60
export function visibleWorkstationDisplays(
  displays: readonly WorkstationDisplay[],
  selectedAgentKey: string | null
) {
  if (displays.length <= AUTHORED_WORKER_LIMIT) return displays
  return displays.filter((display) => display.agentKey === selectedAgentKey)
}
