import { afterEach, describe, expect, it, vi } from 'vitest'
import { followTerminalColorScheme, type ColorSchemeSource } from '../../src/tui/themeDetection.ts'
import { getPaletteMode, onPaletteChange, setPaletteMode, type PaletteMode } from '../../src/tui/theme.ts'
import { TuiThemeService } from '../../src/tui/tui-theme-service.ts'
import { Context } from '@deepseek-ai/cordis'
import { palettes } from '../../src/tui/palette.generated.ts'

function fakeTerminal(answer: PaletteMode | undefined) {
  const listeners = new Set<(scheme: PaletteMode) => void>()
  const notifications: boolean[] = []
  const source: ColorSchemeSource = {
    queryTerminalColorScheme: () => Promise.resolve(answer),
    onTerminalColorSchemeChange: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    setTerminalColorSchemeNotifications: enabled => { notifications.push(enabled) },
  }
  return { source, notifications, emit: (scheme: PaletteMode) => { for (const l of [...listeners]) l(scheme) }, listeners }
}

const initial = getPaletteMode()
afterEach(() => { setPaletteMode(initial) })

describe('following the terminal color scheme (Q8 in spec 038-ui-component-library research.md)', () => {
  it('adopts the scheme the terminal reports at startup and asks for re-render once', async () => {
    setPaletteMode('dark')
    const term = fakeTerminal('light'); const rerender = vi.fn()
    followTerminalColorScheme(term.source, rerender, {})
    await Promise.resolve(); await Promise.resolve()
    expect(getPaletteMode()).toBe('light'); expect(rerender).toHaveBeenCalledTimes(1)
    expect(term.notifications).toEqual([true])
  })

  it('leaves the palette alone when the terminal does not answer, and does not re-render for an unchanged scheme', async () => {
    setPaletteMode('dark')
    const silent = fakeTerminal(undefined); const rerender = vi.fn()
    followTerminalColorScheme(silent.source, rerender, {})
    await Promise.resolve(); await Promise.resolve()
    expect(getPaletteMode()).toBe('dark'); expect(rerender).not.toHaveBeenCalled()
    silent.emit('dark'); expect(rerender).not.toHaveBeenCalled()
  })

  it('follows later changes and stops following when disposed', async () => {
    setPaletteMode('dark')
    const term = fakeTerminal(undefined); const rerender = vi.fn()
    const dispose = followTerminalColorScheme(term.source, rerender, {})
    term.emit('light'); expect(getPaletteMode()).toBe('light'); expect(rerender).toHaveBeenCalledTimes(1)
    dispose()
    expect(term.listeners.size).toBe(0); expect(term.notifications).toEqual([true, false])
    term.emit('dark'); expect(getPaletteMode()).toBe('light')
  })

  it('never asks or follows when the user pinned the palette', () => {
    const term = fakeTerminal('light'); const rerender = vi.fn()
    followTerminalColorScheme(term.source, rerender, { ACRYL_TUI_THEME: 'dark' })
    expect(term.notifications).toEqual([]); expect(term.listeners.size).toBe(0)
  })
})

describe('the tuiTheme service (read-only palette for plugins)', () => {
  it('exposes the live mode, hex and color functions and notifies on change', () => {
    setPaletteMode('dark')
    const service = new TuiThemeService(new Context())
    const seen: PaletteMode[] = []; const off = onPaletteChange(m => seen.push(m)); const offService = service.onChange(() => {})
    const primary = service.color('primary')   // captured once
    expect(service.mode).toBe('dark'); expect(service.hex('primary')).toBe(palettes.dark.primary)
    const before = primary('x')
    setPaletteMode('light')
    expect(service.mode).toBe('light'); expect(service.hex('primary')).toBe(palettes.light.primary)
    expect(primary('x')).not.toBe(before); expect(seen).toEqual(['light'])
    off(); offService()
  })
})
