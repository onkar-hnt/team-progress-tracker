import type { ApexOptions } from 'apexcharts'

import { TASK_STATUS_LABELS } from '@constants/task.constants'
import type { TaskStatus } from '@models/index'
import { formatShortDate, formatWeekday } from '@utils/date.utils'
import type {
  DailyTrendPoint,
  DeveloperSummary,
  ProjectSummary,
  StatusBreakdown,
} from '@utils/work-summary.utils'

import { ApexChart } from './ApexChart'
import { CHART_COLORS, STATUS_CHART_COLORS, labelInkOn, seriesColor } from './chart-colors'
import { CHART_HEIGHT, useChartBase, withChartBase } from './chart-theme'
import { formatCount, formatHours, formatPercent } from './chart-utils'

const DAY_LABELS_MAX = 7

// 34px per bar row; 520px max plot height including legend allowance.
const ROW_HEIGHT = 34
const ROWS_MAX_HEIGHT = 520
const LEGEND_ALLOWANCE = 64

type ChartEvents = NonNullable<NonNullable<ApexOptions['chart']>['events']>

// Must match panel background; Sass token unavailable here.
const SLICE_SEPARATOR = '#ffffff'

function sliceLabels(sliceColors: readonly string[]): ApexOptions['dataLabels'] {
  return {
    enabled: true,
    formatter: formatPercent,

    // labelInkOn picks readable ink; Apex shadow is redundant.
    dropShadow: { enabled: false },

    style: { colors: sliceColors.map(labelInkOn) },
  }
}

interface WeeklyTrendChartProps {
  trend: readonly DailyTrendPoint[]
}

export function WeeklyTrendChart({ trend }: WeeklyTrendChartProps) {
  const base = useChartBase()

  const labels = trend.map((point) => dayLabel(point.date, trend.length))

  const busiest = trend.reduce<DailyTrendPoint | undefined>(
    (best, point) => (best === undefined || point.total > best.total ? point : best),
    undefined,
  )

  const options = withChartBase(base, {
    chart: { type: 'line', stacked: false },
    colors: [CHART_COLORS.primary, STATUS_CHART_COLORS.completed, STATUS_CHART_COLORS.blocked],

    // Only the total is filled; gradient fades so the area does not compete with the line.
    fill: {
      type: ['gradient', 'solid', 'solid'],
      gradient: { opacityFrom: 0.35, opacityTo: 0.02, shadeIntensity: 1, stops: [0, 100] },
    },

    stroke: { curve: 'smooth', width: [2, 2, 2] },

    // Markers on hover only — permanent dots clutter multi-series lines.
    markers: { size: 0, strokeWidth: 2, hover: { size: 5 } },

    xaxis: { categories: labels, axisTicks: { show: false }, tooltip: { enabled: false } },
    yaxis: { labels: { formatter: formatCount }, min: 0, forceNiceScale: true },
    tooltip: { y: { formatter: formatCount } },
  })

  const series = [
    { name: 'Updates', type: 'area', data: trend.map((point) => point.total) },
    { name: 'Completed', type: 'line', data: trend.map((point) => point.completed) },
    { name: 'Blocked', type: 'line', data: trend.map((point) => point.needsAttention) },
  ]

  return (
    <ApexChart
      emptyMessage="No updates were logged in this period."
      isEmpty={trend.every((point) => point.total === 0)}
      options={options}
      series={series}
      summary={
        busiest === undefined
          ? 'No updates were logged in this period.'
          : `Task updates per day across ${String(trend.length)} days. Busiest day was ${dayLabel(busiest.date, trend.length)} with ${String(busiest.total)} updates.`
      }
      type="line"
    />
  )
}

interface StatusDistributionChartProps {
  statuses: StatusBreakdown
  /** Given, a slice becomes clickable and reports which status was chosen. */
  onSelectStatus?: (status: TaskStatus) => void
}

