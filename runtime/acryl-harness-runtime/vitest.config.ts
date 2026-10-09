import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Booting a real profile (a Loader tree, a package install) takes a few seconds on a fast POSIX machine and longer on Windows file systems; the
    // 5 s default timed these tests out there without anything being wrong.
    testTimeout: process.platform === 'win32' ? 60_000 : 5_000,
    hookTimeout: process.platform === 'win32' ? 60_000 : 10_000,
  },
})
