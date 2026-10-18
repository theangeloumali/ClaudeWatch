import type { UsageOffset } from './usage-offsets'

type Offsets = Map<string, UsageOffset>

// The ledger answers with the latest hand-over it had read when it saved, so only recent
// ones need keeping; dropping an older one only delays a save.
const MAX_HELD = 16

// dry-new: offsets the bridge may save while a ledger listens: never past a line the ledger
// has not written, or a crash between the two saves skips those tokens for good.
export class UsageCheckpoint {
  private handovers = 0
  // Where the offsets stood after each hand-over the ledger has not yet answered, oldest first.
  private held: { handover: number; offsets: Offsets }[] = []
  private durable: Offsets | null = null

  // Numbers a hand-over of lines read up to `offsets`.
  handOver(offsets: Offsets): number {
    this.held.push({ handover: ++this.handovers, offsets })
    if (this.held.length > MAX_HELD) this.held.shift()
    return this.handovers
  }

  // The ledger has every line up to `handover` on disk.
  markDurable(handover: number): void {
    const index = this.held.findLastIndex((entry) => entry.handover <= handover)
    if (index < 0) return
    this.durable = this.held[index].offsets
    this.held.splice(0, index + 1)
  }

  // The live offsets once the ledger has answered every hand-over, else the newest it did.
  savable(live: () => Offsets): Offsets | null {
    const durable = this.durable
    this.durable = null
    return this.held.length ? durable : live()
  }
}
