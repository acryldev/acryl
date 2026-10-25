/**
 * `clientModules` and `buildClientModules` against real folders: each test app is a temporary folder with its own `typescript` (linked from
 * this package) or none, as an app with and without its devDependencies. The browser files are stand-ins here; the framework's real ones,
 * in a real browser, are checked by `distribution/acrylblends-framework/scripts/verify-standalone.mjs`.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Acryl } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import { CompileCache, buildClientModules, clientModules } from '../src/client-modules.ts'

const here = dirname(fileURLToPath(import.meta.url))
const typescript = realpathSync(join(here, '..', 'node_modules', 'typescript'))

const folders: string[] = []
afterEach(() => {
  while (folders.length > 0) rmSync(folders.pop()!, { recursive: true, force: true })
})

/** A temporary app: `src/client/` with the given files, `typescript` unless left out, and stand-in browser files in `runtime/`. */
function app(files: Record<string, string>, { withTypescript = true } = {}): { dir: string, root: string, runtimeDir: string } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-client-modules-')))
  folders.push(dir)
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  if (withTypescript) symlinkSync(typescript, join(dir, 'node_modules', 'typescript'), 'junction')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module' }))
  const root = join(dir, 'src', 'client')
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), text)
  }
  mkdirSync(root, { recursive: true })
  const runtimeDir = join(dir, 'runtime')
  mkdirSync(runtimeDir)
  writeFileSync(join(runtimeDir, 'jsx-dom.js'), '/* jsx-dom */\n')
  writeFileSync(join(runtimeDir, 'client.js'), '/* client */\n')
  return { dir, root, runtimeDir }
}

const COUNTER = [
  "import { render, useState } from 'acrylblends/jsx/dom'",
  "import { hc } from 'acrylblends/client'",
  "import confetti from 'canvas-confetti'",
  "import { label } from './parts/label.ts'",
  "const hint: string = \"import x from 'acrylblends/jsx/dom'\"",
  'const Counter = () => { const [n, set] = useState(0); return <button onClick={() => set(n + 1)}>{label(n)}</button> }',
  "render(<Counter />, document.getElementById('counter')!)",
  'export { hc, confetti, hint }',
  '',
].join('\n')
const LABEL = "import { jsx } from 'acrylblends/jsx/dom/jsx-runtime'\nexport const label = (n: number): string => `Count ${n}`\nexport { jsx }\n"

const serve = (options: Parameters<typeof clientModules>[0], mount = '/client') => new Acryl().route(mount, clientModules(options))

