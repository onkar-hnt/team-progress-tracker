import type { ApexOptions } from 'apexcharts'
import ReactApexChart from 'react-apexcharts/core'

// Tree-shaken renderers only — add a new import when introducing a chart type.
import 'apexcharts/bar'
import 'apexcharts/donut'
import 'apexcharts/line' // Registers line and area both.
import 'apexcharts/features/legend'

import { EmptyState } from '@components/ui/feedback/Feedback'

import { CHART_HEIGHT } from './chart-theme'

import 'apexcharts/dist/apexcharts.css'
import './ApexChart.scss'

export type ApexChartType = 'area' | 'bar' | 'donut' | 'line'

interface ApexChartProps {
  /** Read instead of the drawing. */
  summary: string

  options: ApexOptions
  series: ApexOptions['series']
  type: ApexChartType

  /** Overridden only by charts whose panel is a different size. */
  height?: number

  /** Caller decides emptiness — donut zeros vs empty bar rows differ. */
  emptyMessage?: string
  isEmpty?: boolean

  /** Cursor only; click handling is wired through chart.events. */
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

      {/* min-width: 0 lets the chart shrink inside a grid track. */}
      <div
        aria-hidden="true"
        className={`apex-chart__canvas${isInteractive ? ' apex-chart__canvas--interactive' : ''}`}
      >
        <ReactApexChart height={height} options={options} series={series} type={type} width="100%" />
      </div>
    </div>
  )
}
