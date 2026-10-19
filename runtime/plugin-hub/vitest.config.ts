import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // These tests pack real tarballs and drive real git repositories; on the Windows runner the first of them in a file takes about 5 s (process and
    // module start-up), which is vitest's default limit, so they failed by a few milliseconds (2026-10-19, `core.spec.ts` packing, `share.spec.ts`).
    testTimeout: 30_000,
  },
})
