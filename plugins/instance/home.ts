/**
 * Where an app's data lives, decided in this one file (specs/049-framework-architecture/app-storage.md, task T026).
 *
 * The root is `~/.acryl` on every OS (`acrylRoot`). An app's data is `~/.acryl/apps/<id>/data/`, whether the app is installed (its source is in
 * `apps/<id>/source/`) or is a folder made by `acryl new` (its source is that folder). The id of a folder app is written once into
 * `<app>/.acryl/app.json`, which is git-ignored: a moved folder keeps its id and so its data, and a git clone has none, so it gets its own.
 *
 * Nothing else computes this: the plugin, the generated host and the CLI import it. `scripts/lib/bulkhead.test.mjs` fails when another file does.
 * Only `node:` modules are imported here, so the CLI can bundle this file and an app can carry it.
 */
import { randomBytes } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, posix, resolve, win32 } from 'node:path'

export class AppInstanceError extends Error {
  override name = 'AppInstanceError'
}

export const APPS_DIR = 'apps'
/** The app folder's own state (the door's address file, the app id). Git-ignored by every template. */
export const APP_STATE_DIR = '.acryl'
export const APP_ID_FILE = 'app.json'
/** Where an app made before T026 kept its data, beside its code. */
export const OLD_HOME_DIR = '.acrylblends'

type Env = Readonly<Record<string, string | undefined>>

/** The person's home folder: the one place the product asks the OS for it. `HOME` (or `USERPROFILE` on Windows) wins, so an isolated run moves it. */
export function personHome(
  env: Env = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const fromEnv = (platform === 'win32' ? env.USERPROFILE : env.HOME)?.trim()
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : homedir()
}

/** The path module of a platform, so a root computed for Windows on a Mac is a Windows path. */
export const pathOf = (platform: NodeJS.Platform) => (platform === 'win32' ? win32 : posix)

/**
 * The root of everything ACRYL keeps for one person: `<home>/.acryl`, one short, predictable folder on every OS, as DeepSeek Harness keeps `<home>/.dsh`.
 * It is deliberately not the OS's application-data folder (Library/Application Support, AppData, .local/share): those differ per OS, hide the work, and
 * are not what a person types or finds. `ACRYL_HOME`, when it is an absolute path, moves the root (an isolated run, a test), as it moves ACRYL's own home.
 */
export function acrylRoot(platform: NodeJS.Platform, env: Env, home: string): string {
  const path = pathOf(platform)
  const pinned = env.ACRYL_HOME?.trim()
  return pinned !== undefined && path.isAbsolute(pinned)
    ? path.normalize(pinned)
    : path.join(home, '.acryl')
}

/** Windows refuses these as a file or folder name, whatever the case and whatever follows a dot. */
const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\..*)?$/iu

/** A control character (U+0000 to U+001F): never in a file name on Windows, never in a one-line label. */
export const hasControlCharacter = (text: string): boolean =>
  [...text].some((character) => (character.codePointAt(0) ?? 0) < 0x20)

/** A name every OS accepts as one path segment: no separators or characters Windows forbids, no trailing dot or space, not reserved, not too long. */
export function isPortableName(name: string, maxLength: number): boolean {
  return (
    name.length > 0 &&
    name.length <= maxLength &&
    name.trim() === name &&
    !name.endsWith('.') &&
    !/[<>:"/\\|?*]/u.test(name) &&
    !hasControlCharacter(name) &&
    !RESERVED.test(name)
  )
}

/** An app id: lower-case ASCII letters, digits and single dashes, 40 characters at most, never reserved. Compared as is (always lower-case). */
export function isAppId(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) && isPortableName(id, 40)
}

/**
 * A new app's id: the name, folded to ASCII lower-case and dashes, cut to 30 characters, then 4 random hex digits (`my-notes-3f2a`). The name stays a label;
 * renaming the app never moves its folder.
 */
export function newAppId(
  name: string,
  random: () => string = () => randomBytes(2).toString('hex'),
): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .slice(0, 30)
      .replace(/^-+|-+$/gu, '') || 'app'
  const id = `${base}-${random()}`
  if (!isAppId(id))
    throw new AppInstanceError(`could not make an app id from "${name}" (got "${id}")`)
  return id
}

/** The id of an app folder, when it has one: `<app>/.acryl/app.json` holding `{ "id": "<id>" }` with a valid id. Never creates anything. */
export function readAppId(appRoot: string): string | undefined {
  try {
    const id = (
      JSON.parse(readFileSync(join(appRoot, APP_STATE_DIR, APP_ID_FILE), 'utf8')) as {
        id?: unknown
      }
    ).id
    return typeof id === 'string' && isAppId(id) ? id : undefined
  } catch {
    return undefined
  }
}

/**
 * The id of an app folder: the one in `.acryl/app.json`, else a new one (the folder's name and four hex digits) written there. Two processes starting a
 * fresh folder at once end with the same id: the file is created exclusively and the loser reads the winner's.
 */
