/**
 * App instance: everything one running app owns on this machine, decided in one place and chosen once.
 *
 * Extracted from ACRYL (`runtime/acryl-harness-runtime/src/instance/`): a sealed compartment per app (Release It!'s bulkhead), built by
 * factories that always produce a consistent family (home, port, run lock), chosen once in `main.ts`. `selectInstance` is the only code
 * that reads the environment; every plugin reads the `appInstance` service instead.
 *
 * Pure apart from `selectInstance`, which reads the given environment object. Paths are built, never checked.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  AppInstanceError,
  appDataHome,
  appHomes,
  followFolder,
  migrateOldHome,
  moveChats,
  personHome,
} from './home.ts'

export { AppInstanceError, appDataHome, appHomes, followFolder, migrateOldHome, moveChats }

/** How the instance was chosen: from the project folder, a home the caller pinned, or an app of a desktop product's root (`storage.ts`). */
export type AppInstanceKind = 'project' | 'pinned' | 'product'

/** Where the app listens first, and whether it moves to the next free port when that one is taken. Port 0 means any free port. */
export interface PortPreference {
  readonly start: number
  readonly scan: boolean
}

export interface AppInstance {
  readonly kind: AppInstanceKind
  /** Unique on this machine: seeds the port. */
  readonly id: string
  /** Human name: the name the app was made with (its package.json), else the project folder's name. */
  readonly name: string
  /** The project folder: its code and its `node_modules`. */
  readonly root: string
  /** The app's own data: settings, installed extensions, the extension ledger. Never shared with another app. */
  readonly home: string
  /**
   * The host's engine home: where the engine keeps its own files, the logs included. ACRYL's plugins read it (the support download serves `dshHome/logs`);
   * in this host the engine and the app share one home, so it equals `home`.
   */
  readonly dshHome: string
  readonly port: PortPreference
  /** The interface to listen on. Absent means loopback only; a container sets `0.0.0.0` so its published port reaches the app. */
  readonly host?: string
  /** Records the one live process of this instance. */
  readonly runLockFile: string
}

export const RUN_LOCK_FILE = 'instance.json'
export const PORT_BASE = 3100
export const PORT_SPAN = 900
export const HOME_ENV = 'ACRYLBLENDS_HOME'
/**
 * The app's source folder, when the process runs from another folder: a desktop product's frame host runs the Program from the bundle on an app's
 * `source` (storage.ts), so its own location is not the app. Set by `instanceEnv`, never by hand.
 */
export const ROOT_ENV = 'ACRYLBLENDS_ROOT'
export const PORT_ENV = 'ACRYLBLENDS_PORT'
/** The app's name, for a process that runs from the bundle on the app's `source` folder: the folder's own name says nothing (`source`). Set by `instanceEnv`. */
export const NAME_ENV = 'ACRYLBLENDS_NAME'
export const HOST_ENV = 'ACRYLBLENDS_HOST'
/** The names hosting platforms set: used when `ACRYLBLENDS_PORT` and `ACRYLBLENDS_HOST` are not. */
export const PLATFORM_PORT_ENV = 'PORT'
export const PLATFORM_HOST_ENV = 'HOST'

/** FNV-1a over the id: stable across runs and platforms, spread over the app port range, so two apps rarely start on the same port. */
export function stablePort(id: string): number {
  let hash = 0x811c9dc5
  for (const character of id) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return PORT_BASE + (hash % PORT_SPAN)
}

const digest = (text: string, length: number) =>
  createHash('sha1').update(text).digest('hex').slice(0, length)
const plainName = (folder: string) =>
  basename(folder)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'app'

/** The name the app was made with (`init --name`, kept as package.json's name), or undefined when it has none. */
function declaredName(root: string): string | undefined {
  try {
    const name = (
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: unknown }
    ).name
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined
  } catch {
    return undefined
  }
}

function family(input: {
  kind: AppInstanceKind
  id: string
  name: string
  root: string
  home: string
  port: PortPreference
}): AppInstance {
  return Object.freeze({
    kind: input.kind,
    id: input.id,
    name: input.name,
    root: input.root,
    home: input.home,
    dshHome: input.home,
    port: Object.freeze({ ...input.port }),
    runLockFile: join(input.home, RUN_LOCK_FILE),
  })
}

/**
 * The default: a folder made by `acryl new`. Its code is the folder; its data is `~/.acryl/apps/<id>/data` (`home.ts`, the one place that says so), with the
 * id kept in the folder's own `.acryl/app.json`, so the data follows the app when the folder is moved and is not shared with a clone of it.
 * The first call on a folder writes that file, so the folder must exist and be writable; tests pass `env` with `ACRYL_HOME` and `HOME` pointing at a scratch folder.
 */
