/**
 * How a child process runs Windows-only launchers, and where each platform keeps Chrome. Windows cannot start a .cmd without cmd.exe, and npm's own shim
 * resolves its files against the working directory when its name is quoted, so npm is named bare and the door's path is quoted (it may contain spaces).
 * Every answer here is pure, so the differences are tested on any machine.
 */
import { join } from 'node:path'

/**
 * The npm a child process spawns. On Windows: `npm.cmd` through the shell, unquoted (quoting makes the shim look for its files under the working
 * directory). Everywhere else: `npm`, no shell.
 */
export const npmSpawn = (platform = process.platform) =>
  platform === 'win32'
    ? { command: 'npm.cmd', options: { shell: true } }
    : { command: 'npm', options: {} }

/**
 * The door's command in an app folder and how to run it: `acryl.cmd` on Windows, through the shell and quoted so a folder with spaces still runs; the
 * POSIX script elsewhere.
 */
export const doorSpawn = (app, platform = process.platform) =>
  platform === 'win32'
    ? { command: `"${join(app, '.acryl', 'bin', 'acryl.cmd')}"`, options: { shell: true } }
    : { command: join(app, '.acryl', 'bin', 'acryl'), options: {} }

/**
 * Where a Chrome or Chromium may be, in the order to try: `CHROME_BIN` wins; Windows names Chrome's two Program Files locations and the per-user
 * install, macOS the app bundle, and every other platform (Linux) the distribution paths.
 */
export function chromeCandidates(env = process.env, platform = process.platform) {
  const windows = [
    join(env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(
      env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    ),
    join(env.LOCALAPPDATA ?? 'C:\\Users\\Public', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  const linux = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const platformPaths = platform === 'win32' ? windows : platform === 'darwin' ? mac : linux
  return [env.CHROME_BIN, ...platformPaths].filter((path) => path !== undefined && path !== '')
}
