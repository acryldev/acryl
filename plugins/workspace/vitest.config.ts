import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { xtermCssPlugin } from './scripts/xterm-css-plugin.mjs'

export default defineConfig({
  plugins: [xtermCssPlugin()],
  resolve: {
    // The routes' guard (the own-page rule, the terminal socket's among it) lives in loopback-http: the tests run the current source of it, not whatever
    // build is in lib/ (a stale one answered 403 to the hosted terminal socket, a failure that looked like the workspace's).
    alias: { '@acryldev/loopback-http/router': fileURLToPath(new URL('../../runtime/loopback-http/src/router.ts', import.meta.url)) },
  },
  test: {
    // Node 25 and later have their own localStorage, which hides jsdom's (window.localStorage is undefined); the tests use jsdom's.
    execArgv: ['--no-experimental-webstorage'],
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['../../scripts/testing/isolate-home.ts', './tests/setup.ts'],
    // Tests that run real git (worktrees, commits) take longer than vitest's 5 s default on Windows file systems; nothing is wrong when they do.
    testTimeout: process.platform === 'win32' ? 60_000 : process.platform === 'darwin' ? 30_000 : 5_000,
  },
})
