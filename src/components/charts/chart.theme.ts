import type { CSSProperties } from 'react'

import { usePrefersReducedMotion } from '@hooks/use-reduced-motion'

/**
 * What the charts are drawn with.
 *
 * Recharts takes its colours, type sizes and tooltip styling as props, so a chart is
 * the one place in this application where design decisions have to be made in
 * TypeScript rather than in Sass. Before this each chart made them itself, in hex: five
 * literals for the statuses, a sixth for a grid line, `fontSize={11}` for an axis — a
 * palette beside the palette, drifting on its own. `#eef1f5` for a grid line was a
 * colour the design system did not contain at all.
 *
 * The colours here are `var()` references, resolved by the browser against the
 * definitions in `_reset.scss`, which are themselves written from the Sass tokens. So
 * "completed" is one green, defined once, whether it is a badge, a bar or a pie slice.
 *
 * ## Why the props are grouped rather than passed individually
 *
 * The five charts had the same axis configuration written out five times and had already
 * drifted in two of them. Spreading a shared object is how the axes stay identical, and
 * more to the point how the next chart is consistent without its author having to read
 * the other five first.
 */

/** The four task statuses, in the same colours their badges use. */
export const STATUS_COLOURS = {
  'not-started': 'var(--chart-not-started)',
  'in-progress': 'var(--chart-in-progress)',
  completed: 'var(--chart-completed)',
  blocked: 'var(--chart-blocked)',
} as const

/**
 * For categories with no inherent meaning — the projects in a pie.
 *
 * Six, then it repeats. A chart of more than six projects is unreadable as a pie
 * whatever the colours do, and the fix for that is a different chart rather than a
 * seventh colour nobody can tell from the second.
 */
export const SERIES_COLOURS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
  'var(--chart-series-6)',
] as const

/**
 * Both axes of every cartesian chart.
 *
 * 12px because that is `$font-size-xs`, the size every other small label in the
 * application is set at; the charts were at 11, which is a size the type scale does not
 * have. Ticks are unmarked and the axis line is the hairline the rest of the interface
 * uses, so the numbers read as labels on the plot rather than as a diagram of an axis.
 */
export const AXIS_PROPS = {
  axisLine: { stroke: 'var(--chart-grid)' },
  fontSize: 12,
  stroke: 'var(--chart-axis)',
  tickLine: false,
} as const

export const GRID_PROPS = {
  stroke: 'var(--chart-grid)',

  /// Horizontal lines only. The vertical ones add nothing to a value read off the left
  /// and turn a five-day chart into a grid of boxes.
  vertical: false,
} as const

/**
 * The hover card, made to match the ones the application draws itself.
 *
 * Recharts' default is a square white box with a grey border and browser-default type.
 * Beside a panel with a 0.5rem radius and a soft shadow it looks like a chart borrowed
 * from somewhere else — which it is, and the point of styling it is that nobody should
 * be able to tell.
 */
const TOOLTIP_SURFACE: CSSProperties = {
  background: 'var(--chart-surface)',
  border: '1px solid var(--chart-grid)',
  borderRadius: '0.5rem',
  boxShadow: '0 8px 24px rgb(15 23 42 / 14%)',
  fontSize: 12,
  padding: '0.5rem 0.75rem',
}

export const TOOLTIP_PROPS = {
  contentStyle: TOOLTIP_SURFACE,
  itemStyle: { padding: '0.125rem 0' },
  labelStyle: { color: 'var(--chart-text)', fontWeight: 600, marginBottom: '0.25rem' },
} as const

/**
 * What is highlighted behind the pointer, on a bar chart only.
 *
 * A faint brand tint instead of the library's mid-grey block, which was solid enough to
 * read as a selection somebody had made rather than as the bar being pointed at.
 *
 * Bars only, because the same prop on a line chart draws a vertical rule and `fill` is
 * not what colours a rule — it would produce a default-coloured line with a fill nobody
 * can see. The line charts leave the cursor alone, where the default is already a thin
 * grey guide.
 */
export const BAR_CURSOR = { fill: 'var(--chart-cursor)' } as const

export const LEGEND_PROPS = {
  iconSize: 8,
  iconType: 'circle',
  wrapperStyle: { fontSize: 12, paddingTop: '0.5rem' },
} as const

/**
 * How the series animate in, if they do.
 *
 * The one animation in the application that a stylesheet cannot reach: Recharts grows
 * its bars and draws its lines from props, and it does not consult the reduced-motion
 * preference itself. The blanket rule in `_reset.scss` catches its CSS transitions but
 * not this, because this is not CSS — it is the library interpolating path geometry
 * frame by frame.
 *
 * 600ms, matching the count-up on the stat cards: a screen where the figures and the
 * charts settle together, rather than one where the charts are still moving after the
 * numbers have stopped.
 */
export function useChartMotion() {
  const prefersReducedMotion = usePrefersReducedMotion()

  return {
    animationDuration: 600,
    animationEasing: 'ease-out',
    isAnimationActive: !prefersReducedMotion,
  } as const
}
