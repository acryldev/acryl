import { defineConfig } from 'vitest/config'
import { xtermCssPlugin } from './scripts/xterm-css-plugin.mjs'

export default defineConfig({
  plugins: [xtermCssPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // Tests that run real git (worktrees, commits) take longer than vitest's 5 s default: on Windows file systems always, and on macOS and Linux when the
    // whole tree's suites run in parallel (a git write here measured 5.6 s under the full check). The timeout is the operation's budget, not a mask for a hang.
    testTimeout: process.platform === 'win32' ? 60_000 : 20_000,
  },
})
