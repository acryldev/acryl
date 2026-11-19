import { dirname, posix } from 'node:path'
import type { LibraryPlugin } from './library'

/**
 * The framework plugins import each other by package name (`acryl-router`, `acryl-router/middleware`, `acryl-instance`): inside this repository they are workspace packages. An app has
 * no such packages, only the copied source, so `acrylblends init` and `add` rewrite those specifiers to relative paths when they copy a plugin. The file each name stands
 * for is the `entries` table of the plugin's `plugin.json`; the name is its `package.json` name, which need not equal its library folder.
 */

/** `acryl-router/middleware` to `acryl-router/src/middleware/index.ts`: every importable name of every library plugin. */
export type EntryTable = ReadonlyMap<string, string>

export function entryTable(library: ReadonlyMap<string, LibraryPlugin>): EntryTable {
  const table = new Map<string, string>()
  for (const [name, { packageName, entries }] of library)
    for (const [subpath, file] of Object.entries(entries ?? {}))
      table.set(`${packageName ?? name}${subpath}`, `${name}/${file}`)
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

const RELATIVE = /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/gu

/**
 * The inverse, for a plugin an app stops carrying and installs instead (spec 051 T011: the desktop shell and the instance): rewrite the
 * relative imports that reach into its copied files back to package specifiers. `file` is the importing file's path inside the app
 * (`src/main.ts`, `plugins/agent-panel/headless.ts`); `table` maps each importable specifier to its file under the app's plugins folder
 * (`acryl-instance/storage` -> `instance/storage.ts`), for the moved plugins only. A relative import of a moved plugin's file that no
 * specifier names is an error: the package does not export it, so the app would break.
 */
export function toPackageSpecifiers(
  source: string,
  file: string,
  table: EntryTable,
  moved: ReadonlySet<string>,
): string {
  const byFile = new Map<string, string>()
  for (const [specifier, target] of table) byFile.set(target, specifier)
  const kind = classify(source)
  return source.replace(
    RELATIVE,
    (match, lead: string, quote: string, relative: string, offset: number) => {
      if (kind[offset] !== 0) return match
      const resolved = posix.normalize(posix.join(dirname(file), relative))
      if (!resolved.startsWith('plugins/')) return match
      const inPlugins = resolved.slice('plugins/'.length)
      if (!moved.has(inPlugins.split('/')[0] ?? '')) return match
      const specifier = byFile.get(inPlugins)
      if (specifier === undefined)
        throw new Error(
          `${file}: imports "${relative}", a file of ${inPlugins.split('/')[0]} its package does not export`,
        )
      return `${lead}${quote}${specifier}${quote}`
    },
  )
}
