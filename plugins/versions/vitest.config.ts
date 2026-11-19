import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // These tests run real git in scratch repositories, and a Windows file system makes every one of those calls several times slower: the whole suite
    // took 28.43 s on windows-latest against 7.63 s on this Mac (packages job, Node 22, run 41751864088), and "answers a refused push with a conflict that
    // keeps git reason" (a clone, two commits, a push and a refused push) measured 1123 ms here, which put it past vitest's 5 s default there. The timeout
    // is the operation's budget, not a mask for a hang, and it is the budget the workspace's own real-git suite carries.
    testTimeout: process.platform === 'win32' ? 60_000 : 20_000,
  },
})
