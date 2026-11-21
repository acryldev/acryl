/**
 * `registry:<id>`: a plugin the public registry (cordisplugins.github.io) lists, pulled by the id it shows. The registry only points at a public GitHub
 * release, so the id is turned into the `github:<owner>/<repo>@<version>` source that release has, and the integrity the registry lists is the check the
 * download must pass: a release changed after the registry read it is refused. Pure; the caller fetches the index.
 */

export const REGISTRY_INDEX_URL = 'https://cordisplugins.github.io/registry/index.json'

/** What a pull needs of one registry entry (the rest of the entry is for the page that shows it). */
export interface RegistryHit {
  /** `github:<owner>/<repo>@<version>`: what another machine fetches, and what the app records. */
  readonly source: string
  /** The sha512 the registry lists for the release file. */
  readonly integrity: string
}

export type RegistryLookup =
  | { readonly ok: true; readonly hit: RegistryHit }
  | { readonly ok: false; readonly reason: string; readonly next: string }

const GITHUB_REPO =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*?)(?:\.git)?\/?$/u

/** Find `id` (or the package name, `@scope/name`) in the index text; its release as a source, or why there is none. */
export function lookUpRegistry(indexText: string, id: string): RegistryLookup {
  let entries: unknown
  try {
    entries = (JSON.parse(indexText) as { entries?: unknown }).entries
  } catch {
    entries = undefined
  }
  if (!Array.isArray(entries))
    return {
      ok: false,
      reason: 'the registry answered in a way this app does not understand',
      next: 'try again later, or pull github:<owner>/<repo> from the plugin page',
    }
  const wanted = id.trim().toLowerCase()
  const entry = entries.find(
    (item: { id?: unknown; name?: unknown }) =>
      typeof item?.id === 'string' &&
      (item.id.toLowerCase() === wanted ||
        (typeof item.name === 'string' && item.name.toLowerCase() === wanted)),
  ) as { repo?: unknown; version?: unknown; integrity?: unknown } | undefined
  if (entry === undefined)
    return {
      ok: false,
      reason: `the registry lists no plugin ${id}`,
      next: 'copy the id from https://cordisplugins.github.io, or pull github:<owner>/<repo>',
    }
  const repo = typeof entry.repo === 'string' ? GITHUB_REPO.exec(entry.repo) : null
  if (repo === null || typeof entry.version !== 'string' || typeof entry.integrity !== 'string')
    return {
      ok: false,
      reason: `the registry's entry for ${id} does not name a GitHub release this app can pull`,
      next: 'open its page on https://cordisplugins.github.io for how to install it',
    }
  return {
    ok: true,
    hit: { source: `github:${repo[1]}/${repo[2]}@${entry.version}`, integrity: entry.integrity },
  }
}
