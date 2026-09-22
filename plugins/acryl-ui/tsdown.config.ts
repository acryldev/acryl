import { defineConfig } from 'tsdown'
import { cssModulesInline } from './build/css-modules-plugin.ts'

const PACKAGE_NAME = '@acryl/ui'

// Same shape as dsh-client-ui-brand-acryl's client build plus the DSH CSS Modules step: a `require`-able client module for the loader, react and the app's own
// primitives and theme stay external (the module table answers them), everything else (clsx) is inlined.
export default defineConfig({
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
  deps: { neverBundle: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-theme', '@deepseek-ai/dsh-client-ui-slots'], onlyBundle: ['clsx'] },
  plugins: [cssModulesInline(PACKAGE_NAME)],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
