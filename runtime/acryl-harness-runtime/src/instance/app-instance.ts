/**
 * AppInstance: everything one running ACRYL app owns on this machine, as one consistent family (spec 036, "Self-containment").
 *
 * Patterns, by the books in the repo's engineering rules:
 * - **Bulkhead** (Release It!): each app is a sealed compartment; nothing it owns is reachable from another app.
 * - **Abstract Factory** (refactoring.guru): the factories below produce a whole family of resources (home, engine home, port, Electron user data, run lock,
 *   project scope) that always belong together; a caller cannot mix one app's home with another app's port.
 * - **Deep module / information hiding** (A Philosophy of Software Design): "where an app keeps things" is decided here and nowhere else.
 * - The instance is chosen once, in the composition root (Clean Architecture's Main), by `select.ts`, the only code that reads the environment or the OS home.
 *
 * Pure: no I/O. Paths are built, never checked; `select.ts` does the few filesystem checks that choose a factory.
 *
 * @module acryl-harness-runtime/instance/app-instance
 */

import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'

/** How the instance was chosen. Only `default` may use the shared `~/.acryl`. */
export type AppInstanceKind = 'default' | 'development' | 'worktree' | 'app' | 'managed' | 'pinned'

export interface AppInstance {
  readonly kind: AppInstanceKind
  /** Unique on this machine: it seeds the port, names the Electron user data and namespaces project folders. */
  readonly id: string
  /** Human name (the folder name for an app). */
  readonly name: string
  /** The ACRYL home: settings, sessions, profiles (under `dshHome`), global extensions, runtime state. */
  readonly home: string
  /** The DSH engine home the pinned harness reads (`DSH_HOME`). */
  readonly dshHome: string
  /** First Web port to try, and whether to move to the next free one when it is taken. */
  readonly webPort: { readonly start: number, readonly scan: boolean }
  /** Electron's product and user-data folder name: separates window state, storage and the single-instance lock. */
  readonly userDataName: string
  /** Namespace for folders this app writes inside a project it opens; undefined keeps the classic shared locations. */
  readonly projectScope?: string
  /** The app definition (`blend.yaml`) when this is an app folder. */
  readonly definitionFile?: string
  /** The pessimistic offline lock that makes one live process per instance. */
  readonly runLockFile: string
}

export const DEFAULT_WEB_PORT = 3080
export const WORKTREE_WEB_PORT = 3081
export const APP_PORT_BASE = 3100
export const APP_PORT_SPAN = 900
export const APP_DEFINITION_FILE = 'blend.yaml'
export const RUN_LOCK_FILE = 'instance.json'
export const ENGINE_DIR_NAME = '.dsh'
export const DEFAULT_HOME_DIR_NAME = '.acryl'
export const DEVELOPMENT_HOME_DIR_NAME = '.acryl-dev'
export const WORKTREE_HOMES_DIR_NAME = '.acryl-worktrees'
export const MANAGED_HOMES_DIR_NAME = '.acryl-instances'

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
/** A project-scope id (the extension pack validates the same shape before building a path from it). */
export const PROJECT_SCOPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
export const PROJECT_SCOPE_MAX = 64

export class AppInstanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppInstanceError'
  }
}

/** A plain app name: lowercase letters, digits and dashes, at most 32. It becomes a folder, an app name and a port seed. */
export function appName(value: unknown): string {
  if (typeof value !== 'string' || !NAME.test(value) || value.length > 32) throw new AppInstanceError(`an app name is lowercase letters, digits and dashes (at most 32), got ${JSON.stringify(value)}`)
  return value
}

/** FNV-1a over the id: stable across runs and platforms, spreads ids over the app port range. */
export function stablePort(id: string): number {
  let hash = 0x811c9dc5
  for (const character of id) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return APP_PORT_BASE + (hash % APP_PORT_SPAN)
}

function family(input: {
  kind: AppInstanceKind
  id: string
  name: string
  home: string
  dshHome?: string
  webPort: AppInstance['webPort']
  userDataName: string
  projectScope?: string
  definitionFile?: string
}): AppInstance {
  return Object.freeze({
    kind: input.kind,
    id: input.id,
    name: input.name,
    home: input.home,
    dshHome: input.dshHome ?? join(input.home, ENGINE_DIR_NAME),
    webPort: Object.freeze({ ...input.webPort }),
    userDataName: input.userDataName,
    ...(input.projectScope === undefined ? {} : { projectScope: input.projectScope }),
    ...(input.definitionFile === undefined ? {} : { definitionFile: input.definitionFile }),
    runLockFile: join(input.home, RUN_LOCK_FILE),
  })
}

/** Plain ACRYL, nothing configured: the one instance allowed to use the shared `~/.acryl`. */
export function defaultInstance(osHome: string): AppInstance {
  return family({ kind: 'default', id: 'acryl', name: 'acryl', home: join(osHome, DEFAULT_HOME_DIR_NAME), webPort: { start: DEFAULT_WEB_PORT, scan: false }, userDataName: 'ACRYL' })
}

