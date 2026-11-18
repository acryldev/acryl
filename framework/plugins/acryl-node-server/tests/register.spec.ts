/**
 * `node --import <register> page.tsx`, the way an app runs it: real child processes in a temporary app folder. The folder gets its own
 * `typescript` (linked from this package) or none, and a JSX runtime package its tsconfig.json names, so the hook reads `jsxImportSource`
 * from the app as it does in a real one.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const register = join(here, '..', 'src', 'register.ts')
const jsxRuntime = pathToFileURL(join(here, '..', '..', 'acryl-router', 'src', 'core', 'jsx', 'jsx-runtime.ts')).href
const typescript = realpathSync(join(here, '..', 'node_modules', 'typescript'))

const folders: string[] = []
afterEach(() => {
  while (folders.length > 0) rmSync(folders.pop()!, { recursive: true, force: true })
})

/** A temporary app: its files, a `test-jsx` runtime package its tsconfig.json points at, and `typescript` unless left out. */
function app(files: Record<string, string>, { withTypescript = true } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-register-'))
  folders.push(dir)
  const runtime = join(dir, 'node_modules', 'test-jsx')
  mkdirSync(runtime, { recursive: true })
  writeFileSync(join(runtime, 'package.json'), JSON.stringify({ name: 'test-jsx', type: 'module', exports: { './jsx-runtime': './jsx-runtime.js', './jsx-dev-runtime': './jsx-runtime.js' } }))
  writeFileSync(join(runtime, 'jsx-runtime.js'), `export * from ${JSON.stringify(jsxRuntime)}\n`)
  if (withTypescript) symlinkSync(typescript, join(dir, 'node_modules', 'typescript'), 'junction')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module' }))
  writeFileSync(join(dir, 'tsconfig.json'), '{\n  // as an app sets it up\n  "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "test-jsx" }\n}\n')
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

// Without NODE_PATH: pnpm's bin shim for vitest sets it to the workspace store, where an app started by `npm run` or `node` would not look.
const { NODE_PATH: _storePath, ...env } = process.env
// `--import` takes a module specifier, as `import()` does: an absolute path has to be a file: URL (on Windows `D:\...` reads as scheme `d:`).
const run = (dir: string, entry: string) =>
  spawnSync(process.execPath, ['--import', pathToFileURL(register).href, entry], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 })

describe('the JSX register hook', () => {
  it('runs a .tsx page that imports a .tsx component, compiled with the tsconfig.json import source', () => {
    const dir = app({
      'title.tsx': 'export const Title = ({ text }: { text: string }) => <h1 class="title">{text}</h1>\n',
      'page.tsx': "import { Title } from './title.tsx'\nprocess.stdout.write(String(<main><Title text=\"Acryl!\" /></main>))\n",
    })
    const result = run(dir, 'page.tsx')
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('<main><h1 class="title">Acryl!</h1></main>')
  })

  it('points a stack trace at the .tsx line', () => {
    const dir = app({
      'boom.tsx': [
        'const Broken = (): never => {',
        '  // line 2',
        "  throw new Error('broken component')",
        '}',
        'String(<div><Broken /></div>)',
        '',
      ].join('\n'),
    })
    const result = run(dir, 'boom.tsx')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('broken component')
    expect(result.stderr).toMatch(/boom\.tsx:3:\d+/u)
  })

  it('says what is missing when the app has no typescript', () => {
    const dir = app({ 'page.tsx': 'process.stdout.write(String(<p>x</p>))\n' }, { withTypescript: false })
    const result = run(dir, 'page.tsx')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('page.tsx contains JSX, and compiling it needs the typescript package in this app: npm install --save-dev typescript')
  })

  it('leaves .ts modules to Node: an app without typescript and without JSX runs', () => {
    const dir = app({ 'main.ts': "const greeting: string = 'Acryl!'\nprocess.stdout.write(greeting)\n" }, { withTypescript: false })
    const result = run(dir, 'main.ts')
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('Acryl!')
  })
})
