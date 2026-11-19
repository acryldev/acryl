// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { pickElementShortcut } from '../src/client/index.ts'

describe('the element picker shortcut', () => {
  it('is Cmd/Ctrl+Shift+. on every surface and platform, from a page, a text field (the chat composer) or a terminal', () => {
    const spec = pickElementShortcut(() => {})
    expect(spec.id).toBe('acryl-mount-anchors.toggle')
    expect(Object.keys(spec.defaults).sort()).toEqual(['desktop:linux', 'desktop:macos', 'desktop:windows', 'web:linux', 'web:macos', 'web:windows'])
    for (const binding of Object.values(spec.defaults)) expect(binding).toEqual({ code: 'Period', modifiers: ['primary', 'shift'] })
    expect([...spec.regions].sort()).toEqual(['editable', 'page', 'terminal'])
  })

  it('runs what it was given', () => {
    const run = vi.fn()
    const resolved = pickElementShortcut(run).resolve({ modal: null } as never)
    if (resolved.status === 'handled') resolved.run()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