export function StatusDistributionChart({
  onSelectStatus,
  statuses,
}: StatusDistributionChartProps) {
  const base = useChartBase()

  // needsAttention overlaps other statuses and must not be a fifth slice.
  const slices = [
    { key: 'not-started', value: statuses.notStarted },
    { key: 'in-progress', value: statuses.inProgress },
    { key: 'completed', value: statuses.completed },
    { key: 'blocked', value: statuses.blocked },
  ] as const satisfies readonly { key: TaskStatus; value: number }[]

  const sliceColors = slices.map((slice) => STATUS_CHART_COLORS[slice.key])

  const options = withChartBase(base, {
    chart: {
      type: 'donut',
      events: onSelectStatus === undefined ? {} : selectByIndex(slices, onSelectStatus),
    },
    colors: sliceColors,
    labels: slices.map((slice) => TASK_STATUS_LABELS[slice.key]),
    dataLabels: sliceLabels(sliceColors),

    plotOptions: {
      pie: {
        donut: {
          size: '62%',
          labels: {
            show: true,
            name: { show: true },
            value: { show: true },
            total: { show: true, label: 'Tasks', formatter: () => String(statuses.total) },
          },
        },
        expandOnClick: false,
      },
    },

    stroke: { colors: [SLICE_SEPARATOR], width: 2 },

    tooltip: { y: { formatter: formatCount } },
  })

  return (
    <ApexChart
      emptyMessage="No tasks fall in this period."
      isEmpty={statuses.total === 0}
      isInteractive={onSelectStatus !== undefined}
      options={options}
      series={slices.map((slice) => slice.value)}
      summary={`Task status split of ${String(statuses.total)} tasks. ${slices
        .map((slice) => `${TASK_STATUS_LABELS[slice.key]}: ${String(slice.value)}`)
        .join(', ')}.`}
      type="donut"
    />
  )
}

interface DeveloperProgressChartProps {
  summaries: readonly DeveloperSummary[]
  /** Given, a bar becomes clickable and reports whose it was. */
  onSelectDeveloper?: (developerId: string) => void
}

export function DeveloperProgressChart({
  onSelectDeveloper,
  summaries,
}: DeveloperProgressChartProps) {
  const base = useChartBase()

  const height = Math.min(
    ROWS_MAX_HEIGHT,
    Math.max(CHART_HEIGHT, summaries.length * ROW_HEIGHT + LEGEND_ALLOWANCE),
  )

  const options = withChartBase(base, {
    chart: {
      type: 'bar',
      stacked: true,
      events:
        onSelectDeveloper === undefined
          ? {}
          : selectByIndex(
            summaries.map((row) => ({ key: row.developer.id })),
            onSelectDeveloper,
          ),
    },
    colors: [
      STATUS_CHART_COLORS.completed,
      STATUS_CHART_COLORS['in-progress'],
      STATUS_CHART_COLORS['not-started'],
      STATUS_CHART_COLORS.blocked,
    ],

    plotOptions: {
      bar: {
        horizontal: true,

        // borderRadiusApplication: end — otherwise every stack segment is rounded.
        borderRadius: 4,
        borderRadiusApplication: 'end',
        barHeight: '62%',
      },
    },

    stroke: { width: 0 },
    xaxis: {
      categories: summaries.map((row) => row.developer.name),
      labels: { formatter: formatCount },
    },
    yaxis: { labels: { maxWidth: 140 } },
    tooltip: { y: { formatter: formatCount } },
  })

  return (
    <ApexChart
      emptyMessage="No tasks are assigned in this period."
      height={height}
      isEmpty={summaries.every((row) => row.statuses.total === 0)}
      isInteractive={onSelectDeveloper !== undefined}
      options={options}
      series={[
        { name: 'Completed', data: summaries.map((row) => row.statuses.completed) },
        { name: 'In Progress', data: summaries.map((row) => row.statuses.inProgress) },
        { name: 'Not Started', data: summaries.map((row) => row.statuses.notStarted) },
        { name: 'Blocked', data: summaries.map((row) => row.statuses.blocked) },
      ]}
      summary={`Task status by developer. ${summaries
        .map((row) => `${row.developer.name}: ${String(row.statuses.completed)} completed`)
        .join(', ')}.`}
      type="bar"
    />
  )
}

