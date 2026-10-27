/**
 * The plain entry imports nothing from Cordis or `pg`: `acryl-db-pglite/open`, its built JavaScript and declarations, and every file those
 * import. No declaration names a PGlite type. It reads this package's built `lib/`, so it needs `pnpm run build` first.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const specifiers = (text: string) => [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/gu)].map(match => match[1] ?? '')

it('imports nothing from Cordis or pg in the plain entry or anything it imports, at runtime or in its types', () => {
  const seen = new Set<string>()
  const visit = (file: URL): void => {
    if (seen.has(file.href)) return
    seen.add(file.href)
    const imports = specifiers(readFileSync(fileURLToPath(file), 'utf8'))
    expect(imports.filter(spec => /cordis|schemastery|^pg$|^pg\//u.test(spec)), fileURLToPath(file)).toEqual([])
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

it('names no PGlite type in the declarations of either entry, so an app\'s typecheck never loads PGlite\'s (they need Emscripten\'s and WebAssembly\'s globals)', () => {
  const seen = new Set<string>()
  const visit = (file: URL): void => {
    if (seen.has(file.href)) return
    seen.add(file.href)
    const imports = specifiers(readFileSync(fileURLToPath(file), 'utf8'))
    expect(imports.filter(spec => spec.startsWith('@electric-sql/')), fileURLToPath(file)).toEqual([])
    for (const spec of imports) if (spec.startsWith('.')) visit(new URL(spec.replace(/\.(?:js|ts)$/u, '.d.ts'), file))
  }
  visit(new URL('../lib/types/index.d.ts', import.meta.url))
  visit(new URL('../lib/types/open.d.ts', import.meta.url))
  expect(seen.size).toBeGreaterThan(2)
})
