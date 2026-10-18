import { inspectorOwnsKeyboard, isInsideScroller, keyInputFrom, WALK_KEYS } from '../logic/hotkeys'
import { walkKey, type Player } from './walking'

interface WalkKeyOptions {
  player: Player
  // The key that speaks to the agent beside the player.
  onTalk: () => void
  // A walking key went down: the scene needs a frame to start moving.
  onChange: () => void
}

// The keyboard while walking is on. Keys typed into a field, or pressed with focus in a panel
// that scrolls, are left to that field or panel.
export function listenForWalkKeys({ player, onTalk, onChange }: WalkKeyOptions): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const input = keyInputFrom(event)
    if (
      input.hasModifier ||
      input.isTargetEditable ||
      isInsideScroller(event.target) ||
      inspectorOwnsKeyboard(event)
    )
      return
    if (event.key.toUpperCase() === WALK_KEYS.talk) {
      event.preventDefault()
      return onTalk()
    }
    const key = walkKey(event.key)
    if (!key) return
    // An arrow key would also scroll the page.
    event.preventDefault()
    player.held.add(key)
    onChange()
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    const key = walkKey(event.key)
    if (key) player.held.delete(key)
  }
  // A key released while another window has focus never reports its keyup.
  const release = (): void => player.held.clear()
  const onFocus = (event: FocusEvent): void => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (
      target?.closest('input, textarea, select, [contenteditable="true"]') ||
      isInsideScroller(event.target) ||
      inspectorOwnsKeyboard(event)
    )
      release()
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', release)
  window.addEventListener('focusin', onFocus)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', release)
    window.removeEventListener('focusin', onFocus)
    release()
  }
}
