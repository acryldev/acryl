/**
 * The scaffolds published acrylblends releases shipped, as `acrylblends upgrade` needs them: the template's route module and, where the composition root
 * exports `composeInto` today, `src/app.ts`. Fixtures are verbatim from each release (deduplicated by content hash under `legacy/<template>/<hash>/`, built by
 * `scripts/build-legacy-layouts.mjs` from the release tags). An app's file matches when it equals the released bytes with the app name substituted, or the
 * current template's file (already upgraded); anything else is the app's own and is never replaced.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATES, type Template, templateDir } from './templates'
import { compareVersions } from './version'

/** The app name init substituted for `__APP_NAME__` in the template's files. */
const PLACEHOLDER = '__APP_NAME__'

/** The frame row module's path inside an app: a template with it is framed by the host. */
export const FRAME_FILE = 'src/frame.ts'

/** One distinct scaffold a release shipped for a template: the content hash the build script gave it, and its files (released bytes, placeholders left). */
export interface LegacyVariant {
  readonly id: string
  readonly files: ReadonlyMap<string, string>
}

/** What the upgrade's read of one scaffold file found. */
export type ScaffoldState = 'same' | 'update' | 'add' | 'conflict'

export interface ScaffoldFile {
  /** Path inside the app, with forward slashes. */
  readonly file: string
  /** The current template's text, which an upgrade writes for `update` and `add`. */
  readonly text: string
  readonly state: ScaffoldState
}

/** The upgrade's read of an app: its template and what the frame layout would do to its scaffold. */
export interface LegacyRead {
  readonly template: Template
  /** `src/frame.ts` first (it has no released predecessor), then the template's own files the frame layout replaces. */
  readonly files: readonly ScaffoldFile[]
}

/** The `legacy/` fixtures: beside `dist/` in the build and `src/` in a checkout, found by walking up like the templates. */
export function legacyRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const candidate = join(dir, 'legacy')
    if (existsSync(join(candidate, 'layouts.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) throw new Error('acrylblends cannot find its legacy layout fixtures')
    dir = parent
  }
}

/** Whether a template carries the frame row (only the framed templates can be upgraded onto it). `dir` overrides the template folder for tests. */
export function carriesFrame(template: Template, dir: string = templateDir(template)): boolean {
  return existsSync(join(dir, FRAME_FILE))
}

/** A template's file as a scaffolded app of `name` has it, or undefined when the current template has no such file. */
function templateText(template: Template, file: string, name: string): string | undefined {
  const path = join(templateDir(template), file)
  return existsSync(path) ? readFileSync(path, 'utf8').replaceAll(PLACEHOLDER, name) : undefined
}

function read(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

function walk(dir: string, base: string, into: Map<string, string>): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, `${base}${entry}/`, into)
    else into.set(`${base}${entry}`, readFileSync(path, 'utf8'))
  }
}

/** Every distinct scaffold the releases shipped for a template, sorted by hash. Empty when no release shipped this template. */
export function legacyVariants(template: Template): LegacyVariant[] {
  const dir = join(legacyRoot(), template)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((entry) => statSync(join(dir, entry)).isDirectory())
    .sort()
    .map((id) => {
      const files = new Map<string, string>()
      walk(join(dir, id), '', files)
      return { id, files }
    })
}

/** The app's name as `init` wrote it into the scaffold (package.json, then the folder). */
export function appNameOf(appDir: string): string {
  try {
    const manifest = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
      name?: unknown
    }
    if (typeof manifest.name === 'string' && manifest.name !== '') return manifest.name
  } catch {
    // The caller already refused an app without a readable package.json; fall through to the folder.
  }
  return basename(appDir)
}

/** The scaffold files the releases recorded for a template (the union across variants): what a fixture app starts from. */
export function legacyScaffold(template: Template): readonly string[] {
  const paths = new Set<string>()
  for (const variant of legacyVariants(template))
    for (const file of variant.files.keys()) paths.add(file)
  return [...paths].sort()
}

/**
 * The app's entry module when a release before 0.7.8 wrote it: those releases shipped `src/main.ts` importing `./plugins/...` where the app keeps its
 * plugins one folder up (`../plugins/...` since 0.7.8), so the app cannot start as scaffolded and the frame layout cannot be applied on top of it.
 */
export function brokenEntry(appDir: string): string | undefined {
  const file = join(appDir, 'src', 'main.ts')
  const text = read(file)
  return text !== undefined && /from '\.\/plugins\//u.test(text) ? 'src/main.ts' : undefined
}

/** The first release whose scaffold an upgrade can carry forward: 0.7.8 fixed the entry module's plugin imports. */
const FIRST_FIXED = '0.7.8'

