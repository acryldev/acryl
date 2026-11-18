import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// The suite is ACRYL's own (provenance.json lists the changes): the DSH client bundles are loader-provided at run time,
// so its tests read the pinned DSH source vendored under tests/fixtures/dsh, and the ACRYL repository's HOME isolation
// setup is not needed here.
export default defineConfig({
  resolve: {
    alias: {
      // The app's primitives are a static-linked bundle the loader provides at runtime; tests use a stub with the same names.
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(new URL('./tests/stubs/primitives.tsx', import.meta.url)),
      // The conversation client module is also a loader-provided bundle; its phase rule is a pure function, tested from the pinned source.
      '@deepseek-ai/dsh-client-ui-conversation/client': fileURLToPath(new URL('./tests/fixtures/dsh/packages/client/ui-conversation/src/client/contract/snapshot.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'] },
})
