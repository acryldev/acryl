import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    // The app's primitives are a static-linked bundle the loader provides at runtime; tests use a stub with the same names.
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(new URL('./tests/stubs/primitives.tsx', import.meta.url)),
      // The conversation client module is also a loader-provided bundle; its phase rule is a pure function, tested from the pinned source.
      '@deepseek-ai/dsh-client-ui-conversation/client': fileURLToPath(new URL('../../deepseek-harness/packages/client/ui-conversation/src/client/contract/snapshot.ts', import.meta.url)),
    },
  },
  test: { setupFiles: ['../../scripts/testing/isolate-home.ts'], include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'] },
})
