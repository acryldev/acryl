/**
 * Where ACRYL keeps the apps of one person (specs/049-framework-architecture/app-storage.md in ACRYL): one short root, `~/.acryl`, the same on macOS,
 * Windows and Linux (as DeepSeek Harness keeps `~/.dsh`), and one sealed folder per app inside it.
 *
 *   <root>/layout.json             { "layout": 1, "writtenBy": "<who wrote it and its version>" }
 *   <root>/apps.json               the registry: id, name, created, last opened
 *   <root>/apps/<id>/source/       the person's work: a git repository
 *   <root>/apps/<id>/data/         their settings, sessions and notes; data/logs holds the logs (the engine writes `<home>/logs`)
 *   <root>/apps/<id>/cache/        build output: rebuilt on demand
 *   <root>/electron/               Chromium's own user data
 *   <root>/trash/                  an app that was started over, moved here, never deleted
 *
 * There is no per-OS rule: `acrylRoot` is `<home>/.acryl` everywhere, so what a person is told, types and finds is one thing. Nothing else in the product
 * reads the home folder or asks Electron for a path (scripts/lib/bulkhead.test.mjs). No file written here holds an absolute path: the root and the bundle can move.
 */
import {
  type Dirent,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { archiveName, exportArchive, importArchive } from './archive.ts'
import {
  APPS_DIR,
  AppInstanceError,
  acrylRoot,
  hasControlCharacter,
  isAppId,
  isPortableName,
  newAppId,
  pathOf,
  personHome,
} from './home.ts'
import { type AppInstance, productInstance } from './index.ts'

// The rule for where things are lives in home.ts; these are re-exported so the product code and its tests keep one import.
export { APPS_DIR, acrylRoot, isAppId, isPortableName, newAppId, personHome }

/** The layout this build writes and reads. A root with a lower one is migrated on open (a later slice); a higher one is refused. */
export const LAYOUT_VERSION = 1
export const LAYOUT_FILE = 'layout.json'
export const REGISTRY_FILE = 'apps.json'
export const TRASH_DIR = 'trash'
export const ELECTRON_DIR = 'electron'

/** One app's folders. `logs` is inside `data` because the engine writes its logs to `<home>/logs`. */
export interface ProductAppFolders {
  readonly id: string
  readonly source: string
  readonly data: string
  readonly cache: string
  readonly logs: string
}

/** The folders of app `id` under `root`, built, never checked. */
export function appFolders(
  root: string,
  id: string,
  platform: NodeJS.Platform = process.platform,
): ProductAppFolders {
  if (!isAppId(id)) throw new AppInstanceError(`"${id}" is not an app id`)
  const path = pathOf(platform)
  const folder = path.join(root, APPS_DIR, id)
  const data = path.join(folder, 'data')
  return Object.freeze({
    id,
    source: path.join(folder, 'source'),
    data,
    cache: path.join(folder, 'cache'),
    logs: path.join(data, 'logs'),
  })
}

/** One app in the registry. Dates are ISO strings; nothing here is a path. */
export interface RegisteredApp {
  readonly id: string
  readonly name: string
  readonly created: string
  readonly lastOpened?: string
  /** The person chose the name (named it on the first start, renamed it, or imported it under a file name); absent while it is the product's default. */
  readonly named?: true
}

/** What `openRoot` found: a root this build writes, or one written by a newer build (refused by the caller with the version it names). */
export type RootState =
  | { readonly kind: 'current' }
  | { readonly kind: 'older'; readonly layout: number }
  | { readonly kind: 'newer'; readonly layout: number; readonly writtenBy: string }

/** A JSON file written whole: to a sibling first, then renamed over, so a crash never leaves half a file. */
function writeJson(file: string, value: unknown): void {
  const next = `${file}.next`
  writeFileSync(next, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(next, file)
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown
}

/**
 * Open a product root, creating it on the first start: `layout.json` and an empty `apps.json`. A root written by a newer layout is reported, never
 * changed; an older one is reported for the migration runner. A layout file that is not this format stops with a message, never a guess.
 */
export function openRoot(root: string, writtenBy: string): RootState {
  const file = join(root, LAYOUT_FILE)
  if (!existsSync(file)) {
    mkdirSync(root, { recursive: true })
    writeJson(join(root, REGISTRY_FILE), { apps: [] })
    writeJson(file, { layout: LAYOUT_VERSION, writtenBy })
    return { kind: 'current' }
  }
  const value = readJson(file) as { layout?: unknown; writtenBy?: unknown }
  if (typeof value.layout !== 'number' || !Number.isInteger(value.layout) || value.layout < 1)
    throw new AppInstanceError(`${file} has no layout version; it was not written by this product`)
  if (value.layout > LAYOUT_VERSION)
    return {
      kind: 'newer',
      layout: value.layout,
      writtenBy: typeof value.writtenBy === 'string' ? value.writtenBy : 'a newer version',
    }
  if (value.layout < LAYOUT_VERSION) return { kind: 'older', layout: value.layout }
  return { kind: 'current' }
}

/** The apps the root holds, in the order they were made. */
export function listApps(root: string): RegisteredApp[] {
  const value = readJson(join(root, REGISTRY_FILE)) as { apps?: unknown }
  if (!Array.isArray(value.apps))
    throw new AppInstanceError(`${join(root, REGISTRY_FILE)} has no app list`)
  return value.apps.filter(
    (app): app is RegisteredApp =>
      app !== null &&
      typeof app === 'object' &&
      typeof (app as RegisteredApp).id === 'string' &&
      isAppId((app as RegisteredApp).id) &&
      typeof (app as RegisteredApp).name === 'string',
  )
}

/** One app's registry entry, or a message naming the root. */
function findApp(root: string, id: string): RegisteredApp {
  const found = listApps(root).find((app) => app.id === id)
  if (found === undefined) throw new AppInstanceError(`no app "${id}" in ${root}`)
  return found
}

function saveApps(root: string, apps: readonly RegisteredApp[]): void {
  writeJson(join(root, REGISTRY_FILE), { apps })
}

/** A name a person gave: trimmed, one line, not empty, 80 characters at most. It is a label only, so any script is fine. */
function checkedName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed.length > 80 || hasControlCharacter(trimmed))
    throw new AppInstanceError('an app name is one line of 1 to 80 characters')
  return trimmed
}

