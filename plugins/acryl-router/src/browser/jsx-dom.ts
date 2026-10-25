/**
 * The DOM renderer as one browser module: `acrylblends/jsx/dom`, its JSX runtimes and `client`, in a single file with no imports, so a page
 * loads it without a bundler and the runtime and the hooks share one module. `clientModules` serves it and points those imports here.
 */

export * from '../core/jsx/dom/index.ts'
export { jsx, jsxs } from '../core/jsx/dom/jsx-runtime.ts'
export { jsxDEV } from '../core/jsx/dom/jsx-dev-runtime.ts'
export { createRoot, hydrateRoot } from '../core/jsx/dom/client.ts'
