import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as chrome from '../../src/client/shell/chrome-metrics.ts'
import { resolveShellEnvironment, WEB_SHELL_ENVIRONMENT } from '../../src/client/shell/environment.ts'

describe('shell environment (one contract for Web and Desktop)', () => {
  it('runs the ACRYL shell on a page without Electron markers, which is what Web is', () => {
    expect(resolveShellEnvironment('')).toEqual({ mode: 'advanced', platform: 'web' })
    expect(resolveShellEnvironment('#')).toBe(WEB_SHELL_ENVIRONMENT)
    expect(resolveShellEnvironment('#unrelated=1')).toBe(WEB_SHELL_ENVIRONMENT)
  })

  it('reads the Electron-owned markers, including the user-chosen compatibility mode', () => {
    expect(resolveShellEnvironment('#dsh-desktop-mode=advanced&dsh-desktop-platform=darwin')).toEqual({ mode: 'advanced', platform: 'darwin' })
    expect(resolveShellEnvironment('dsh-desktop-platform=win32&dsh-desktop-mode=compatibility')).toEqual({ mode: 'compatibility', platform: 'win32' })
    expect(resolveShellEnvironment('#dsh-desktop-mode=advanced&dsh-desktop-platform=linux')).toEqual({ mode: 'advanced', platform: 'linux' })
  })

  it.each([
    ['#dsh-desktop-mode=glass&dsh-desktop-platform=darwin', 'dsh-desktop-mode'],
    ['#dsh-desktop-mode=advanced', 'dsh-desktop-platform'],
    ['#dsh-desktop-platform=darwin', 'dsh-desktop-mode'],
    ['#dsh-desktop-mode=advanced&dsh-desktop-platform=web', 'dsh-desktop-platform'],
    ['#dsh-desktop-mode=advanced&dsh-desktop-platform=android', 'dsh-desktop-platform'],
  ])('fails loudly for a half-marked or unknown page %s', (hash, field) => {
    expect(() => resolveShellEnvironment(hash)).toThrow(field)
  })
})

describe('native window chrome metrics', () => {
  it('match the numbers Electron main uses (apps/acryl-desktop/src/shell/window-chrome.ts), so the frame and the window cannot drift', () => {
    const desktop = readFileSync(new URL('../../../../apps/acryl-desktop/src/shell/window-chrome.ts', import.meta.url), 'utf8')
    const read = (name: string): number => {
      const match = new RegExp(`export const ${name} = (\\d+)`).exec(desktop)
      if (match?.[1] === undefined) throw new Error(`${name} is missing from Desktop's window-chrome.ts`)
      return Number(match[1])
    }
    for (const name of Object.keys(chrome)) {
      expect(chrome[name as keyof typeof chrome], name).toBe(read(name))
    }
    expect(Object.keys(chrome).sort()).toEqual([
      'MACOS_DRAG_REGION_HEIGHT', 'MACOS_TITLEBAR_HEIGHT', 'MACOS_TRAFFIC_LIGHT_SAFE_WIDTH',
      'WINDOWS_CAPTION_CONTROLS_WIDTH', 'WINDOWS_TITLEBAR_HEIGHT',
    ])
  })
})
