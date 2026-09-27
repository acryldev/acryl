/**
 * `acryl new <dir>`: create an ACRYL Blends app (spec 036). The plan and the write are the runtime's (`planNewApp`, `writeNewApp`); this adapter finds the
 * launcher the app's `bin/acryl` hands off to and reports the result.
 *
 * The launcher is the framework's `scripts/blank.mjs`, which a framework checkout has. A published CLI does not carry it yet, so `new` says so instead of
 * writing an app that cannot start.
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planNewApp, writeNewApp } from 'acryl-harness-runtime'

export interface NewAppCommandOptions {
  readonly dir: string
  readonly title?: string
  readonly blueprint?: string
  readonly accent?: string
  readonly tagline?: string
  readonly runtime?: string
  readonly skipGit?: boolean
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

/** `launcher` null means there is no framework checkout (a default parameter would swallow an explicit `undefined`). */
export function runNewApp(options: NewAppCommandOptions, launcher: string | null = findLauncher() ?? null): NewAppCommandResult {
  if (launcher === null) throw new Error('acryl new needs the ACRYL framework checkout for now (its launcher, scripts/blank.mjs, is not part of the published CLI yet)')
  const planned = planNewApp(options.dir, {
    launcher,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.blueprint === undefined ? {} : { blueprint: options.blueprint }),
    brand: { ...(options.accent === undefined ? {} : { accent: options.accent }), ...(options.tagline === undefined ? {} : { tagline: options.tagline }) },
  })
  // A carried runtime brings its launcher along (the framework launcher and its one library), so the app never reads the framework again.
  const { git } = writeNewApp(planned, {
    git: options.skipGit !== true,
    ...(options.runtime === undefined ? {} : {
      runtimeDir: resolve(options.runtime),
      launcherFiles: { 'launch.mjs': launcher, 'lib/instances.mjs': join(dirname(launcher), 'lib', 'instances.mjs') },
    }),
  })
  return { git, root: planned.root, title: options.title ?? planned.name, blueprint: planned.blueprint.id, files: Object.keys(planned.files) }
}
