import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { classifySpecifier, findViolations, importsOf } from '../src/check-deps'
import { type Io, runCli } from '../src/index'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-deps-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let count = 0
function app(files: Record<string, string>, opener?: string | string[]) {
  const dir = join(scratch, `app${++count}`)
  const pkg = { name: 'x', ...(opener === undefined ? {} : { acryl: { opener } }) }
  files['package.json'] = JSON.stringify(pkg)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

describe('importsOf', () => {
  it('finds static, side-effect, re-export, dynamic and require imports with their lines', () => {
    const source = [
      "import { a } from 'one'",
      "import 'two'",
      "export * from 'three'",
      'const x = await import(',
      "  'four'",
      ')',
      "const y = require('five')",
      "import type { Db } from 'six'",
      'import {',
      '  b,',
      "} from 'seven'",
    ].join('\n')
    expect(importsOf(source)).toEqual([
      { specifier: 'one', line: 1 },
      { specifier: 'two', line: 2 },
      { specifier: 'three', line: 3 },
      { specifier: 'four', line: 5 },
      { specifier: 'five', line: 7 },
      { specifier: 'six', line: 8 },
      { specifier: 'seven', line: 11 },
    ])
  })
  it('ignores an import in a comment, and a word that only contains the keyword', () => {
    const source = [
      "// import x from 'node:sqlite'",
      "/* import y from 'pg' */",
      "/**\n * import z from 'electron'\n */",
      "const reimport = 'not an import'",
      "const s = 'pg'",
    ].join('\n')
    expect(importsOf(source)).toEqual([])
  })
})

describe('classifySpecifier', () => {
  it('names drivers, openers and electron, and leaves ports and packages alone', () => {
    expect(classifySpecifier('node:sqlite')).toBe('driver')
    expect(classifySpecifier('pg')).toBe('driver')
    expect(classifySpecifier('pg/lib/client')).toBe('driver')
    expect(classifySpecifier('@electric-sql/pglite')).toBe('driver')
    expect(classifySpecifier('acrylblends/db/sqlite')).toBe('opener')
    expect(classifySpecifier('acryl-db-sqlite/open')).toBe('opener')
    expect(classifySpecifier('electron')).toBe('electron')
    expect(classifySpecifier('acrylblends/db')).toBeUndefined()
    expect(classifySpecifier('acryl-db')).toBeUndefined()
    expect(classifySpecifier('pgrx')).toBeUndefined()
    expect(classifySpecifier('postgres-array')).toBeUndefined()
    expect(classifySpecifier('./pg')).toBeUndefined()
  })
})

describe('findViolations', () => {
  it('passes an app whose only provider import is its declared opener', () => {
    const dir = app(
      {
        'src/db.ts': "import { openDb } from 'acrylblends/db/sqlite'\n",
        'src/routes.ts': "import type { Db } from 'acrylblends/db'\n",
        'test/a.test.ts': "import { openDb } from '../src/db.ts'\n",
      },
      'src/db.ts',
    )
    expect(findViolations(dir)).toEqual([])
  })
  it('names the file and line of a driver imported in a route file', () => {
    const dir = app(
      {
        'src/db.ts': "import { openDb } from 'acrylblends/db/sqlite'\n",
        'src/routes.ts':
          "import { Acryl } from 'acrylblends'\n\nimport { DatabaseSync } from 'node:sqlite'\n",
      },
      'src/db.ts',
    )
    expect(findViolations(dir)).toEqual([
      { file: 'src/routes.ts', line: 3, specifier: 'node:sqlite', kind: 'driver' },
    ])
  })
  it('refuses the opener outside the declared file, and every provider when none is declared', () => {
    const dir = app({ 'src/a.ts': "import { openDb } from 'acrylblends/db/sqlite'\n" })
    expect(findViolations(dir).map((v) => v.kind)).toEqual(['opener'])
    const two = app(
      {
        'src/db.ts': "import 'acrylblends/db/sqlite'\n",
        'src/other.ts': "import 'acrylblends/db/sqlite'\n",
      },
      ['src/db.ts', 'src/extra.ts'],
    )
    expect(findViolations(two).map((v) => v.file)).toEqual(['src/other.ts'])
  })
  it('lets only the desktop shell import electron, and the provider plugin its own wrap', () => {
    const dir = app({
      'plugins/desktop/main.ts': "import { app } from 'electron'\n",
      'plugins/acryl-db-sqlite/src/index.ts':
        "import { openDb } from './open.ts'\nimport 'acryl-db-sqlite/open'\n",
      'plugins/mine/index.ts': "import 'electron'\nimport 'acryl-db-sqlite'\n",
    })
    expect(findViolations(dir).map((v) => `${v.file}:${v.line}:${v.kind}`)).toEqual([
      'plugins/mine/index.ts:1:electron',
      'plugins/mine/index.ts:2:opener',
    ])
  })
})

describe('check-deps', () => {
  it('prints file:line for a planted import and exits 1; exits 0 on a clean app', async () => {
    const bad = app({ 'src/routes.ts': "import { Client } from 'pg'\n" })
    let err = ''
    let out = ''
    const io: Io = {
      stdout: { write: (t: string) => (out += t) },
      stderr: { write: (t: string) => (err += t) },
      cwd: bad,
      ask: undefined,
      install: async () => 0,
    }
    expect(await runCli(['check-deps'], io)).toBe(1)
    expect(err).toContain('src/routes.ts:1: "pg" is a database driver')
    const good = app({ 'src/routes.ts': "import type { Db } from 'acrylblends/db'\n" })
    expect(await runCli(['check-deps', good], { ...io, cwd: scratch })).toBe(0)
    expect(out).toContain('no app code imports a database provider')
    expect(await runCli(['check-deps', 'a', 'b'], io)).toBe(2)
  })
})
