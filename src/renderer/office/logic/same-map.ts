// Same keys, each with a same value; `undefined` reads as a missing key, so no value may be one.
export function isSameMap<Key, Value>(
  a: ReadonlyMap<Key, Value>,
  b: ReadonlyMap<Key, Value>,
  isSame: (x: Value, y: Value) => boolean
): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) {
    const other = b.get(key)
    if (other === undefined || !isSame(value, other)) return false
  }
  return true
}
