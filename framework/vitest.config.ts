import { defineConfig } from 'vitest/config'

// The framework packages (plugins/acryl-*, packages/framework) test themselves: `pnpm -r run test` runs each package's own suite with its own vitest settings.
// This one covers the packages that scaffold apps (the CLI and create-acrylblends) and the docs. The templates' own tests run inside each scaffolded project:
// see scripts/verify-scaffolder.mjs.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10_000,
    // Hooks here build and delete fixture trees: a scaffolded app is the CLI's whole plugin library, and removing one suite's scratch took 15,046 ms on
    // this Mac on 2026-11-03, while the sibling cli.test.ts cleanup also passed vitest's 10 s hook default (the full check failed on both that day, after
    // every test had passed). The cost is the fixture's own size, not a wait for something external, so the bound is 120 s, eight times the measurement.
    // Tests keep their 10 s bound; this one applies to hooks only.
    hookTimeout: 120_000,
    include: [
      'packages/cli/test/**/*.test.ts',
      'packages/create/test/**/*.test.ts',
      'docs/test/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
})
