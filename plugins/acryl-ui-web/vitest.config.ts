import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    // The app's primitives are a static-linked bundle the loader provides at runtime; tests use a stub with the same names.
    alias: { '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(new URL('./tests/stubs/primitives.tsx', import.meta.url)) },
  },
  test: { include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'] },
})
