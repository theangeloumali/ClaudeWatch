import { Fragment } from 'react'
import { Seal, SLIP_CLASS } from '../../components/deck/WorkOrderSlip'
import type { WorkOrder } from '../../deck/work-orders'
import { cn } from '../../lib/utils'
import type { ZoomBand } from '../logic/camera-bands'
import type { CardStatus, NameCard, ProjectStack } from '../logic/name-cards'
import { CARD_STATUS_COLOR } from '../office-palette'
import { GEM_SPECS } from '../logic/status-gem'
import { OFFSCREEN, type CardAnchors } from './CardProjector'

function StatusDot({ card, isLarge = false }: { card: NameCard; isLarge?: boolean }) {
  return (
    <span
      className={cn(
        'block shrink-0 rounded-full ring-1 ring-black/40',
        isLarge ? 'size-2.5 ring-2 ring-white' : 'size-2'
      )}
      style={{ backgroundColor: CARD_STATUS_COLOR[card.status] }}
    />
  )
}

// The two states that wait on the owner; their cards are paper slips like the queue's.
const NEEDS_YOU: Partial<Record<CardStatus, WorkOrder['attention']>> = {
  permission: 'permission',
  waiting: 'question'
}

function register(map: Map<string, HTMLElement>, key: string) {
  return (element: HTMLElement | null) => {
    if (element) map.set(key, element)
    else map.delete(key)
  }
}

interface NameCardLayerProps {
  cards: readonly NameCard[]
  stacks: readonly ProjectStack[]
  band: ZoomBand
  selectedAgentKey: string | null
  anchors: CardAnchors
  reviewableKeys: ReadonlySet<string>
  onReview: (sessionKey: string) => void
  onFlyToZone: (zoneId: string) => void
}

// Desk cards (status dot, NAME, role line), apprentice pills, the status dots that stand in for
// culled cards and per-project stacked badges. Everything here repeats what the List view, the
// Offices panel and the inspector expose, so the layer stays out of the accessibility tree.
export function NameCardLayer(props: NameCardLayerProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {props.cards.map((card) => {
        const isSelected = card.agentKey === props.selectedAgentKey
        // Floor cards stay compact, but retain a textual activity line.
        const isCompact = props.band !== 'desk' && !isSelected
        const detail =
          card.status === 'working' && card.isAvailable !== false
            ? `${GEM_SPECS.working.label} · ${card.detail}`
            : card.detail
        if (card.kind === 'pill') {
          return (
            <span
              key={card.agentKey}
              ref={register(props.anchors.cards, card.agentKey)}
              style={{ transform: OFFSCREEN }}
              className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-white/90 px-1.5 py-px text-[10px] font-semibold text-neutral-800 shadow"
            >
              <span>{card.title}</span>
              <span className="block font-normal">{detail}</span>
            </span>
          )
        }
        const attention = NEEDS_YOU[card.status]
        // A keyed fragment, not an array: arrays are matched by position, which remounted every
        // card after the one that left.
        return (
          <Fragment key={card.agentKey}>
            <div
              ref={register(props.anchors.cards, card.agentKey)}
              style={{ transform: OFFSCREEN }}
              className={cn(
                'absolute left-0 top-0 flex flex-col whitespace-nowrap',
                attention ? SLIP_CLASS : 'rounded-lg bg-white text-neutral-900 shadow-md',
                isCompact ? 'px-1.5 py-0.5' : 'px-2.5 py-1',
                isSelected && 'outline outline-2 outline-accent'
              )}
            >
              <span className="flex items-center gap-1.5">
                {attention ? <Seal attention={attention} isSmall /> : <StatusDot card={card} />}
                <span
                  className={cn(
                    'font-bold uppercase tracking-wide',
                    isCompact ? 'text-[9px]' : 'text-[11px]'
                  )}
                >
                  {card.title}
                </span>
              </span>
              <span
                className={cn(
                  'text-[10px]',
                  attention ? 'pl-5 text-ink-soft' : 'pl-3.5 text-neutral-600'
                )}
              >
                {detail}
              </span>
              {!isCompact && card.sessionKey && props.reviewableKeys.has(card.sessionKey) && (
                // Mouse shortcut only: the layer is aria-hidden; the queue row has the keyboard Review.
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => card.sessionKey && props.onReview(card.sessionKey)}
                  className="pointer-events-auto mt-1 rounded-md bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-neutral-700"
                >
                  Review
                </button>
              )}
            </div>
            <span
              ref={register(props.anchors.dots, card.agentKey)}
              style={{ transform: OFFSCREEN }}
              className="absolute left-0 top-0"
            >
              <StatusDot card={card} isLarge />
            </span>
          </Fragment>
        )
      })}
      {props.stacks.map((stack) => (
        <button
          key={stack.projectKey}
          type="button"
          tabIndex={-1}
          ref={register(props.anchors.stacks, stack.projectKey)}
          style={{ transform: OFFSCREEN }}
          onClick={() => stack.zoneId && props.onFlyToZone(stack.zoneId)}
          className="pointer-events-auto absolute left-0 top-0 max-w-[min(360px,calc(100vw-1.5rem))] whitespace-normal rounded-lg bg-neutral-900/90 px-2.5 py-1 text-left text-[11px] font-semibold text-white shadow-md hover:bg-neutral-800"
        >
          {stack.text}
        </button>
      ))}
    </div>
  )
}
