/**
 * Starting a coding agent (`claude`, `codex`, `pi`) without a shell. Off Windows the program is spawned by name. On Windows an npm-installed CLI is a `.cmd` shim, which CreateProcess
 * cannot start, and a shell would pass the person's message through cmd.exe quoting (`& | < > ^ "` would run or break). So the shim is read: npm writes the script it runs
 * (`"%dp0%\node_modules\<package>\dist\cli.js"`), and that script is started with Node directly, as one process. A native `.exe` (the Windows installer of claude) is started as it is.
 */
import { existsSync, readFileSync } from 'node:fs'
import { win32 } from 'node:path'

export interface Launch {
  readonly file: string
  readonly args: string[]
}

export interface LaunchDeps {
  readonly platform?: NodeJS.Platform
  readonly env?: NodeJS.ProcessEnv
  readonly exists?: (path: string) => boolean
  readonly read?: (path: string) => string
  /** The Node that starts a shim's script (this process's). */
  readonly execPath?: string
}

/** The script an npm `.cmd` shim runs: the quoted path after `%dp0%\`, ending in .js, .cjs or .mjs. */
const SHIM_SCRIPT = /"%dp0%[\\/]([^"\r\n]+?\.(?:mjs|cjs|js))"/iu

/**
 * @returns how to start `program` with `args`, or a sentence saying why it cannot be started here. A program that is not found is also a sentence.
 */
export function resolveLaunch(
  program: string,
  args: readonly string[],
  deps: LaunchDeps = {},
): Launch | { readonly error: string } {
  const platform = deps.platform ?? process.platform
  if (platform !== 'win32') return { file: program, args: [...args] }
  const env = deps.env ?? process.env
  const exists = deps.exists ?? existsSync
  const read = deps.read ?? ((path: string) => readFileSync(path, 'utf8'))
  const execPath = deps.execPath ?? process.execPath
  const folders = (env.PATH ?? env.Path ?? '').split(';').filter(Boolean)
  for (const folder of folders) {
    for (const extension of ['.exe', '.com', '.cmd', '.bat']) {
      const found = win32.join(folder, `${program}${extension}`)
      if (!exists(found)) continue
      if (extension === '.exe' || extension === '.com') return { file: found, args: [...args] }
      let text: string
      try {
        text = read(found)
      } catch {
        return { error: `${program} is installed as ${found} but that file cannot be read` }
      }
      const script = SHIM_SCRIPT.exec(text)?.[1]
      if (script === undefined) {
        return {
          error: `${program} is installed as ${found}, a batch file the panel cannot start without a shell (a shell would pass the message through cmd.exe quoting). Install the native program, or an npm package that creates an npm shim`,
        }
      }
      const directory = win32.dirname(found)
      const node = win32.join(directory, 'node.exe')
      return {
        file: exists(node) ? node : execPath,
        args: [win32.join(directory, script), ...args],
      }
    }
  }
  return { error: `${program} was not found on the PATH` }
}
