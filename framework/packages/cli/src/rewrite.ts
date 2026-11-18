import { dirname, posix } from 'node:path'

/**
 * The framework plugins import each other by package name (`acryl-router`, `acryl-router/middleware`): inside this repository they are workspace packages. An app has
 * no such packages, only the copied source, so `acrylblends init` and `add` rewrite those specifiers to relative paths when they copy a plugin. The file each name stands
 * for is the `entries` table of the plugin's `plugin.json`.
 */

/** `acryl-router/middleware` to `acryl-router/src/middleware/index.ts`: every importable name of every library plugin. */
export type EntryTable = ReadonlyMap<string, string>

export function entryTable(
  library: ReadonlyMap<string, { readonly entries?: Readonly<Record<string, string>> | undefined }>,
): EntryTable {
  const table = new Map<string, string>()
  for (const [plugin, { entries }] of library)
    for (const [subpath, file] of Object.entries(entries ?? {}))
      table.set(`${plugin}${subpath}`, `${plugin}/${file}`)
  return table
}

/** For every character of a TypeScript source: 0 = code, 1 = inside a comment, 2 = inside a string or template literal. */
function classify(source: string): Uint8Array {
  const kind = new Uint8Array(source.length)
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      kind.fill(1, i, stop)
      i = stop
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      kind.fill(1, i, stop)
      i = stop
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\') j += 1
        else if (c !== '`' && source[j] === '\n') break
        j += 1
      }
      kind.fill(2, i, Math.min(j + 1, source.length))
      i = j + 1
    } else i += 1
  }
  return kind
}

const SPECIFIER =
  /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(acryl-[A-Za-z0-9-]+(?:\/[A-Za-z0-9./-]+)?)\2/gu

/**
 * Rewrite the specifiers that name another library plugin to relative paths. `file` is the path of the file inside the plugins folder (for example
 * `acryl-state/src/service.ts`). Only real import and export statements are touched: a specifier named in a comment or in a string (a documentation example) is text,
 * not a dependency. Any other `acryl-*` specifier in code is an error: a library plugin may depend only on the others and on public packages.
 */
export function rewriteSpecifiers(source: string, file: string, entries: EntryTable): string {
  const kind = classify(source)
  return source.replace(
    SPECIFIER,
    (match, lead: string, quote: string, specifier: string, offset: number) => {
      if (kind[offset] !== 0) return match
      const target = entries.get(specifier)
      if (target === undefined)
        throw new Error(`${file}: imports "${specifier}", which is not a library plugin`)
      let path = posix.relative(dirname(file), target)
      if (!path.startsWith('.')) path = `./${path}`
      return `${lead}${quote}${path}${quote}`
    },
  )
}
