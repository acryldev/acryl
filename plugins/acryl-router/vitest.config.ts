import { configDefaults, defineConfig } from 'vitest/config'

// The ported JSX tests compile with the framework's own JSX runtime, as upstream's do: the string renderer for every suite, and the DOM
// suites a second time with the DOM renderer.
const jsx = (importSource: string) => ({ oxc: { jsx: { runtime: 'automatic' as const, importSource } } })
// Shared case files are imported by the router and CSS suites, not run on their own.
const exclude = [...configDefaults.exclude, '**/*.case.test.*']
const domSuites = ['src/core/jsx/dom/**/*.test.tsx', 'src/core/jsx/hooks/dom.test.tsx']

export default defineConfig({
  test: {
    environment: 'node',
    // The ported core's own suite uses the global test functions.
    globals: true,
    projects: [
      { ...jsx('./src/core/jsx'), extends: true, test: { name: 'main', include: ['tests/**/*.spec.{ts,tsx}', 'src/core/**/*.test.{ts,tsx}'], exclude } },
      { ...jsx('./src/core/jsx'), extends: true, test: { name: 'jsx-runtime-default', include: domSuites, exclude } },
      { ...jsx('./src/core/jsx/dom'), extends: true, test: { name: 'jsx-runtime-dom', include: domSuites, exclude } },
    ],
  },
})
