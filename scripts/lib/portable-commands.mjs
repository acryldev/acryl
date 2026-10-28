/**
 * The two external commands the release scripts run that start differently on Windows.
 *
 * - A `.cmd` shim (`npm`, the bin an npm install writes): Node starts a `.cmd` file only through a shell since its 2024 security release
 *   (CVE-2024-27980), so `execFileSync('npm', ...)` fails with ENOENT or EINVAL on Windows.
 * - `tar`: the first `tar` on a Windows PATH is often Git's GNU tar, which reads `C:\...` as a remote host (`Cannot connect to C:`) and cannot
 *   read a `.zip`. Windows' own `System32\tar.exe` (bsdtar, in Windows 10 1803 and later) takes Windows paths and reads and writes both formats.
 *
 * @module scripts/lib/portable-commands
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * `execFileSync` for a command that may be a `.cmd` shim on Windows. There it runs through `cmd.exe` with each argument in double quotes, so a
 * path with spaces stays one argument; an argument that itself contains a double quote is refused, because `cmd.exe` cannot pass one through.
 * A bare command name (`npm`) is left unquoted: `cmd.exe` gives a quoted name it finds on the PATH the current folder as its own `%~dp0`, and
 * npm's shim then looks for npm there.
 * @param {string} command - the command name or path (`npm`, or an installed bin).
 * @param {readonly string[]} args - its arguments.
 * @param {import('node:child_process').ExecFileSyncOptions} [options] - passed to `execFileSync`.
 * @returns {string | Buffer} what `execFileSync` returns.
 */
export function execShim(command, args, options = {}) {
  if (process.platform !== 'win32') return execFileSync(command, args, options)
  const quote = (arg) => {
    if (arg.includes('"')) throw new Error(`portable-commands: cannot pass an argument with a double quote through cmd.exe: ${arg}`)
    return `"${arg}"`
  }
  const file = /^[\w.-]+$/u.test(command) ? command : quote(command)
  return execFileSync(file, args.map(quote), { ...options, shell: true })
}

/**
 * The tar to run: Windows' own bsdtar on Windows, the `tar` on the PATH elsewhere.
 * @returns {string} the command.
 */
export function tarCommand() {
  return process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
}
