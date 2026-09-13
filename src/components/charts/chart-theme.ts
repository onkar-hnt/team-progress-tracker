import { useMemo } from 'react'
import type { ApexOptions } from 'apexcharts'

import { usePrefersReducedMotion } from '@hooks/use-reduced-motion'

/**
 * Everything the charts agree on.
 *
 * One base configuration, and each chart adds only what is true of its own data. The five charts
 * previously repeated their axes, their grid and their type sizes, and had already drifted in two
 * places — which is visible, because two charts on one screen with different tick sizes read as
 * two charts from different applications.
 *
 * ## What is not here
 *
 * Colour, type and spacing of anything that is not data. ApexCharts writes axis labels, grid
 * lines, the legend and the tooltip as ordinary DOM and SVG that a stylesheet can reach, so those
 * are styled in `ApexChart.scss` from the Sass tokens — see the note there. Setting them here
 * from JavaScript would mean a second set of values to keep in step with the design system.
 *
 * The exception is `fontFamily: 'inherit'`, which is not a value but an instruction: ApexCharts
 * otherwise writes its own default face into an inline style, and an inline style is the one
 * thing the stylesheet cannot politely override.
 */

/**
 * How tall a chart is.
 *
 * The panels these sit in are laid out around this number, and it is deliberately the height the
 * charts had before this rewrite: changing the library and the proportions in one go would make
 * any layout problem afterwards hard to attribute to either.
 */
export const CHART_HEIGHT = 260

/** Where a chart is redrawn for a narrow window. Matches `respond-to-tablet`, which is 48rem. */
const TABLET_BREAKPOINT = 768

export function useChartBase(): ApexOptions {
  const prefersReducedMotion = usePrefersReducedMotion()

  return useMemo<ApexOptions>(
    () => ({
      chart: {
        fontFamily: 'inherit',
        background: 'transparent',

        // The toolbar is a download-and-zoom widget in the corner of every chart. Removed:
        // these are five-to-thirty point charts that do not repay zooming, the export it
        // offers duplicates the CSV buttons on the reports screen, and its buttons are the
        // only focusable things inside a region the application deliberately hides from
        // assistive technology.
        toolbar: { show: false },
        zoom: { enabled: false },

        // Apex reserves room above the plot for a title it has not been given.
        parentHeightOffset: 0,

        /**
         * 600ms, the same as the counting stat cards, so a dashboard settles all at once
         * rather than in instalments.
         *
         * `animateGradually` draws the series one after another, which on a three-series
         * trend takes over a second and reads as the chart being slow to load.
         *
         * Off entirely under `prefers-reduced-motion`. This is one of the two places the
         * preference has to be read in script — Apex interpolates path geometry frame by
         * frame from a prop, which no stylesheet can reach.
         */
        animations: {
          enabled: !prefersReducedMotion,
          speed: 600,
          animateGradually: { enabled: false },
          dynamicAnimation: { enabled: !prefersReducedMotion, speed: 240 },
        },
      },

      /**
       * Off by default, on where a chart argues for it.
       *
       * Numbers printed on every point are the fastest way to make a chart unreadable; the
       * tooltip is where a precise value belongs. The donuts turn them on, because a share of
       * a whole is the one case where the number is the point.
       */
      dataLabels: { enabled: false },

      grid: {
        // Horizontal lines only, dashed. Vertical lines add nothing to a value read off the
        // left axis and turn a five-day chart into a sheet of graph paper.
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        strokeDashArray: 4,
        padding: { bottom: 0, left: 8, right: 8, top: 0 },
      },

      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        fontWeight: 500,
        markers: { shape: 'circle', size: 6 },
        itemMargin: { horizontal: 10, vertical: 2 },
      },

      /**
       * One tooltip for the whole x position rather than one per series.
       *
       * On the trend chart the useful question is "what happened on Tuesday", and three
       * separate hover targets that each answer a third of it is the version that makes
       * somebody hover three times. `intersect: false` is what lets the pointer be near the
       * line rather than on it.
       */
      tooltip: { shared: true, intersect: false },

      stroke: { curve: 'smooth', lineCap: 'round', width: 2 },

      states: {
        hover: { filter: { type: 'lighten' } },

        // Apex dims every other series when one is clicked, which for a chart that is not a
        // filter reads as having broken it.
        active: { filter: { type: 'none' } },
      },

      /**
       * Narrow windows get a shorter chart and a smaller legend, not a squeezed one.
       *
       * Apex merges these over the options above at the breakpoint, so only the differences
       * belong here.
       */
      responsive: [
        {
          breakpoint: TABLET_BREAKPOINT,
          options: {
            chart: { height: 220 },
            legend: { itemMargin: { horizontal: 6, vertical: 1 } },
            grid: { padding: { left: 4, right: 4 } },
          },
        },
      ],

      // Apex draws its own "No data" in the middle of an empty plot. The wrapper shows the
      // application's own empty state instead, which explains what would fill it.
      noData: { text: '' },
    }),
    [prefersReducedMotion],
  )
}

/**
 * The base configuration with one chart's own on top.
 *
 * A plain object spread would replace whole sections: a chart that sets `chart.type` would drop
 * the animation and toolbar settings with it, silently, and the chart would still render — with
 * a download button and an animation that ignores the motion preference. So the sections that
 * both sides legitimately contribute to are merged one level deep, and the rest are replaced.
 *
 * One level is enough because that is how deep the shared configuration goes. It is not a generic
 * deep merge, and it should not become one: something that merges arbitrarily far is something
 * nobody can predict the result of.
 */
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
