import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['../../scripts/testing/isolate-home.ts'],
    include: ['tests/**/*.spec.ts'],
  },
})