const withEnv = async (value: string | undefined, run: () => Promise<void>): Promise<void> => {
  const previous = process.env.NODE_ENV
  if (value === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = value
  try {
    await run()
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
}

describe('clientModules', () => {
  it('serves a .tsx module compiled for the browser, with the framework imports pointed at the browser files', async () => {
    const { root, runtimeDir } = app({ 'counter.tsx': COUNTER, 'parts/label.ts': LABEL })
    const site = serve({ root, runtimeDir })
    const res = await site.request('/client/counter.tsx')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    const code = await res.text()
    expect(code).toContain('from "./@acrylblends/jsx-dom.js"') // the JSX runtime TypeScript adds
    expect(code).toContain("from './@acrylblends/jsx-dom.js'")
    expect(code).toContain("from './@acrylblends/client.js'")
    expect(code).toContain("from 'canvas-confetti'") // another package is left to the page's import map
    expect(code).toContain("from './parts/label.ts'")
    expect(code).toContain("\"import x from 'acrylblends/jsx/dom'\"") // a string is not an import
    expect(code).not.toContain(': string')
    expect(code).toContain('//# sourceMappingURL=data:application/json;base64,')
    // One level down, the browser files are one level up.
    expect(await (await site.request('/client/parts/label.ts')).text()).toContain("from '../@acrylblends/jsx-dom.js'")
    expect(await (await site.request('/client/@acrylblends/jsx-dom.js')).text()).toBe('/* jsx-dom */\n')
    expect(await (await site.request('/client/@acrylblends/client.js')).text()).toBe('/* client */\n')
  })

  it('works under whatever path the app is routed at', async () => {
    const { root, runtimeDir } = app({ 'counter.tsx': COUNTER, 'parts/label.ts': LABEL })
    const site = serve({ root, runtimeDir }, '/assets/islands')
    expect((await site.request('/assets/islands/counter.tsx')).status).toBe(200)
    expect(await (await site.request('/assets/islands/@acrylblends/jsx-dom.js')).text()).toBe('/* jsx-dom */\n')
    expect((await site.request('/client/counter.tsx')).status).toBe(404)
  })

  it('compiles JSX for the DOM renderer whatever the server tsconfig.json says, and a file pragma still wins', async () => {
    const { dir, root, runtimeDir } = app({
      'a.tsx': 'export const a = <i />\n',
      'b.tsx': '/** @jsxImportSource preact */\nexport const b = <i />\n',
    })
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'acrylblends/jsx' } }))
    const site = serve({ root, runtimeDir })
    expect(await (await site.request('/client/a.tsx')).text()).toContain('from "./@acrylblends/jsx-dom.js"')
    expect(await (await site.request('/client/b.tsx')).text()).toContain('from "preact/jsx-runtime"')
  })

  it('serves .js and .mjs files as they are', async () => {
    const { root, runtimeDir } = app({ 'plain.js': "import 'acrylblends/jsx/dom'\n", 'mod.mjs': 'export {}\n' })
    const site = serve({ root, runtimeDir })
    const res = await site.request('/client/plain.js')
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(await res.text()).toBe("import 'acrylblends/jsx/dom'\n")
    expect((await site.request('/client/mod.mjs')).status).toBe(200)
  })

  it('answers 404 for anything outside the folder or outside the served files', async () => {
    const { dir, root, runtimeDir } = app({ 'counter.tsx': COUNTER, '.secret.ts': 'x', 'types.d.ts': 'x', 'notes.txt': 'x', 'parts/label.ts': LABEL })
    writeFileSync(join(dir, 'server.ts'), 'export const secret = 1\n')
    symlinkSync(join(dir, 'server.ts'), join(root, 'linked.ts'))
    mkdirSync(join(root, 'dir.ts'))
    const site = serve({ root, runtimeDir })
    for (const path of [
      '/client/../server.ts', '/client/%2e%2e/server.ts', '/client/parts/..%2f..%2f..%2fserver.ts', '/client/.secret.ts', '/client/types.d.ts',
      '/client/notes.txt', '/client/linked.ts', '/client/dir.ts', '/client/missing.tsx', '/client/parts%5clabel.ts', '/client/%E0%A4%A.ts',
      '/client/@acrylblends/other.js', '/client/', '/client',
    ]) {
      expect((await site.request(path)).status, path).toBe(404)
    }
  })

  it('compiles a module once until it changes, and answers a matching If-None-Match with 304', async () => {
    const { root, runtimeDir } = app({ 'a.ts': 'export const a: number = 1\n' })
    const site = serve({ root, runtimeDir })
    const first = await site.request('/client/a.ts')
    const etag = first.headers.get('etag')!
    expect(etag).toMatch(/^".+"$/u)
    expect((await site.request('/client/a.ts', { headers: { 'if-none-match': etag } })).status).toBe(304)
    writeFileSync(join(root, 'a.ts'), 'export const a: number = 22\n')
    utimesSync(join(root, 'a.ts'), new Date(), new Date(Date.now() + 5_000))
    const edited = await site.request('/client/a.ts', { headers: { 'if-none-match': etag } })
    expect(edited.status).toBe(200)
    expect(await edited.text()).toContain('export const a = 22')
  })

  it('says what is missing when the app has no typescript, and still serves plain modules', async () => {
    const { root, runtimeDir } = app({ 'counter.tsx': COUNTER, 'plain.js': 'export {}\n' }, { withTypescript: false })
    const site = serve({ root, runtimeDir })
    const res = await site.request('/client/counter.tsx')
    expect(res.status).toBe(500)
    expect(await res.text()).toBe(`acrylblends: ${join(root, 'counter.tsx')} is a client module, and compiling it needs the typescript package in this app: npm install --save-dev typescript`)
    expect((await site.request('/client/plain.js')).status).toBe(200)
  })
})

