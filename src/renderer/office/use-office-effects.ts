import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import type { FocusResult, SessionRef } from '../../shared/office/types'
import { cityEvents, type CityEvent, type CityEventLog } from '../office-live/city-events'
import {
  cityEventNews,
  newAttentionItems,
  queueNews,
  type AttentionItem,
  type NewsItem
} from './logic/attention-queue'
import {
  commandForKey,
  inspectorOwnsKeyboard,
  keyInputFrom,
  type OfficeCommand
} from './logic/hotkeys'
import { focusMessage } from './logic/interactions'
import type { OfficeAction } from './logic/office-reducer'
import { GEM_SPECS } from './logic/status-gem'
import type { OfficeFeed } from './scene-model'

export function useFeedSubscription(feed: OfficeFeed, dispatch: Dispatch<OfficeAction>): void {
  useEffect(
    () => feed.subscribe((frame) => dispatch({ type: 'frame-received', frame })),
    [feed, dispatch]
  )
}

// Commands the reducer cannot carry out: they act outside the office state.
type OutsideCommand = Extract<
  OfficeCommand,
  { type: 'cycle-theme' | 'focus-terminal' | 'toggle-settings' }
>

function actionForCommand(command: Exclude<OfficeCommand, OutsideCommand>): OfficeAction {
  switch (command.type) {
    case 'walls':
      return { type: 'walls-set', mode: command.mode }
    case 'next-attention':
      return { type: 'next-attention' }
    case 'toggle-list':
      return { type: 'list-toggled' }
    case 'company-number':
      return { type: 'company-numbered', number: command.number }
    case 'rotate':
      return { type: 'camera-rotated', direction: command.direction }
    case 'tilt':
      return { type: 'camera-tilted', direction: command.direction }
    case 'zoom':
      return { type: 'camera-zoomed', direction: command.direction }
    case 'fly-to-selected':
      return { type: 'fly-to-selected' }
    case 'toggle-walk':
      return { type: 'walk-toggled' }
    default: {
      const unreachable: never = command
      return unreachable
    }
  }
}

export interface HotkeyHandlers {
  onCycleTheme: () => void
  onFocusTerminal: () => void
  onToggleSettings: () => void
}

export function useOfficeHotkeys(
  dispatch: Dispatch<OfficeAction>,
  isListForced: boolean,
  { onCycleTheme, onFocusTerminal, onToggleSettings }: HotkeyHandlers,
  isWalking = false,
  hasPlayer = true
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || inspectorOwnsKeyboard(event)) return
      const command = commandForKey(keyInputFrom(event), isWalking, hasPlayer)
      if (!command || (isListForced && command.type === 'toggle-list')) return
      event.preventDefault()
      if (command.type === 'cycle-theme') onCycleTheme()
      else if (command.type === 'focus-terminal') onFocusTerminal()
      else if (command.type === 'toggle-settings') onToggleSettings()
      else dispatch(actionForCommand(command))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    dispatch,
    isListForced,
    onCycleTheme,
    onFocusTerminal,
    onToggleSettings,
    isWalking,
    hasPlayer
  ])
}

const FOCUS_FAILED: FocusResult = { success: false }

// Brings an agent's terminal forward. `notice` says where that landed whenever it was not
// the agent's own pane; it stays until dismissed or the next request.
export function useFocusTerminal(feed: OfficeFeed) {
  const [notice, setNotice] = useState('')
  const focusTerminal = useCallback(
    (agentKey: string): void => {
      setNotice('')
      void feed
        .focus(agentKey)
        .catch(() => FOCUS_FAILED)
        .then((result) => setNotice(focusMessage(result)))
    },
    [feed]
  )
  const dismissNotice = useCallback(() => setNotice(''), [])
  return { notice, focusTerminal, dismissNotice }
}

interface Announcement {
  // The polite status for screen readers.
  announcement: string
  // The visible line: the latest worded city event or needs-you prompt.
  news: NewsItem | null
}

// What a line reports, kept in place of its words: names are looked up in the sessions on screen
// at each render, so a line shown before Hide names turned on never keeps a real name.
type NewsSource = { kind: 'event'; event: CityEvent } | { kind: 'prompt'; item: AttentionItem }

interface Said {
  spoken: readonly NewsSource[]
  latest: NewsSource | null
}

const UNSAID: Said = { spoken: [], latest: null }

// The prompt as the sessions on screen name it; null once its session has left them.
function promptNamed(item: AttentionItem, sessions: readonly SessionRef[]): AttentionItem | null {
  const session = sessions.find((candidate) => candidate.key === item.sessionKey)
  if (!session) return null
  const { projectLabel, companyLabel, name: sessionName } = session
  return { ...item, projectLabel, companyLabel, sessionName }
}

function newsOf(source: NewsSource, sessions: readonly SessionRef[]): NewsItem | null {
  if (source.kind === 'event') return cityEventNews(source.event, sessions)
  const item = promptNamed(source.item, sessions)
  return item && queueNews(item)
}

function spokenOf(source: NewsSource, sessions: readonly SessionRef[]): string | null {
  if (source.kind === 'event') return cityEventNews(source.event, sessions)?.text ?? null
  const item = promptNamed(source.item, sessions)
  return item && `${GEM_SPECS[item.attention].label}: ${item.projectLabel} › ${item.sessionName}`
}

// One polite, atomic message per change so screen readers hear "Needs permission: PropApp › auth", not a bare count.
// City events join it, and the latest becomes the visible line; the first frame is a baseline
// that makes no line, as a hello fires no event.
export function useAttentionAnnouncement(
  queue: readonly AttentionItem[],
  sessions: readonly SessionRef[] = [],
  events: Pick<CityEventLog, 'active' | 'version'> = cityEvents
): Announcement {
  const previousRef = useRef<readonly AttentionItem[] | null>(null)
  const wordedRef = useRef<ReadonlySet<string>>(new Set())
  const [said, setSaid] = useState(UNSAID)
  const firedCount = events.version()
  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = queue
    const added = newAttentionItems(previous ?? [], queue)
    const live = events.active()
    const fresh = live.filter((event) => !wordedRef.current.has(event.id))
    wordedRef.current = new Set(live.map((event) => event.id))
    const isBaseline = previous === null
    const worded = isBaseline
      ? []
      : fresh.filter((event) => cityEventNews(event, sessions) !== null)
    const spoken: NewsSource[] = [
      ...added.map((item) => ({ kind: 'prompt' as const, item })),
      ...worded.map((event) => ({ kind: 'event' as const, event }))
    ]
    if (spoken.length === 0) return
    setSaid((current) => ({
      spoken,
      latest: isBaseline ? current.latest : (spoken.at(-1) ?? null)
    }))
  }, [queue, sessions, events, firedCount])
  const announcement = useMemo(
    () => said.spoken.flatMap((source) => spokenOf(source, sessions) ?? []).join('. '),
    [said, sessions]
  )
  const line = useMemo(() => said.latest && newsOf(said.latest, sessions), [said, sessions])
  // A frame that words the line the same keeps the same object, so the memoised ticker stays put.
  const lineId = line?.id
  const lineText = line?.text
  const news = useMemo(
    () => (lineId !== undefined && lineText !== undefined ? { id: lineId, text: lineText } : null),
    [lineId, lineText]
  )
  return { announcement, news }
}
