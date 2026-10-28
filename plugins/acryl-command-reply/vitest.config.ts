import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The published client module is a browser bundle wrapped for the client module loader, so the test reads the same function from the
    // pinned DeepSeek Harness source instead of a stub of it.
    alias: { '@deepseek-ai/dsh-client-ui-conversation/client': fileURLToPath(new URL('../../deepseek-harness/packages/client/ui-conversation/src/client/contract/snapshot.ts', import.meta.url)) },
  },
  test: {
    setupFiles: ['../../scripts/testing/isolate-home.ts'],
    include: ['tests/**/*.spec.ts'],
  },
})
