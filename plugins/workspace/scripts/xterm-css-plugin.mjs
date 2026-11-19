/**
 * Bundler plugin (rolldown and vite share this shape) that serves xterm's own stylesheet as a string
 * module named `virtual:xterm-css`. The client ships as one JS file, so its CSS is injected from JS.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const ID = 'virtual:xterm-css'
const RESOLVED = `\0${ID}`
const require = createRequire(import.meta.url)

export function xtermCssPlugin() {
  return {
    name: 'acryl-xterm-css',
    enforce: 'pre',
    resolveId(id) { return id === ID ? RESOLVED : null },
    load(id) {
      return id === RESOLVED ? `export default ${JSON.stringify(readFileSync(require.resolve('@xterm/xterm/css/xterm.css'), 'utf8'))}` : null
    },
  }
}
