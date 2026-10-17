import type { AgentActivity } from '../../../shared/office/types'
export function sensorOpening(activity: AgentActivity): number {
  return activity === 'thinking' ||
    activity === 'reading' ||
    activity === 'searching' ||
    activity === 'delegating'
    ? -0.8
    : 0
}
