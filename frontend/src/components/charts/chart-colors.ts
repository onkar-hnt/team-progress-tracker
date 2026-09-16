import type { TaskStatus } from '@models/index'

// ApexCharts needs literal hex for gradient/hover math; CSS vars break shading.
// Categorical colours omit red and amber so project charts do not imply failure.
export const CHART_COLORS = {
  primary: '#3b6ef5',
  secondary: '#06b6d4',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#6366f1',
  accent: '#8b5cf6',
  neutral: '#94a3b8',
} as const

// Keyed by TaskStatus so data order cannot drift from colour order.
export const STATUS_CHART_COLORS: Readonly<Record<TaskStatus, string>> = {
  'not-started': CHART_COLORS.neutral,
  'in-progress': CHART_COLORS.primary,
  completed: CHART_COLORS.success,
  blocked: CHART_COLORS.danger,
}

// Six colours then repeat; no red or amber for neutral project categories.
const SERIES_CHART_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.accent,
  CHART_COLORS.secondary,
  CHART_COLORS.info,
  CHART_COLORS.neutral,
] as const

// Modulo keeps the index total under noUncheckedIndexedAccess.
export function seriesColor(index: number): string {
  return SERIES_CHART_COLORS[index % SERIES_CHART_COLORS.length] ?? CHART_COLORS.primary
}

// Duplicated from Sass: Apex writes label ink into SVG fill attributes.
const LABEL_INK = {
  light: '#ffffff',
  dark: '#172033',
} as const

// Luminance crossover where white and dark ink have equal contrast.
const INK_CROSSOVER = 0.21

// Per-slice ink from luminance; stylesheets cannot vary fill per slice.
export function labelInkOn(sliceColor: string): string {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(sliceColor.slice(offset, offset + 2), 16) / 255)

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]

  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue

  return luminance > INK_CROSSOVER ? LABEL_INK.dark : LABEL_INK.light
}
