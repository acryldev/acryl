import { defineConfig } from 'tsdown'

const PACKAGE_NAME = 'acryl-blends-frame'

export default defineConfig([
  {
    name: PACKAGE_NAME,
    // `app-generation` is the dev launcher's own entry (scripts/ide-host.mjs loads it before the app's code), so it is a file of its own.
    entry: { index: 'src/index.ts', 'app-generation': 'src/app-generation.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
  },
  {
    name: `${PACKAGE_NAME}/client`,
    entry: { client: 'src/client/index.ts' },
    tsconfig: 'tsconfig.client.json',
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    external: [
      'react',
      'react/jsx-runtime',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-runtime/client',
      '@deepseek-ai/dsh-client-ui-slots',
      // Sibling plugins with their own Loader rows: resolved through the shared Module Loader registry at runtime, since rolldown
      // cannot read named exports out of another package's `window.__ModuleLoader__`-wrapped client.js (see acryl-workspace).
      'acryl-app-shell/client',
      'acryl-versions/client',
    ],
    noExternal: (id: string) => id.startsWith('@deepseek-ai/') ? undefined : true,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
