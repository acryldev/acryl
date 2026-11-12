import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['../../scripts/testing/isolate-home.ts'],
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
})
