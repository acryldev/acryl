import { defineConfig } from 'vitest/config'

// Only this package's tests. The templates ship their own tests, which run in the scaffolded project.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
})
