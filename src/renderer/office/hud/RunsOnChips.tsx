import type { ModelChip } from '../logic/model-names'
import { GLASS_CLASS, GLASS_META_CLASS } from './glass'

// Display only: the distinct models live sessions report, with how many run each.
export function RunsOnChips({ chips }: { chips: readonly ModelChip[] }) {
  if (chips.length === 0) return null
  return (
    <section
      aria-label="Runs on"
      data-canvas-obstacle
      className={`${GLASS_CLASS} flex max-w-full self-start flex-wrap items-center gap-1.5 px-2.5 py-1.5`}
    >
      <h2 className={`${GLASS_META_CLASS} font-semibold tracking-[0.14em]`}>RUNS ON</h2>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <li
            key={chip.label}
            className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px]"
          >
            <span className="max-w-[160px] truncate">{chip.label}</span>
            <span className="font-mono text-white/70">{chip.count}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
