import type { ApexOptions } from 'apexcharts'
import ReactApexChart from 'react-apexcharts/core'

/// The renderers this application draws with, and the one optional feature it uses. See the
/// note on bundle size at the foot of the comment below.
import 'apexcharts/bar'
import 'apexcharts/donut'
import 'apexcharts/line' // Registers line and area both.
import 'apexcharts/features/legend'

import { EmptyState } from '@components/ui/feedback/Feedback'

import { CHART_HEIGHT } from './chart-theme'

import 'apexcharts/dist/apexcharts.css'
import './ApexChart.scss'

/**
 * The frame every chart is drawn in.
 *
 * Three things belong to all of them and none of them should be repeating:
 *
 * **A text summary.** An SVG of a trend line conveys nothing without sight, so each chart
 * states its own point in a sentence — the busiest day, the totals, the split — and that
 * sentence is what a screen reader is given. The drawing itself is `aria-hidden`, because the
 * alternative is reading out several hundred path elements.
 *
 * **An empty state.** A chart of nothing is a plot with axes and no marks, which looks like a
 * chart that failed rather than a week with no work in it. Apex will print its own "No data"
 * in the middle of the plot; that is turned off in the base options in favour of the same
 * empty state the lists and tables use, saying what would fill it.
 *
 * **The stylesheet.** Apex's CSS is not bundled into its JavaScript from version 7 onward and
 * has to be imported. Imported here rather than in the application entry point so that a
 * screen with no charts does not pay for it, and imported *before* `ApexChart.scss` so that
 * the application's own rules — which restate the tooltip, legend and axis type in the
 * project's tokens — come later in the sheet and win without needing `!important`.
 *
 * ## Why the imports are picked apart
 *
 * `react-apexcharts/core` plus a renderer per chart type, rather than `react-apexcharts` and
 * its default bundle. Apex registers renderers and optional features through entry points, so
 * importing the four this application uses leaves out every chart type it does not: candlestick,
 * heatmap, radar, treemap and a dozen more. It takes about 260 KB off the chunk this lands in.
 *
 * The cost is that a *new* kind of chart needs its renderer added here, and Apex says so in the
 * console when one is missing rather than failing silently. That is the trade this makes: a
 * legible error the first time somebody draws a radar chart, against a quarter of a megabyte
 * shipped to everybody who opens the dashboard.
 *
 * Two features are deliberately not imported. The toolbar, because it is turned off in the base
 * options anyway. Keyboard navigation, because it would put focusable elements inside a region
 * that is `aria-hidden` — the summary above is what assistive technology is given, and a
 * tab stop leading into a hidden drawing would be worse than no tab stop at all.
 */

export type ApexChartType = 'area' | 'bar' | 'donut' | 'line'

interface ApexChartProps {
  /** What the chart shows, as a sentence. Read instead of the drawing. */
  summary: string

  options: ApexOptions
  series: ApexOptions['series']
  type: ApexChartType

  /** Overridden only by charts whose panel is a different size. */
  height?: number

  /**
   * Shown in place of the chart when there is nothing to plot.
   *
   * Deciding this here rather than checking `series.length` inside the wrapper: for a donut
   * "nothing" means every slice is zero, for a bar chart it means no rows, and only the chart
   * itself knows which of its arrays is the one that matters.
   */
  emptyMessage?: string
  isEmpty?: boolean

  /**
   * Whether clicking a segment does something.
   *
   * Only affects the cursor. What the click *does* is wired through `chart.events` by the
   * chart that has something to navigate to.
   */
  isInteractive?: boolean
}

export function ApexChart({
  emptyMessage,
  height = CHART_HEIGHT,
  isEmpty = false,
  isInteractive = false,
  options,
  series,
  summary,
  type,
}: ApexChartProps) {
  if (isEmpty && emptyMessage !== undefined) {
    return (
      <div className="apex-chart apex-chart--empty" style={{ minHeight: height }}>
        <EmptyState message={emptyMessage} />
      </div>
    )
  }

  return (
    <div className="apex-chart">
      <p className="sr-only">{summary}</p>

      {/* `min-width: 0` on the canvas, because a chart inside a grid track measures its
          parent and a parent that sizes to its content cannot shrink — the chart would set
          the column width and the column would never narrow again. */}
      <div
        aria-hidden="true"
        className={`apex-chart__canvas${isInteractive ? ' apex-chart__canvas--interactive' : ''}`}
      >
        <ReactApexChart height={height} options={options} series={series} type={type} width="100%" />
      </div>
    </div>
  )
}
