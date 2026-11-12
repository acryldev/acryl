import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['../../scripts/testing/isolate-home.ts'],
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
  },
})
