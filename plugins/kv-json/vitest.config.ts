import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    // Opening and closing files many times is slow on hosted Windows and macOS runners (Windows CI timed out at 5 s, 2026-11-24).
    testTimeout: process.platform === 'linux' ? 5_000 : 30_000,
  },
})
