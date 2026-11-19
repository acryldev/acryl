/**
 * A staged extension lives in the app's home, which may be anywhere (a pinned home in a temporary folder), so a bare import such as
 * `@deepseek-ai/cordis` would not find the app's `node_modules`. This resolve hook leaves resolution alone, and only when it fails for a
 * module inside the staging folder, resolves the same name from the app's project folder. Uses Node's public `module.registerHooks`
 * (ACRYL needed the same fallback on Deno); the returned function removes the hook.
 *
 * The framework plugins are not packages in an app (they are source under `plugins/`), so `aliases` names the files a framework specifier such as
 * `acryl-router` stands for (and the ports and providers beside it: `acryl-kv`, `acryl-kv-json`, `acryl-db`, ..., and each as `#acryl-kv` ... the name the app's `package.json` "imports" gives them). A staged plugin then imports the same module the app itself runs, so `App` is the very class the router mounts.
 */
import { existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PACKAGE = 'acrylblends'

const isBare = (specifier: string) => !/^[./]/.test(specifier) && !specifier.includes(':')

/**
 * The framework's specifiers, as files of the vendored router plugin that sits beside this one. A plugin written while the app runs (by the agent, from the docs in the app)
 * imports `acrylblends` and `acrylblends/<subpath>` as the docs write them; the old `acryl-router` names keep working. Empty when the app has no router.
 */
const MIDDLEWARE = [
  'basic-auth',
  'bearer-auth',
  'body-limit',
  'combine',
  'compress',
  'context-storage',
  'cors',
  'csrf',
  'etag',
  'ip-restriction',
  'jwk',
  'jwt',
  'language',
  'logger',
  'loopback-only',
  'method-not-allowed',
  'method-override',
  'powered-by',
  'pretty-json',
  'request-id',
  'secure-headers',
  'serve-static',
  'timeout',
  'timing',
  'trailing-slash',
]
const HELPERS = [
  'accepts',
  'cookie',
  'factory',
  'html',
  'route',
  'schema-validator',
  'streaming',
  'testing',
  'validator',
  'ws',
]

/** The `acrylblends/...` names a plugin installed live may import, with the file each resolves to under `acryl-router/src`. */
export function frameworkSpecifiers(): Record<string, string> {
  const map: Record<string, string> = {
    '': 'index.ts',
    conninfo: 'index.ts',
    'http-exception': 'index.ts',
    types: 'index.ts',
    client: 'client.ts',
    jsx: 'core/jsx/index.ts',
    'jsx/jsx-runtime': 'core/jsx/jsx-runtime.ts',
    'jsx/jsx-dev-runtime': 'core/jsx/jsx-dev-runtime.ts',
    'jsx/streaming': 'core/jsx/streaming.ts',
  }
  for (const name of MIDDLEWARE) map[name] = 'middleware/index.ts'
  for (const name of HELPERS) map[name] = 'helpers/index.ts'
  return map
}

export function routerAliases(): Record<string, string> {
  const src = new URL('../acryl-router/src/', import.meta.url)
  const aliases: Record<string, string> = {}
  const add = (specifier: string, file: string) => {
    const path = fileURLToPath(new URL(file, src))
    if (existsSync(path)) aliases[specifier] = path
  }
  for (const [sub, file] of Object.entries(frameworkSpecifiers()))
    add(sub === '' ? PACKAGE : `${PACKAGE}/${sub}`, file)
  add('acryl-router', 'index.ts')
  add('acryl-router/middleware', 'middleware/index.ts')
  add('acryl-router/helpers', 'helpers/index.ts')
  // The ports and their providers sit beside the router as source too (`acrylblends add kv` copies `acryl-kv` and `acryl-kv-json`). A plugin installed live, a
  // provider of your own for example, imports them by name and gets the very modules the app runs.
  const plugins = new URL('../', import.meta.url)
  for (const folder of readdirSync(fileURLToPath(plugins), { withFileTypes: true })) {
    if (!folder.isDirectory() || !folder.name.startsWith('acryl-')) continue
    const entry = fileURLToPath(new URL(`${folder.name}/src/index.ts`, plugins))
    if (!existsSync(entry)) continue
    // The bare name, and the app's own `#name` (a `package.json` "imports" entry that `acrylblends add` writes): a staged copy lives in the app's home, which may be
    // outside the app folder, where Node would not find that entry.
    aliases[folder.name] ??= entry
    aliases[`#${folder.name}`] = entry
    // Its other top-level modules by subpath, as its package exports them (`acryl-node-server/client-modules`): the door imports one before any extension is installed.
    for (const file of readdirSync(fileURLToPath(new URL(`${folder.name}/src/`, plugins)))) {
      if (
        !file.endsWith('.ts') ||
        file === 'index.ts' ||
        file.endsWith('.test.ts') ||
        file.endsWith('.d.ts')
      )
        continue
      aliases[`${folder.name}/${file.slice(0, -3)}`] ??= fileURLToPath(
        new URL(`${folder.name}/src/${file}`, plugins),
      )
    }
    const suite = fileURLToPath(new URL(`${folder.name}/src/conformance.ts`, plugins))
    if (existsSync(suite)) aliases[`#${folder.name}/conformance`] = suite
  }
  return aliases
}

export function resolveFromApp(
  stageRoot: string,
  appRoot: string,
  aliases: Record<string, string> = {},
): () => void {
  mkdirSync(stageRoot, { recursive: true })
  const staged = pathToFileURL(`${realpathSync(stageRoot)}/`).href
  const parentURL = pathToFileURL(join(realpathSync(appRoot), 'package.json')).href
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      const alias = aliases[specifier]
      if (alias !== undefined && context.parentURL?.startsWith(staged))
        return nextResolve(pathToFileURL(alias).href, context)
      try {
        return nextResolve(specifier, context)
      } catch (error) {
        if (isBare(specifier) && context.parentURL?.startsWith(staged))
          return nextResolve(specifier, { ...context, parentURL })
        throw error
      }
    },
  })
  return () => hook.deregister()
}
