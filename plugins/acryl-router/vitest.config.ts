import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'src/core/**/*.test.ts'],
    // The ported core's own suite uses the global test functions.
    globals: true,
    // Shared case files are imported by the router suites, not run on their own.
    exclude: ['**/node_modules/**', '**/*.case.test.ts'],
  },
})
