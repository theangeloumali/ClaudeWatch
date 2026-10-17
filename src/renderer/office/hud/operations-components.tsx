import { cn } from '../../lib/utils'
import { useOfficeSettings } from '../logic/office-settings'
import type { OperationsWorker } from '../logic/operations-model'
import { PROVIDER_LABEL } from '../office-palette'
import { ROW_CLASS } from './hud-styles'

// dry-new: OfficeRow selects projects; this shared row selects a supplied real worker.
export function OperationsWorkerRow({
  worker,
  onChooseWorker
}: {
  worker: OperationsWorker
  onChooseWorker: (agentKey: string) => void
}) {
  // A key can carry names (a teammate's id is `name@team`): Hide names keeps it off the tooltip.
  const { hideNames } = useOfficeSettings()
  const facts = [worker.label, worker.projectLabel, ...(hideNames ? [] : [worker.key])]
  return (
    <button
      type="button"
      onClick={() => onChooseWorker(worker.key)}
      className={cn(ROW_CLASS, 'w-full py-1.5 text-body text-text-primary')}
      style={{ minHeight: 44 }}
      title={facts.join(' · ')}
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words font-semibold [overflow-wrap:anywhere]">
          {worker.label}
        </span>
        <span className="block break-words text-xs text-text-secondary [overflow-wrap:anywhere]">
          {worker.detail}
        </span>
        <span className="block truncate text-caption text-text-secondary">
          {PROVIDER_LABEL[worker.provider]} · {worker.isSubagent ? 'Subagent' : 'Session'} ·{' '}
          {worker.isPresent ? 'Present' : 'Assigned, not present'}
        </span>
      </span>
    </button>
  )
}
