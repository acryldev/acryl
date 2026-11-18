import { defineConfig } from 'vitest/config'

// The suite is ACRYL's own, unchanged; it runs on this repository's vitest.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})
