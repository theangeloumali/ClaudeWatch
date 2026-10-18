// A moment's local calendar day, YYYY-MM-DD: the accounts ledger and the Office's spires share it.
export function dayKey(atMs: number): string {
  const date = new Date(atMs)
  const twoDigits = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`
}
