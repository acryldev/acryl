/**
 * The plain entry imports nothing from Cordis or PGlite: `acryl-db-postgres/open`, its built JavaScript and declarations, and every file
 * those import. It reads this package's built `lib/`, so it needs `pnpm run build` first.
 *
 * vendoring: skip - a copy vendored into an app (with relative imports, no build of its own) has no `lib/`; the app's own typecheck is
 * what proves the copy names no Cordis type it does not provide.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('imports nothing from Cordis in the plain entries or anything they import, at runtime or in their types', () => {
  const specifiers = (text: string) => [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/gu)].map(match => match[1] ?? '')
  const seen = new Set<string>()
  const visit = (file: URL): void => {
    if (seen.has(file.href)) return
    seen.add(file.href)
    const imports = specifiers(readFileSync(fileURLToPath(file), 'utf8'))
    expect(imports.filter(spec => /cordis|schemastery|pglite/u.test(spec)), fileURLToPath(file)).toEqual([])
    for (const spec of imports) {
      if (!spec.startsWith('.')) continue
      const target = /\.(?:js|ts)$/u.test(spec) ? spec.replace(/\.ts$/u, file.pathname.endsWith('.d.ts') ? '.d.ts' : '.js') : `${spec}.js`
      visit(new URL(target, file))
    }
  }
  const lib = (file: string) => new URL(`../lib/${file}`, import.meta.url)
  visit(lib('open.js'))
  visit(lib('types/open.d.ts'))
  expect(seen.size).toBeGreaterThan(2)
})

it('imports nothing at all in the dialect entry, so acryl-db-pglite does not load pg through it', () => {
  for (const file of ['dialect.js', 'types/dialect.d.ts']) {
    const text = readFileSync(fileURLToPath(new URL(`../lib/${file}`, import.meta.url)), 'utf8')
    const bare = [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/gu)].map(match => match[1] ?? '').filter(spec => !spec.startsWith('.'))
    expect(bare, file).toEqual([])
  }
})
