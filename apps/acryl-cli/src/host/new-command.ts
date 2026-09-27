/**
 * `acryl new <dir>`: create an ACRYL Blends app (spec 036). The plan and the write are the runtime's (`planNewApp`, `writeNewApp`); this adapter finds the
 * launcher the app's `bin/acryl` hands off to and reports the result.
 *
 * The launcher is the framework's `scripts/blank.mjs`, which a framework checkout has. A published CLI does not carry it yet, so `new` says so instead of
 * writing an app that cannot start.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planNewApp, resolveStartSource, writeNewApp, type LauncherFile } from 'acryl-harness-runtime'

export interface NewAppCommandOptions {
  readonly dir: string
  readonly title?: string
  readonly blueprint?: string
  readonly accent?: string
  readonly tagline?: string
  readonly runtime?: string
  readonly skipGit?: boolean
  readonly from?: string
  readonly registry?: string
}

export interface NewAppCommandResult {
  readonly git: 'initialized' | 'skipped' | 'unavailable'
  readonly root: string
  readonly title: string
  readonly blueprint: string
  readonly files: readonly string[]
}

/** The framework checkout this CLI runs from: the nearest ancestor with `scripts/blank.mjs`. */
export function findLauncher(from: string = dirname(fileURLToPath(import.meta.url))): string | undefined {
  let current = resolve(from)
  for (;;) {
    const candidate = join(current, 'scripts', 'blank.mjs')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/**
 * What an app that carries its own runtime needs to start without the framework: the launcher, its instance adapter, and a copy of the runtime's instance
 * module (the same isolation rules, loaded as TypeScript source by Node) with a one-line module file pointing at the copy.
 */
function carriedLauncher(launcher: string): Record<string, LauncherFile> {
  const scripts = dirname(launcher)
  const instanceSource = join(scripts, '..', 'runtime', 'acryl-harness-runtime', 'src', 'instance')
  const files: Record<string, LauncherFile> = {
    'launch.mjs': { from: launcher },
    'lib/instances.mjs': { from: join(scripts, 'lib', 'instances.mjs') },
    'lib/instance-module.mjs': { content: "export * from './instance/index.ts'\n" },
  }
  for (const file of readdirSync(instanceSource)) if (file.endsWith('.ts')) files[`lib/instance/${file}`] = { from: join(instanceSource, file) }
  return files
}

/** `launcher` null means there is no framework checkout (a default parameter would swallow an explicit `undefined`). */
export function runNewApp(options: NewAppCommandOptions, launcher: string | null = findLauncher() ?? null): NewAppCommandResult {
  if (launcher === null) throw new Error('acryl new needs the ACRYL framework checkout for now (its launcher, scripts/blank.mjs, is not part of the published CLI yet)')
  // A folder, a git repository (the user's own git login) or a registry starter, resolved to a local folder for as long as the new app is written.
  const resolved = options.from === undefined ? undefined : resolveStartSource(options.from, options.registry === undefined ? {} : { registry: options.registry })
  try {
    return writeFromSource(options, launcher, resolved?.folder)
  } finally {
    resolved?.dispose()
  }
}

function writeFromSource(options: NewAppCommandOptions, launcher: string, source: string | undefined): NewAppCommandResult {
  const planned = planNewApp(options.dir, {
    ...(source === undefined ? {} : { from: { manifestText: readFileSync(join(source, 'blend.yaml'), 'utf8'), ...(existsSync(join(source, 'blend.lock.json')) ? { lockText: readFileSync(join(source, 'blend.lock.json'), 'utf8') } : {}) } }),
    launcher,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.blueprint === undefined ? {} : { blueprint: options.blueprint }),
    brand: { ...(options.accent === undefined ? {} : { accent: options.accent }), ...(options.tagline === undefined ? {} : { tagline: options.tagline }) },
  })
  // A carried runtime brings its launcher along (the framework launcher and its one library), so the app never reads the framework again.
  const { git } = writeNewApp(planned, {
    git: options.skipGit !== true,
    ...(source === undefined ? {} : { extensionsFrom: join(source, 'extensions'), blueprintsFrom: join(source, 'blueprints') }),
    ...(options.runtime === undefined ? {} : { runtimeDir: resolve(options.runtime), launcherFiles: carriedLauncher(launcher) }),
  })
  return { git, root: planned.root, title: options.title ?? planned.name, blueprint: planned.blueprint.id, files: Object.keys(planned.files) }
}
