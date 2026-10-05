/**
 * The composition-root selector: the ONLY code in ACRYL that reads the environment or the OS home to decide where an app lives (a test enforces it).
 * Everything else receives an `AppInstance`, or reads it from the `appInstance` Cordis service.
 *
 * Precedence, highest first:
 *   ACRYL_HOME with a `blend.yaml`   an app folder (managed when it sits in ~/.acryl-instances)
 *   ACRYL_HOME                       a pinned home
 *   DSH_HOME (legacy)                a pinned engine home; the ACRYL home is its parent when it is named `.dsh`
 *   checkout is a git worktree       the worktree's own home
 *   development requested            ~/.acryl-dev (the main checkout's `pnpm run dev`)
 *   nothing                          the default ~/.acryl
 * then ACRYL_WEB_PORT (explicit start port), ACRYL_INSTANCE (explicit project scope) and ACRYL_LOCAL_PRODUCT_NAME (Electron user data) refine the
 * chosen family: they are how `instanceEnvironment` hands a family to a child process.
 *
 * @module acryl-harness-runtime/instance/select
 */

import { existsSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import {
  APP_DEFINITION_FILE,
  DEFAULT_HOME_DIR_NAME,
  DEVELOPMENT_HOME_DIR_NAME,
  ENGINE_DIR_NAME,
  MANAGED_HOMES_DIR_NAME,
  WORKTREE_HOMES_DIR_NAME,
  appFolderInstance,
  appName,
  defaultInstance,
  developmentInstance,
  pinnedInstance,
  withProjectScope,
  withUserDataName,
  withWebPort,
  worktreeInstance,
  type AppInstance,
} from './app-instance.ts'

export interface SelectInstanceOptions {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly osHome?: string
  /** The checkout a development launcher runs from; a git worktree gets its own instance. */
  readonly checkout?: string
  /** The main checkout's isolated development app (`pnpm run dev`) rather than the default. */
  readonly development?: boolean
}

/**
 * Set by a gate, a smoke or a live-run launcher: this process tree must run in an explicitly isolated home. With it set, `selectInstance` refuses (fails
 * closed) to choose a home that is not pinned by the caller or that lies inside a real ACRYL or DSH home of the OS user, so a forgotten override ends in an
 * error naming the fix, never in a write to the installed app's data.
 */
export const REQUIRE_ISOLATED_HOME_ENV = 'ACRYL_REQUIRE_ISOLATED_HOME'

export class IsolationRequiredError extends Error {
  constructor(detail: string) {
    super(`${REQUIRE_ISOLATED_HOME_ENV} is set, so this run needs an explicitly isolated home: ${detail}. Pin ACRYL_HOME (and DSH_HOME) to a throwaway folder outside the OS user's real ACRYL and DSH homes.`)
    this.name = 'IsolationRequiredError'
  }
}

const REAL_HOME_FOLDERS = [DEFAULT_HOME_DIR_NAME, DEVELOPMENT_HOME_DIR_NAME, WORKTREE_HOMES_DIR_NAME, MANAGED_HOMES_DIR_NAME, ENGINE_DIR_NAME]

const inside = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`) || path.startsWith(`${folder}\\`)

function assertIsolated(instance: AppInstance, osHome: string): void {
  if (instance.kind !== 'pinned' && instance.kind !== 'app') throw new IsolationRequiredError(`the ${instance.kind} instance would use ${instance.home}`)
  const realHomes = REAL_HOME_FOLDERS.map(folder => real(join(osHome, folder)))
  for (const [label, path] of [['home', instance.home], ['engine home', instance.dshHome]] as const) {
    const resolved = real(path)
    const hit = realHomes.find(folder => inside(resolved, folder))
    if (hit !== undefined) throw new IsolationRequiredError(`the ${label} ${resolved} lies inside the real ${hit}`)
  }
}

const set = (value: string | undefined): value is string => value !== undefined && value.trim() !== ''

function real(path: string): string {
  try { return realpathSync(path) } catch { return resolve(path) }
}

/** Is this checkout a git worktree (its `.git` is a file pointing at the main repository)? */
export function isGitWorktree(checkoutRoot: string): boolean {
  const git = join(checkoutRoot, '.git')
  return existsSync(git) && statSync(git).isFile()
}

/** The OS user's home directory: exported only so the dev launchers need not read it themselves. */
export function osHomeDirectory(): string {
  return homedir()
}

/** An app folder given by path (`bin/acryl`, `--dir`), whether or not it is the environment's choice. */
export function appFolder(folder: string, osHome: string = homedir()): AppInstance {
  const root = real(folder)
  const managedRoot = real(join(osHome, MANAGED_HOMES_DIR_NAME))
  return appFolderInstance(root, dirname(root) === managedRoot)
}

/** A managed app by name: `~/.acryl-instances/<name>`. */
export function managedApp(name: string, osHome: string = homedir()): AppInstance {
  // Validate before building a path: a name such as `../x` must never reach outside the managed root.
  return appFolderInstance(join(osHome, MANAGED_HOMES_DIR_NAME, appName(name)), true)
}

export function selectInstance(options: SelectInstanceOptions = {}): AppInstance {
  const env = options.env ?? process.env
  const osHome = options.osHome ?? homedir()
  let chosen: AppInstance
  if (set(env.ACRYL_HOME)) {
    const home = resolve(env.ACRYL_HOME.trim())
    chosen = existsSync(join(home, APP_DEFINITION_FILE)) ? appFolder(home, osHome) : pinnedInstance(home)
  } else if (set(env.DSH_HOME)) {
    const dshHome = resolve(env.DSH_HOME.trim())
    chosen = pinnedInstance(basename(dshHome) === ENGINE_DIR_NAME ? dirname(dshHome) : dshHome, dshHome)
  } else if (options.checkout !== undefined && isGitWorktree(options.checkout)) {
    chosen = worktreeInstance(osHome, options.checkout)
  } else if (options.development === true) {
    chosen = developmentInstance(osHome)
  } else {
    chosen = defaultInstance(osHome)
  }
  if (set(env.ACRYL_WEB_PORT)) chosen = withWebPort(chosen, Number(env.ACRYL_WEB_PORT.trim()))
  if (set(env.ACRYL_INSTANCE) && chosen.kind === 'pinned') chosen = withProjectScope(chosen, env.ACRYL_INSTANCE.trim())
  if (set(env.ACRYL_LOCAL_PRODUCT_NAME)) chosen = withUserDataName(chosen, env.ACRYL_LOCAL_PRODUCT_NAME.trim())
  if (set(env[REQUIRE_ISOLATED_HOME_ENV])) assertIsolated(chosen, osHome)
  return chosen
}
