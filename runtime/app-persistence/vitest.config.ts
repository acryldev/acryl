import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The Intel macOS and Windows runners are several times slower than Linux: a runtime that boots in 1 s there can take over 5 s (v0.2.8 release runs).
    testTimeout: process.platform === 'linux' ? 5_000 : 30_000,
    setupFiles: ['../../scripts/testing/isolate-home.ts'],
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
})
