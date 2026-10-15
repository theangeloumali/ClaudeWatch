import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import type { FocusResult } from '../../shared/office/types'
import { newAttentionItems, type AttentionItem } from './logic/attention-queue'
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

// One polite, atomic message per change so screen readers hear "Needs permission: PropApp › auth", not a bare count.
export function useAttentionAnnouncement(queue: readonly AttentionItem[]): string {
  const previousRef = useRef<readonly AttentionItem[]>([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    const added = newAttentionItems(previousRef.current, queue)
    previousRef.current = queue
    if (added.length === 0) return
    setMessage(
      added
        .map(
          (item) => `${GEM_SPECS[item.attention].label}: ${item.projectLabel} › ${item.sessionName}`
        )
        .join('. ')
    )
  }, [queue])
  return message
}