/**
 * Whether every release that shipped a layout variant is before 0.7.8. Such an app's `src/main.ts` imports `./plugins/...` and cannot start (see
 * {@link brokenEntry}); the upgrade reports it and leaves the frame alone. Exposed for the fixture builders (the gate and the tests).
 */
export function variantFromBrokenEra(template: Template, id: string): boolean {
  const versions = releasedVersions()
  const index = JSON.parse(readFileSync(join(legacyRoot(), 'layouts.json'), 'utf8')) as {
    releases?: Array<{ version?: unknown; layouts?: Record<string, unknown> }>
  }
  const users = (index.releases ?? []).filter((release) => release.layouts?.[template] === id)
  if (users.length === 0) return false
  return users.every((release) => {
    const version = typeof release.version === 'string' ? release.version : ''
    return version !== '' && versions.includes(version) && compareVersions(version, FIRST_FIXED) < 0
  })
}

/** The releases the fixtures cover, oldest first, from the index the build script wrote (for the CLI's message). */
export function releasedVersions(): string[] {
  try {
    const index = JSON.parse(readFileSync(join(legacyRoot(), 'layouts.json'), 'utf8')) as {
      releases?: Array<{ version?: unknown }>
    }
    return (index.releases ?? [])
      .map((release) => release.version)
      .filter((version): version is string => typeof version === 'string')
  } catch {
    return []
  }
}

/** The scaffold a named release shipped for a template, from the index (undefined when that release had no such template, or the index lacks it). */
export function releasedVariant(template: Template, version: string): LegacyVariant | undefined {
  try {
    const index = JSON.parse(readFileSync(join(legacyRoot(), 'layouts.json'), 'utf8')) as {
      releases?: Array<{ version?: unknown; layouts?: Record<string, unknown> }>
    }
    const release = (index.releases ?? []).find((entry) => entry.version === version)
    const id = release?.layouts?.[template]
    return typeof id === 'string'
      ? legacyVariants(template).find((variant) => variant.id === id)
      : undefined
  } catch {
    return undefined
  }
}

/** The release range the fixtures cover, for a sentence: `0.3.0 through 1.1.0`, or `the published releases` when the index cannot be read. */
export function releasedRange(): string {
  const versions = releasedVersions()
  const first = versions[0]
  const last = versions.at(-1)
  if (first === undefined || last === undefined) return 'the published releases'
  return first === last ? first : `${first} through ${last}`
}

/**
 * Which template made this app: the template whose released (or current) scaffold files the app matches most. Undefined when none matches: the app's
 * scaffold was edited, or a release that shipped no template made it, and the upgrade leaves it alone.
 */
export function identifyTemplate(appDir: string, name: string): Template | undefined {
  let best: { template: Template; score: number } | undefined
  for (const template of TEMPLATES) {
    const variants = legacyVariants(template)
    if (variants.length === 0) continue
    let score = 0
    for (const variant of variants) {
      let matches = 0
      for (const [file, text] of variant.files)
        if (read(join(appDir, file)) === text.replaceAll(PLACEHOLDER, name)) matches += 1
      score = Math.max(score, matches)
    }
    // An app already upgraded (or scaffolded by this version) matches the current template instead.
    let current = 0
    for (const file of legacyScaffold(template)) {
      const text = templateText(template, file, name)
      if (text !== undefined && read(join(appDir, file)) === text) current += 1
    }
    score = Math.max(score, current)
    if (score > 0 && (best === undefined || score > best.score)) best = { template, score }
  }
  return best?.template
}

/**
 * What the frame layout would do to the app's scaffold of `template`: `same` when the app already has the current template's file, `update` when it has a
 * released one, `add` when it is missing, `conflict` when the app edited it (the caller refuses without `--force`).
 */
export function readLegacy(appDir: string, template: Template, name: string): LegacyRead {
  const variants = legacyVariants(template)
  const files: ScaffoldFile[] = []
  const frame = read(join(appDir, FRAME_FILE))
  if (carriesFrame(template)) {
    const text = templateText(template, FRAME_FILE, name)
    if (text !== undefined)
      files.push({
        file: FRAME_FILE,
        text,
        state: frame === undefined ? 'add' : frame === text ? 'same' : 'conflict',
      })
  }
  for (const file of legacyScaffold(template)) {
    const text = templateText(template, file, name)
    // A file the current template no longer has is left to the app: the upgrade has nothing to write for it.
    if (text === undefined) continue
    const app = read(join(appDir, file))
    const released = variants
      .map((variant) => variant.files.get(file))
      .filter((value): value is string => value !== undefined)
      .map((value) => value.replaceAll(PLACEHOLDER, name))
    files.push({
      file,
      text,
      state:
        app === undefined
          ? 'add'
          : app === text
            ? 'same'
            : released.includes(app)
              ? 'update'
              : 'conflict',
    })
  }
  return { template, files }
}
