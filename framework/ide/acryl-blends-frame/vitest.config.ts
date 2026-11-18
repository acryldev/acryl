import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // The git-sync suites run real git (a clone, pushes, a fetch) in scratch repositories, which a Windows file system makes several times slower:
    // "pulls by fast-forward what another clone pushed" passed the 5 s default on windows-latest (packages job, Node 26, run 41985424512). The same
    // budget as acryl-versions' and acryl-workspace's real-git suites; it is the operation's budget, not a mask for a hang.
    testTimeout: process.platform === 'win32' ? 60_000 : 20_000,
  },
})
