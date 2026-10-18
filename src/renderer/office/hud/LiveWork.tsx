import type { CSSProperties } from 'react'
import { parseAgentKey } from '../../../shared/office/agent-key'
import { observeAgent } from '../../../shared/office/observation'
import { PLATE_TITLE_CLASS } from '../../components/deck/deck-styles'
import { useOfficeNow } from '../use-office-now'
import { formatElapsedTime } from '../../lib/utils'
import { reachBlocker, reachTarget } from '../logic/interactions'
import { useOfficeSettings } from '../logic/office-settings'
import { PROVIDER_LABEL } from '../office-palette'
import type { OfficeFeed, OfficeFrame } from '../scene-model'
import { Fact } from './Fact'

export interface LiveWorkProps {
  frame: OfficeFrame
  agentKey: string
  feed: OfficeFeed
  style?: CSSProperties
  presentation?: 'panel' | 'strip'
}

// dry-new: Inspector's legacy facts do not distinguish own observations from world motion.
export function LiveWork({ frame, agentKey, feed, style, presentation = 'panel' }: LiveWorkProps) {
  const nowMs = useOfficeNow()
  // Keys and ids can carry names (a teammate's id is `name@team`), so Hide names hides them too.
  const { hideNames } = useOfficeSettings()
  const resolved = parseAgentKey(agentKey, frame.sessions)
  const session = resolved?.session
  const member = resolved?.member
  const evidence = observeAgent({ ...frame, agentKey, nowMs })
  const source =
    evidence.observation?.coverage === 'own'
      ? frame.sources.find((candidate) => candidate.id === evidence.observation?.sourceId)
      : undefined
  const startedAtMs = member ? member.startedAtMs : session?.startedAtMs
  const elapsed =
    startedAtMs === undefined ||
    !Number.isFinite(startedAtMs) ||
    startedAtMs < 0 ||
    startedAtMs > nowMs
      ? 'Unknown'
      : formatElapsedTime(Math.floor((nowMs - startedAtMs) / 1000))
  const target = session ? reachTarget(session, member) : undefined
  const worldAgent = frame.agents.find((candidate) => candidate.agentKey === agentKey)
  const statusLabel = evidence.status[0].toUpperCase() + evidence.status.slice(1)

  if (presentation === 'strip') {
    const workerLabel = member?.name ?? member?.type ?? session?.name ?? 'Worker unavailable'
    const qualification =
      evidence.status === 'fresh'
        ? 'Own report'
        : evidence.status === 'unknown'
          ? 'Own activity freshness unknown'
          : evidence.status === 'disconnected'
            ? 'Disconnected · last known only'
            : 'Last known · not live confirmation'
    return (
      <section aria-label="Live work" style={style} className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-baseline gap-2 text-body">
          <strong
            className="min-w-0 flex-1 truncate text-text-primary"
            title={hideNames ? workerLabel : `${workerLabel} · ${agentKey}`}
          >
            {workerLabel}
          </strong>
          <span className="shrink-0 font-semibold text-text-primary">{statusLabel}</span>
          <span className="hidden min-w-0 truncate text-xs text-text-secondary md:block">
            {session ? PROVIDER_LABEL[session.provider] : 'Unknown provider'} ·{' '}
            {evidence.observation?.coverage === 'own'
              ? evidence.observation.sourceId
              : 'Own source unavailable'}
          </span>
        </div>
        <p
          className="line-clamp-1 break-all text-xs text-text-secondary"
          title={`${qualification} · Activity: ${evidence.activity ?? 'Unknown'} · Attention: ${evidence.attention ?? 'Unknown'} · Tool: ${evidence.currentTool?.name ?? 'Unknown'} · Observed: ${timestamp(evidence.observation?.observedAtMs)}`}
        >
          <span className="font-semibold">{qualification}.</span> Reported activity:{' '}
          {evidence.activity ?? 'Unknown'} · Attention: {evidence.attention ?? 'Unknown'} · Tool:{' '}
          {evidence.currentTool?.name ?? 'Unknown'}
        </p>
        <span className="sr-only">
          Own source:{' '}
          {evidence.observation?.coverage === 'own' ? evidence.observation.sourceId : 'Unknown'}.
          Observed: {timestamp(evidence.observation?.observedAtMs)}.
          {feed.isViewOnly ? ' Read-only mode; captures and provider actions are unavailable.' : ''}
        </span>
      </section>
    )
  }

  return (
    <section aria-label="Live work" style={style} className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={PLATE_TITLE_CLASS}>Live work</h3>
        <span className="text-body font-semibold text-text-primary">{statusLabel}</span>
      </div>
      {evidence.status !== 'fresh' && (
        <p className="text-xs text-text-secondary">
          {evidence.status === 'unknown'
            ? 'Own activity freshness is unknown.'
            : 'Reported values are last known, not live confirmation.'}
        </p>
      )}
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 [&_dd>span]:overflow-visible [&_dd>span]:whitespace-normal [&_dd>span]:break-all [&_dd>span]:text-clip">
        <Fact term="Reported activity" value={evidence.activity ?? 'Unknown'} />
        <Fact term="Reported attention" value={evidence.attention ?? 'Unknown'} />
        <Fact term="Tool" value={evidence.currentTool?.name ?? 'Unknown'} />
        <Fact term="Provider" value={session ? PROVIDER_LABEL[session.provider] : 'Unknown'} />
        <Fact
          term="Source"
          value={
            evidence.observation?.coverage === 'own' ? evidence.observation.sourceId : 'Unknown'
          }
        />
        <Fact
          term="Coverage"
          value={evidence.observation?.coverage === 'own' ? 'Own record' : 'Unknown'}
        />
        <Fact term="Session ID" value={hideNames ? 'Hidden' : (session?.sessionId ?? 'Unknown')} />
        <Fact term="Agent key" value={hideNames ? 'Hidden' : agentKey} />
        <Fact
          term={member && !member.cwd ? 'Working directory (lead fallback)' : 'Working directory'}
          value={member?.cwd ?? session?.cwd ?? 'Unknown'}
        />
        <Fact term="Elapsed" value={elapsed} />
        <Fact
          term="Reported updated"
          value={timestamp(member ? undefined : session?.updatedAtMs)}
        />
        <Fact term="Observed" value={timestamp(evidence.observation?.observedAtMs)} />
        <Fact term="Source checked" value={timestamp(source?.checkedAtMs)} />
        <Fact term="Feed received" value={timestamp(frame.feedReceivedAtMs)} />
        <Fact
          term="Terminal target"
          value={
            target
              ? `${target.name}${hideNames ? '' : ` — ${target.key}`}${member && target.isLead ? ' (lead terminal)' : ''}`
              : 'Unknown'
          }
        />
        <Fact
          term="World placement"
          value={
            worldAgent
              ? `${worldAgent.place === 'lounge' ? 'Game corner' : 'Assigned office'} — ${worldAgent.floorId} (visual placement only)`
              : 'Unknown'
          }
        />
      </dl>
      <p className="text-xs text-text-secondary">
        Reported activity describes the provider report, not what code executes.
        {feed.isViewOnly
          ? ' Captures and provider actions are unavailable in read-only mode.'
          : target && reachBlocker(target)
            ? ' No verified Orca pane is available for capture; Focus terminal may only open the app or working folder.'
            : ''}
      </p>
    </section>
  )
}

function timestamp(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 'Unknown'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : 'Unknown'
}
