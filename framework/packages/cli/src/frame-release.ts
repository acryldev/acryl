/**
 * Where an app's frame packages come from. npm by default: `frame/packages.json` (bundled into the CLI at build) names each frame package's published
 * name and version and the DSH release they are built against, and `init --desktop` installs those. `ACRYLBLENDS_FRAME_PACKAGES` overrides them: a JSON
 * set of specs for a checkout's unpublished build, or `none` for an app on the framework alone. An app that already carries frame packages upgrades from
 * its own pins.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import release from '../../../frame/packages.json' with { type: 'json' }
import { findDesktopShell } from './desktop-shell'
import { FRAME_PACKAGES, type IdeProfileInput, type IdeProfilePackage } from './ide-profile'
import { VERSION } from './version'

/** One frame package as it publishes: its folder (frame/packages.json `path`; a row package's folder is its source name), its published name, its version. */
export interface FrameReleasePackage {
  readonly source: string
  readonly name: string
  readonly version: string
}

/** The npm scope every frame package publishes under. */
export const FRAME_SCOPE: string = release.scope

/** The DSH release the frame's packages pin as peers, so an app's DSH pin is the same one. */
export const FRAME_DSH_VERSION: string = release.dshVersion

/** Every package the frame publishes, in the file's order. */
const publishedName = (key: string, entry: { name?: string }): string =>
  key.includes('/') ? key : `${release.scope}/${entry.name ?? key}`

export const FRAME_RELEASE: readonly FrameReleasePackage[] = Object.entries(release.packages).map(
  ([key, entry]) => ({
    source: publishedName(key, entry as { name?: string }),
    name: publishedName(key, entry as { name?: string }),
    version: entry.version,
  }),
)

/**
 * The specs an app's frame installs: the DSH pin, the framework, and a spec per frame package keyed by its source name. `names` maps a source name to
 * the module it installs as when that differs (a published package); without an entry the module is the source name (a checkout's `file:` spec).
 */
export interface FrameProfileSpecs {
  readonly dshVersion: string
  readonly frameworkVersion: string
  readonly packages: Readonly<Record<string, string>>
  readonly names?: Readonly<Record<string, string>>
}

/** `ACRYLBLENDS_FRAME_PACKAGES=none`: the app runs on the framework alone, whatever the default would be. */
export const FRAMEWORK_ONLY = 'framework-only'

/**
 * The frame's specs from npm: every row package by its published name at a caret over its released version, the DSH pin the packages are built against,
 * and this CLI's own release as the framework. A row package the file does not name is an error (the CLI tests catch it), never a silent skip.
 */
export function publishedFrameProfile(): FrameProfileSpecs {
  const bySource = new Map(FRAME_RELEASE.map((entry) => [entry.source, entry]))
  const packages: Record<string, string> = {}
  const names: Record<string, string> = {}
  for (const entry of FRAME_PACKAGES) {
    if (entry.installed === true) continue
    const published = bySource.get(entry.name)
    if (published === undefined)
      throw new Error(`frame/packages.json does not name the frame row ${entry.name}`)
    packages[entry.name] = `^${published.version}`
    names[entry.name] = published.name
  }
  return { dshVersion: FRAME_DSH_VERSION, frameworkVersion: `^${VERSION}`, packages, names }
}

/** `ACRYLBLENDS_FRAME_PACKAGES`: specs (a checkout's build), {@link FRAMEWORK_ONLY} for `none`, undefined when unset or malformed. */
export function frameProfileFromEnv(): FrameProfileSpecs | typeof FRAMEWORK_ONLY | undefined {
  const raw = process.env.ACRYLBLENDS_FRAME_PACKAGES
  if (raw === undefined || raw.trim() === '') return undefined
  if (raw.trim() === 'none') return FRAMEWORK_ONLY
  try {
    const parsed = JSON.parse(raw) as {
      dshVersion?: unknown
      frameworkVersion?: unknown
      packages?: unknown
    }
    if (typeof parsed.dshVersion !== 'string' || typeof parsed.frameworkVersion !== 'string')
      return undefined
    const packages: Record<string, string> = {}
    for (const [key, value] of Object.entries((parsed.packages ?? {}) as Record<string, unknown>))
      if (typeof value === 'string') packages[key] = value
    return { dshVersion: parsed.dshVersion, frameworkVersion: parsed.frameworkVersion, packages }
  } catch {
    return undefined
  }
}

