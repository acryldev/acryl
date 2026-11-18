import { describe, expect, it } from 'vitest'
import { type ColorScheme, ThemeSwitch } from '../src/client/theme-switch.ts'

function source(start: ColorScheme) {
  let scheme = start
  const set: string[] = []
  return {
    set,
    flip: (to: ColorScheme) => { scheme = to },
    getTheme: () => ({ active: { colorScheme: scheme } }),
    setTheme: (id: string) => { set.push(id) },
  }
}

describe('the top bar theme switch', () => {
  it('asks the theme service for the other scheme, and shows the new one after the service reports it', () => {
    const theme = source('dark')
    const toggle = new ThemeSwitch(theme)
    let notified = 0
    toggle.subscribe(() => { notified += 1 })
    toggle.toggle()
    expect(theme.set).toEqual(['light'])
    expect(toggle.getSnapshot()).toBe('dark')
    theme.flip('light')
    toggle.refresh()
    expect(toggle.getSnapshot()).toBe('light')
    expect(notified).toBe(1)
    toggle.refresh()
    expect(notified).toBe(1)
    toggle.toggle()
    expect(theme.set).toEqual(['light', 'dark'])
  })
})
