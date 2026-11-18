import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { test } from 'node:test'
import { readProduct } from '../../instance/bundle.ts'
import { openProductStorage } from '../../instance/storage.ts'
import { openProductApp, seedSource } from '../product.ts'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'acryl-product-'))

const PROGRAM = ['node_modules/', 'plugins/acryl-router/', 'scripts/', 'cordis.yml']

/** A bundle as electron-builder leaves it: no `.git`, a filtered manifest, and the carriers the packer adds. */
function bundle(root: string): void {
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'dist'), { recursive: true })
  mkdirSync(join(root, '.acrylblends'), { recursive: true })
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  mkdirSync(join(root, 'template-git', 'objects'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{}\n')
  writeFileSync(
    join(root, 'product.json'),
    `${JSON.stringify({ product: 'Test Product', appName: 'Test App', program: PROGRAM })}\n`,
  )
  // The Program: framework plugins next to the person's own, the generated host, the packages.
  mkdirSync(join(root, 'plugins', 'acryl-router'), { recursive: true })
  mkdirSync(join(root, 'plugins', 'notes'), { recursive: true })
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(join(root, 'plugins', 'acryl-router', 'index.ts'), 'export {}\n')
  writeFileSync(join(root, 'plugins', 'acryl-router-extra.ts'), 'export {}\n')
  writeFileSync(join(root, 'plugins', 'notes', 'index.ts'), 'export {}\n')
  writeFileSync(join(root, 'scripts', 'ide-host.mjs'), '// host\n')
  writeFileSync(join(root, 'cordis.yml'), '[]\n')
  writeFileSync(
    join(root, 'package-product.json'),
    '{"name":"test-app","scripts":{"dev":"node x"}}\n',
  )
  writeFileSync(join(root, 'gitignore-product'), 'node_modules/\n.acrylblends/\n')
  writeFileSync(join(root, 'gitattributes-product'), '* text=auto eol=lf\n')
  writeFileSync(join(root, 'src', 'app.ts'), 'export {}\n')
  writeFileSync(join(root, 'dist', 'build.txt'), 'x')
  writeFileSync(join(root, '.acrylblends', 'state.yaml'), 'x')
  writeFileSync(join(root, 'node_modules', 'dep.js'), 'x')
  writeFileSync(join(root, 'template-git', 'HEAD'), 'ref: refs/heads/main\n')
}

const excludeOf = (source: string): string =>
  readFileSync(join(source, '.git', 'info', 'exclude'), 'utf8')

/** A product's storage under a moved home (`<home>/.acryl`), never the real one. */
const storageIn = (home: string) =>
  openProductStorage({ writtenBy: '1.0.0', env: { HOME: home }, home })

test('reads the product marker: its name, and the first app’s name (the product’s when absent); a marker without a product is none', () => {
  const root = scratch()
  assert.equal(readProduct(root), undefined)
  writeFileSync(join(root, 'product.json'), '{"product":"  "}\n')
  assert.equal(readProduct(root), undefined)
  // The marker an earlier build wrote names a Documents folder: it is not a product of this layout.
  writeFileSync(join(root, 'product.json'), '{"appFolder":"Test App"}\n')
  assert.equal(readProduct(root), undefined)
  writeFileSync(join(root, 'product.json'), '{"product":"Test Product"}\n')
  assert.deepEqual(readProduct(root), {
    product: 'Test Product',
    appName: 'Test Product',
    program: [],
  })
  writeFileSync(join(root, 'product.json'), '{"product":"Test Product","appName":" Mine "}\n')
  assert.deepEqual(readProduct(root), { product: 'Test Product', appName: 'Mine', program: [] })
})

test('a new app’s source is the person’s part of the bundled app, with what the packager drops or filters written back, and without the Program, build output, app data or the marker', () => {
  const root = scratch()
  const source = join(scratch(), 'source')
  bundle(root)
  // The bundled root arrives as a URL's directory, with a trailing separator: the skip list must still name the bundle's top level.
  seedSource(`${root}${sep}`, source, PROGRAM)
  // The `.gitignore` and the manifest the packager refused to ship are there as themselves.
  assert.equal(readFileSync(join(source, '.gitignore'), 'utf8'), 'node_modules/\n.acrylblends/\n')
  // Line endings stay pinned in the person's repository, so a plugin made on Windows digests the same on a Mac.
  assert.equal(readFileSync(join(source, '.gitattributes'), 'utf8'), '* text=auto eol=lf\n')
  assert.equal(
    readFileSync(join(source, 'package.json'), 'utf8'),
    '{"name":"test-app","scripts":{"dev":"node x"}}\n',
  )
  // The repository travels as its carrier and becomes `.git`; the carrier names do not stay in the source.
  assert.equal(readFileSync(join(source, '.git', 'HEAD'), 'utf8'), 'ref: refs/heads/main\n')
  for (const absent of [
    'template-git',
    'gitignore-product',
    'gitattributes-product',
    'package-product.json',
    'product.json',
    'dist',
    '.acrylblends',
    // The Program stays in the bundle and is served from there.
    'node_modules',
    'plugins/acryl-router',
    'scripts',
    'cordis.yml',
  ])
    assert.equal(existsSync(join(source, absent)), false, absent)
  assert.equal(readFileSync(join(source, 'src', 'app.ts'), 'utf8'), 'export {}\n')
  // The person's plugins are theirs; a name that only starts like a Program folder is not the Program.
  assert.ok(existsSync(join(source, 'plugins', 'notes', 'index.ts')))
  assert.ok(existsSync(join(source, 'plugins', 'acryl-router-extra.ts')))
  // The product's names are ignored locally, never through the app's own `.gitignore`.
  assert.match(excludeOf(source), /^product\.json$/mu)
})

test('the first start makes one app in the product’s root, never in Documents; a later start opens it again and never seeds it twice', () => {
  const root = scratch()
  bundle(root)
  const home = scratch()
  const product = { product: 'Test Product', appName: 'Test App', program: PROGRAM }
  const lines: string[] = []
  const first = openProductApp(storageIn(home), product, root, (line) => lines.push(line))
  assert.equal(first.kind, 'product')
  assert.equal(first.name, 'Test App')
  assert.match(first.id, /^test-app-[0-9a-f]{4}$/u)
  // Source, data (the engine's home, its logs inside) and cache, in one folder under ~/.acryl of the moved home, the same for every product.
  assert.ok(first.root.startsWith(home), first.root)
  assert.equal(first.root, join(home, '.acryl', 'apps', first.id, 'source'))
  assert.equal(first.home, join(first.root, '..', 'data'))
  assert.equal(first.dshHome, first.home)
  assert.ok(existsSync(join(first.home, 'logs')))
  assert.equal(readFileSync(join(first.root, 'src', 'app.ts'), 'utf8'), 'export {}\n')
  assert.equal(existsSync(join(home, 'Documents')), false)

  // The person's change survives the next start: the source is theirs, and the bundle is not copied over it.
  writeFileSync(join(first.root, 'src', 'app.ts'), 'export const mine = 1\n')
  const again = openProductApp(storageIn(home), product, root, (line) => lines.push(line))
  assert.equal(again.id, first.id)
  assert.equal(readFileSync(join(again.root, 'src', 'app.ts'), 'utf8'), 'export const mine = 1\n')
  assert.equal(lines.length, 1)
  assert.equal(storageIn(home).apps().length, 1)
  assert.ok(storageIn(home).apps()[0]?.lastOpened !== undefined)
  // The Blank product's app is the person's to name: the first start asks.
  assert.equal(storageIn(home).apps()[0]?.named, undefined)
})

test('nothing the product writes names the bundle: no file under its root holds the bundle’s path, so a moved or updated bundle opens every app', () => {
  const root = scratch()
  bundle(root)
  const home = scratch()
  openProductApp(
    storageIn(home),
    { product: 'Test Product', appName: 'Test App', program: PROGRAM },
    root,
    () => {},
  )
  const offenders: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (readFileSync(path, 'utf8').includes(root)) offenders.push(path)
    }
  }
  walk(home)
  assert.deepEqual(offenders, [])
})

