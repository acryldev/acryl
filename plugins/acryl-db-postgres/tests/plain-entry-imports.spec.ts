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

it('imports nothing from Cordis in the plain entries or anything they import, at runtime or in their types, and pg only when a database opens', () => {
  const specifiers = (text: string) => [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/gu)].map(match => match[1] ?? '')
  const seen = new Set<string>()
  const visit = (file: URL): void => {
    if (seen.has(file.href)) return
    seen.add(file.href)
    const imports = specifiers(readFileSync(fileURLToPath(file), 'utf8'))
    expect(imports.filter(spec => /cordis|schemastery|pglite/u.test(spec)), fileURLToPath(file)).toEqual([])
    // pg is an optional peer of acrylblends: the code imports it when a database opens, and the declarations never name it.
    const text = readFileSync(fileURLToPath(file), 'utf8')
    if (file.pathname.endsWith('.d.ts')) expect(imports, fileURLToPath(file)).not.toContain('pg')
    else expect(/^\s*import\s[^(]*?from\s*["']pg["']/mu.test(text), fileURLToPath(file)).toBe(false)
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
