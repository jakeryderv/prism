const UNITS = ['B', 'KiB', 'MiB', 'GiB'] as const

/** Human-readable byte count in binary units: integers below 1 KiB, one decimal above. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  let value = n
  let i = 0
  while (value >= 1024 && i < UNITS.length - 1) {
    value /= 1024
    i++
  }
  return i === 0 ? `${Math.round(value)} ${UNITS[0]}` : `${value.toFixed(1)} ${UNITS[i]}`
}
