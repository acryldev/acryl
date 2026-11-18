import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { compareVersions, VERSION } from './version'

/** Thrown when the target directory exists and is not empty. Nothing has been written. */
export class TargetNotEmptyError extends Error {
  constructor(readonly target: string) {
    super(
      `refusing to write into "${target}": the directory is not empty. Choose an empty or new directory.`,
    )
    this.name = 'TargetNotEmptyError'
  }
}

/** A project name npm accepts: lower case letters, digits and dashes, starting with a letter. */
export function isValidName(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name) && name.length <= 214
}

/** A valid default project name derived from a directory path. */
export function nameFrom(directory: string): string {
  const base = directory.split(/[\\/]/).filter(Boolean).pop() ?? ''
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .replace(/-+$/, '')
  return cleaned || 'my-app'
}

/** Refuse a target that exists and is not an empty directory. A missing target is fine: it is created. */
export function assertTargetFree(target: string): void {
  if (!existsSync(target)) return
  if (!statSync(target).isDirectory() || readdirSync(target).length > 0)
    throw new TargetNotEmptyError(target)
}

/**
 * Copy a template into `target`, replacing `__APP_NAME__` with `name` and `__ACRYLBLENDS_RANGE__` with the range of this release. Checks the target before writing anything.
 *
 * @returns the copied files, relative to `target`
 */
export function copyTemplate(source: string, target: string, name: string): string[] {
  assertTargetFree(target)
  mkdirSync(target, { recursive: true })
  const written: string[] = []
  const walk = (from: string, to: string, prefix: string) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules' ||
        (prefix === '' &&
          (entry.name === TEMPLATE_MANIFEST ||
            entry.name === 'upstream.json' ||
            entry.name === 'AGENTS.md'))
      )
        continue
      const sourcePath = join(from, entry.name)
      // npm and git treat a file named .gitignore specially, so templates keep it as `gitignore` (and `dockerignore`).
      const targetName =
        prefix === '' && (entry.name === 'gitignore' || entry.name === 'dockerignore')
          ? `.${entry.name}`
          : entry.name
      const targetPath = join(to, targetName)
      if (entry.isDirectory()) {
        mkdirSync(targetPath, { recursive: true })
        walk(sourcePath, targetPath, `${prefix}${entry.name}/`)
        continue
      }
      const text = readFileSync(sourcePath, 'utf8')
      if (text.includes('__APP_NAME__') || text.includes('__ACRYLBLENDS_RANGE__'))
        writeFileSync(
          targetPath,
          text.replaceAll('__APP_NAME__', name).replaceAll('__ACRYLBLENDS_RANGE__', `^${VERSION}`),
        )
      else cpSync(sourcePath, targetPath)
      written.push(`${prefix}${targetName}`)
    }
  }
  walk(source, target, '')
  return written
}

/** A template's own manifest, `template.json`: the library plugins it is built from. Never copied (nor is `upstream.json`, the record of what was synced from ACRYL, nor the template's `AGENTS.md`, which `writeAgentFiles` joins to the shared core). */
export const TEMPLATE_MANIFEST = 'template.json'

/** The address a template's desktop window opens on, when it is not the root (`template.json`: `desktopPath`). */
export function readTemplateDesktopPath(templateDir: string): string | undefined {
  const file = join(templateDir, TEMPLATE_MANIFEST)
  if (!existsSync(file)) return undefined
  return (JSON.parse(readFileSync(file, 'utf8')) as { desktopPath?: string }).desktopPath
}

