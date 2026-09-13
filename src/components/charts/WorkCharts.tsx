import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { TASK_STATUS_LABELS } from '@constants/task.constants'
import type { DeveloperSummary, ProjectSummary, StatusBreakdown } from '@utils/work-summary.utils'
import type { DailyTrendPoint } from '@utils/work-summary.utils'
import { formatShortDate, formatWeekday } from '@utils/date.utils'

import {
  AXIS_PROPS,
  BAR_CURSOR,
  GRID_PROPS,
  LEGEND_PROPS,
  SERIES_COLOURS,
  STATUS_COLOURS,
  TOOLTIP_PROPS,
  useChartMotion,
} from './chart.theme'

import './WorkCharts.scss'

/**
 * Chart wrappers around the aggregation utilities.
 *
 * Each chart is paired with a short text summary that is announced to screen
 * readers, because an SVG of a trend line conveys nothing without sight. The
 * charts themselves are hidden from assistive technology to avoid reading out
 * hundreds of meaningless path elements.
 */

const CHART_HEIGHT = 260

interface ChartFrameProps {
  summary: string
  children: React.ReactNode
}

function ChartFrame({ children, summary }: ChartFrameProps) {
  return (
    <div className="work-chart">
      <p className="sr-only">{summary}</p>
      <div aria-hidden="true" className="work-chart__canvas">
        <ResponsiveContainer height={CHART_HEIGHT} width="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface WeeklyTrendChartProps {
  trend: readonly DailyTrendPoint[]
}

export function WeeklyTrendChart({ trend }: WeeklyTrendChartProps) {
  const motion = useChartMotion()

  const data = trend.map((point) => ({
    ...point,
    label: `${formatWeekday(point.date)} ${formatShortDate(point.date)}`,
  }))

  const busiest = data.reduce(
    (best, point) => (point.total > best.total ? point : best),
    data[0] ?? { label: 'none', total: 0 },
  )

  return (
    <ChartFrame
      summary={`Task updates per day across ${String(data.length)} days. Busiest day was ${busiest.label} with ${String(busiest.total)} updates.`}
    >
      <LineChart data={data} margin={{ bottom: 0, left: -20, right: 8, top: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis {...AXIS_PROPS} dataKey="label" />
        <YAxis {...AXIS_PROPS} allowDecimals={false} />
        <Tooltip {...TOOLTIP_PROPS} />
        <Legend {...LEGEND_PROPS} />
        {/* The brand colour rather than a status one: this line is every update, of
            whatever status, and the two lines under it are statuses. */}
        <Line
          {...motion}
          dataKey="total"
          name="Updates"
          stroke={SERIES_COLOURS[0]}
          strokeWidth={2}
          type="monotone"
        />
        <Line
          {...motion}
          dataKey="completed"
          name="Completed"
          stroke={STATUS_COLOURS.completed}
          strokeWidth={2}
          type="monotone"
        />
        <Line
          {...motion}
          dataKey="needsAttention"
          name="Blocked"
          stroke={STATUS_COLOURS.blocked}
          strokeWidth={2}
          type="monotone"
        />
      </LineChart>
    </ChartFrame>
  )
}

interface StatusDistributionChartProps {
  statuses: StatusBreakdown
}

export function StatusDistributionChart({ statuses }: StatusDistributionChartProps) {
  const motion = useChartMotion()

  // Only the four mutually exclusive status counts are charted; needsAttention
  // overlaps them and would make the slices sum to more than the total.
  const data = [
    { name: TASK_STATUS_LABELS['not-started'], value: statuses.notStarted, key: 'not-started' },
    { name: TASK_STATUS_LABELS['in-progress'], value: statuses.inProgress, key: 'in-progress' },
    { name: TASK_STATUS_LABELS.completed, value: statuses.completed, key: 'completed' },
    { name: TASK_STATUS_LABELS.blocked, value: statuses.blocked, key: 'blocked' },
  ] as const

  const summary = data.map((slice) => `${slice.name}: ${String(slice.value)}`).join(', ')

  return (
    <ChartFrame summary={`Task status split of ${String(statuses.total)} tasks. ${summary}.`}>
      <PieChart>
        <Pie
          {...motion}
          data={[...data]}
          dataKey="value"
          innerRadius={55}
          nameKey="name"
          outerRadius={90}
          // A hairline between the slices in the panel's own colour, so two adjacent
          // slices are separable where a red and an amber would otherwise meet.
          stroke="var(--chart-surface)"
          strokeWidth={2}
        >
          {data.map((slice) => (
            <Cell fill={STATUS_COLOURS[slice.key]} key={slice.key} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_PROPS} />
        <Legend {...LEGEND_PROPS} />
      </PieChart>
    </ChartFrame>
  )
}

interface DeveloperProgressChartProps {
  summaries: readonly DeveloperSummary[]
}

export function DeveloperProgressChart({ summaries }: DeveloperProgressChartProps) {
  const motion = useChartMotion()

  const data = summaries.map((summary) => ({
    name: summary.developer.name.split(' ')[0] ?? summary.developer.name,
    completed: summary.statuses.completed,
    inProgress: summary.statuses.inProgress,
    notStarted: summary.statuses.notStarted,
    blocked: summary.statuses.blocked,
  }))

  const summary = summaries
    .map((item) => `${item.developer.name}: ${String(item.statuses.completed)} completed`)
    .join(', ')

  return (
    <ChartFrame summary={`Task status by developer. ${summary}.`}>
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 8, top: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis {...AXIS_PROPS} dataKey="name" />
        <YAxis {...AXIS_PROPS} allowDecimals={false} />
        <Tooltip {...TOOLTIP_PROPS} cursor={BAR_CURSOR} />
        <Legend {...LEGEND_PROPS} />
        <Bar
          {...motion}
          dataKey="completed"
          fill={STATUS_COLOURS.completed}
          name="Completed"
          stackId="status"
        />
        <Bar
          {...motion}
          dataKey="inProgress"
          fill={STATUS_COLOURS['in-progress']}
          name="In Progress"
          stackId="status"
        />
        <Bar
          {...motion}
          dataKey="notStarted"
          fill={STATUS_COLOURS['not-started']}
          name="Not Started"
          stackId="status"
        />
        <Bar
          {...motion}
          dataKey="blocked"
          fill={STATUS_COLOURS.blocked}
          name="Blocked"
          stackId="status"
        />
      </BarChart>
    </ChartFrame>
  )
}

interface ProjectDistributionChartProps {
  summaries: readonly ProjectSummary[]
}

export function ProjectDistributionChart({ summaries }: ProjectDistributionChartProps) {
  const motion = useChartMotion()

  const data = summaries
    .filter((summary) => summary.statuses.total > 0)
    .map((summary) => ({ name: summary.project.name, value: summary.statuses.total }))

  const summary = data.map((slice) => `${slice.name}: ${String(slice.value)}`).join(', ')

  return (
    <ChartFrame summary={`Task distribution across projects. ${summary}.`}>
      <PieChart>
        <Pie
          {...motion}
          data={data}
          dataKey="value"
          nameKey="name"
          outerRadius={90}
          stroke="var(--chart-surface)"
          strokeWidth={2}
        >
          {data.map((slice, index) => (
            <Cell fill={SERIES_COLOURS[index % SERIES_COLOURS.length]} key={slice.name} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_PROPS} />
        <Legend {...LEGEND_PROPS} />
      </PieChart>
    </ChartFrame>
  )
}

interface HoursByDayChartProps {
  trend: readonly DailyTrendPoint[]
}

export function HoursByDayChart({ trend }: HoursByDayChartProps) {
  const motion = useChartMotion()

  const data = trend.map((point) => ({
    label: `${formatWeekday(point.date)} ${formatShortDate(point.date)}`,
    hoursLogged: point.hoursLogged,
  }))

  const total = data.reduce((sum, point) => sum + point.hoursLogged, 0)

  return (
    <ChartFrame summary={`Hours logged per day, ${String(Math.round(total))} hours in total.`}>
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 8, top: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis {...AXIS_PROPS} dataKey="label" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_PROPS} cursor={BAR_CURSOR} />
        <Bar
          {...motion}
          dataKey="hoursLogged"
          fill={SERIES_COLOURS[0]}
          name="Hours"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartFrame>
  )
}
