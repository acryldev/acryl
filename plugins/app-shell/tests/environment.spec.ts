import { describe, expect, it } from 'vitest'
import { resolveShellEnvironment, WEB_SHELL_ENVIRONMENT } from '../src/client/environment.ts'

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
