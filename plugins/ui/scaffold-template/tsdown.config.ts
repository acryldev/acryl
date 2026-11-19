import { defineConfig } from 'tsdown'
import { cssModulesInline } from './build/css-modules-plugin.ts'

// Rename this to your real package name before publishing; it becomes both the npm name and the
// client module id the loader registers under. Same build chain as @acryl/ui itself (spec
// 038-ui-component-library): a `require`-able client module, react and the app's own primitives
// stay external, clsx is inlined, CSS Modules compile to plugin-owned <style data-plugin> tags.
const PACKAGE_NAME = 'my-ui-plugin'

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
  deps: { neverBundle: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives'], onlyBundle: ['clsx'] },
  plugins: [cssModulesInline(PACKAGE_NAME)],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
