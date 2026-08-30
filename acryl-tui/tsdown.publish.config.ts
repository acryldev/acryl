import { defineConfig } from 'tsdown'

/**
 * Publish build for the `acryl` npm CLI.
 *
 * The default `tsdown.config.ts` (used by `pnpm build` for the development
 * loop) leaves node_modules dependencies external, which includes the
 * workspace-internal packages `acryl-control` and `acryl-harness-runtime`.
 * That is fine in the workspace (those packages resolve as workspace deps),
 * but it produces a `bin.js` that is NOT self-contained: an external
 * `npm install -g acryl` cannot resolve `acryl-harness-runtime`, so the CLI
 * fails at startup with ERR_MODULE_NOT_FOUND.
 *
 * This publish build therefore BUNDLES the internal ACRYL packages (and the
 * Cordis runtime) into `lib-publish/bin.js`, so the shipped CLI only needs the
 * public `@deepseek-ai/*` runtime packages (declared in the publish manifest's
 * dependency closure). The DSH/Cordis runtime ecosystem and its native addons
 * stay external and are pulled by the published dependency map.
 */
const shared = {
  outDir: 'lib-publish',
  format: 'esm' as const,
  platform: 'node' as const,
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  // Bundle the internal workspace packages so the entrypoint is self-contained.
  noExternal: ['acryl-control', 'acryl-harness-runtime'],
}

export default defineConfig([
  {
    ...shared,
    name: 'acryl-tui/bin',
    entry: { bin: 'src/bin.ts' },
    clean: true,
    banner: '#!/usr/bin/env node',
  },
  {
    ...shared,
    name: 'acryl-tui',
    entry: { index: 'src/index.ts' },
    clean: false,
  },
])