describe('CompileCache', () => {
  const stat = { mtimeMs: 1, size: 1 }
  it('keeps at most its bound of bytes, dropping the least recently served first', () => {
    const cache = new CompileCache(10)
    cache.set('a', stat, '1234')
    cache.set('b', stat, '1234')
    expect(cache.get('a', 1, 1)?.code).toBe('1234') // a is now the most recent
    cache.set('c', stat, '1234')
    expect(cache.files).toEqual(['a', 'c'])
    expect(cache.heldBytes).toBe(8)
  })

  it('counts UTF-8 bytes, does not keep a module larger than the bound, and drops an entry whose file changed', () => {
    const cache = new CompileCache(10)
    cache.set('wide', stat, 'éééé') // 8 bytes
    expect(cache.heldBytes).toBe(8)
    expect(cache.set('huge', stat, 'x'.repeat(11)).code).toHaveLength(11)
    expect(cache.files).toEqual(['wide'])
    expect(cache.get('wide', 2, 1)).toBeUndefined()
    expect(cache.heldBytes).toBe(0)
  })
})

describe('buildClientModules', () => {
  it('writes each module compiled at the same path and copies the browser files', () => {
    const { dir, root, runtimeDir } = app({ 'counter.tsx': COUNTER, 'parts/label.ts': LABEL, 'plain.js': 'export {}\n', '.hidden.ts': 'x', 'types.d.ts': 'x' })
    const outDir = join(dir, 'dist', 'client')
    expect(buildClientModules({ root, outDir, runtimeDir })).toEqual(['counter.tsx', 'parts/label.ts', 'plain.js', '@acrylblends/jsx-dom.js', '@acrylblends/client.js'])
    expect(readFileSync(join(outDir, 'counter.tsx'), 'utf8')).toContain("from './@acrylblends/client.js'")
    expect(readFileSync(join(outDir, 'parts', 'label.ts'), 'utf8')).toContain("from '../@acrylblends/jsx-dom.js'")
    expect(readFileSync(join(outDir, '@acrylblends', 'jsx-dom.js'), 'utf8')).toBe('/* jsx-dom */\n')
  })

  it('refuses an output folder inside the client folder', () => {
    const { root, runtimeDir } = app({ 'a.ts': 'export {}\n' })
    expect(() => buildClientModules({ root, outDir: join(root, 'dist'), runtimeDir })).toThrow('lies inside the client folder')
  })

  it('serves the built folder in production with no typescript in the app, and only that folder', async () => {
    const { dir, root, runtimeDir } = app({ 'counter.tsx': COUNTER, 'parts/label.ts': LABEL, 'later.ts': 'export {}\n' })
    const outDir = join(dir, 'dist', 'client')
    buildClientModules({ root, outDir, runtimeDir })
    unlinkSync(join(outDir, 'later.ts'))
    // The production install: devDependencies left out.
    unlinkSync(join(dir, 'node_modules', 'typescript'))
    await withEnv('production', async () => {
      const site = serve({ root, runtimeDir: join(dir, 'nowhere'), compiled: outDir })
      const res = await site.request('/client/counter.tsx')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(readFileSync(join(outDir, 'counter.tsx'), 'utf8'))
      expect(await (await site.request('/client/@acrylblends/jsx-dom.js')).text()).toBe('/* jsx-dom */\n')
      const stale = await site.request('/client/later.ts')
      expect(stale.status).toBe(500)
      expect(await stale.text()).toContain('later.ts is not in')
      expect((await site.request('/client/missing.ts')).status).toBe(404)
      // A production image may ship only the built folder.
      rmSync(join(dir, 'src'), { recursive: true })
      expect((await serve({ root, compiled: outDir }).request('/client/counter.tsx')).status).toBe(200)
      expect(() => clientModules({ root, compiled: join(dir, 'not-built') })).toThrow('does not exist; build it with buildClientModules')
    })
  })

  it('compiles on request outside production even when a built folder exists, so an edit shows', async () => {
    const { dir, root, runtimeDir } = app({ 'a.ts': 'export const a = 1\n' })
    const outDir = join(dir, 'dist', 'client')
    buildClientModules({ root, outDir, runtimeDir })
    writeFileSync(join(root, 'a.ts'), 'export const a = 2\n')
    await withEnv(undefined, async () => {
      expect(await (await serve({ root, runtimeDir, compiled: outDir }).request('/client/a.ts')).text()).toContain('export const a = 2')
    })
  })
})
