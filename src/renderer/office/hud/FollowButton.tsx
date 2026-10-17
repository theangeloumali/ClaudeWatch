import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'
import { cn } from '../../lib/utils'

// Rides the camera along with the selected agent; pressed while it does.
export function FollowButton({
  isFollowing,
  onToggle
}: {
  isFollowing: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={isFollowing}
      onClick={onToggle}
      className={cn(
        BUTTON_QUIET_COMPACT_CLASS,
        'min-h-11 min-w-11 aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-brass'
      )}
    >
      Follow
    </button>
  )
}
