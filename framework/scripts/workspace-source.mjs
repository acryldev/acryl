// `node --import ./scripts/workspace-source.mjs --test ...`: the library plugins (plugins/ at the repository root, the app plugins beside ACRYL's own) import each other by
// package name (`@acryldev/router`, `@acryldev/instance`), which in this workspace resolves to each package's built `lib/` or source. The tests import the same plugins' SOURCE by
// relative path, so the two would be two copies of one module. This hook resolves those package names to the source too, from the `entries` table of each plugin.json,
// exactly as `acrylblends init` does when it copies a plugin into an app.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const plugins = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins')
const sources = new Map()
for (const name of readdirSync(plugins)) {
  const manifest = join(plugins, name, 'plugin.json')
  if (!existsSync(manifest)) continue
  const packageFile = join(plugins, name, 'package.json')
  const packageName = existsSync(packageFile)
    ? JSON.parse(readFileSync(packageFile, 'utf8')).name
    : name
  const { entries = {} } = JSON.parse(readFileSync(manifest, 'utf8'))
  for (const [subpath, file] of Object.entries(entries))
    sources.set(`${packageName}${subpath}`, pathToFileURL(join(plugins, name, file)).href)
}

// Workspace packages that are not library plugins (the framework CLI, the runtime packages) are imported by package name from a profile a
// test boots in a temporary folder, where Node's own resolution finds no node_modules. Map each export to the package's built file.
const repoRoot = join(plugins, '..')
for (const group of ['plugins', 'runtime', 'framework/packages']) {
  const base = join(repoRoot, group)
  if (!existsSync(base)) continue
  for (const name of readdirSync(base)) {
    const file = join(base, name, 'package.json')
    if (!existsSync(file)) continue
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof manifest.name !== 'string' || manifest.exports === undefined) continue
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      const value = typeof target === 'string' ? target : (target?.default ?? target?.import ?? target?.require)
      if (typeof value !== 'string' || !value.startsWith('./lib/')) continue
      const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.replace(/^\.\//u, '')}`
      if (!sources.has(specifier)) sources.set(specifier, pathToFileURL(join(base, name, value)).href)
    }
  }
}

registerHooks({
  resolve(specifier, context, next) {
    const source = sources.get(specifier)
    return source === undefined ? next(specifier, context) : next(source, context)
  },
})
