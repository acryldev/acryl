/**
 * `npm run desktop`: starts Electron on `main.ts` next to this file. It exists for one case: on Linux where the kernel restricts unprivileged user namespaces
 * (Ubuntu 23.10 and later: `kernel.apparmor_restrict_unprivileged_userns=1`), Chromium's sandbox cannot start for an Electron that npm unpacked into node_modules, and Electron
 * aborts before any of our code runs. There, and only there, it starts with `--no-sandbox` and says so; everywhere else Electron starts exactly as it does with the sandbox on.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** The arguments for Electron: the entry file, with `--no-sandbox` first when the sandbox is blocked. */
export function electronArgs(entry: string, blocked: boolean): string[] {
  return blocked ? ['--no-sandbox', entry] : [entry]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const electron = createRequire(import.meta.url)('electron') as string
  // ACRYLBLENDS_DESKTOP_SANDBOX=1: the owner has given Electron an AppArmor profile and wants the sandbox.
  const blocked =
    process.env.ACRYLBLENDS_DESKTOP_SANDBOX !== '1' && sandboxBlocked(process.platform)
  if (blocked) console.warn(SANDBOX_NOTICE)
  const child = spawn(electron, electronArgs(join(import.meta.dirname, 'main.ts'), blocked), {
    stdio: 'inherit',
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal))
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}