interface ProjectDistributionChartProps {
  summaries: readonly ProjectSummary[]
  /** Given, a slice becomes clickable and reports which project was chosen. */
  onSelectProject?: (projectId: string) => void
}

export function ProjectDistributionChart({
  onSelectProject,
  summaries,
}: ProjectDistributionChartProps) {
  const base = useChartBase()

  const slices = summaries.filter((summary) => summary.statuses.total > 0)
  const total = slices.reduce((sum, slice) => sum + slice.statuses.total, 0)
  const sliceColors = slices.map((_, index) => seriesColor(index))

  const options = withChartBase(base, {
    chart: {
      type: 'donut',
      events:
        onSelectProject === undefined
          ? {}
          : selectByIndex(
            slices.map((slice) => ({ key: slice.project.id })),
            onSelectProject,
          ),
    },
    colors: sliceColors,
    labels: slices.map((slice) => slice.project.name),
    dataLabels: sliceLabels(sliceColors),

    plotOptions: {
      pie: {
        donut: {
          size: '62%',
          labels: {
            show: true,
            name: { show: true },
            value: { show: true },
            total: { show: true, label: 'Tasks', formatter: () => String(total) },
          },
        },
        expandOnClick: false,
      },
    },

    stroke: { colors: [SLICE_SEPARATOR], width: 2 },
    tooltip: { y: { formatter: formatCount } },
  })

  return (
    <ApexChart
      emptyMessage="No project has tasks in this period."
      isEmpty={slices.length === 0}
      isInteractive={onSelectProject !== undefined}
      options={options}
      series={slices.map((slice) => slice.statuses.total)}
      summary={`Task distribution across projects. ${slices
        .map((slice) => `${slice.project.name}: ${String(slice.statuses.total)}`)
        .join(', ')}.`}
      type="donut"
    />
  )
}

interface HoursByDayChartProps {
  trend: readonly DailyTrendPoint[]
}

export function HoursByDayChart({ trend }: HoursByDayChartProps) {
  const base = useChartBase()

  const labels = trend.map((point) => dayLabel(point.date, trend.length))
  const hours = trend.map((point) => point.hoursLogged)
  const total = hours.reduce((sum, value) => sum + value, 0)

  const options = withChartBase(base, {
    chart: { type: 'bar' },
    colors: [CHART_COLORS.secondary],

    legend: { show: false },

    plotOptions: { bar: { borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '52%' } },
    xaxis: { categories: labels, axisTicks: { show: false }, tooltip: { enabled: false } },
    yaxis: { labels: { formatter: formatHours }, min: 0, forceNiceScale: true },
    tooltip: { y: { formatter: formatHours } },
  })

  return (
    <ApexChart
      emptyMessage="No hours were logged in this period."
      isEmpty={total === 0}
      options={options}
      series={[{ name: 'Hours', data: hours }]}
      summary={`Hours logged per day, ${formatHours(total)} in total.`}
      type="bar"
    />
  )
}

// Past a week, drop weekday labels — thirty rotated labels do not fit.
function dayLabel(date: string, dayCount: number): string {
  return dayCount > DAY_LABELS_MAX
    ? formatShortDate(date)
    : `${formatWeekday(date)} ${formatShortDate(date)}`
}

// Maps Apex dataPointIndex to domain id; -1 means click missed a mark.
function selectByIndex<T extends string>(
  keys: readonly { key: T }[],
  onSelect: (key: T) => void,
): ChartEvents {
  return {
    dataPointSelection: (_event, _chart, options) => {
      const chosen = options === undefined ? undefined : keys[options.dataPointIndex]
      if (chosen !== undefined) onSelect(chosen.key)
    },
  }
}
