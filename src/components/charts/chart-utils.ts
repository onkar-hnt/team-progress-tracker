/**
 * Formatting for the numbers on a chart.
 *
 * ApexCharts hands every axis tick and every tooltip value through a formatter, and its default
 * is the raw JavaScript number: an axis of task counts labelled "0, 0.5, 1, 1.5, 2", and four and
 * a half hours shown as "4.500000000000001" once a few halves have been added together. Both were
 * visible in the charts this replaced.
 *
 * These live apart from the theme because they are about the domain — what a count is, what an
 * hour is — rather than about how a chart looks.
 */

/**
 * A count of things: whole, always.
 *
 * Applied to the axis as well as the tooltip, because an axis is where a fractional tick appears
 * first. Apex passes a number in most positions and occasionally a string, so both are accepted
 * rather than trusted.
 */
export function formatCount(value: number | string): string {
  const count = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(count) ? String(Math.round(count)) : ''
}

/**
 * Hours, to one place, and no trailing zero.
 *
 * "7.5h" and "8h" rather than "7.5h" and "8.0h": the half hour is the smallest unit anybody logs,
 * so one decimal is the whole precision, and printing it when it is zero is noise in a column of
 * figures.
 */
export function formatHours(value: number | string): string {
  const hours = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(hours)) return ''

  const rounded = Math.round(hours * 10) / 10

  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}h`
}

/** A share of a whole, whole-numbered. Apex hands a donut's formatter the percentage already. */
export function formatPercent(value: number): string {
  return `${String(Math.round(value))}%`
}
