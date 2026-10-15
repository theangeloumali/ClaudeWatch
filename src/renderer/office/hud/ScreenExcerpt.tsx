// The agent's rendered terminal lines. Held in component state only: never stored, never logged.
// On a work order it takes the paper's ink; on a plate, the deck's colours.
export function ScreenExcerpt({ lines }: { lines: readonly string[] }) {
  return (
    <pre
      aria-label="Screen excerpt"
      tabIndex={0}
      className="max-h-60 min-w-0 overflow-auto overscroll-contain whitespace-pre rounded-md border border-border bg-surface p-2 font-mono text-[11px] leading-snug text-text-primary [[data-inspector-expanded=true]_&]:max-h-[60dvh] [[data-inspector-expanded=true]_&]:text-xs [.on-paper_&]:border-ink/25 [.on-paper_&]:bg-paper-shade [.on-paper_&]:text-ink"
    >
      {lines.length > 0 ? lines.join('\n') : 'The screen is empty.'}
    </pre>
  )
}
