/**
 * Which shell this page renders, and on what platform. One contract for both surfaces:
 *
 * - Desktop (Electron) marks the page URL fragment with `dsh-desktop-mode` and `dsh-desktop-platform`; the
 *   mode is the user's choice (`compatibility` keeps the stock frame, `advanced` is the ACRYL shell).
 * - Web carries no marker and always runs the ACRYL shell, so both surfaces share one workspace.
 */

export type ShellMode = 'compatibility' | 'advanced'

/** Desktop platforms with native window chrome, plus `web` for a plain browser page. */
export type ShellPlatform = 'darwin' | 'win32' | 'linux' | 'web'

export interface ShellEnvironment {
  readonly mode: ShellMode
  readonly platform: ShellPlatform
}

/** What a page without Electron's markers renders. */
export const WEB_SHELL_ENVIRONMENT: ShellEnvironment = Object.freeze({ mode: 'advanced', platform: 'web' })

const MODES = new Set<ShellMode>(['compatibility', 'advanced'])
const DESKTOP_PLATFORMS = new Set<ShellPlatform>(['darwin', 'win32', 'linux'])

/**
 * @param hash - the page's URL fragment, with or without the leading `#`.
 * @returns the environment the Electron markers describe, or the Web environment when there are none.
 * @throws when exactly one marker is present or a value is not recognized: a half-marked page is a Host bug.
 */
export function resolveShellEnvironment(hash: string): ShellEnvironment {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const mode = params.get('dsh-desktop-mode')
  const platform = params.get('dsh-desktop-platform')
  if (mode === null && platform === null) return WEB_SHELL_ENVIRONMENT
  if (!MODES.has(mode as ShellMode)) {
    throw new Error(`acryl-workspace: invalid or missing dsh-desktop-mode ${JSON.stringify(mode)}`)
  }
  if (!DESKTOP_PLATFORMS.has(platform as ShellPlatform)) {
    throw new Error(`acryl-workspace: invalid or missing dsh-desktop-platform ${JSON.stringify(platform)}`)
  }
  return { mode: mode as ShellMode, platform: platform as ShellPlatform }
}
