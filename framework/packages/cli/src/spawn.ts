import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface Invocation {
  file: string
  args: string[]
}

/**
 * How to start a package manager without the shell option (Node warns about passing args to a shell, DEP0190, and a `.cmd` shim cannot be spawned directly).
 * Off Windows the command runs as it is. On Windows npm runs as `node npm-cli.js` (the one npm is running from, else the one beside `node`); any other
 * manager goes through `cmd.exe /d /s /c <name>.cmd`, whose arguments stay an array.
 */
export function packageManagerInvocation(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
  execPath: string = process.execPath,
): Invocation {
  if (platform !== 'win32') return { file: command, args: [...args] }
  if (command === 'npm') {
    const running = env.npm_execpath
    const cli =
      running !== undefined && /npm-cli\.c?js$/.test(running)
        ? running
        : join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (exists(cli)) return { file: execPath, args: [cli, ...args] }
  }
  return { file: env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', `${command}.cmd`, ...args] }
}