test('a seed that fails leaves no app behind: no registry entry and no folder', () => {
  const home = scratch()
  const storage = storageIn(home)
  assert.throws(
    () =>
      storage.create('Broken', () => {
        throw new Error('the bundle is unreadable')
      }),
    /the bundle is unreadable/u,
  )
  assert.deepEqual(storage.apps(), [])
  const apps = join(storage.electron, '..', 'apps')
  assert.deepEqual(existsSync(apps) ? readdirSync(apps) : [], [])
})

test('a root written by a newer version stops with a message naming that version, and is left as it was', () => {
  const home = scratch()
  const storage = storageIn(home)
  const layout = join(storage.electron, '..', 'layout.json')
  const newer = '{"layout":2,"writtenBy":"9.0.0"}'
  writeFileSync(layout, newer)
  assert.throws(
    () => storageIn(home),
    /written by 9\.0\.0, which is newer than this one \(1\.0\.0\)/u,
  )
  assert.equal(readFileSync(layout, 'utf8'), newer)
})

test('a product that is one Blend makes its first app from the Blend in its bundle, not from the bundle’s own tree, and without the Program the Blend carried', () => {
  const root = scratch()
  bundle(root)
  // The Blend: its own plugin and source, a copy of a framework plugin (the Program serves that one from the bundle), and the repository it travels with.
  const seed = join(root, 'seed')
  mkdirSync(join(seed, 'plugins', 'finops'), { recursive: true })
  mkdirSync(join(seed, 'plugins', 'acryl-router'), { recursive: true })
  mkdirSync(join(seed, 'template-git'), { recursive: true })
  writeFileSync(join(seed, 'plugins', 'finops', 'index.ts'), 'export const finops = 1\n')
  writeFileSync(join(seed, 'plugins', 'acryl-router', 'index.ts'), 'export const copy = 1\n')
  writeFileSync(join(seed, 'blend.yaml'), 'kind: Blueprint\n')
  writeFileSync(join(seed, 'template-git', 'HEAD'), 'ref: refs/heads/main\n')
  const product = {
    product: 'Cloud Costs',
    appName: 'Cloud Costs',
    program: PROGRAM,
    seed: 'seed',
    named: true as const,
  }
  const storage = openProductStorage({ writtenBy: '1.0.0', env: {}, home: scratch() })
  const app = openProductApp(storage, product, root, () => {})
  // A product that is one Blend is a finished app under its own name: the first start does not ask for one.
  assert.equal(storage.app(app.id).named, true)
  // An app this product made before it carried the mark is marked on the next start, under the name it has.
  const home2 = scratch()
  const storage2 = openProductStorage({ writtenBy: '1.0.0', env: {}, home: home2 })
  const earlier = openProductApp(storage2, { ...product, named: undefined }, root, () => {})
  assert.equal(storage2.app(earlier.id).named, undefined)
  const again = openProductApp(storage2, product, root, () => {})
  assert.equal(again.id, earlier.id)
  assert.equal(storage2.app(earlier.id).named, true)
  assert.equal(storage2.app(earlier.id).name, 'Cloud Costs')
  assert.equal(
    readFileSync(join(app.root, 'plugins', 'finops', 'index.ts'), 'utf8'),
    'export const finops = 1\n',
  )
  assert.ok(existsSync(join(app.root, 'blend.yaml')))
  assert.ok(existsSync(join(app.root, '.git', 'HEAD')))
  // Not the bundle's own tree (the Blank starter's src), and not the Blend's copy of a Program plugin.
  assert.equal(existsSync(join(app.root, 'src', 'app.ts')), false)
  assert.equal(existsSync(join(app.root, 'plugins', 'acryl-router')), false)
})

