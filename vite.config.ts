import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: '/team-progress-tracker/',
  plugins: [react()],

  /**
   * The chart library, pre-bundled at startup rather than when a chart is first drawn.
   *
   * Vite finds dependencies by crawling from the entry point, and every charted screen is behind
   * `React.lazy`, so ApexCharts and its four renderers are not discovered until somebody opens the
   * dashboard. Discovering a new dependency mid-session means re-optimising, which changes the
   * `?v=` hash on every optimised module — and the request already in flight for the one that
   * triggered it fails with a 504. For an ordinary import Vite recovers by reloading the page. For
   * a `React.lazy` import it cannot: the rejected dynamic import becomes a render error, the error
   * boundary catches it, and the screen stays broken until somebody reloads by hand.
   *
   * Naming them here moves that work to server startup, where it costs half a second once and
   * nothing afterwards. The subpaths have to be listed individually because that is how Apex
   * registers renderers, and an unlisted one would be discovered late exactly as before.
   */
  optimizeDeps: {
    include: [
      'apexcharts/bar',
      'apexcharts/donut',
      'apexcharts/line',
      'apexcharts/features/legend',
      'react-apexcharts/core',
    ],
  },

  resolve: {
    /// Apex's renderers register themselves against the core class, so there must be exactly one
    /// copy of it however the entry points are combined. Its own documentation asks for this.
    dedupe: ['apexcharts'],

    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@models': fileURLToPath(new URL('./src/models', import.meta.url)),
      '@services': fileURLToPath(new URL('./src/services', import.meta.url)),
      '@hooks': fileURLToPath(new URL('./src/hooks', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
      '@constants': fileURLToPath(new URL('./src/constants', import.meta.url)),
      '@config': fileURLToPath(new URL('./src/config', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
    },
  },
})
