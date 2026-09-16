import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: '/team-progress-tracker/',
  plugins: [react()],

  /** Pre-bundle ApexCharts so lazy routes do not trigger mid-session re-optimisation and 504s. */
  optimizeDeps: {
    include: [
      'apexcharts/bar',
      'apexcharts/donut',
      'apexcharts/line',
      'apexcharts/features/legend',
      'react-apexcharts/core',
    ],
  },

  build: {
    /**
     * Above the ApexCharts chunk, which is 640 KB of prebuilt library and is fetched only by the
     * dashboard and the reports. Left just above it rather than switched off, so a new chunk that
     * grows past the charts still says so.
     */
    chunkSizeWarningLimit: 700,

    rolldownOptions: {
      output: {
        /**
         * Only libraries the first screen already needs are grouped, so a UI change no longer
         * invalidates the cached copy of React or zod. A group ignores the boundary between
         * static and dynamic imports, so grouping ApexCharts or MSAL would drag them into the
         * entry — leave those to automatic chunking, which keeps them lazy.
         */
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              priority: 20,
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            },
            {
              name: 'forms',
              priority: 20,
              test: /node_modules[\\/](react-hook-form|@hookform[\\/]resolvers|zod)[\\/]/,
            },
            { name: 'vendor', priority: 20, test: /node_modules[\\/](@tanstack[\\/]|date-fns[\\/])/ },
          ],
        },
      },
    },
  },

  resolve: {
    /// Apex renderers must share one core instance.
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
      '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
    },
  },
})