/** Record where the desktop window opens in package.json (`acrylblends.desktopPath`), read by `plugins/desktop/main.ts`. */
export function writeDesktopPath(appDir: string, path: string): void {
  const file = join(appDir, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    acrylblends?: Record<string, unknown>
  }
  manifest.acrylblends = { ...manifest.acrylblends, desktopPath: path }
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

export function readTemplatePlugins(templateDir: string): string[] {
  const file = join(templateDir, TEMPLATE_MANIFEST)
  if (!existsSync(file)) return []
  const { plugins } = JSON.parse(readFileSync(file, 'utf8')) as { plugins?: string[] }
  return plugins ?? []
}

/** A version a plugin's pin can be compared with: an exact one or a caret or tilde range. A tag, a path or a URL is the app's own choice. */
function comparableVersion(spec: string): string | undefined {
  return /^[\^~]?\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(spec) ? spec.replace(/^[\^~]/u, '') : undefined
}

/** Whether a plugin's pin asks for more than what the app has: the plugin's code was written against that version. */
function asksForNewer(wanted: string, current: string): boolean {
  const a = comparableVersion(wanted)
  const b = comparableVersion(current)
  return a !== undefined && b !== undefined && compareVersions(a, b) > 0
}

/**
 * Add run-time dependencies to an app's package.json and sort the keys. Returns the names to install: those added, and those moved because a plugin asks for a newer
 * version than the app lists (the plugin's new code needs it). A version the app lists that is the same or newer stays. A package the app lists as a development
 * dependency too is taken out of that list: npm lets the development entry win, so `npm install --omit=dev` would leave a run-time dependency out.
 */
export function mergeDependencies(
  appDir: string,
  dependencies: Readonly<Record<string, string>>,
): string[] {
  const file = join(appDir, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const current = manifest.dependencies ?? {}
  const added = Object.keys(dependencies).filter((name) => !(name in current))
  const moved = Object.entries(dependencies).filter(
    ([name, wanted]) => current[name] !== undefined && asksForNewer(wanted, current[name]),
  )
  const merged = { ...dependencies, ...current, ...Object.fromEntries(moved) }
  manifest.dependencies = Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)),
  )
  if (manifest.devDependencies !== undefined)
    manifest.devDependencies = Object.fromEntries(
      Object.entries(manifest.devDependencies).filter(([name]) => !(name in merged)),
    )
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  return [...added, ...moved.map(([name]) => name)]
}

