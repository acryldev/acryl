import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['../../scripts/testing/isolate-home.ts', './tests/setup.ts'],
  },
})
