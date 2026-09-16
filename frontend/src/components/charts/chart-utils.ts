// Domain formatters for Apex axis ticks and tooltips.

/** Whole counts only; Apex may pass a string. */
export function formatCount(value: number | string): string {
  const count = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(count) ? String(Math.round(count)) : ''
}

/** Hours to one decimal; drop trailing .0. */
export function formatHours(value: number | string): string {
  const hours = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(hours)) return ''

  const rounded = Math.round(hours * 10) / 10

  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}h`
}

/** Apex passes donut percentages already rounded. */
export function formatPercent(value: number): string {
  return `${String(Math.round(value))}%`
}
