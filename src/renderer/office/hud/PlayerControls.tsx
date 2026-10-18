import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { useEffect } from 'react'
import type { AgentView } from '../../../shared/office/types'
import type { Player } from '../player/walking'
import { BAR_BUTTON_CLASS } from './hud-styles'

const DIRECTIONS = [
  { key: 'ArrowUp', label: 'Move player up', Icon: ArrowUp },
  { key: 'ArrowLeft', label: 'Move player left', Icon: ArrowLeft },
  { key: 'ArrowDown', label: 'Move player down', Icon: ArrowDown },
  { key: 'ArrowRight', label: 'Move player right', Icon: ArrowRight }
] as const

// dry-new: camera arrow controls pan; these controls move the owner's existing local player.
export function PlayerControls({
  player,
  nearAgent,
  onInspect
}: {
  player: Player | null
  nearAgent?: Pick<AgentView, 'agentKey' | 'label'>
  onInspect: (agentKey: string) => void
}) {
  useEffect(() => {
    const release = (): void => {
      player?.held.clear()
    }
    window.addEventListener('blur', release)
    return () => {
      release()
      window.removeEventListener('blur', release)
    }
  }, [player])
  const start = (key: string): void => {
    player?.held.add(key)
    player?.onGoal?.()
  }
  const stop = (key: string): void => {
    player?.held.delete(key)
  }
  return (
    <div
      role="group"
      aria-label="Player movement"
      className="flex flex-wrap items-center gap-1 px-1 py-1"
    >
      <span className="mr-1 text-xs text-text-secondary">Hold to move</span>
      {DIRECTIONS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          title={label}
          disabled={!player}
          className={`${BAR_BUTTON_CLASS} h-9 min-w-9 touch-none`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId)
            start(key)
          }}
          onPointerUp={() => stop(key)}
          onPointerCancel={() => stop(key)}
          onLostPointerCapture={() => stop(key)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              start(key)
            }
          }}
          onKeyUp={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              stop(key)
            }
          }}
          onBlur={() => stop(key)}
        >
          <Icon aria-hidden="true" className="size-4" />
        </button>
      ))}
      <button
        type="button"
        className={BAR_BUTTON_CLASS}
        disabled={!nearAgent}
        onClick={() => {
          if (nearAgent) onInspect(nearAgent.agentKey)
        }}
      >
        Inspect nearby agent
      </button>
      <span className="text-xs text-text-secondary">
        {nearAgent ? nearAgent.label : 'Move closer to a worker'}
      </span>
    </div>
  )
}