/** The isolated local development app of the main checkout (`pnpm run dev`). */
export function developmentInstance(osHome: string): AppInstance {
  return family({ kind: 'development', id: 'acryl-dev', name: 'acryl-dev', home: join(osHome, DEVELOPMENT_HOME_DIR_NAME), webPort: { start: DEFAULT_WEB_PORT, scan: true }, userDataName: 'ACRYL Development' })
}

/** A second checkout (a git worktree): never the main checkout's home, port or Electron app. */
export function worktreeInstance(osHome: string, checkoutRoot: string): AppInstance {
  const folder = basename(checkoutRoot).replace(/[^A-Za-z0-9._-]+/gu, '-')
  const scope = `worktree-${folder.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')}`.slice(0, PROJECT_SCOPE_MAX).replace(/-+$/u, '')
  return family({ kind: 'worktree', id: scope, name: folder, home: join(osHome, WORKTREE_HOMES_DIR_NAME, folder), webPort: { start: WORKTREE_WEB_PORT, scan: true }, userDataName: `ACRYL Development ${folder}`, projectScope: scope })
}

/**
 * An app folder (`acryl new`): the folder is the home. Two folders may share a name, so a folder's id carries a short digest of its real path; a managed app
 * (kept under `~/.acryl-instances/<name>`) is unique by name.
 */
export function appFolderInstance(realFolder: string, managed: boolean): AppInstance {
  const name = appName(basename(realFolder))
  const id = managed ? name : `${name}-${createHash('sha1').update(realFolder).digest('hex').slice(0, 4)}`
  return family({ kind: managed ? 'managed' : 'app', id, name, home: realFolder, webPort: { start: stablePort(id), scan: true }, userDataName: `ACRYL ${id}`, projectScope: id, definitionFile: join(realFolder, APP_DEFINITION_FILE) })
}

/** A home a caller pinned explicitly (ACRYL_HOME without an app definition, or a legacy DSH_HOME): honoured as given. */
export function pinnedInstance(home: string, dshHome?: string): AppInstance {
  const name = basename(home).replace(/^\.+/u, '') || 'acryl'
  return family({ kind: 'pinned', id: `pinned-${createHash('sha1').update(home).digest('hex').slice(0, 6)}`, name, home, ...(dshHome === undefined ? {} : { dshHome }), webPort: { start: DEFAULT_WEB_PORT, scan: false }, userDataName: 'ACRYL' })
}

/** The same family with an explicit port preference (ACRYL_WEB_PORT). Explicit always scans: the caller asked for a start, not a fight. */
export function withWebPort(instance: AppInstance, start: number): AppInstance {
  if (!Number.isInteger(start) || start < 1024 || start > 65_535) throw new AppInstanceError(`the web port must be a port number from 1024 to 65535, got ${String(start)}`)
  return Object.freeze({ ...instance, webPort: Object.freeze({ start, scan: true }) })
}

/** A project-scope override (ACRYL_INSTANCE) for a pinned home. */
export function withProjectScope(instance: AppInstance, scope: string): AppInstance {
  if (!PROJECT_SCOPE.test(scope) || scope.length > PROJECT_SCOPE_MAX) throw new AppInstanceError(`a project scope is lowercase letters, digits and dashes (at most ${String(PROJECT_SCOPE_MAX)}), got ${JSON.stringify(scope)}`)
  return Object.freeze({ ...instance, projectScope: scope })
}

/**
 * The environment contract that hands an instance to a child process or to the pinned harness. It is the ONLY way an instance crosses a process
 * boundary: the child's `select.ts` reads these exact values back into the same family.
 */
export function instanceEnvironment(instance: AppInstance): Record<string, string> {
  // The default instance is what a child derives with nothing set, so it adds nothing (and never pins the shared home by accident).
  if (instance.kind === 'default') return {}
  // A home pinned only through a legacy DSH_HOME round-trips as DSH_HOME alone: an ACRYL_HOME would outrank it and nest a different engine home.
  const engineOnly = instance.kind === 'pinned' && instance.dshHome !== join(instance.home, ENGINE_DIR_NAME)
  return {
    ...(engineOnly ? {} : { ACRYL_HOME: instance.home }),
    DSH_HOME: instance.dshHome,
    ...(instance.webPort.scan ? { ACRYL_WEB_PORT: String(instance.webPort.start) } : {}),
    ACRYL_LOCAL_PRODUCT_NAME: instance.userDataName,
    ...(instance.projectScope === undefined ? {} : { ACRYL_INSTANCE: instance.projectScope }),
  }
}

export function profileDir(instance: AppInstance, profileName: string): string {
  return join(instance.dshHome, 'profiles', profileName)
}

const USER_DATA_NAME = /^[A-Za-z0-9.][A-Za-z0-9._ -]{0,63}$/u

/** The Electron user-data name (ACRYL_LOCAL_PRODUCT_NAME): a plain folder name, never a path, so it cannot escape the user-data root. */
export function withUserDataName(instance: AppInstance, name: string): AppInstance {
  if (!USER_DATA_NAME.test(name) || name.includes('..')) throw new AppInstanceError(`the Electron user-data name must be a plain folder name, got ${JSON.stringify(name)}`)
  return Object.freeze({ ...instance, userDataName: name })
}
