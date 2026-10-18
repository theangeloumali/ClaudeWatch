import { Eye } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { PeekResult, TerminalProvenance } from '../../../shared/office/types'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'
import { useOfficeNow } from '../use-office-now'
import { cn } from '../../lib/utils'
import { failureMessage } from '../logic/interactions'
import { useOfficeSettings } from '../logic/office-settings'
import { ScreenExcerpt } from './ScreenExcerpt'
import { useRequest } from './use-request'

const FAILED: PeekResult = { success: false, lines: [] }
const CAPTURE_EXPIRES_AFTER_MS = 60_000
const MAX_CAPTURE_LINES = 80
const MAX_LINE_CHARS = 1000

export interface PeekPanelProps {
  agentKey: string
  peek: (sessionKey: string) => Promise<PeekResult>
  selectedAgentKey?: string
  paneKey?: string | null
  incarnationKey?: string
  terminal?: TerminalProvenance
  isViewOnly?: boolean
  disabledReason?: string
}

// A changed target remounts the request, dropping both saved and in-flight private output.
export function PeekPanel(props: PeekPanelProps) {
  const boundary = JSON.stringify([
    props.agentKey,
    props.selectedAgentKey,
    props.paneKey,
    props.incarnationKey,
    props.terminal,
    props.isViewOnly,
    props.disabledReason
  ])
  return <PeekLifetime key={boundary} {...props} />
}

function PeekLifetime(props: PeekPanelProps) {
  const [generation, setGeneration] = useState(0)
  const [hasExpired, setHasExpired] = useState(false)
  return (
    <PeekCapture
      key={generation}
      {...props}
      hasExpired={hasExpired}
      onExpire={() => {
        setHasExpired(true)
        setGeneration((current) => current + 1)
      }}
    />
  )
}

function PeekCapture({
  agentKey,
  peek,
  paneKey,
  terminal,
  isViewOnly,
  disabledReason,
  hasExpired,
  onExpire
}: PeekPanelProps & { hasExpired: boolean; onExpire: () => void }) {
  const [request, run] = useRequest(FAILED)
  const [receivedAtMs, setReceivedAtMs] = useState<number>()
  const nowMs = useOfficeNow()
  // Agent keys can carry names (a teammate's id is `name@team`); Hide names hides them too.
  const { hideNames } = useOfficeSettings()
  const result = request.status === 'done' ? request.result : null
  const capturedAtMs = validTimestamp(result?.capturedAtMs)
  const expiryBase =
    receivedAtMs === undefined ? capturedAtMs : Math.min(capturedAtMs ?? receivedAtMs, receivedAtMs)
  const isExpired =
    result?.success === true &&
    expiryBase !== undefined &&
    nowMs - expiryBase >= CAPTURE_EXPIRES_AFTER_MS
  const reason = isViewOnly ? 'Terminal capture is unavailable in view-only mode.' : disabledReason
  const reasonId = useId()
  const isMatching = result ? matchesTarget({ result, agentKey, paneKey, terminal }) : false
  const canDisplay = result?.success && isMatching && !isExpired && !reason
  useEffect(() => {
    if (isExpired) onExpire()
  }, [isExpired, onExpire])
  const load = async (): Promise<void> => {
    if (reason || request.status === 'pending') return
    await run(() => peek(agentKey))
    setReceivedAtMs(Date.now())
  }
  let statusMessage = ''
  if (request.status === 'pending') statusMessage = 'Reading the screen…'
  else if (result && !result.success) statusMessage = failureMessage(result.reason)
  else if (result?.success && !isMatching)
    statusMessage = 'Capture target could not be verified. Refresh to try again.'
  else if (hasExpired && request.status === 'idle')
    statusMessage = 'Capture expired; Peek again to read the screen.'

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button
        type="button"
        disabled={Boolean(reason) || request.status === 'pending'}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => void load()}
        className={cn(BUTTON_QUIET_COMPACT_CLASS, 'self-start')}
      >
        <Eye aria-hidden="true" className="size-3.5" />
        {reason ? 'Capture unavailable' : request.status === 'idle' ? 'Peek at screen' : 'Refresh'}
      </button>
      {reason && (
        <p id={reasonId} className="text-xs text-text-secondary">
          Reason: {reason}
        </p>
      )}
      {canDisplay && result && (
        <>
          <p className="break-all text-xs text-text-secondary">
            {capturedAtMs === undefined
              ? 'Capture time unavailable'
              : `Captured at ${new Date(capturedAtMs).toISOString()}`}
          </p>
          <p className="break-all text-xs text-text-secondary">
            Capture target{result.targetAgentKey ? '' : ' (requested)'}:{' '}
            {hideNames ? 'Hidden' : (result.targetAgentKey ?? agentKey)}
          </p>
          <p className="break-all text-xs text-text-secondary">
            {result.terminal
              ? `Terminal: ${hideNames ? 'Hidden' : result.terminal.ownerAgentKey} · pane ${result.terminal.paneKey} · PID ${result.terminal.pid} · incarnation ${result.terminal.incarnationId}`
              : 'Terminal provenance unavailable'}
          </p>
          {/* A terminal can print anything, a project path or a client's name included. */}
          {hideNames ? (
            <p className="text-xs text-text-secondary">
              Screen text is hidden while names are hidden.
            </p>
          ) : (
            <ScreenExcerpt
              lines={result.lines
                .slice(0, MAX_CAPTURE_LINES)
                .map((line) => line.slice(0, MAX_LINE_CHARS))}
            />
          )}
        </>
      )}
      <p aria-live="polite" className="text-xs text-text-secondary">
        {statusMessage}
      </p>
    </div>
  )
}

function validTimestamp(value: number | undefined): number | undefined {
  return value !== undefined && value >= 0 && Number.isFinite(new Date(value).getTime())
    ? value
    : undefined
}

function matchesTarget({
  result,
  agentKey,
  paneKey,
  terminal
}: Pick<PeekPanelProps, 'agentKey' | 'paneKey' | 'terminal'> & { result: PeekResult }): boolean {
  if (result.targetAgentKey !== undefined && result.targetAgentKey !== agentKey) return false
  if (!result.terminal) return terminal === undefined
  if (result.terminal.ownerAgentKey !== agentKey) return false
  if (paneKey !== undefined && result.terminal.paneKey !== paneKey) return false
  return (
    !terminal ||
    (result.terminal.ownerAgentKey === terminal.ownerAgentKey &&
      result.terminal.paneKey === terminal.paneKey &&
      result.terminal.pid === terminal.pid &&
      result.terminal.startedAtMs === terminal.startedAtMs &&
      result.terminal.incarnationId === terminal.incarnationId)
  )
}
