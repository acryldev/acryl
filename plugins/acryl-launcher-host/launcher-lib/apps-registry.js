// The list of ACRYL apps on this machine (spec 050 D6-D8): one file, `<home>/apps.json`, where <home> is ACRYL's own hidden folder (~/.acryl).
// An entry is { id, path, blend, madeBy, surface, added }: where the app lives, which Blend it is, who made it ('person' or 'agent') and which surface it
// has (spec 050 D10: 'web', 'desktop', or 'tui', the lightest kind, listed but not yet made). Nothing scans the
// disk: an app is in the list because `acryl new` made it, an agent asked to keep it, or the person added its folder. The file is the only
// state; whether an app's folder is still there is read when the list is shown (inspectApp), never stored.
// Home is a parameter, never looked up here: where an app's home is chosen is the caller's single decision (AppInstance rule of this repo).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** What makes a folder an app: the Blend manifest create-acrylblends writes at its root. */
export const APP_MARKER = 'blend.yaml'
export const REGISTRY_FILE = 'apps.json'

const MADE_BY = Object.freeze(['person', 'agent'])
/** The three kinds of app (spec 050 D10). An entry without one is a web app, which is what every app made before the field existed is. */
export const SURFACES = Object.freeze(['web', 'desktop', 'tui'])
const slug = name => name.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'app'

/** The Blend id a folder's blend.yaml names (`metadata.id`, else a top-level `id:`, else `name:`), or '' when it names none. */
export function blendOf(folder) {
  try {
    const text = readFileSync(join(folder, APP_MARKER), 'utf8')
    // The manifest create-acrylblends writes keeps the id under `metadata:`; an older or hand-written one has it at the top.
    return /^metadata:[^\S\n]*\n(?:[ \t]+\S.*\n|[ \t]*\n)*?[ \t]+id:\s*["']?([^\s"'#]+)/mu.exec(text)?.[1]
      ?? /^id:\s*["']?([^\s"']+)/mu.exec(text)?.[1] ?? /^name:\s*["']?([^\s"']+)/mu.exec(text)?.[1] ?? ''
  } catch { return '' }
}

const valid = entry => entry && typeof entry.id === 'string' && typeof entry.path === 'string'

/** Every app in the list, oldest first; an empty list when the file is missing or not readable as a list (a broken file never stops the launcher). */
export function readApps(home) {
  try {
    const parsed = JSON.parse(readFileSync(join(home, REGISTRY_FILE), 'utf8'))
    return (Array.isArray(parsed?.apps) ? parsed.apps : []).filter(valid).map(entry => Object.freeze({
      id: entry.id, path: entry.path, blend: entry.blend ?? '', madeBy: MADE_BY.includes(entry.madeBy) ? entry.madeBy : 'person',
      surface: SURFACES.includes(entry.surface) ? entry.surface : 'web', added: entry.added ?? '',
    }))
  } catch { return [] }
}

function write(home, apps) {
  mkdirSync(home, { recursive: true })
  const file = join(home, REGISTRY_FILE)
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ apps }, null, 2)}\n`)
  renameSync(temporary, file)   // a reader never sees half a file
}

/**
 * Put an app's folder in the list. A folder already listed stays as it is (`added: false`). A folder without a blend.yaml is not an app: this throws
 * a sentence a person can act on.
 */
export function addApp(home, { path, madeBy = 'person', surface = 'web' }, { now = () => new Date().toISOString() } = {}) {
  const folder = resolve(path)
  if (!existsSync(join(folder, APP_MARKER))) throw new Error(`${folder} is not an ACRYL app: it has no ${APP_MARKER}`)
  const apps = readApps(home)
  const existing = apps.find(entry => resolve(entry.path) === folder)
  if (existing) return { entry: existing, added: false }
  const taken = new Set(apps.map(entry => entry.id))
  const base = slug(basename(folder))
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${String(n)}`
  const entry = Object.freeze({ id, path: folder, blend: blendOf(folder), madeBy: MADE_BY.includes(madeBy) ? madeBy : 'person', surface: SURFACES.includes(surface) ? surface : 'web', added: now() })
  write(home, [...apps, entry])
  return { entry, added: true }
}

/** Take an app out of the list (its folder is not touched). Returns whether it was listed. */
export function removeApp(home, id) {
  const apps = readApps(home)
  if (!apps.some(entry => entry.id === id)) return false
  write(home, apps.filter(entry => entry.id !== id))
  return true
}

/** What is true of a listed app now: its folder is there or it is not ('ready' | 'missing'). */
export function inspectApp(entry) {
  return Object.freeze({ state: existsSync(join(entry.path, APP_MARKER)) ? 'ready' : 'missing' })
}