export function projectInstance(
  projectRoot: string,
  env: Readonly<Record<string, string | undefined>> = {},
  platform: NodeJS.Platform = process.platform,
): AppInstance {
  const root = resolve(projectRoot)
  const name = declaredName(root) ?? plainName(root)
  const folders = appHomes(root, platform, env, personHome(env, platform))
  // An app made before the data moved still has `<app>/.acrylblends`: it is moved once, here, at start. A move that fails stops the app with the old folder intact.
  const moved = migrateOldHome(root, folders.data)
  if (moved.status === 'moved')
    process.stderr.write(
      `acrylblends: moved this app's data to ${folders.data} (${String(moved.files)} files); the old folder is kept as ${moved.kept}\n`,
    )
  else if (moved.status === 'refused') process.stderr.write(`acrylblends: ${moved.reason}\n`)
  // The folder was moved or renamed since the last start: its chats (filed by the folder they work in) are brought along, once.
  // Never stops the app: chats that could not be attached are left as they were, and the app starts.
  try {
    const followed = followFolder(folders.data, root)
    if (
      followed !== undefined &&
      (followed.sessions || followed.workspaces > 0 || followed.branchChats)
    )
      process.stderr.write(
        `acrylblends: this app's folder moved, so its chats were attached to ${root}\n`,
      )
  } catch (cause) {
    process.stderr.write(
      `acrylblends: could not attach this app's chats to ${root}: ${cause instanceof Error ? cause.message : String(cause)}\n`,
    )
  }
  return family({
    kind: 'project',
    id: folders.id,
    name,
    root,
    home: folders.data,
    port: { start: stablePort(folders.id), scan: true },
  })
}

/**
 * A home the caller pinned (ACRYLBLENDS_HOME): honoured as given. Tests and second copies of an app use it to stay apart. `root` is the
 * project folder (where its packages are installed); it defaults to the current directory.
 */
export function pinnedInstance(
  home: string,
  options: { name?: string; root?: string } = {},
): AppInstance {
  const absolute = resolve(home)
  const root = resolve(options.root ?? process.cwd())
  const id = `pinned-${digest(absolute, 6)}`
  return family({
    kind: 'pinned',
    id,
    name: options.name ?? declaredName(root) ?? plainName(root),
    root,
    home: absolute,
    port: { start: stablePort(id), scan: true },
  })
}

/**
 * An app of a desktop product (`storage.ts`): its source is the project folder, its data the home (the engine's home too, so its logs land in
 * `data/logs`), and its id, the registry's, seeds the port. The name is the person's label for it.
 */
export function productInstance(
  folders: { readonly id: string; readonly source: string; readonly data: string },
  name: string,
): AppInstance {
  return family({
    kind: 'product',
    id: folders.id,
    name,
    root: folders.source,
    home: folders.data,
    port: { start: stablePort(folders.id), scan: true },
  })
}

/** The same family with an explicit start port. Port 0 asks the system for any free port. */
export function withPort(instance: AppInstance, start: number): AppInstance {
  if (!Number.isInteger(start) || start < 0 || start > 65_535) {
    throw new AppInstanceError(
      `the port must be 0 (any free port) or 1 to 65535, got ${String(start)}`,
    )
  }
  return Object.freeze({ ...instance, port: Object.freeze({ start, scan: start !== 0 }) })
}

/**
 * Choose the instance. The only place that reads the environment: `ACRYLBLENDS_ROOT` names the app's folder when the process runs from another one,
 * `ACRYLBLENDS_HOME` pins the home, `ACRYLBLENDS_PORT` sets the start port, `ACRYLBLENDS_HOST` the interface; hosting platforms set `PORT` and `HOST`
 * instead, and those are read when the `ACRYLBLENDS_` ones are not; otherwise the project folder decides.
 */
export function selectInstance(options: {
  projectRoot: string
  env?: Record<string, string | undefined>
}): AppInstance {
  const env = options.env ?? {}
  const projectRoot = env[ROOT_ENV]?.trim() || options.projectRoot
  const pinned = env[HOME_ENV]?.trim()
  return withRunEnv(
    pinned
      ? pinnedInstance(pinned, {
          name: env[NAME_ENV]?.trim() || declaredName(projectRoot) || plainName(projectRoot),
          root: projectRoot,
        })
      : projectInstance(projectRoot, env),
    env,
  )
}

/**
 * Where an instance listens, as the environment says, whichever way it was chosen (a desktop product's app too): `ACRYLBLENDS_PORT` (else a hosting
 * platform's `PORT`) the start port, `ACRYLBLENDS_HOST` (else `HOST`) the interface.
 */
export function withRunEnv(
  instance: AppInstance,
  env: Record<string, string | undefined> = {},
): AppInstance {
  let chosen = instance
  const port = env[PORT_ENV]?.trim() || env[PLATFORM_PORT_ENV]?.trim()
  if (port) chosen = withPort(chosen, Number(port))
  const host = env[HOST_ENV]?.trim() || env[PLATFORM_HOST_ENV]?.trim()
  if (host) chosen = Object.freeze({ ...chosen, host })
  return chosen
}

/**
 * What a child process started for this instance (the frame host) needs in its environment so that its own `selectInstance` chooses the same home and
 * the same start port, on the same app folder. The parent decides once; the child never derives a second answer from the folder it runs in.
 */
export function instanceEnv(instance: AppInstance): Record<string, string> {
  return {
    [ROOT_ENV]: instance.root,
    [NAME_ENV]: instance.name,
    [HOME_ENV]: instance.home,
    [PORT_ENV]: String(instance.port.start),
    ...(instance.host === undefined ? {} : { [HOST_ENV]: instance.host }),
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    appInstance: AppInstance
  }
}

/** Provides the chosen instance as the `appInstance` service. Mount it first, with the instance as its config. */
export const instance = {
  name: 'instance',
  apply(ctx: Context, chosen: AppInstance) {
    ctx.provide('appInstance', chosen)
  },
}
