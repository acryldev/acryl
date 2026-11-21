// prepack: ship the plugin library and the framework docs inside the package (the CLI copies them out); postpack: remove the copies again.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isOmitted } from './dist/index.js'

const from = fileURLToPath(new URL('../../../plugins', import.meta.url))
const to = fileURLToPath(new URL('./plugins', import.meta.url))

/**
 * What a plugin's folder contributes to the package: everything an app can receive. Tests (`test`, `tests`) and whatever the plugin's own `omit` patterns name (the colocated
 * `*.test.*` and `*.case.ts` files of the vendored framework) stay in the repository: `acrylblends init` never copies them, so shipping them only makes the package bigger.
 * The repository's plugins folder also holds ACRYL's own plugins: only folders with a `plugin.json` are the library this package ships.
 */
const manifestOf = new Map()
function manifestOfPlugin(plugin) {
  if (!manifestOf.has(plugin)) {
    const file = join(from, plugin, 'plugin.json')
    manifestOf.set(plugin, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined)
  }
  return manifestOf.get(plugin)
}

function shipped(path) {
  const inside = relative(from, path).split(sep)
  if (inside.some((part) => part === 'node_modules' || part === 'test' || part === 'tests'))
    return false
  const [plugin, ...rest] = inside
  if (plugin === undefined || plugin === '') return true
  const manifest = manifestOfPlugin(plugin)
  // The library is the folders that name a plugin; ACRYL's own plugins sit beside it.
  if (manifest === undefined) return false
  if (rest.length === 0) return true
  // A package whose entry lives in `src/` (the vendored ones) ships only its manifests, licence and `src/`; the app plugins keep their files at the folder root and ship them all.
  if (
    existsSync(join(from, plugin, 'package.json')) &&
    (manifest.entries?.[''] ?? 'index.ts').startsWith('src/') &&
    !['plugin.json', 'package.json', 'LICENSE'].includes(rest.join('/')) &&
    rest[0] !== 'src'
  )
    return false
  // An app plugin keeps its source at the folder root: its build output and build files are the repository's own.
  if (
    !(manifest.entries?.[''] ?? 'index.ts').startsWith('src/') &&
    ['lib', 'dist', 'node_modules', 'scripts', 'tsdown.config.ts', 'tsconfig.json'].includes(
      rest[0],
    )
  )
    return false
  return !isOmitted(rest.join('/'), manifest.omit)
}

rmSync(to, { recursive: true, force: true })
if (process.argv[2] === 'copy') cpSync(from, to, { recursive: true, filter: shipped })

const docsFrom = fileURLToPath(new URL('../../docs/framework', import.meta.url))
const docsTo = fileURLToPath(new URL('./docs', import.meta.url))

rmSync(docsTo, { recursive: true, force: true })
if (process.argv[2] === 'copy') cpSync(docsFrom, join(docsTo, 'framework'), { recursive: true })

// The product packer (`acrylblends pack`, `acrylblends pkgbuild`) and the helpers they import, so a Blend's own repository packs with the published package.
const packTo = fileURLToPath(new URL('./pack', import.meta.url))
rmSync(packTo, { recursive: true, force: true })
if (process.argv[2] === 'copy') {
  for (const [from, to] of [
    ['pack-blank-mac.mjs', 'pack-blank-mac.mjs'],
    ['pkgbuild.mjs', 'pkgbuild.mjs'],
    ['lib/create-source.mjs', 'lib/create-source.mjs'],
    ['lib/arch-linux.mjs', 'lib/arch-linux.mjs'],
  ])
    cpSync(fileURLToPath(new URL(`../../scripts/${from}`, import.meta.url)), join(packTo, to))
}
