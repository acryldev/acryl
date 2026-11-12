/**
 * What decides whether a pulled plugin may enter this app. Pure, over the files of the package: nothing here touches a disk or runs the plugin,
 * so a refusal has nothing to undo (Clean Architecture: policy free of I/O).
 */
import { digestFiles, type PluginFile, portabilityIssues } from '@webboxes/blends-core'
import { hostInjectFromSource } from '@webboxes/plugin-hub'

export type Refusal =
  | 'source'
  | 'fetch'
  | 'name'
  | 'digest'
  | 'portability'
  | 'dependencies'
  | 'entry'
  | 'inject'
  | 'missing-service'
  | 'folder-exists'
  | 'install'
  /** A list of sources that cannot be read, or holds a line that is not one source. */
  | 'list'

export interface PullRefused {
  readonly ok: false
  readonly refusal: Refusal
  readonly reason: string
  /** What the person can do about it. */
  readonly next: string
}

export const refuse = (refusal: Refusal, reason: string, next: string): PullRefused => ({
  ok: false,
  refusal,
  reason,
  next,
})

const SHA256 = /^[0-9a-f]{64}$/
const DIGEST_MARK = '@sha256:'

/** The source a person wrote, split into where it comes from and the content digest it names. @throws when the digest is malformed. */
export function splitDigest(input: string): { readonly source: string; readonly digest?: string } {
  const at = input.lastIndexOf(DIGEST_MARK)
  if (at === -1) return { source: input }
  const digest = input.slice(at + DIGEST_MARK.length)
  if (!SHA256.test(digest))
    throw new Error(`"${digest}" is not a content digest: it has 64 lowercase hex characters`)
  return { source: input.slice(0, at), digest }
}

/** The entry files the extensions folder loads, in its order. */
const ENTRIES = ['index.ts', 'index.js', 'index.mjs']

const text = (file: PluginFile): string => Buffer.from(file.bytes).toString('utf8')

export interface PullContext {
  /** The content digest the source names. */
  readonly digest?: string | undefined
  /** Whether the extensions folder can hold a plugin of this name. */
  readonly nameFits: (name: string) => boolean
  /** Whether this app has the service right now. */
  readonly hasService: (name: string) => boolean
}

/** The first reason this package may not enter the app, or undefined. */
export function pullRefusal(
  manifest: Readonly<Record<string, unknown>>,
  files: readonly PluginFile[],
  context: PullContext,
): PullRefused | undefined {
  const name = String(manifest.name)
  if (!context.nameFits(name)) {
    return refuse(
      'name',
      `the package is called "${name}", which a folder in plugins/ cannot hold`,
      'ask its author to release it under lowercase letters, digits and dashes',
    )
  }
  const digest = digestFiles(files)
  if (context.digest !== undefined && context.digest !== digest) {
    return refuse(
      'digest',
      `${digest} is not the digest the source names (${context.digest}); these are different bytes`,
      'ask the person who gave you the digest which release they meant',
    )
  }
  const issues = portabilityIssues(files)
  if (issues.length > 0) {
    return refuse(
      'portability',
      issues.map((issue) => `${issue.path}: ${issue.reason}`).join('; '),
      'ask its author to fix this and release again, so it works on every OS',
    )
  }
  const dependencies = Object.keys(
    (manifest.dependencies as Record<string, unknown> | undefined) ?? {},
  )
  if (dependencies.length > 0) {
    return refuse(
      'dependencies',
      `it needs ${dependencies.join(', ')} installed, and a pull installs nothing`,
      'ask its author to bundle them or name them as peers',
    )
  }
  const entry = ENTRIES.flatMap((path) => files.filter((file) => file.path === path))[0]
  if (entry === undefined) {
    return refuse(
      'entry',
      `it has none of ${ENTRIES.join(', ')} at its top level`,
      'this package is not a plugin an app can load; ask its author',
    )
  }
  const inject = hostInjectFromSource(text(entry))
  if (inject !== undefined && 'error' in inject) {
    return refuse(
      'inject',
      `${inject.error}. A pull reads what a plugin needs without running it`,
      'ask its author to list the services as plain names',
    )
  }
  const missing = (inject?.names ?? []).filter((service) => !context.hasService(service))
  if (missing.length > 0) return missingServices(missing)
  return undefined
}

export const missingServices = (missing: readonly string[]): PullRefused =>
  refuse(
    'missing-service',
    `it needs ${missing.join(', ')}, which this app does not have`,
    'add the plugin that provides it, then pull again',
  )
