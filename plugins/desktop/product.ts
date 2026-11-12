/**
 * A product build (M10 T002): a desktop package that ships an app as its own starting point. `product.json` at the bundle root marks it. The bundle is
 * the Program, read-only (a mounted DMG can never be written to); the person's apps live in the product's root in the OS per-user data folder, one
 * sealed folder each (plugins/instance/storage.ts, specs/049-framework-architecture/app-storage.md in ACRYL). A new app's source gets the person's
 * part of the starting app only; the Program (product.json's `program`: the framework's plugins, the generated host, the packages) stays in the bundle
 * and is served from there (plugins/instance/bundle.ts), so an update replaces it for every app.
 */

import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { inProgram, type Product } from '../instance/bundle.ts'
import type { AppInstance } from '../instance/index.ts'
import type { AppStorage } from '../instance/storage.ts'

/**
 * What a new app's source does not carry from the bundle besides the Program: build output, the bundle's own app data, and the carrier names the packager
 * keeps files under. The scaffold's repository travels as `template-git` and becomes the source's `.git`; the other carriers become their files (see `CARRIED`).
 */
const SKIPPED = new Set([
  'dist',
  '.acrylblends',
  'product.json',
  'template-git',
  'gitignore-product',
  'gitattributes-product',
  'package-product.json',
])

/**
 * The app's own files that the packager drops or rewrites inside a bundle, and the plain names they travel under. electron-builder excludes `.gitignore` and `.gitattributes`
 * by name, and it ships a filtered manifest (the `scripts` block goes), so neither can reach the source as itself; `seedSource` writes them back.
 */
const CARRIED: readonly { readonly carrier: string; readonly file: string }[] = [
  { carrier: 'gitignore-product', file: '.gitignore' },
  { carrier: 'gitattributes-product', file: '.gitattributes' },
  { carrier: 'package-product.json', file: 'package.json' },
]

/** What the packager adds to the scaffold's repository: kept out of the source's `git status` through git's local exclude, never its tracked `.gitignore`. */
const PRODUCT_NAMES = [
  'product.json',
  'gitignore-product',
  'gitattributes-product',
  'package-product.json',
  'template-git/',
] as const

/** Keep the product's own names out of the source's `git status`, the way git's local exclude is meant for. */
function ignoreProductFiles(source: string): void {
  const git = join(source, '.git')
  if (!existsSync(git)) return
  const info = join(git, 'info')
  const file = join(info, 'exclude')
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const known = new Set(before.split('\n').map((line) => line.trim()))
  const missing = PRODUCT_NAMES.filter((name) => !known.has(name))
  if (missing.length === 0) return
  mkdirSync(info, { recursive: true })
  const separator = before === '' || before.endsWith('\n') ? '' : '\n'
  appendFileSync(file, `${separator}${missing.join('\n')}\n`)
}

/**
 * Fill a new app's empty source folder with the person's part of the bundle's starting app: its files, its repository and the files the packager could
 * only carry under another name, without the Program. Run once, when the app is made (`AppStorage.create`); an app's source is the person's from then on
 * and is never written here again.
 * @param bundle - the bundled app (read-only).
 * @param source - the new app's source folder.
 * @param program - the Program's paths (product.json), which stay in the bundle.
 */
export function seedSource(bundle: string, source: string, program: readonly string[]): void {
  cpSync(bundle, source, {
    recursive: true,
    dereference: true,
    errorOnExist: false,
    force: true,
    // The bundled root arrives as a URL's directory and can end in a separator: paths are taken relative to it, never by index.
    filter: (path) => {
      const parts = relative(bundle, path).split(sep)
      if (parts[0] === '') return true
      if (SKIPPED.has(parts[0] ?? '')) return false
      // A folder is compared with its trailing separator, so `plugins/acryl-router` is the Program's `plugins/acryl-router/`.
      const tree = parts.join('/')
      return !inProgram(program, tree) && !inProgram(program, `${tree}/`)
    },
  })
  const templateGit = join(bundle, 'template-git')
  if (existsSync(templateGit))
    cpSync(templateGit, join(source, '.git'), { recursive: true, force: true })
  for (const { carrier, file } of CARRIED) {
    const from = join(bundle, carrier)
    if (existsSync(from)) cpSync(from, join(source, file), { force: true })
  }
  ignoreProductFiles(source)
}

/**
 * The app a product opens: the one opened last, or on the first start a new one seeded from the bundle and named after the product's starting app.
 * Choosing among several apps and naming the first one are the frame's pages (app-storage.md slice 4).
 */
export function openProductApp(
  storage: AppStorage,
  product: Product,
  bundle: string,
  log: (line: string) => void = console.log,
): AppInstance {
  let app = storage.last()
  if (app === undefined) {
    log(`product: making the app "${product.appName}" from the bundled app (first start, one time)`)
    // A product that is one Blend carries it in a folder of its bundle; the Blank product's starting app is the bundle's own tree.
    const from = product.seed === undefined ? bundle : join(bundle, product.seed)
    app = storage.create(product.appName, (source) => {
      seedSource(from, source, product.program)
    })
  }
  return storage.open(app.id)
}
