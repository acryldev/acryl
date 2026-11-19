// The types of watch-host.mjs (a plain script: the packaged host's runtime starts it without the TypeScript loader).

/** `size:mtime` of every file under `paths` (a file path stands for itself), by path; a missing path has no entry. */
export function snapshot(paths: readonly string[]): Map<string, string>

/** Whether two snapshots differ: a file added, removed, or with another size or modification time. */
export function changed(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): boolean
