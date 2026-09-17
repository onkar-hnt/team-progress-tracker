import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Tests run against the same module graph the app does, so the aliases are
 * repeated here rather than the whole Vite config being imported: that config
 * carries the build, the base path and the chunking, none of which a test run
 * has any use for.
 */
export default defineConfig({
  test: {
    // Node by default: most of what is tested is plain logic, and standing up
    // jsdom for it costs more than the tests themselves. The two files that
    // need a browser — `localStorage`, online/offline events — ask for jsdom
    // with a `@vitest-environment` docblock.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,

    // The client reads this at call time, so every test sees the same gateway
    // address regardless of what is in the developer's .env.local.
    env: {
      VITE_API_BASE_URL: 'http://localhost:5100',
    },
  },

  resolve: {
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
