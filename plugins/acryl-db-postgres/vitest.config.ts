import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['../../scripts/testing/isolate-home.ts'],
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Each file starts its own PGlite in a beforeAll; on a loaded Intel macOS runner with all files at once that passed vitest's 10 s default (the v0.2.8
    // release run failed there on tests/conformance.spec.ts: "Hook timed out in 10000ms").
    hookTimeout: 60_000,
  },
})
