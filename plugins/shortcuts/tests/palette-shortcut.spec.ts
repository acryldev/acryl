import { describe, expect, it, vi } from 'vitest'
import { paletteShortcut } from '../src/client/index.ts'

describe('the command palette shortcut', () => {
  it('is Cmd/Ctrl+Shift+P wherever a page may take it, from a page, a text field or a terminal', () => {
    const spec = paletteShortcut(() => {})
    expect(spec.id).toBe('acryl.command-palette.toggle')
    // Not on Web for Linux: DSH refuses it there, and one refused default takes the whole registration down.
    expect(Object.keys(spec.defaults).sort()).toEqual(['desktop:linux', 'desktop:macos', 'desktop:windows', 'web:macos', 'web:windows'])
    for (const binding of Object.values(spec.defaults)) expect(binding).toEqual({ code: 'KeyP', modifiers: ['primary', 'shift'] })
    expect([...spec.regions].sort()).toEqual(['editable', 'page', 'terminal'])
    expect(spec.modals).toEqual([])
  })

  it('runs what it was given', () => {
    const run = vi.fn()
    const resolved = paletteShortcut(run).resolve({ modal: null } as never)
    expect(resolved.status).toBe('handled')
    if (resolved.status === 'handled') resolved.run()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