/**
 * Make a new app: its id, its four folders, its registry entry. Returns the entry. `seed` fills the new, empty source folder (the product's starting
 * app); the entry is written only after it succeeded, and a failed seed removes the folder it was given, so the registry never names a half-made app.
 */
export function createApp(
  root: string,
  name: string,
  options: {
    now?: () => Date
    random?: () => string
    seed?: (folders: ProductAppFolders) => void
    /** The person chose this name (an import, a fresh start of a named app). */
    named?: boolean
  } = {},
): RegisteredApp {
  const label = checkedName(name)
  const apps = listApps(root)
  const taken = new Set(apps.map((app) => app.id))
  let id = newAppId(label, options.random)
  for (let attempt = 0; taken.has(id) || existsSync(join(root, APPS_DIR, id)); attempt += 1) {
    if (attempt > 16) throw new AppInstanceError(`no free id for "${label}"`)
    id = newAppId(label)
  }
  const folders = appFolders(root, id)
  for (const folder of [folders.source, folders.logs, folders.cache])
    mkdirSync(folder, { recursive: true })
  if (options.seed !== undefined) {
    try {
      options.seed(folders)
    } catch (cause) {
      // The folder was made by this call a moment ago and holds nothing of the person's.
      rmSync(join(root, APPS_DIR, id), { recursive: true, force: true })
      throw cause
    }
  }
  const entry: RegisteredApp = {
    id,
    name: label,
    created: (options.now?.() ?? new Date()).toISOString(),
    ...(options.named === true ? { named: true as const } : {}),
  }
  saveApps(root, [...apps, entry])
  return entry
}

