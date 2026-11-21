/**
 * The two versions a person sees on an app (the frame's top bar, Help > About): their Blend's own, `metadata.version` in blend.yaml, which they raise as
 * they change the app, and the ACRYL Blends framework it runs on (the installed `@acryldev/blends`, else the range the app declares).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { parseDefinition } from './parse.js'

export interface AppVersions {
  readonly blend?: string
  readonly framework?: string
}

/** The framework's package name in an app's package.json. */
export const FRAMEWORK_PACKAGE = '@acryldev/blends'

const json = (text: string | undefined): Record<string, unknown> | undefined => {
  if (text === undefined) return undefined
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/** The versions in the texts of an app's blend.yaml, the installed framework's package.json and the app's own package.json; each may be missing. */
export function appVersions(files: {
  readonly manifest?: string
  readonly frameworkPackage?: string
  readonly appPackage?: string
}): AppVersions {
  const document = files.manifest === undefined ? undefined : parseDefinition(files.manifest).document
  const metadata = (document as { metadata?: { version?: unknown } } | undefined)?.metadata
  const blend = text(metadata?.version)
  const app = json(files.appPackage)
  const declared = ['dependencies', 'devDependencies', 'peerDependencies']
    .map((field) => text((app?.[field] as Record<string, unknown> | undefined)?.[FRAMEWORK_PACKAGE]))
    .find((range) => range !== undefined)
  const framework = text(json(files.frameworkPackage)?.version) ?? declared
  return { ...(blend === undefined ? {} : { blend }), ...(framework === undefined ? {} : { framework }) }
}

/** One line for both: `csv-explorer 0.1.4 · ACRYL Blends 1.7.21`; a missing version is left out. */
export function appVersionsLine(name: string, versions: AppVersions): string {
  return [
    versions.blend === undefined ? name : `${name} ${versions.blend}`,
    ...(versions.framework === undefined ? [] : [`ACRYL Blends ${versions.framework}`]),
  ].join(' · ')
}

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * {@link appVersions} of the app at `root`. The framework resolves from `frameworkFrom` as Node resolves it: the app itself, or a product's bundle, whose
 * apps' sources hold only the person's files.
 */
export function readAppVersions(root: string, frameworkFrom: string = root): AppVersions {
  let frameworkPackage: string | undefined
  try {
    frameworkPackage = readText(createRequire(join(frameworkFrom, 'package.json')).resolve(`${FRAMEWORK_PACKAGE}/package.json`))
  } catch {
    // Not installed (yet): the declared range stands in.
  }
  return appVersions({
    manifest: readText(join(root, 'blend.yaml')),
    appPackage: readText(join(root, 'package.json')),
    ...(frameworkPackage === undefined ? {} : { frameworkPackage }),
  })
}
