// `acryl --gui`: open the ACRYL desktop app that is already installed. Where the installer puts it is fixed by the desktop package's electron-builder
// config (productName ACRYL, per-user NSIS install, Debian package): macOS /Applications/ACRYL.app, Windows %LOCALAPPDATA%\Programs\ACRYL\ACRYL.exe,
// Linux /opt/ACRYL/acryl-desktop. Returns the command that opens it, or undefined when it is not installed (the selector then fetches the installer).
import { join } from 'node:path'

/** Where each OS keeps the installed app, most likely first. */
export function desktopLocations({ platform, env, home }) {
  if (platform === 'darwin') return [join('/Applications', 'ACRYL.app'), join(home, 'Applications', 'ACRYL.app')]
  if (platform === 'win32') return [join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'ACRYL', 'ACRYL.exe')]
  return ['/opt/ACRYL/acryl-desktop']
}

/** `{ command, args }` that opens the installed desktop app, or undefined. */
export function installedDesktop({ platform, env, home, exists }) {
  const found = desktopLocations({ platform, env, home }).find(exists)
  if (found === undefined) return undefined
  return platform === 'darwin' ? { command: 'open', args: ['-a', found] } : { command: found, args: [] }
}
