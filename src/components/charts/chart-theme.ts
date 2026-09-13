import { useMemo } from 'react'
import type { ApexOptions } from 'apexcharts'

import { usePrefersReducedMotion } from '@hooks/use-reduced-motion'

// Shared chart defaults; chrome is styled in ApexChart.scss from Sass tokens.
// fontFamily: inherit stops Apex from writing an inline face the stylesheet cannot override.
export const CHART_HEIGHT = 260

/** Matches `respond-to-tablet` (48rem). */
const TABLET_BREAKPOINT = 768

export function useChartBase(): ApexOptions {
  const prefersReducedMotion = usePrefersReducedMotion()

  return useMemo<ApexOptions>(
    () => ({
      chart: {
        fontFamily: 'inherit',
        background: 'transparent',

        // Toolbar adds focusable controls inside an aria-hidden region.
        toolbar: { show: false },
        zoom: { enabled: false },

        // Apex reserves room above the plot for a title it has not been given.
        parentHeightOffset: 0,

        // 600ms matches stat cards; animateGradually off for multi-series charts.
        // Must be read in script — Apex animates paths, which CSS cannot reach.
        animations: {
          enabled: !prefersReducedMotion,
          speed: 600,
          animateGradually: { enabled: false },
          dynamicAnimation: { enabled: !prefersReducedMotion, speed: 240 },
        },
      },

      // Donuts enable dataLabels where a share of the whole is the point.
      dataLabels: { enabled: false },

      grid: {
        // Vertical grid lines add nothing for a left-axis value read.
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        strokeDashArray: 4,
        padding: { bottom: 0, left: 8, right: 8, top: 0 },
      },

      // Colour and type come from ApexChart.scss; itemMargin is written inline by Apex.
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        markers: { shape: 'circle', size: 6 },
        itemMargin: { horizontal: 8, vertical: 2 },
      },

      // shared + intersect: false — one tooltip per x position, pointer need not hit the line.
      tooltip: { shared: true, intersect: false },

      stroke: { curve: 'smooth', lineCap: 'round', width: 2 },

      states: {
        hover: { filter: { type: 'lighten' } },

        // Apex dims other series on click, which reads as broken on non-filter charts.
        active: { filter: { type: 'none' } },
      },

      responsive: [
        {
          breakpoint: TABLET_BREAKPOINT,
          options: {
            chart: { height: 220 },
            legend: { itemMargin: { horizontal: 5, vertical: 1 } },
            grid: { padding: { left: 4, right: 4 } },
          },
        },
      ],

      // Wrapper shows the application empty state instead.
      noData: { text: '' },
    }),
    [prefersReducedMotion],
  )
}

// Shallow-merge shared sections; a plain spread would drop nested chart settings.
export function withChartBase(base: ApexOptions, specific: ApexOptions): ApexOptions {
  return {
    ...base,
    ...specific,
    chart: { ...base.chart, ...specific.chart },
    grid: { ...base.grid, ...specific.grid },
    legend: { ...base.legend, ...specific.legend },
    tooltip: { ...base.tooltip, ...specific.tooltip },
    dataLabels: { ...base.dataLabels, ...specific.dataLabels },
    stroke: { ...base.stroke, ...specific.stroke },
    xaxis: { ...base.xaxis, ...specific.xaxis },
  }
}
