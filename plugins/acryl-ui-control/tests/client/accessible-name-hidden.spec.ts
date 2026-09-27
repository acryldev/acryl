// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { nameOf } from '../../src/client/driver/accessibility.ts'

describe('accessible names', () => {
  it('leave out aria-hidden and hidden content such as a check mark', () => {
    document.body.innerHTML = '<button id="a">Board tabs<span aria-hidden="true">✓</span><span hidden>secret</span></button><label id="l">Name<span aria-hidden="true">*</span><input></label>'
    expect(nameOf(document.getElementById('a') as Element, 'button')).toBe('Board tabs')
    expect(nameOf(document.querySelector('input') as Element, 'textbox')).toBe('Name')
  })
})
