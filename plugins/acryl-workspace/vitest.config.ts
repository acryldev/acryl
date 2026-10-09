import { defineConfig } from 'vitest/config'
import { xtermCssPlugin } from './scripts/xterm-css-plugin.mjs'

export default defineConfig({
  plugins: [xtermCssPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // Tests that run real git (worktrees, commits) take longer than vitest's 5 s default on Windows file systems; nothing is wrong when they do.
    testTimeout: process.platform === 'win32' ? 60_000 : 5_000,
  },
})
