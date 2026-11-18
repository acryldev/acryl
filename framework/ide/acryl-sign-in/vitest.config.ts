import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The ACRYL repository isolated HOME through `../../scripts/testing/isolate-home.ts`; that script does not exist in this
    // repository, and these tests do not touch a home (the port's provenance names the one-line change).
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
})
