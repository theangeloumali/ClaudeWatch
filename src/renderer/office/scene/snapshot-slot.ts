// Writes a snapshot slot and returns 1 if it changed, so an idle check allocates nothing.
export function storeSlot<Value>(snapshot: Value[], index: number, value: Value): number {
  const hasChanged = snapshot[index] !== value
  snapshot[index] = value
  return hasChanged ? 1 : 0
}
