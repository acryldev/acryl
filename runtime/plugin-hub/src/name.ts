// A plugin's name (spec 044 lifecycle.md, D9): an npm package name with exactly one level of scope, whose dots are levels of the author's own tree.
// `@inboxxobni/accounting-app-aurora.sidebar.date-filter` is owner `inboxxobni`, path `accounting-app-aurora` > `sidebar` > `date-filter`.
// npm, pnpm, DSH's installer and GitHub all accept this form, so the dotted name is the one form everywhere: typed, shown, published.

/** One level of the tree: lowercase letters, digits and hyphens, starting with a letter or digit. A dot is never part of a segment. */
const SEGMENT = /^[a-z0-9][a-z0-9-]*$/u
/** What npm and DSH's installer accept (`PACKAGE_NAME` in `@deepseek-ai/dsh-plugin-manager`'s install-spec.ts). */
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
const NPM_NAME_MAX_LENGTH = 214

export interface PluginName {
  /** The full name as npm and the profile's package.json spell it. */
  readonly full: string
  /** The scope without `@` (the GitHub owner or npm scope), or undefined for an unscoped name. */
  readonly owner?: string
  /** The name after the scope. */
  readonly local: string
  /**
   * The levels of the author's tree. Undefined when a level is not a plain segment (an older name such as `socket.io-client` or one with `_`):
   * such a name is valid and installable, it just has no tree.
   */
  readonly path?: readonly string[]
}

export class InvalidPluginNameError extends Error {
  constructor(readonly input: string, readonly reason: string) {
    super(`${JSON.stringify(input)} is not a plugin name: ${reason}`)
    this.name = 'InvalidPluginNameError'
  }
}

/** Read a plugin name. Throws for anything npm or DSH's installer would refuse. */
export function parsePluginName(input: string): PluginName {
  const full = input.trim()
  if (full === '') throw new InvalidPluginNameError(input, 'it is empty')
  if (full.length > NPM_NAME_MAX_LENGTH) throw new InvalidPluginNameError(input, `it is longer than ${NPM_NAME_MAX_LENGTH} characters`)
  if (full !== full.toLowerCase()) throw new InvalidPluginNameError(input, 'npm accepts only lowercase names; write date-filter, not dateFilter')
  if (!NPM_NAME.test(full)) throw new InvalidPluginNameError(input, 'use @owner/name with letters, digits, hyphens and dots, one "/" at most')
  const slash = full.indexOf('/')
  const owner = full.startsWith('@') ? full.slice(1, slash) : undefined
  const local = owner === undefined ? full : full.slice(slash + 1)
  const levels = local.split('.')
  const path = levels.every(level => SEGMENT.test(level)) ? levels : undefined
  return { full, local, ...(owner === undefined ? {} : { owner }), ...(path === undefined ? {} : { path }) }
}

/**
 * Build a name from an owner and the levels of a tree, refusing a level that would make the dots ambiguous.
 * `pluginNameOf('inboxxobni', ['accounting-app-aurora', 'sidebar', 'date-filter'])` is `@inboxxobni/accounting-app-aurora.sidebar.date-filter`.
 */
export function pluginNameOf(owner: string | undefined, path: readonly string[]): PluginName {
  if (path.length === 0) throw new InvalidPluginNameError('', 'it needs at least one level')
  for (const level of path) {
    if (!SEGMENT.test(level)) throw new InvalidPluginNameError(level, 'a level is lowercase letters, digits and hyphens, with no dot')
  }
  return parsePluginName(`${owner === undefined ? '' : `@${owner}/`}${path.join('.')}`)
}

/**
 * The directory a name is kept under in a store: `@owner/a.b` becomes `@owner/a.b`, an unscoped `a.b` stays `a.b`. Both parts are already
 * valid file names on every system (lowercase, no reserved characters).
 */
export function storeDirectoryOf(name: PluginName): readonly string[] {
  return name.owner === undefined ? [name.local] : [`@${name.owner}`, name.local]
}
