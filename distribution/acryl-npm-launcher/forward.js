// The short commands of `acryl`: each runs a part that already exists, with the same flags, and no `--` in front of them.
//
//   acryl new <name> [starter]    makes an app: create-acrylblends (the app, in the frame, installed and started)
//   acryl plugin <verb> ...       inside an app: the app's own door (publish, pull, ...); `plugins` means the same
//   acryl blends <command> ...    the acrylblends command (add, upgrade, open, preflight, ...)
//   acryl update                  acrylblends upgrade, in the app
//
// The functions here only decide what to run; bin.js runs it. Nothing here touches the network or the disk except `existsSync` of the door file.
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/** The commands this module answers. `acryl` with anything else keeps its old meaning. */
export const FORWARDED = ['new', 'create', 'plugin', 'plugins', 'blends', 'update']

/** The package `acryl new` runs. `ACRYL_CREATE` pins another (a version, a tarball) without a new flag. */
export const CREATE_SPEC = 'create-acrylblends@latest'
export const BLENDS_SPEC = 'acrylblends'

/** The door of an app: the same file the app's `npm run acryl` runs. */
export const DOOR = join('plugins', 'acryl-door', 'src', 'cli', 'acryl.ts')

/**
 * The npm that runs a package from the registry (or a local one): the npm that started this process when there is one (npx sets npm_execpath), so no shell
 * is needed and the same npm is used; else `npm` (`npm.cmd` through the shell on Windows, as every .cmd must be).
 */
export function npmExec({ env, platform, execPath }, spec, rest) {
  const cli = env.npm_execpath
  const args = ['exec', '--yes', spec, '--', ...rest]
  if (cli && /npm-cli\.c?js$/u.test(basename(cli))) return { command: execPath, args: [cli, ...args] }
  return platform === 'win32'
    ? { command: 'npm.cmd', args, shell: true }
    : { command: 'npm', args }
}

/** The app folder that holds this directory: the nearest parent with the door file. */
export function appRoot(from, exists = existsSync) {
  let dir = resolve(from)
  for (;;) {
    if (exists(join(dir, DOOR))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * What a forwarded command runs: `{ command, args, cwd?, shell? }`, or `{ error }` with a line a person can act on. Returns undefined for a command this
 * module does not forward.
 */
export function forwardCommand(argv, context) {
  const [command, ...rest] = argv
  if (!FORWARDED.includes(command)) return undefined
  const { env, cwd } = context
  if (command === 'new' || command === 'create')
    return npmExec(context, env.ACRYL_CREATE?.trim() || CREATE_SPEC, rest)
  if (command === 'blends') return npmExec(context, BLENDS_SPEC, rest)
  if (command === 'update') return npmExec(context, BLENDS_SPEC, ['upgrade', ...rest])
  // plugin | plugins: the door of the app this directory is in.
  const root = appRoot(cwd, context.exists)
  if (root === undefined)
    return {
      error: `acryl ${command} works inside an app folder (the one acryl new made): cd into it first`,
    }
  if (rest.length === 0)
    return { error: `acryl ${command} needs what to do, for example: acryl plugin publish my-plugin` }
  return { command: context.execPath, args: [join(root, DOOR), 'plugin', ...rest], cwd: root }
}
