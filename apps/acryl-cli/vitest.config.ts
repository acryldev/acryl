import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    // Tests that run real git (init, commit, push) take longer than vitest's 5 s default on Windows file systems; nothing is wrong when they do.
    testTimeout: process.platform === 'win32' ? 60_000 : 5_000,
  },
})
