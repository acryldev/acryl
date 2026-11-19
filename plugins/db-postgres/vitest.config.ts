import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The Intel macOS and Windows runners are several times slower than Linux: a runtime that boots in 1 s there can take over 5 s (v0.2.8 release runs).
    testTimeout: process.platform === 'linux' ? 5_000 : 30_000,
    setupFiles: ['../../scripts/testing/isolate-home.ts'],
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Each file starts its own PGlite in a beforeAll; on a loaded Intel macOS runner with all files at once that passed vitest's 10 s default (the v0.2.8
    // release run failed there on tests/conformance.spec.ts: "Hook timed out in 10000ms").
    hookTimeout: 60_000,
  },
})
