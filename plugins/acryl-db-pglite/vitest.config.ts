import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // A fresh PGlite runs initdb (about a second, several on a loaded runner): each case opens one.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
