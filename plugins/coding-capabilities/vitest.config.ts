import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: process.platform === 'linux' ? 5_000 : 30_000,
    setupFiles: ['../../scripts/testing/isolate-home.ts'],
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})
