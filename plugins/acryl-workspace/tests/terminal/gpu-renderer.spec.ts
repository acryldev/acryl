// @vitest-environment jsdom

import { Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'
import { enableGpuRenderer } from '../../src/client/terminal/gpu-renderer.ts'

describe('enableGpuRenderer', () => {
  it('stays on the DOM renderer where WebGL2 is not available (jsdom has none)', () => {
    const terminal = new Terminal()
    expect(enableGpuRenderer(terminal)).toBe(false)
    terminal.dispose()
  })
})
