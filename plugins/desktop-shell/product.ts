/**
 * A product build (M10 T002): a desktop package that ships an app as its own starting point. `product.json` at the bundle root marks it. The bundle is
 * the Program, read-only (a mounted DMG can never be written to); the person's apps live in the product's root in the OS per-user data folder, one
 * sealed folder each (plugins/instance/storage.ts, specs/049-framework-architecture/app-storage.md in ACRYL). A new app's source gets the person's
 * part of the starting app only; the Program (product.json's `program`: the framework's plugins, the generated host, the packages) stays in the bundle
 * and is served from there (plugins/instance/bundle.ts), so an update replaces it for every app.
 */

import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { AppInstance } from '@acryldev/instance'
import { inProgram, type Product } from '@acryldev/instance/bundle'
import type { AppStorage } from '@acryldev/instance/storage'

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
export function seedSource(
  bundle: string,
  source: string,
  program: readonly string[],
  refresh = false,
): void {
  cpSync(bundle, source, copyOptions(bundle, program))
  finishSeed(bundle, source, refresh)
}

/** `seedSource` without holding the event loop: a window can paint ("Updating...") while a big tree is copied. Same files, same result. */
export async function seedSourceAsync(
  bundle: string,
  source: string,
  program: readonly string[],
  refresh = false,
): Promise<void> {
  await cp(bundle, source, copyOptions(bundle, program))
  finishSeed(bundle, source, refresh)
}

/** What `cp` and `cpSync` copy: the bundle's own files, never the Program (which stays in the bundle) or the packager's carriers. */
function copyOptions(bundle: string, program: readonly string[]) {
  return {
    recursive: true,
    dereference: true,
    errorOnExist: false,
    force: true,
    // The bundled root arrives as a URL's directory and can end in a separator: paths are taken relative to it, never by index.
    filter: (path: string): boolean => {
      const parts = relative(bundle, path).split(sep)
      if (parts[0] === '') return true
      if (SKIPPED.has(parts[0] ?? '')) return false
      // A folder is compared with its trailing separator, so `plugins/router` is the Program's `plugins/router/`.
      const tree = parts.join('/')
      return !inProgram(program, tree) && !inProgram(program, `${tree}/`)
    },
  }
}

/** The small files after the tree: the repository (a new app only) and the files the packager carried under other names. */
function finishSeed(bundle: string, source: string, refresh: boolean): void {
  const templateGit = join(bundle, 'template-git')
  // A refresh keeps the source's own history: the new build's files arrive as changes in it, never as a replaced repository.
  if (!refresh && existsSync(templateGit))
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
  const { app, created } = openProductInstance(storage, product, bundle, log)
  if (product.named === true && product.build !== undefined)
    refreshFinishedApp(app, product, bundle, created, log)
  return app
}

/**
 * `openProductApp` for the window's start: the same app, but the update's copy over its source is returned, not run. The shell runs it after it holds the
 * single-instance lock and shows a window ("Updating..."), so a second start never copies at the same time and a person sees what is happening. Without
 * an update to run, `update` is undefined.
 */
export function openProductAppForStart(
  storage: AppStorage,
  product: Product,
  bundle: string,
  log: (line: string) => void = console.log,
): { readonly app: AppInstance; readonly update: (() => Promise<void>) | undefined } {
  const { app, created } = openProductInstance(storage, product, bundle, log)
  if (product.named !== true || product.build === undefined) return { app, update: undefined }
  const build = product.build
  const state = buildState(app, build, created)
  if (state.kind === 'record') writeBuild(app, build)
  if (state.kind !== 'copy') return { app, update: undefined }
  return {
    app,
    update: async () => {
      log(
        `product: updating "${app.name}" to build ${build} (it was made from ${state.made ?? 'an earlier build'})`,
      )
      await seedSourceAsync(sourceOf(product, bundle), app.root, product.program, true)
      // Written only after the copy finished: a start that could not copy tries again at the next start.
      writeBuild(app, build)
    },
  }
}

function openProductInstance(
  storage: AppStorage,
  product: Product,
  bundle: string,
  log: (line: string) => void,
): { readonly app: AppInstance; readonly created: boolean } {
  let app = storage.last()
  const created = app === undefined
  if (app === undefined) {
    log(`product: making the app "${product.appName}" from the bundled app (first start, one time)`)
    // A product that is one Blend carries it in a folder of its bundle; the Blank product's starting app is the bundle's own tree.
    const from = sourceOf(product, bundle)
    // A product that is one finished Blend (ACRYL Control Center, ACRYL ADE) has its name: only the Blank product asks for one (product.json `named`).
    app = storage.create(
      product.appName,
      (source) => {
        seedSource(from, source, product.program)
      },
      { named: product.named === true },
    )
  } else if (product.named === true && app.named !== true) {
    // An app a named product made before it carried the mark (ACRYL Control Center 0.1.0-0.1.3): keep its name and stop asking.
    app = storage.rename(app.id, app.name)
  }
  return { app: storage.open(app.id), created }
}

const sourceOf = (product: Product, bundle: string): string =>
  product.seed === undefined ? bundle : join(bundle, product.seed)

/** The file in a named product's app data that says which build its source was made from. */
export const PRODUCT_BUILD_FILE = 'product-build'

/**
 * A named product (a finished Blend: ACRYL Control Center, ACRYL ADE) ships its own plugins in the source half: without this, an app made by build 1 kept
 * build 1's code forever and no update reached the screen. When the source was made from another build, this build's files are copied over it (the
 * person's data lives in `data/`, never here). An app made before builds were recorded has no record, and is refreshed once.
 */
function refreshFinishedApp(
  app: AppInstance,
  product: Product,
  bundle: string,
  created: boolean,
  log: (line: string) => void,
): void {
  const build = product.build as string
  const state = buildState(app, build, created)
  if (state.kind === 'copy') {
    log(
      `product: updating "${app.name}" to build ${build} (it was made from ${state.made ?? 'an earlier build'})`,
    )
    seedSource(sourceOf(product, bundle), app.root, product.program, true)
  }
  if (state.kind !== 'current') writeBuild(app, build)
}

/** What the record says about the source: made from this build ('current'), new (only the record is written), or from another build (its files are copied over). */
function buildState(
  app: AppInstance,
  build: string,
  created: boolean,
):
  | { readonly kind: 'current' | 'record' }
  | { readonly kind: 'copy'; readonly made: string | undefined } {
  const record = join(app.home, PRODUCT_BUILD_FILE)
  const made = existsSync(record) ? readFileSync(record, 'utf8').trim() : undefined
  if (made === build) return { kind: 'current' }
  return created ? { kind: 'record' } : { kind: 'copy', made }
}

function writeBuild(app: AppInstance, build: string): void {
  mkdirSync(app.home, { recursive: true })
  writeFileSync(join(app.home, PRODUCT_BUILD_FILE), `${build}\n`)
}