export function appIdOf(appRoot: string, random?: () => string): string {
  const existing = readAppId(appRoot)
  if (existing !== undefined) return existing
  const id = newAppId(basename(resolve(appRoot)), random)
  const folder = join(appRoot, APP_STATE_DIR)
  try {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, APP_ID_FILE), `${JSON.stringify({ id }, null, 2)}\n`, { flag: 'wx' })
    return id
  } catch (cause) {
    const raced = readAppId(appRoot)
    if (raced !== undefined) return raced
    throw new AppInstanceError(
      `cannot write the app's id into ${folder}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

/** The folders an app keeps under the root: its data, and what can be rebuilt (`cache`, Chromium's files). Built, never checked. */
export interface AppHomes {
  readonly id: string
  readonly data: string
  readonly cache: string
}

export function appHomesOf(id: string, root: string, platform: NodeJS.Platform): AppHomes {
  if (!isAppId(id)) throw new AppInstanceError(`"${id}" is not an app id`)
  const folder = pathOf(platform).join(root, APPS_DIR, id)
  return Object.freeze({
    id,
    data: pathOf(platform).join(folder, 'data'),
    cache: pathOf(platform).join(folder, 'cache'),
  })
}

/**
 * The folders of an app made by `acryl new`: `~/.acryl/apps/<id>/data` for its data, `~/.acryl/apps/<id>/cache` for what can be rebuilt. The id is read
 * from (or first written to) the app folder's `.acryl/app.json`. An app that still has a `.acrylblends/` folder beside its code is moved by
 * `migrateOldHome`, which the host runs once at start.
 */
export function appHomes(
  appRoot: string,
  platform: NodeJS.Platform = process.platform,
  env: Env = process.env,
  home: string = personHome(env, platform),
): AppHomes {
  return appHomesOf(appIdOf(appRoot), acrylRoot(platform, env, home), platform)
}

/** The data folder of an app made by `acryl new`: the one answer every part of the app and the CLI shares. */
export function appDataHome(
  appRoot: string,
  platform: NodeJS.Platform = process.platform,
  env: Env = process.env,
  home: string = personHome(env, platform),
): string {
  return appHomes(appRoot, platform, env, home).data
}

/** `{ path: size }` of every file under a folder, relative with `/`: what two copies must agree on. A symbolic link counts as a file, never followed. */
function inventory(folder: string, prefix = ''): Map<string, number> {
  const found = new Map<string, number>()
  for (const entry of readdirSync(join(folder, prefix), { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      found.set(`${relative}/`, 0)
      for (const [path, size] of inventory(folder, relative)) found.set(path, size)
    } else found.set(relative, lstatSync(join(folder, relative)).size)
  }
  return found
}

export type MigrationResult =
  | { readonly status: 'none' }
  | {
      readonly status: 'moved'
      readonly from: string
      readonly kept: string
      readonly files: number
    }
  | { readonly status: 'refused'; readonly reason: string }

/**
 * Move an app's data from `<app>/.acrylblends/` to its data folder, once. The old folder is copied, checked file by file (names and sizes), and only
 * then renamed to `.acrylblends.old`; it is never deleted. A data folder that already has content is never touched (the move is refused and nothing
 * changes). When the copy or the check fails, what was copied is removed and the old folder stays exactly as it was.
 * `copy` is the copy step, replaceable so a test can fail half way.
 */
export function migrateOldHome(
  appRoot: string,
  dataHome: string,
  copy: (from: string, to: string) => void = (from, to) => {
    // Entry by entry into the empty data folder: on Linux cpSync refuses a target folder that exists (EEXIST) even when it is empty, while
    // nothing inside may ever be overwritten either way.
    for (const entry of readdirSync(from))
      cpSync(join(from, entry), join(to, entry), {
        recursive: true,
        errorOnExist: true,
        force: false,
        verbatimSymlinks: true,
      })
  },
): MigrationResult {
  const old = join(appRoot, OLD_HOME_DIR)
  if (!existsSync(old) || !lstatSync(old).isDirectory()) return { status: 'none' }
  if (existsSync(dataHome) && readdirSync(dataHome).length > 0)
    return {
      status: 'refused',
      reason: `${dataHome} already has content, so ${old} was not moved; look at both and remove one`,
    }
  const created = !existsSync(dataHome)
  try {
    mkdirSync(dataHome, { recursive: true })
    copy(old, dataHome)
    const before = inventory(old)
    const after = inventory(dataHome)
    for (const [path, size] of before)
      if (after.get(path) !== size)
        throw new Error(
          `${path} was not copied whole (${String(after.get(path))} of ${String(size)})`,
        )
    if (after.size !== before.size) throw new Error('the copy has files the original does not')
  } catch (cause) {
    // Only what this call put into the (empty) data folder is removed; the old folder was never changed.
    for (const entry of readdirSync(dataHome))
      rmSync(join(dataHome, entry), { recursive: true, force: true })
    if (created) rmSync(dataHome, { recursive: true, force: true })
    throw new AppInstanceError(
      `could not move ${old} to ${dataHome}: ${cause instanceof Error ? cause.message : String(cause)}; the old folder is unchanged`,
    )
  }
  let kept = `${old}.old`
  for (let n = 2; existsSync(kept); n += 1) kept = `${old}.old-${String(n)}`
  renameSync(old, kept)
  return {
    status: 'moved',
    from: old,
    kept,
    files: [...inventory(dataHome).keys()].filter((p) => !p.endsWith('/')).length,
  }
}

const isLink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * DSH's folder for the chats of one working folder (`dsh-session-persistence-jsonl`, `projectKey`): separators become one dash, safe characters stay, the
 * rest is `~XXXX`, between two dashes pairs, cut to 251. Copied so a chat folder can be renamed with the app's; keep it in step with that function.
 */
export function chatKeyOf(folder: string): string {
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < folder.length; i += 1) {
    const code = folder.charCodeAt(i)
    const character = String.fromCharCode(code)
    if (character === '/' || character === '\\' || character === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (character !== '~' && /^[A-Za-z0-9._-]$/u.test(character)) {
      readable += character
      separatorRun = false
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/u, '') || 'root').slice(0, 251)}--`
}

/** What {@link moveChats} changed: how many of the three places that name a chat folder were rewritten. */
export interface ChatMove {
  readonly sessions: boolean
  readonly workspaces: number
  readonly branchChats: boolean
}

function rewriteJson(file: string, change: (value: unknown) => boolean): boolean {
  if (!existsSync(file)) return false
  let value: unknown
  try {
    value = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return false
  }
  if (!change(value)) return false
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, file)
  return true
}

