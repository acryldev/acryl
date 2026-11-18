// `node --import ./scripts/workspace-source.mjs --test ...`: the library plugins (plugins/acryl-*) import each other by package name (`acryl-router`, `acryl-router/helpers`), which in this
// workspace resolves to each package's built `lib/`. The tests of the library plugins that are not packages (agent-panel, extensions, builder ...) import the same plugins' SOURCE by
// relative path, so the two would be two copies of one module. This hook resolves those package names to the source too, from the `entries` table of each plugin.json, exactly as
// `acrylblends init` does when it copies a plugin into an app.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const plugins = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins')
const sources = new Map()
for (const name of readdirSync(plugins).filter((entry) => entry.startsWith('acryl-'))) {
  const manifest = join(plugins, name, 'plugin.json')
  if (!existsSync(manifest)) continue
  const { entries = {} } = JSON.parse(readFileSync(manifest, 'utf8'))
  for (const [subpath, file] of Object.entries(entries))
    sources.set(`${name}${subpath}`, pathToFileURL(join(plugins, name, file)).href)
}

registerHooks({
  resolve(specifier, context, next) {
    const source = sources.get(specifier)
    return source === undefined ? next(specifier, context) : next(source, context)
  },
})
