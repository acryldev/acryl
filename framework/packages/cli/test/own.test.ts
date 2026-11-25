// `acrylblends own` (spec 052 D18, T068) against a fake npm and a fake frame regeneration: what is copied, in what order the build runs, and that a
// failure leaves the app exactly as it was.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { Io } from '../src/io'
import { own, parseOwnOptions, type Run } from '../src/own'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function io(cwd: string) {
  const out: string[] = []
  const err: string[] = []
  const session: Io = {
    stdout: { write: (t: string) => out.push(t) },
    stderr: { write: (t: string) => err.push(t) },
    cwd,
    ask: undefined,
    install: async () => 0,
  }
  return { session, out, err }
}

/** An app in the frame with @acryldev/settings installed read-only, as a shared install leaves it, carrying its source (or not). */
function app(withSource = true): string {
  const root = mkdtempSync(join(tmpdir(), 'acryl-own-'))
  roots.push(root)
  writeFileSync(join(root, 'cordis.patch.yml'), '- insert: []\n')
  const pkg = join(root, 'node_modules', '@acryldev', 'settings')
  mkdirSync(join(pkg, 'lib'), { recursive: true })
  mkdirSync(join(pkg, 'node_modules', 'dep'), { recursive: true })
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: '@acryldev/settings', version: '1.2.3' }),
  )
  writeFileSync(join(pkg, 'lib', 'index.js'), 'export {}\n')
  if (withSource) {
    mkdirSync(join(pkg, 'src'))
    writeFileSync(join(pkg, 'src', 'index.ts'), 'export {}\n')
    chmodSync(join(pkg, 'src', 'index.ts'), 0o444)
  }
  return root
}

it('copies the installed package into plugins/, writable and without its node_modules, builds it and regenerates the frame', () => {
  const root = app()
  const calls: string[] = []
  const run: Run = (program, args, cwd) => {
    calls.push(`${cwd.slice(root.length)}: ${program} ${args.join(' ')}`)
    return 0
  }
  let regenerated = ''
  const { session, out } = io(root)
  expect(
    own(parseOwnOptions(['settings']), session, run, (dir) => {
      regenerated = dir
      return undefined
    }),
  ).toBe(0)
  const copy = join(root, 'plugins', 'settings')
  expect(existsSync(join(copy, 'src', 'index.ts'))).toBe(true)
  expect(existsSync(join(copy, 'node_modules'))).toBe(false)
  expect(statSync(join(copy, 'src', 'index.ts')).mode & 0o200).toBe(0o200)
  expect(readFileSync(join(copy, '.npmrc'), 'utf8')).toBe('legacy-peer-deps=true\n')
  expect(calls).toEqual([
    '/plugins/settings: npm install --include=dev --ignore-scripts --no-audit --no-fund',
    '/plugins/settings: npm run build',
  ])
  expect(regenerated).toBe(root)
  expect(out.join('')).toMatch(/the app owns @acryldev\/settings now/u)
})

it('a failed build or a refused regeneration removes the copy; a package without its source is refused before anything is copied', () => {
  const failing = app()
  const { session, err } = io(failing)
  expect(
    own(
      parseOwnOptions(['@acryldev/settings']),
      session,
      (_p, args) => (args[0] === 'run' ? 1 : 0),
      () => undefined,
    ),
  ).toBe(1)
  expect(existsSync(join(failing, 'plugins', 'settings'))).toBe(false)
  expect(err.join('')).toMatch(/building it failed; plugins\/settings\/ was removed/u)

  const refused = app()
  const second = io(refused)
  expect(
    own(
      parseOwnOptions(['settings']),
      second.session,
      () => 0,
      () => 'cordis.patch.yml was edited by hand',
    ),
  ).toBe(1)
  expect(existsSync(join(refused, 'plugins', 'settings'))).toBe(false)

  const old = app(false)
  const third = io(old)
  expect(
    own(
      parseOwnOptions(['settings']),
      third.session,
      () => {
        throw new Error('not reached')
      },
      () => undefined,
    ),
  ).toBe(1)
  expect(third.err.join('')).toMatch(/@acryldev\/settings@1\.2\.3 does not carry its source/u)
  expect(existsSync(join(old, 'plugins'))).toBe(false)
})

it('names only frame packages, and one at a time', () => {
  expect(() => parseOwnOptions([])).toThrow(/own takes one package/u)
  const root = app()
  expect(() => own(parseOwnOptions(['left-pad']), io(root).session)).toThrow(
    /not a frame package an app can own/u,
  )
})