/**
 * Make the chats an app filed under one folder belong to another, once: the engine's folder for the new place becomes a link to the folder the chats are in, the
 * workspace the engine registered keeps its id and its chats under the new path, and the frame's branch chats move to the new key. For an app that was moved
 * or renamed ({@link followFolder}). The chats stay where they are: the engine checks that a chat's log is at the place its own header names
 * (its working folder then), so a renamed folder is refused as corrupt and takes the whole workspace down with it. A chat made later is filed under the new place,
 * in the same folder. A chat made before the move still has the old folder as its working folder. Nothing is overwritten: a folder already at the new key is left alone, and an app with no chat under `from` changes nothing. Run before the engine starts.
 */
export function moveChats(dataHome: string, from: string, to: string): ChatMove {
  const none: ChatMove = { sessions: false, workspaces: 0, branchChats: false }
  if (from === to) return none
  let sessions = false
  const oldKey = join(dataHome, 'sessions', chatKeyOf(from))
  const newKey = join(dataHome, 'sessions', chatKeyOf(to))
  if (existsSync(oldKey) && !isLink(oldKey) && !existsSync(newKey) && !isLink(newKey)) {
    // A junction (Windows, no privilege needed) wants an absolute target; elsewhere the link is relative, so a moved data root keeps it.
    symlinkSync(
      process.platform === 'win32' ? oldKey : chatKeyOf(from),
      newKey,
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    sessions = true
  }
  let workspaces = 0
  rewriteJson(join(dataHome, 'storages', 'workspace.json'), (value) => {
    const table = (value as { tables?: { workspaces?: Record<string, { path?: unknown }> } } | null)
      ?.tables?.workspaces
    for (const entry of Object.values(table ?? {}))
      if (entry.path === from) {
        entry.path = to
        workspaces += 1
      }
    return workspaces > 0
  })
  const branchChats = rewriteJson(join(dataHome, 'frame', 'branch-chats.json'), (value) => {
    const file = value as { roots?: Record<string, unknown>; open?: Record<string, unknown> } | null
    let changed = false
    for (const table of [file?.roots, file?.open])
      if (table !== undefined && Object.hasOwn(table, from) && !Object.hasOwn(table, to)) {
        table[to] = table[from]
        delete table[from]
        changed = true
      }
    return changed
  })
  return { sessions, workspaces, branchChats }
}

/** Where an app's data home records the folder the app was last started in, so a start in another folder is a move. */
export const APP_FOLDER_FILE = 'app-folder.json'

/**
 * The app was started in another folder than last time (it was moved or renamed): its chats follow it ({@link moveChats} from the folder it was in to the one it is in).
 * Records the folder it is in now. The engine files a chat under the folder it works in, so a moved app would otherwise show no chats. Run before the engine starts.
 * The first start only records. @returns what was changed, none when the folder is the same or unknown.
 */
export function followFolder(dataHome: string, appRoot: string): ChatMove | undefined {
  const file = join(dataHome, APP_FOLDER_FILE)
  let before: string | undefined
  try {
    const recorded = (JSON.parse(readFileSync(file, 'utf8')) as { root?: unknown }).root
    before = typeof recorded === 'string' && recorded !== '' ? recorded : undefined
  } catch {
    before = undefined
  }
  if (before === appRoot) return undefined
  const moved = before === undefined ? undefined : moveChats(dataHome, before, appRoot)
  mkdirSync(dataHome, { recursive: true })
  writeFileSync(file, `${JSON.stringify({ root: appRoot }, null, 2)}\n`)
  return moved
}
