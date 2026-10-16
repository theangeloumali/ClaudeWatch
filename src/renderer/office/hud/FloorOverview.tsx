import { parseAgentKey } from '../../../shared/office/agent-key'
import {
  buildFloorActivitySummaries,
  type FloorActivitySummary
} from '../../../shared/office/floor-aggregates'
import { observeAgent } from '../../../shared/office/observation'
import { BUTTON_QUIET_COMPACT_CLASS, PLATE_TITLE_CLASS } from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import { useOfficeNow } from '../use-office-now'
import type { OfficeFrame } from '../scene-model'
import { ROW_CLASS } from './hud-styles'
import { cn } from '../../lib/utils'

export interface FloorOverviewProps {
  frame: OfficeFrame
  onFocusFloor: (floorId: string) => void
  onSelectAgent: (key: string) => void
  focusedFloorId?: string | null
}

// dry-new: the Offices tree groups projects, not persistent physical floors or own fresh reports.
export function FloorOverview({
  frame,
  onFocusFloor,
  onSelectAgent,
  focusedFloorId
}: FloorOverviewProps) {
  const nowMs = useOfficeNow()
  const summaries = buildFloorActivitySummaries({ ...frame, nowMs })
  const byFloorId = new Map(summaries.map((summary) => [summary.floorId, summary]))
  const floors = [...frame.floors].sort(compareFloors)
  return (
    <section aria-label="Floors at a glance" className="min-w-0">
      <Plate faceClassName="flex min-w-0 flex-col gap-2 p-3">
        <h2 className={PLATE_TITLE_CLASS}>Floors at a glance</h2>
        <div className="space-y-1 text-xs text-text-secondary">
          {frame.connected ? (
            <>
              <p>Most populated: {winner(summaries, 'presentAgentKeys')}</p>
              <p>Busiest: {winner(summaries, 'workingAgentKeys')}</p>
            </>
          ) : (
            <p>
              Disconnected — positions and assignments are last known; current activity is unknown.
            </p>
          )}
        </div>
        {floors.length === 0 && (
          <p className="text-xs text-text-secondary">
            Floor assignments are unknown until the first floor report.
          </p>
        )}
        <ul
          aria-label="Floor summaries"
          tabIndex={0}
          className="max-h-[32vh] min-w-0 space-y-2 overflow-auto overscroll-contain"
        >
          {floors.map((floor) => {
            const summary = byFloorId.get(floor.floorId)
            if (!summary) return null
            const lastKnownAttention = summary.assignedAgentKeys.filter((key) => {
              const evidence = observeAgent({ ...frame, agentKey: key, nowMs })
              return (
                evidence.status !== 'fresh' &&
                evidence.observation?.coverage === 'own' &&
                (evidence.attention === 'permission' ||
                  evidence.attention === 'question' ||
                  evidence.attention === 'error')
              )
            })
            const attentionKeys = [
              ...new Set([...summary.attentionAgentKeys, ...lastKnownAttention])
            ]
            return (
              <li key={floor.floorId} className="min-w-0 border-t border-border pt-1">
                <button
                  type="button"
                  className={cn(ROW_CLASS, 'w-full break-words font-semibold text-text-primary')}
                  aria-label={`Focus ${floor.label}`}
                  aria-current={focusedFloorId === floor.floorId ? 'true' : undefined}
                  onClick={() => onFocusFloor(floor.floorId)}
                >
                  {floor.label}
                </button>
                <p className="px-1.5 text-xs leading-relaxed text-text-secondary">
                  {summary.assignedAgentKeys.length} assigned · {summary.presentAgentKeys.length}{' '}
                  present{!frame.connected && ' (last known)'} ·{' '}
                  {frame.connected
                    ? `${summary.workingAgentKeys.length} fresh working`
                    : 'fresh working unknown'}{' '}
                  · {summary.attentionAgentKeys.length} attention
                  {lastKnownAttention.length > 0 &&
                    ` · ${lastKnownAttention.length} last-known attention`}{' '}
                  · {summary.unknownAgentKeys.length} unknown · {summary.staleAgentKeys.length}{' '}
                  stale
                </p>
                {(summary.unknownAgentKeys.length > 0 ||
                  summary.staleAgentKeys.length > 0 ||
                  !frame.connected) && (
                  <p className="px-1.5 text-xs text-text-secondary">
                    Unknown attention for unconfirmed records; zero confirmed is not an all-clear.
                  </p>
                )}
                {attentionKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-1.5 pt-1">
                    {attentionKeys.map((key) => {
                      const resolved = parseAgentKey(key, frame.sessions)
                      const label =
                        frame.agents.find((agent) => agent.agentKey === key)?.label ||
                        resolved?.member?.name ||
                        resolved?.member?.type ||
                        resolved?.session.name ||
                        key
                      return (
                        <button
                          type="button"
                          key={key}
                          className={BUTTON_QUIET_COMPACT_CLASS}
                          aria-label={`Inspect ${label} — ${key}`}
                          title={`${label} — ${key}`}
                          onClick={() => onSelectAgent(key)}
                        >
                          <span aria-hidden="true">{Array.from(label)[0]}</span>
                          <span className="max-w-36 truncate">{label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Plate>
    </section>
  )
}

function compareFloors(
  left: OfficeFrame['floors'][number] & { buildingId?: string; floorNumber?: number },
  right: OfficeFrame['floors'][number] & { buildingId?: string; floorNumber?: number }
): number {
  return (
    (left.buildingId ?? left.floorId).localeCompare(right.buildingId ?? right.floorId, undefined, {
      numeric: true
    }) ||
    (left.floorNumber ?? 0) - (right.floorNumber ?? 0) ||
    left.floorId.localeCompare(right.floorId, undefined, { numeric: true })
  )
}

function winner(
  summaries: readonly FloorActivitySummary[],
  field: 'presentAgentKeys' | 'workingAgentKeys'
): string {
  const highest = Math.max(0, ...summaries.map((summary) => summary[field].length))
  if (highest === 0)
    return field === 'presentAgentKeys'
      ? 'No reported physical presence'
      : 'No fresh working reports'
  const winners = summaries.filter((summary) => summary[field].length === highest)
  return `${winners.map((summary) => summary.label).join(', ')} (${winners.length > 1 ? 'tie, ' : ''}${highest} ${field === 'presentAgentKeys' ? 'present' : 'fresh working'})`
}