/** Give an app a new name; from then on it is the person's name for it. The folder keeps its id. */
export function renameApp(root: string, id: string, name: string): RegisteredApp {
  const label = checkedName(name)
  const apps = listApps(root)
  const found = findApp(root, id)
  const renamed: RegisteredApp = { ...found, name: label, named: true }
  saveApps(
    root,
    apps.map((app) => (app.id === id ? renamed : app)),
  )
  return renamed
}

/** Record that an app was opened now. */
export function touchApp(root: string, id: string, now: () => Date = () => new Date()): void {
  const apps = listApps(root)
  if (!apps.some((app) => app.id === id)) throw new AppInstanceError(`no app "${id}" in ${root}`)
  saveApps(
    root,
    apps.map((app) => (app.id === id ? { ...app, lastOpened: now().toISOString() } : app)),
  )
}

/** What an app's folder holds: its bytes (the files' own sizes, links not followed) and its files. */
export interface AppSize {
  readonly bytes: number
  readonly files: number
}

/** The size of everything under `folder`, read without blocking: an app with packages of its own has many files. */
export async function folderSize(folder: string): Promise<AppSize> {
  let bytes = 0
  let files = 0
  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else {
        try {
          bytes += (await lstat(path)).size
          files += 1
        } catch {
          // Gone while it was read (a log rotated): not counted.
        }
      }
    }
  }
  await walk(folder)
  return { bytes, files }
}

/** A trash folder's name for app `id` moved at `now`: the id and the time, so the same app started over twice keeps both. */
function trashName(id: string, now: Date): string {
  return `${id}-${now.toISOString().replace(/[:.]/gu, '-')}`
}

/**
 * Start app `id` over: a fresh app with the same name is made first (seeded as the first start is), then the old one leaves the registry and its folder
 * moves to `trash/` with a note of its name, never deleted. In that order a crash never loses the person's work: at worst an extra app, or an old
 * folder left in `apps/` that no entry names. The caller stops everything that runs on the old app's folders first.
 */
export function resetApp(
  root: string,
  id: string,
  seed: (folders: ProductAppFolders) => void,
  now: () => Date = () => new Date(),
): RegisteredApp {
  const old = findApp(root, id)
  const fresh = createApp(root, old.name, { seed, now, named: old.named === true })
  saveApps(
    root,
    listApps(root).filter((app) => app.id !== id),
  )
  const at = now()
  const trash = join(root, TRASH_DIR, trashName(id, at))
  mkdirSync(join(root, TRASH_DIR), { recursive: true })
  renameSync(join(root, APPS_DIR, id), trash)
  writeJson(join(trash, 'trashed.json'), {
    id,
    name: old.name,
    created: old.created,
    trashed: at.toISOString(),
  })
  return fresh
}

/**
 * The port a desktop product keeps its apps through (app-storage.md: one port, the per-OS rule in one adapter at the edge). Callers name an app by its
 * id and get an `AppInstance` back; they never join a path. The frame's Settings > App page reaches it through the desktop shell.
 */