/** The specs a new app's frame installs: the environment's, else npm's for a desktop app; undefined leaves the app on the framework alone. */
export function frameProfileForInit(desktop: boolean): FrameProfileSpecs | undefined {
  const fromEnv = frameProfileFromEnv()
  if (fromEnv === FRAMEWORK_ONLY) return undefined
  return fromEnv ?? (desktop ? publishedFrameProfile() : undefined)
}

/**
 * The specs for an app that may or may not be framed already: the environment first, then the app's own `package.json` (a framed app carries the DSH
 * pin, the framework and the frame packages, by their source or published names), then npm's for a desktop app (one with `plugins/desktop-shell`).
 * Undefined when none applies: the caller then leaves the app on the framework alone and says why.
 */
export function frameProfileForApp(root: string): FrameProfileSpecs | undefined {
  const fromEnv = frameProfileFromEnv()
  if (fromEnv === FRAMEWORK_ONLY) return undefined
  if (fromEnv !== undefined) return fromEnv
  const fromApp = frameProfileOfManifest(root)
  if (fromApp !== undefined) return fromApp
  // A desktop app: one carrying the shell's copy, or one that moved to the @acryldev/desktop-shell package (spec 051 T011).
  return findDesktopShell(root) !== undefined ? publishedFrameProfile() : undefined
}

function frameProfileOfManifest(root: string): FrameProfileSpecs | undefined {
  const manifestFile = join(root, 'package.json')
  if (!existsSync(manifestFile)) return undefined
  let manifest: { dependencies?: Record<string, unknown> }
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as typeof manifest
  } catch {
    return undefined
  }
  const dependencies = manifest.dependencies ?? {}
  const dshVersion = dependencies['@deepseek-ai/dsh-base']
  const frameworkVersion = dependencies['@acryldev/blends']
  if (typeof dshVersion !== 'string' || typeof frameworkVersion !== 'string') return undefined
  const publishedOf = new Map(FRAME_RELEASE.map((entry) => [entry.source, entry.name]))
  const packages: Record<string, string> = {}
  const names: Record<string, string> = {}
  for (const entry of FRAME_PACKAGES) {
    const source = dependencies[entry.name]
    const publishedName = publishedOf.get(entry.name)
    const published = publishedName === undefined ? undefined : dependencies[publishedName]
    if (typeof source === 'string') packages[entry.name] = source
    else if (typeof published === 'string' && publishedName !== undefined) {
      packages[entry.name] = published
      names[entry.name] = publishedName
    }
  }
  if (Object.keys(packages).length === 0) return undefined
  // A registry range moves to this CLI's release, as the plugin step of an upgrade moves it; a checkout's `file:`/`link:` spec stays.
  const framework = /^[\^~]?\d/u.test(frameworkVersion) ? `^${VERSION}` : frameworkVersion
  return { dshVersion, frameworkVersion: framework, packages, names }
}

/**
 * The profile input for an app from its specs: every frame row named by the module it installs as, its Loader row id kept as the source name (so a checkout
 * app and a published one have the same rows, and an upgrade between them renames nothing), and the specs as dependencies under the same module names.
 */
export function frameProfileInput(
  specs: FrameProfileSpecs,
  appName: string,
  rows: IdeProfileInput['rows'],
): IdeProfileInput {
  const moduleOf = (source: string) => specs.names?.[source] ?? source
  const packages: IdeProfilePackage[] = FRAME_PACKAGES.map((entry) =>
    entry.installed === true
      ? entry
      : {
          ...entry,
          name: moduleOf(entry.name),
          row: entry.row ?? entry.name,
          spec: specs.packages[entry.name] ?? '',
        },
  )
  return {
    appName,
    dshVersion: specs.dshVersion,
    frameworkVersion: specs.frameworkVersion,
    packages,
    dependencies: Object.fromEntries(
      Object.entries(specs.packages).map(([source, spec]) => [moduleOf(source), spec]),
    ),
    ...(rows === undefined ? {} : { rows }),
  }
}