test('the marker names a seed folder only as a relative path inside the bundle', () => {
  const root = scratch()
  for (const [seed, expected] of [
    ['seed', 'seed'],
    ['seed/', 'seed'],
    ['../outside', undefined],
    ['/abs', undefined],
    ['a\\b', undefined],
  ] as const) {
    writeFileSync(join(root, 'product.json'), JSON.stringify({ product: 'P', seed }))
    assert.equal(readProduct(root)?.seed, expected, seed)
  }
})

test('a named product updated to a new build copies the new build over its app, once, and keeps its data and history; the Blank product never does', () => {
  const root = scratch()
  bundle(root)
  const seed = join(root, 'seed')
  mkdirSync(join(seed, 'plugins', 'launcher'), { recursive: true })
  mkdirSync(join(seed, 'template-git'), { recursive: true })
  writeFileSync(join(seed, 'plugins', 'launcher', 'service.ts'), 'export const v = 1\n')
  writeFileSync(join(seed, 'template-git', 'HEAD'), 'ref: refs/heads/main\n')
  const product = {
    product: 'Control',
    appName: 'Control',
    program: PROGRAM,
    seed: 'seed',
    named: true as const,
    build: 'b1',
  }
  const home = scratch()
  const lines: string[] = []
  const first = openProductApp(
    openProductStorage({ writtenBy: '1.0.0', env: {}, home }),
    product,
    root,
    (line) => lines.push(line),
  )
  writeFileSync(join(first.home, 'chats.json'), '[1]\n')
  writeFileSync(join(first.root, '.git', 'HEAD'), 'ref: refs/heads/mine\n')

  // The same build: nothing is copied.
  openProductApp(openProductStorage({ writtenBy: '1.0.0', env: {}, home }), product, root, (line) =>
    lines.push(line),
  )
  assert.equal(lines.filter((line) => line.includes('updating')).length, 0)

  // The update: build 2's file arrives; the data and the repository stay.
  writeFileSync(join(seed, 'plugins', 'launcher', 'service.ts'), 'export const v = 2\n')
  const updated = openProductApp(
    openProductStorage({ writtenBy: '1.0.0', env: {}, home }),
    { ...product, build: 'b2' },
    root,
    (line) => lines.push(line),
  )
  assert.equal(updated.id, first.id)
  assert.equal(
    readFileSync(join(updated.root, 'plugins', 'launcher', 'service.ts'), 'utf8'),
    'export const v = 2\n',
  )
  assert.equal(readFileSync(join(updated.home, 'chats.json'), 'utf8'), '[1]\n')
  assert.equal(readFileSync(join(updated.root, '.git', 'HEAD'), 'utf8'), 'ref: refs/heads/mine\n')
  assert.equal(lines.filter((line) => line.includes('updating')).length, 1)

  // An app from before builds were recorded is updated once.
  rmSync(join(updated.home, 'product-build'))
  writeFileSync(join(updated.root, 'plugins', 'launcher', 'service.ts'), 'stale\n')
  openProductApp(
    openProductStorage({ writtenBy: '1.0.0', env: {}, home }),
    { ...product, build: 'b2' },
    root,
    () => {},
  )
  assert.equal(
    readFileSync(join(updated.root, 'plugins', 'launcher', 'service.ts'), 'utf8'),
    'export const v = 2\n',
  )

  // The Blank product's source is the person's: a build mark never copies over it.
  const blankHome = scratch()
  const blank = { product: 'Blank', appName: 'Blank', program: PROGRAM, build: 'b1' }
  const mine = openProductApp(
    openProductStorage({ writtenBy: '1.0.0', env: {}, home: blankHome }),
    blank,
    root,
    () => {},
  )
  writeFileSync(join(mine.root, 'src', 'app.ts'), 'export const mine = 1\n')
  openProductApp(
    openProductStorage({ writtenBy: '1.0.0', env: {}, home: blankHome }),
    { ...blank, build: 'b2' },
    root,
    () => {},
  )
  assert.equal(readFileSync(join(mine.root, 'src', 'app.ts'), 'utf8'), 'export const mine = 1\n')
})
