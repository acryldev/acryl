// prepack: ship the plugin library and the framework docs inside the package (the CLI copies them out); postpack: remove the copies again.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isOmitted } from './dist/index.js'

const from = fileURLToPath(new URL('../../plugins', import.meta.url))
const to = fileURLToPath(new URL('./plugins', import.meta.url))

/**
 * What a plugin's folder contributes to the package: everything an app can receive. Tests (`test`, `tests`) and whatever the plugin's own `omit` patterns name (the colocated
 * `*.test.*` and `*.case.ts` files of the vendored framework) stay in the repository: `acrylblends init` never copies them, so shipping them only makes the package bigger.
 */
const omitOf = new Map()
function shipped(path) {
  const inside = relative(from, path).split(sep)
  if (inside.some((part) => part === 'node_modules' || part === 'test' || part === 'tests'))
    return false
  const [plugin, ...rest] = inside
  if (plugin === undefined || rest.length === 0) return true
  // A framework package (it has a package.json) ships as its source: the manifest, the licence and `src/`. Its build files and tests are the repository's own.
  if (
    existsSync(join(from, plugin, 'package.json')) &&
    !['plugin.json', 'LICENSE'].includes(rest.join('/')) &&
    rest[0] !== 'src'
  )
    return false
  if (!omitOf.has(plugin)) {
    const manifest = join(from, plugin, 'plugin.json')
    omitOf.set(
      plugin,
      existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).omit : undefined,
    )
  }
  return !isOmitted(rest.join('/'), omitOf.get(plugin))
}

rmSync(to, { recursive: true, force: true })
if (process.argv[2] === 'copy') cpSync(from, to, { recursive: true, filter: shipped })

const docsFrom = fileURLToPath(new URL('../../docs/framework', import.meta.url))
const docsTo = fileURLToPath(new URL('./docs', import.meta.url))

rmSync(docsTo, { recursive: true, force: true })
if (process.argv[2] === 'copy') cpSync(docsFrom, join(docsTo, 'framework'), { recursive: true })
