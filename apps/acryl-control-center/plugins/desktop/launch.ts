/**
 * `npm run desktop`: starts Electron on `main.ts` next to this file. It exists for one case: on Linux where the kernel restricts unprivileged user namespaces
 * (Ubuntu 23.10 and later: `kernel.apparmor_restrict_unprivileged_userns=1`), Chromium's sandbox cannot start for an Electron that npm unpacked into node_modules, and Electron
 * aborts before any of our code runs. There, and only there, it starts with `--no-sandbox` and says so; everywhere else Electron starts exactly as it does with the sandbox on.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acrylRoot, appIdOf, personHome } from '../instance/home.ts'
import { appTitle, brandedElectron, iconFile } from './brand.ts'

/** The sysctl that makes the sandbox fail for an Electron without an AppArmor profile; its value, or `undefined` where it does not exist (every system but a recent Ubuntu). */
export const RESTRICT_USERNS = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns'

/** Whether the sandbox cannot start here: Linux, with the restriction on. `read` returns a file's text, or throws when there is none. */
export function sandboxBlocked(
  platform: string,
  read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): boolean {
  if (platform !== 'linux') return false
  try {
    return read(RESTRICT_USERNS).trim() === '1'
  } catch {
    return false
  }
}

export const SANDBOX_NOTICE =
  "desktop: this Linux restricts unprivileged user namespaces (kernel.apparmor_restrict_unprivileged_userns=1), so Electron's sandbox cannot start; starting with --no-sandbox. " +
  'To keep the sandbox, give Electron an AppArmor profile that allows `userns` (the way the VS Code and Chrome packages do): see docs/framework/getting-started/desktop.md'

/**
 * The arguments for Electron: the entry file, with `--no-sandbox` first when the sandbox is blocked. Chromium switches given to the script
 * (`npm run desktop -- --remote-debugging-port=9222`) go before the entry; anything that is not a switch is dropped.
 */
export function electronArgs(
  entry: string,
  blocked: boolean,
  extra: readonly string[] = [],
): string[] {
  const switches = extra.filter((arg) => /^--[a-z][a-z0-9-]*(=.*)?$/u.test(arg))
  return [...(blocked ? ['--no-sandbox'] : []), ...switches, entry]
}

/** The signals the launcher hands to Electron: Ctrl-C, a stop, and the terminal closing. */
export const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

/**
 * Start Electron and make it end the way it was asked to. On macOS and Linux Electron leads its own process group, so a terminal's Ctrl-C (which goes to the
 * whole foreground group) reaches only this launcher, which hands Electron exactly one signal. Electron answers a first SIGINT, SIGTERM or SIGHUP with a
 * graceful quit, the one that stops the frame host the window started; a second signal kills it at once, before any of that runs, and a Ctrl-C that reached
 * both processes was two, as is one that npm passes on after the terminal sent it. Later signals are not passed on. Windows has no process groups and no such signals; there Electron starts as before. This process ends with Electron's exit code.
 */
export function runElectron(
  file: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
): ChildProcess {
  const child = spawn(file, args, { stdio: 'inherit', detached: platform !== 'win32' })
  // One signal, ever: npm hands a Ctrl-C to this process a second time, and Electron's quit is bounded (DESKTOP_SHUTDOWN_TIMEOUT_MS) without another.
  let forwarded = false
  for (const signal of FORWARDED_SIGNALS)
    if (platform !== 'win32' || signal !== 'SIGHUP')
      process.on(signal, () => {
        if (forwarded) return
        forwarded = true
        child.kill(signal)
      })
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
  return child
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const electron = createRequire(import.meta.url)('electron') as string
  // ACRYLBLENDS_DESKTOP_SANDBOX=1: the owner has given Electron an AppArmor profile and wants the sandbox.
  const blocked =
    process.env.ACRYLBLENDS_DESKTOP_SANDBOX !== '1' && sandboxBlocked(process.platform)
  if (blocked) console.warn(SANDBOX_NOTICE)
  // macOS: the Dock and Cmd+Tab name the app and draw its icon only when the bundle says so (brand.ts); a copy that cannot be made leaves the stock Electron, with a note.
  const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
  const branded = brandedElectron({
    binary: electron,
    folder: join(
      acrylRoot(process.platform, process.env, personHome(process.env, process.platform)),
      'electron',
    ),
    id: appIdOf(projectRoot),
    name: appTitle(projectRoot),
    icon: iconFile(projectRoot),
  })
  if (branded.problem !== undefined)
    console.warn(`desktop: the Dock shows Electron's own name and icon (${branded.problem})`)
  runElectron(
    branded.binary,
    electronArgs(join(import.meta.dirname, 'main.ts'), blocked, process.argv.slice(2)),
  )
}
