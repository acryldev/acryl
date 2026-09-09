/** Desktop renderer modes accepted from the Electron-owned page URL. */
export type DesktopClientMode = 'compatibility' | 'advanced'

/** Host platforms whose native chrome has a desktop presentation. */
export type DesktopClientPlatform = 'darwin' | 'win32' | 'linux'

/** Validated renderer environment supplied by the Electron Host. */
export interface DesktopClientEnvironment {
  /** Active shell mode for this BrowserWindow lifetime. */
  mode: DesktopClientMode
  /** Electron Host platform used for native spacing and drag regions. */
  platform: DesktopClientPlatform
}

const MODES = new Set<DesktopClientMode>(['compatibility', 'advanced'])
const PLATFORMS = new Set<DesktopClientPlatform>(['darwin', 'win32', 'linux'])

/**
 * Validate the Electron-owned fragment marker before any desktop client effects run.
 *
 * The markers travel in the URL fragment, not the query string: Connection's
 * browser-auth 303-redirects every token-carrying request to the bare origin,
 * discarding the query, while the Fetch redirect algorithm copies the
 * pre-redirect fragment onto a `Location` that specifies none of its own.
 * @param hash - URL fragment string, including or omitting the leading `#`.
 * @returns the validated desktop renderer environment, or undefined outside the desktop shell.
 */
export function parseDesktopClientEnvironment(hash: string): DesktopClientEnvironment | undefined {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const mode = params.get('dsh-desktop-mode')
  const platform = params.get('dsh-desktop-platform')
  if (mode === null && platform === null) return undefined
  if (!MODES.has(mode as DesktopClientMode)) {
    throw new Error(`acryl-desktop: invalid or missing dsh-desktop-mode ${JSON.stringify(mode)}`)
  }
  if (!PLATFORMS.has(platform as DesktopClientPlatform)) {
    throw new Error(`acryl-desktop: invalid or missing dsh-desktop-platform ${JSON.stringify(platform)}`)
  }
  return { mode: mode as DesktopClientMode, platform: platform as DesktopClientPlatform }
}
