// dry-new: office/sim/path.ts keeps its binary heap module-private.
// The cheapest item comes out first.
export class MinHeap {
  private items: { id: number; cost: number }[] = []
  get size(): number {
    return this.items.length
  }
  push(id: number, cost: number): void {
    const items = this.items
    items.push({ id, cost })
    for (let at = items.length - 1; at > 0; ) {
      const parent = (at - 1) >> 1
      if (items[parent].cost <= items[at].cost) break
      ;[items[parent], items[at]] = [items[at], items[parent]]
      at = parent
    }
  }
  pop(): { id: number; cost: number } | undefined {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length && last) {
      items[0] = last
      for (let at = 0; ; ) {
        const [left, right] = [at * 2 + 1, at * 2 + 2]
        let least = at
        if (left < items.length && items[left].cost < items[least].cost) least = left
        if (right < items.length && items[right].cost < items[least].cost) least = right
        if (least === at) break
        ;[items[least], items[at]] = [items[at], items[least]]
        at = least
      }
    }
    return top
  }
}
