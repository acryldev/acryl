import { defineConfig } from 'vitest/config'

// Only this package's tests. The templates ship their own tests, which run in the scaffolded project.
// The bounds are the framework config's (framework/vitest.config.ts): tests that run real git merges and scaffold a whole app take 2 to 3 s alone and passed
// vitest's 5 s default when the full suite runs in parallel (update.test.ts and upgrade-frame.test.ts timed out on 2026-11-26, twice in a row).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 120_000,
  },
})
