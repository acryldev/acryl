import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/adapter/**/*.test.ts'],
    // The ported adapter suite uses the global test functions, makes the web globals writable and checks for leaks with `gc()`.
    globals: true,
    setupFiles: ['./tests/adapter/setup.ts'],
    execArgv: ['--expose-gc'],
  },
})
