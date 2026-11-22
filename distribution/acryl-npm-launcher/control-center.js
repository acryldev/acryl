// Where `acryl --gui` finds ACRYL Control Center, and how `acryl --web` knows the address to open. Pure functions: they only decide; cli.js runs.
//
// `acryl --gui` opens the installed app when there is one (the DMG, NSIS or Debian package from github.com/acrylblends/63-acryl-control-center
// releases), else the Blend copy in ~/.acryl/control-center in its own window. ACRYL_CONTROL_CENTER=blend always takes the Blend copy (an installed app
// keeps its own home, so a test with a scratch HOME must not reach it); ACRYL_CONTROL_CENTER=<path> names the installed app.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { posix, win32 } from 'node:path'

export const PRODUCT = 'ACRYL Control Center'

/** The `Exec=` command of a freedesktop entry named `name`, without its field codes (%U, %f, ...); undefined when the entry is another app's. */
export function desktopEntryExec(text, name = PRODUCT) {
  const lines = text.split(/\r?\n/u)
  if (!lines.some(line => line.trim() === `Name=${name}`)) return undefined
  const exec = lines.find(line => line.startsWith('Exec='))?.slice('Exec='.length).trim()
  if (!exec) return undefined
  const words = exec.match(/"[^"]*"|\S+/gu).map(word => word.replace(/^"|"$/gu, '')).filter(word => !/^%[a-zA-Z]$/u.test(word))
  return words.length === 0 ? undefined : { command: words[0], args: words.slice(1) }
}

/**
 * The installed Control Center as a command to start, or undefined. `fs` is `{ exists, read, list }` (the real disk by default).
 * @returns {{ command: string, args: string[], at: string } | undefined}
 */
export function installedControlCenter({ platform, env, fs = realFs }) {
  const chosen = env.ACRYL_CONTROL_CENTER?.trim()
  if (chosen === 'blend') return undefined
  const home = (platform === 'win32' ? env.USERPROFILE : env.HOME) ?? ''
  if (platform === 'darwin') {
    const apps = chosen ? [chosen] : [`/Applications/${PRODUCT}.app`, posix.join(home, 'Applications', `${PRODUCT}.app`)]
    const at = apps.find(path => fs.exists(path))
    return at === undefined ? undefined : { command: 'open', args: ['-a', at], at }
  }
  if (platform === 'win32') {
    const at = chosen || (env.LOCALAPPDATA ? win32.join(env.LOCALAPPDATA, 'Programs', PRODUCT, `${PRODUCT}.exe`) : undefined)
    return at !== undefined && fs.exists(at) ? { command: at, args: [], at } : undefined
  }
  if (chosen) return fs.exists(chosen) ? { command: chosen, args: [], at: chosen } : undefined
  for (const folder of [posix.join(home, '.local', 'share', 'applications'), '/usr/local/share/applications', '/usr/share/applications']) {
    for (const file of fs.list(folder).filter(name => name.endsWith('.desktop'))) {
      const found = desktopEntryExec(fs.read(posix.join(folder, file)))
      if (found) return { ...found, at: posix.join(folder, file) }
    }
  }
  return undefined
}

const realFs = {
  exists: path => existsSync(path),
  read: path => { try { return readFileSync(path, 'utf8') } catch { return '' } },
  list: folder => { try { return readdirSync(folder) } catch { return [] } },
}

/** The address an app prints, with the token it needs (`http://127.0.0.1:3999/?token=...`): the same rule the Control Center window reads it with. */
const ADDRESS = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+[^\s'")\]]*/u
// biome-ignore lint/suspicious/noControlCharactersInRegex: the colors an app prints around its address
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/gu
export const firstAddress = text => ADDRESS.exec(text.replace(ANSI, ''))?.[0]

/** True unless the person said not to open a browser (ACRYL_NO_OPEN=1, or BROWSER=none as many tools read it). */
export const opensBrowser = env => !['1', 'true'].includes(env.ACRYL_NO_OPEN?.trim() ?? '') && env.BROWSER?.trim() !== 'none'

/**
 * `acryl --gui` / `--web` words. The copy in ~/.acryl is always brought to its Blend's newest release first (acrylblends update), unless `--no-update`;
 * `--update` also asks for that copy instead of an installed app (which updates itself).
 */
export function controlCenterArgs(args) {
  const rest = args.slice(1).filter(arg => arg !== '--update' && arg !== '--no-update')
  if (rest.length > 0) return { error: `acryl ${args[0]} takes only --update or --no-update (not ${rest.join(' ')})` }
  if (args.includes('--update') && args.includes('--no-update')) return { error: `acryl ${args[0]} takes --update or --no-update, not both` }
  return { surface: args[0] === '--gui' ? 'gui' : 'web', update: args.includes('--update'), noUpdate: args.includes('--no-update') }
}

