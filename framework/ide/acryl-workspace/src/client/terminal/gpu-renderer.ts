/**
 * The GPU (WebGL) renderer for a terminal, with the DOM renderer as the fallback.
 *
 * WebGL draws box-drawing and block characters pixel-exact and stays smooth under heavy output, which the
 * DOM renderer does not. It is used only where a WebGL2 context is really available, and a lost context
 * (a sleeping GPU, too many contexts) drops back to the DOM renderer instead of leaving a blank terminal.
 */

import { WebglAddon } from '@xterm/addon-webgl'
import type { Terminal } from '@xterm/xterm'

function webgl2Available(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    return false
  }
}

/** @returns true when the GPU renderer is now active. Call after `terminal.open`. */
export function enableGpuRenderer(terminal: Terminal): boolean {
  if (!webgl2Available()) return false
  try {
    const addon = new WebglAddon()
    addon.onContextLoss(() => { addon.dispose() })
    terminal.loadAddon(addon)
    return true
  } catch {
    return false
  }
}
