import type { TaskStatus } from '@models/index'

/**
 * The chart palette.
 *
 * ## Why the charts have their own tier of colour
 *
 * The interface palette in `_variables.scss` is tuned for text and hairlines: `$color-success`
 * at #14603a is a green that has to stay legible as 12px type on a pale surface, so it is dark
 * and unsaturated. Drawn as a 2px line on white it reads as almost black, and four such colours
 * in one chart are four shades of dark. That is what made the old charts look generic.
 *
 * So these are the same *hues*, one tier brighter and more saturated — the shade a filled area
 * or a rounded bar needs to carry its meaning at a glance. A completed bar here and a Completed
 * badge in the table beside it are recognisably the same green without being the same value.
 *
 * ## Why it is TypeScript rather than a custom property
 *
 * ApexCharts does arithmetic on these: area gradients are computed by shading the series colour,
 * and hover states by lightening it. That arithmetic parses hex, so the obvious trick of handing
 * it `var(--chart-success)` and letting the browser resolve a Sass token does not work — the
 * shading function receives an unparseable string and returns nothing, and the series is drawn
 * with no fill. Data colours therefore live here, in one module, as literal values.
 *
 * Everything *around* the data goes the other way. Axis labels, grid lines, the tooltip surface
 * and the legend text are styled in `ApexChart.scss` from the Sass tokens directly, because
 * ApexCharts writes them as plain attributes that a stylesheet can override. Nothing about the
 * chrome is duplicated here, and a change to the interface palette still reaches the charts.
 *
 * ## The one rule about assigning them
 *
 * A colour means something. Green is finished work, red is stopped work, amber is work that
 * wants attention, blue is work in flight, slate is work not begun. The categorical list below
 * is for data where the categories carry no such meaning of their own — the projects in a
 * distribution — and it deliberately excludes red and amber, so a chart of projects cannot
 * accidentally imply that somebody's project is the failing one.
 */

export const CHART_COLORS = {
  /** Work in flight, and the default for a single-series chart. */
  primary: '#3b6ef5',

  /** A second measure beside the primary one, where both are neutral in tone. */
  secondary: '#06b6d4',

  /** Finished. */
  success: '#10b981',

  /** Wants attention: due soon, behind, under target. */
  warning: '#f59e0b',

  /** Stopped, overdue, failed. */
  danger: '#ef4444',

  /** Informational, and a third categorical colour. */
  info: '#6366f1',

  /** A fourth categorical colour, distinct from both blues at a glance. */
  accent: '#8b5cf6',

  /** Not started, and anything genuinely inert. */
  neutral: '#94a3b8',
} as const

/**
 * The four task statuses.
 *
 * Keyed by the status itself rather than positionally, so a chart cannot list its data in one
 * order and its colours in another — which is the failure that makes a chart quietly wrong
 * rather than visibly broken.
 */
export const STATUS_CHART_COLORS: Readonly<Record<TaskStatus, string>> = {
  'not-started': CHART_COLORS.neutral,
  'in-progress': CHART_COLORS.primary,
  completed: CHART_COLORS.success,
  blocked: CHART_COLORS.danger,
}

/**
 * For categories that are merely different — projects, mostly.
 *
 * Six, then it repeats, and the repeat is honest: a donut of more than six categories cannot be
 * read whatever the colours do, and the answer to that is the table underneath rather than a
 * seventh colour nobody can distinguish from the second.
 *
 * Ordered so that adjacent slices are far apart in hue, and with no red or amber in the list
 * for the reason given above.
 */
const SERIES_CHART_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.accent,
  CHART_COLORS.secondary,
  CHART_COLORS.info,
  CHART_COLORS.neutral,
] as const

/**
 * The nth categorical colour, wrapping.
 *
 * A function rather than the array, because indexing an array under `noUncheckedIndexedAccess`
 * yields `string | undefined` and the honest handling of that at the call site is a fallback
 * colour nobody wants to choose. The modulo makes it total, so there is nothing to fall back to.
 */
export function seriesColor(index: number): string {
  return SERIES_CHART_COLORS[index % SERIES_CHART_COLORS.length] ?? CHART_COLORS.primary
}