export interface AppStorage {
  /** Chromium's own user data for the product's windows (window state, its cache): one folder per product, beside the apps. */
  readonly electron: string
  /** The apps the product holds, in the order they were made. */
  apps(): RegisteredApp[]
  /** The app opened last, else the one made last, or undefined while the product holds none. */
  last(): RegisteredApp | undefined
  /** Make an app named `name`; `seed` fills its empty source folder (the product's starting app). */
  create(name: string, seed: (source: string) => void): RegisteredApp
  /** Open app `id`: it is recorded as opened now, and its instance is returned (source the project root, data its home and the engine's). */
  open(id: string): AppInstance
  /** One app's entry. */
  app(id: string): RegisteredApp
  /** Give app `id` the person's name for it. */
  rename(id: string, name: string): RegisteredApp
  /** What app `id`'s folder holds. */
  size(id: string): Promise<AppSize>
  /** Show app `id`'s folder in the OS file manager (Finder, Explorer, Files). */
  reveal(id: string): void
  /** Write app `id` to `file` as one `.acrylblend`: its source with every version, and its data when `data` is set (never its keys or logs). */
  export(id: string, file: string, options: { readonly data: boolean }): void
  /** Make a new app from an `.acrylblend`, named after the file. Nothing is written when the file is not an archive. */
  import(file: string): RegisteredApp
  /** Start app `id` over: a fresh app of the same name, seeded by `seed`, and the old one moved to `trash/`. Stop what runs on it first. */
  reset(id: string, seed: (source: string) => void): RegisteredApp
}

/** A root written by a newer layout, which this build cannot read: the message names the version that wrote it. */
export class NewerLayoutError extends AppInstanceError {
  override name = 'NewerLayoutError'
}

/**
 * The filesystem adapter of `AppStorage`: the root `~/.acryl` (`acrylRoot`), opened (created on the first start) and
 * checked before anything is read. A root of a newer layout stops with a message, never a half-read start; the layout is 1, so an older one cannot exist
 * yet (the migration runner comes with layout 2).
 */
export function openProductStorage(options: {
  /** Who writes the root and its version (`ACRYL Blends 1.5.0`), written into a new root's layout.json and named when a newer one is found. */
  readonly writtenBy: string
  readonly platform?: NodeJS.Platform
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly home?: string
  /** The git executable exports and imports run: the product's own, else `git` on the PATH. */
  readonly git?: string
  /** The OS file manager, showing one folder (Electron's `shell.showItemInFolder` in the product). */
  readonly reveal?: (path: string) => void
}): AppStorage {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const root = acrylRoot(platform, env, options.home ?? personHome(env, platform))
  const git = options.git ?? 'git'
  const state = openRoot(root, options.writtenBy)
  if (state.kind !== 'current')
    throw new NewerLayoutError(
      state.kind === 'newer'
        ? `${root} was written by ${state.writtenBy}, which is newer than this one (${options.writtenBy}): install that version or a later one to open it`
        : `${root} has layout ${String(state.layout)}, which this version cannot migrate`,
    )
  const opened = (app: RegisteredApp): string => app.lastOpened ?? app.created
  return {
    electron: join(root, ELECTRON_DIR),
    apps: () => listApps(root),
    last: () =>
      listApps(root).reduce<RegisteredApp | undefined>(
        (latest, app) => (latest === undefined || opened(app) >= opened(latest) ? app : latest),
        undefined,
      ),
    create: (name, seed) => createApp(root, name, { seed: (folders) => seed(folders.source) }),
    open(id) {
      const app = findApp(root, id)
      touchApp(root, id)
      return productInstance(appFolders(root, id, platform), app.name)
    },
    app: (id) => findApp(root, id),
    rename: (id, name) => renameApp(root, id, name),
    size: (id) => folderSize(join(root, APPS_DIR, findApp(root, id).id)),
    reveal(id) {
      if (options.reveal === undefined)
        throw new AppInstanceError('this product cannot show a folder')
      options.reveal(join(root, APPS_DIR, findApp(root, id).id))
    },
    export(id, file, { data }) {
      const folders = appFolders(root, findApp(root, id).id, platform)
      exportArchive({
        git,
        source: folders.source,
        ...(data ? { data: folders.data } : {}),
        cache: folders.cache,
        file,
      })
    },
    import: (file) =>
      createApp(root, archiveName(file) || 'Imported app', {
        named: true,
        seed: (folders) => {
          importArchive({
            git,
            file,
            source: folders.source,
            data: folders.data,
            cache: folders.cache,
          })
        },
      }),
    reset: (id, seed) => resetApp(root, id, (folders) => seed(folders.source)),
  }
}