/** Add `package.json` "imports" entries (`#acryl-kv`: `./plugins/acryl-kv/src/index.ts`); an entry the app already has is kept. Returns the names added. */
export function mergeImports(
  appDir: string,
  imports: Readonly<Record<string, string>>,
  pluginsDir: string,
): string[] {
  const file = join(appDir, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { imports?: Record<string, string> }
  const current = manifest.imports ?? {}
  const added = Object.keys(imports).filter((name) => !(name in current))
  manifest.imports = {
    ...Object.fromEntries(
      Object.entries(imports).map(([name, path]) => [name, `./${pluginsDir}/${path}`]),
    ),
    ...current,
  }
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  return added
}

/** Declare a file as an opener in package.json (`"acryl": { "opener": [...] }`): the one place that may import a database provider. */
export function mergeOpener(appDir: string, opener: string): void {
  const file = join(appDir, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    acryl?: { opener?: string | string[] }
  }
  const current = manifest.acryl?.opener
  const list = typeof current === 'string' ? [current] : (current ?? [])
  if (list.includes(opener)) return
  manifest.acryl = { ...manifest.acryl, opener: [...list, opener] }
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

/**
 * Add a plugin's development dependencies and scripts to an app's package.json: nothing the app already has is replaced, and a package the app already needs at run time
 * (`dependencies`) is not listed again as a development one. Returns the names of the development dependencies and scripts added.
 */
export function mergeTooling(
  appDir: string,
  tooling: {
    devDependencies?: Readonly<Record<string, string>> | undefined
    scripts?: Readonly<Record<string, string>> | undefined
  },
): { devDependencies: string[]; scripts: string[] } {
  const file = join(appDir, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
  }
  const dev = manifest.devDependencies ?? {}
  const runtime = manifest.dependencies ?? {}
  const scripts = manifest.scripts ?? {}
  const wanted = Object.entries(tooling.devDependencies ?? {}).filter(
    ([name]) => !(name in runtime),
  )
  const addedDev = wanted.map(([name]) => name).filter((name) => !(name in dev))
  const addedScripts = Object.keys(tooling.scripts ?? {}).filter((name) => !(name in scripts))
  manifest.devDependencies = Object.fromEntries(
    Object.entries({ ...Object.fromEntries(wanted), ...dev })
      .filter(([name]) => !(name in runtime))
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  manifest.scripts = { ...tooling.scripts, ...scripts }
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  return { devDependencies: addedDev, scripts: addedScripts }
}

/** What an app runs before `dev`, `start`, `test` and `check`: refuses a Node too old to run it, in plain words, before anything that would fail confusingly (a plain CommonJS file, so any Node can read it). */
const CHECK_NODE = `// Refuses a Node that is too old to run this app, before the command that would fail on it. Plain CommonJS so that any Node can read it.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 19)) {
  console.error(
    \`Node 22.19+ needed, you have \${process.versions.node}: install it from https://nodejs.org or with nvm (nvm install 22), then run this again.\`,
  )
  process.exit(1)
}
`

/** Write \`scripts/check-node.cjs\` and run it before the app's \`dev\`, \`start\`, \`test\` and \`check\` scripts (npm and pnpm run \`pre<script>\` first). Existing \`pre*\` scripts are kept. */
export function addNodePreflight(appDir: string): void {
  mkdirSync(join(appDir, 'scripts'), { recursive: true })
  writeFileSync(join(appDir, 'scripts', 'check-node.cjs'), CHECK_NODE)
  const file = join(appDir, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }
  const scripts = manifest.scripts ?? {}
  for (const name of ['dev', 'start', 'test', 'check'])
    if (name in scripts && !(`pre${name}` in scripts))
      scripts[`pre${name}`] = 'node scripts/check-node.cjs'
  manifest.scripts = scripts
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** Add the lines a plugin needs to the app's \`.gitignore\` when it has one and they are missing. Returns the lines added. */
export function appendGitignore(appDir: string, lines: readonly string[] | undefined): string[] {
  const file = join(appDir, '.gitignore')
  if (!lines || lines.length === 0 || !existsSync(file)) return []
  const current = readFileSync(file, 'utf8')
  const present = new Set(current.split('\n').map((line) => line.trim()))
  const missing = lines.filter((line) => !present.has(line))
  if (missing.length > 0)
    writeFileSync(
      file,
      `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}${missing.join('\n')}\n`,
    )
  return missing
}

/**
 * The generated app's guide for a coding agent: the shared core, then the template's own part. `CLAUDE.md` is only an import of it. The skills
 * every app ships (`shared/skills/<name>/SKILL.md`) go to `.claude/skills/` (Claude Code) and `.agents/skills/` (the other agents), the same text in both.
 */
export function writeAgentFiles(
  sharedDir: string,
  templateDir: string,
  target: string,
  name: string,
): string[] {
  const core = readFileSync(join(sharedDir, 'AGENTS.core.md'), 'utf8')
  const own = existsSync(join(templateDir, 'AGENTS.md'))
    ? readFileSync(join(templateDir, 'AGENTS.md'), 'utf8')
    : ''
  const defaults = readFileSync(join(sharedDir, 'DEFAULTS.md'), 'utf8')
  const text = `${core}${defaults}${own}`.replaceAll('__APP_NAME__', name)
  // AGENTS.md and CLAUDE.md are the same text; the skills are written where each kind of agent looks for them.
  writeFileSync(join(target, 'AGENTS.md'), text)
  writeFileSync(join(target, 'CLAUDE.md'), text)
  const written = ['AGENTS.md', 'CLAUDE.md']
  for (const skill of sharedSkills(sharedDir)) {
    const skillText = readFileSync(join(sharedDir, 'skills', skill, 'SKILL.md'), 'utf8').replaceAll(
      '__APP_NAME__',
      name,
    )
    for (const scope of ['.claude/skills', '.agents/skills']) {
      const folder = `${scope}/${skill}`
      mkdirSync(join(target, folder), { recursive: true })
      writeFileSync(join(target, folder, 'SKILL.md'), skillText)
      written.push(`${folder}/SKILL.md`)
    }
  }
  return written
}

/** The skills every generated app carries: the folder name of each under `shared/skills/`. */
export function sharedSkills(sharedDir: string): string[] {
  const root = join(sharedDir, 'skills')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Copy the framework's docs (a generated copy of ACRYL's `docs/framework`, already checked against its digest) into `<app>/docs/framework/`,
 * so a coding agent working in the app reads the API from the folder it is in. The generated-copy notes and the digest record stay behind.
 *
 * @returns the copied files, relative to `target`
 */
export function copyFrameworkDocs(source: string, target: string): string[] {
  const written: string[] = []
  const walk = (from: string, to: string, prefix: string) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.name === 'upstream.json' || entry.name === 'UPSTREAM.md') continue
      const sourcePath = join(from, entry.name)
      const targetPath = join(to, entry.name)
      if (entry.isDirectory()) {
        mkdirSync(targetPath, { recursive: true })
        walk(sourcePath, targetPath, `${prefix}${entry.name}/`)
        continue
      }
      cpSync(sourcePath, targetPath)
      written.push(`docs/framework/${prefix}${entry.name}`)
    }
  }
  mkdirSync(join(target, 'docs', 'framework'), { recursive: true })
  walk(source, join(target, 'docs', 'framework'), '')
  return written
}
