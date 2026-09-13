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

/**
 * The five charts, over the aggregation utilities.
 *
 * Each one takes summary data already computed by `work-summary.utils`, decides how it should
 * be drawn, and hands the result to `ApexChart` for the framing every chart shares — the text
 * summary, the empty state, the tokens. Nothing here queries or aggregates anything.
 *
 * ## Clicking a chart
 *
 * Three of them accept an `onSelect…` callback and, given one, navigate on click: a status
 * slice, a developer's column and a project slice each stand for a set of rows the activity
 * screen can list, and the count somebody has just read is the count they want to see the
 * detail of. The callers pass a function that builds the filtered link, because only the
 * screen knows which period is on show.
 *
 * Optional, and never the only route. The drawing is hidden from assistive technology, so a
 * click on it cannot be the only way to reach a filtered list — the dashboard's metric cards
 * are ordinary links to the same views, and the activity screen's own filters reach all of
 * them. What the click saves is a trip through those filters, for somebody already pointing
 * at the answer.
 */

const DAY_LABELS_MAX = 7

/// A row of the developer chart, and the point past which it stops growing one row at a time.
/// 34px is a bar plus the air around it at `barHeight: 62%`; 520 is about two thirds of a laptop
/// window, which is as much as one panel of a dashboard should ask for. The allowance is for the
/// legend and the axis below the plot, which do not scale with the number of rows.
const ROW_HEIGHT = 34
const ROWS_MAX_HEIGHT = 520
const LEGEND_ALLOWANCE = 64

/** Apex's own event map, named once so the click helper below can state what it returns. */
type ChartEvents = NonNullable<NonNullable<ApexOptions['chart']>['events']>

/// The hairline between two adjacent slices of a donut. White because that is what the panel
/// behind it is; `$color-white` cannot be read from here, and a slice separator is the one
/// colour where the drawing has to match the surface exactly rather than approximately.
const SLICE_SEPARATOR = '#ffffff'

/**
 * The percentages printed on a donut, each in the ink that reads on the slice under it.
 *
 * Takes the slice colours the chart is already drawing with, so the two cannot disagree: a
 * colour added to a donut brings its own label ink with it rather than needing a second list
 * kept in the same order. See `labelInkOn`.
 *
 * A share of a whole is the one case where a printed number beats a tooltip, but only where
 * there is room for it: under about one slice in twenty the label lands outside its own wedge
 * and points at a neighbour.
 */
function sliceLabels(sliceColors: readonly string[]): ApexOptions['dataLabels'] {
  return {
    enabled: true,
    formatter: formatPercent,

    /// Apex's shadow is there to rescue white text on a colour it cannot read on, which is a
    /// problem `labelInkOn` has already solved — and a shadow under legible type reads as a
    /// mistake rather than as emphasis.
    dropShadow: { enabled: false },

    style: { colors: sliceColors.map(labelInkOn) },
  }
}

interface WeeklyTrendChartProps {
  trend: readonly DailyTrendPoint[]
}

/**
 * Updates per day, as an area under a line with two lines over it.
 *
 * The total is filled because it is the magnitude the eye should take in first; completed and
 * blocked are drawn as lines over it, because they are subsets of it and a second fill would
 * imply they add up to something. This was three identical lines before, where the one that
 * mattered was whichever the reader happened to look at.
 */
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

    /// Only the total is filled. Its gradient fades to nothing at the bottom so the area reads
    /// as weight under the line rather than as a solid block of colour competing with it.
    fill: {
      type: ['gradient', 'solid', 'solid'],
      gradient: { opacityFrom: 0.35, opacityTo: 0.02, shadeIntensity: 1, stops: [0, 100] },
    },

    stroke: { curve: 'smooth', width: [2, 2, 2] },

    /// Hidden until hovered, then a ring. Permanent dots on three series is a chart of dots;
    /// a marker appearing under the pointer is the confirmation that the tooltip belongs to
    /// this point and not the one beside it.
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

/**
 * The status split, as a donut with the total in the hole.
 *
 * A donut rather than the pie it was, for the hole: the total is the number every slice is a
 * share of, and putting it in the middle answers "of how many" without a caption.
 */
export function StatusDistributionChart({
  onSelectStatus,
  statuses,
}: StatusDistributionChartProps) {
  const base = useChartBase()

  /// The four mutually exclusive counts only. `needsAttention` overlaps them — a blocked task
  /// is also in progress — and including it would make the slices sum past the total.
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

    /// A hairline in the panel's own colour between the slices, so a red and an amber meeting
    /// at an edge stay two slices.
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

/**
 * Status by developer, stacked and lying on its side.
 *
 * Horizontal because the labels are names: as columns they were truncated to a first name and
 * rotated, and a chart whose rows say "Shubh…" is a chart nobody can use. Sideways, the name
 * is a line of ordinary left-aligned text however long the team gets.
 *
 * Everybody appears, including whoever has nothing this period — an empty row against a name is
 * the same fact the summary table below states, and dropping the row would raise the question of
 * where they went. What that costs is height, so the chart is given some: a row apiece up to a
 * limit, past which Apex compresses them, because a panel taller than the window is worse than a
 * thin bar.
 */
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

        /// Rounded, and only on the end of the stack — Apex will otherwise round every
        /// segment, which turns one bar into a row of separate lozenges.
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

/** Where the work is, by project. Categorical colours: no project is the bad one. */
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

/** Hours logged per day. One measure, one colour, rounded columns. */
export function HoursByDayChart({ trend }: HoursByDayChartProps) {
  const base = useChartBase()

  const labels = trend.map((point) => dayLabel(point.date, trend.length))
  const hours = trend.map((point) => point.hoursLogged)
  const total = hours.reduce((sum, value) => sum + value, 0)

  const options = withChartBase(base, {
    chart: { type: 'bar' },
    colors: [CHART_COLORS.secondary],

    /// No legend: one series, whose name is already the panel's heading.
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

/**
 * A day, labelled as densely as the number of days allows.
 *
 * A week gets "Mon 13 Sep", which is worth the width. A month of that is thirty labels in the
 * space of five, which Apex resolves by rotating them to 45 degrees and hiding two in three —
 * so past a week the weekday is dropped and the date carries it.
 */
function dayLabel(date: string, dayCount: number): string {
  return dayCount > DAY_LABELS_MAX
    ? formatShortDate(date)
    : `${formatWeekday(date)} ${formatShortDate(date)}`
}

/**
 * Turns "the third slice was clicked" into "this project was clicked".
 *
 * Apex reports a click as a pair of indices into the series it was given, which is a fact about
 * the chart rather than about the data. Every clickable chart here needs the same translation
 * back to a domain id, and doing it inline three times is three chances to read the wrong array
 * — which would navigate somewhere plausible and wrong.
 *
 * `dataPointIndex` is -1 when the click landed on the plot but not on a mark, so the lookup is
 * checked: a stray click in the white space of a chart should do nothing rather than navigate to
 * whatever happens to be first.
 */
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
