/**
 * The plain entries import nothing from Cordis: `acryl-kv-json/open` and `acryl-kv`'s root, their built JavaScript and declarations, and
 * every file those import. It reads this package's built `lib/` and its workspace neighbour `acryl-kv`'s, so it needs `pnpm run build` first.
 *
 * vendoring: skip - a copy vendored into an app (with relative imports, no build of its own) has neither `lib/`; the app's own typecheck
 * is what proves the copy names no Cordis type it does not provide.
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
    expect(imports.filter(spec => /cordis|schemastery/u.test(spec)), fileURLToPath(file)).toEqual([])
    for (const spec of imports) {
      if (!spec.startsWith('.')) continue
      const target = /\.(?:js|ts)$/u.test(spec) ? spec.replace(/\.ts$/u, file.pathname.endsWith('.d.ts') ? '.d.ts' : '.js') : `${spec}.js`
      visit(new URL(target, file))
    }
  }
  const lib = (pkg: string, file: string) => new URL(`../../${pkg}/lib/${file}`, import.meta.url)
  for (const [pkg, file] of [['acryl-kv-json', 'open.js'], ['acryl-kv-json', 'types/open.d.ts'], ['acryl-kv', 'index.js'], ['acryl-kv', 'types/index.d.ts']] as const) visit(lib(pkg, file))
  expect(seen.size).toBeGreaterThan(4)
})
