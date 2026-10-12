import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Most specs here boot a real profile (a Loader tree, a package install): a few seconds on an idle machine, several times that on a loaded
    // one (the gate runs every package's tests at once) or on Windows file systems. A 5 s default timed boots out with nothing wrong, one spec
    // at a time; the budget is set once here instead. A spec that needs more (a real model, an install) still says so itself.
    testTimeout: process.platform === 'win32' ? 60_000 : 30_000,
    hookTimeout: process.platform === 'win32' ? 60_000 : 10_000,
  },
})
