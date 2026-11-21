/**
 * The direction of dependencies between workspace packages (spec 051, the Pi model). Folders stay flat; the layers live only in the graph that
 * every package.json already declares (dependencies, peerDependencies and devDependencies alike, since all three decide the build order).
 * Two checks keep that graph predictable:
 *
 * 1. No cycles. With none, the packages have one straight build order, foundation first, surfaces last.
 * 2. A short list of "never depends on" rules for what must stay at the bottom. The foundation is named package by package; runtime and
 *    app are read from the folder (runtime/, apps/, examples/).
 *
 * The picture for people (docs/acryl/MONOREPO.md): framework foundation (0) <- ACRYL runtime (1) <- ACRYL plugins (2) <- apps (3).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { corepackCommand, corepackSpawnOptions } from './cli-archive-platform.mjs'

/** The framework's foundation: acrylblends and its library packages. They depend on nothing else in the repository. */
export const FOUNDATION = new Set([
  '@acryldev/blends',
  '@acryldev/framework',
  '@acryldev/db',
  '@acryldev/db-sqlite',
  '@acryldev/drivers',
  '@acryldev/door',
  '@acryldev/inspect',
  '@acryldev/kv',
  '@acryldev/kv-db',
  '@acryldev/kv-json',
  '@acryldev/node-server',
  '@acryldev/page',
  '@acryldev/router',
  '@acryldev/router-http',
  '@acryldev/state',
  '@acryldev/web-server',
])

/**
 * The framework's app plugins, which live in the root `plugins/` folder beside ACRYL's own (spec 051 T017): the desktop shell, the instance, the agent panel and
 * so on. They are workspace packages that import each other by package name, and they depend on the runtime (`@acryldev/blends-core`, `plugin-hub`), so they are
 * the plugins layer, not the foundation. Named here so the guard knows them and a new one cannot slip in without a role.
 */
export const FRAMEWORK_PLUGINS = new Set([
  '@acryldev/agent',
  '@acryldev/agent-panel',
  '@acryldev/app-settings',
  '@acryldev/builder',
  '@acryldev/desktop-shell',
  '@acryldev/desktop-web',
  '@acryldev/driver-acp',
  '@acryldev/driver-pty',
  '@acryldev/extensions',
  '@acryldev/feedback',
  '@acryldev/home',
  '@acryldev/instance',
  '@acryldev/manifest',
  '@acryldev/openai',
  '@acryldev/plugin-share',
  '@acryldev/sandbox',
  '@acryldev/save',
  '@acryldev/showcase',
  '@acryldev/tasks',
])

/** Workspace package folders, as pnpm itself resolves pnpm-workspace.yaml (quoting, globs and `!` negations included); the root is not one. */
export function workspaceFolders(root) {
  const listed = JSON.parse(execFileSync(corepackCommand(process.platform), ['pnpm', 'ls', '-r', '--depth', '-1', '--json'], { cwd: root, encoding: 'utf8', ...corepackSpawnOptions(process.platform) }))
  return listed.map(entry => relative(root, entry.path).replaceAll('\\', '/')).filter(folder => folder !== '')
}

/** Every workspace package: name, folder, and the workspace packages it depends on. */
export function readGraph(root, folders = workspaceFolders(root)) {
  const packages = new Map()
  for (const folder of folders) {
    const manifest = JSON.parse(readFileSync(join(root, folder, 'package.json'), 'utf8'))
    if (typeof manifest.name === 'string') packages.set(manifest.name, { folder, manifest })
  }
  const graph = new Map()
  for (const [name, { folder, manifest }] of packages) {
    const deps = new Set()
    for (const field of ['dependencies', 'peerDependencies', 'devDependencies'])
      for (const dep of Object.keys(manifest[field] ?? {})) if (dep !== name && packages.has(dep)) deps.add(dep)
    const production = new Set()
    for (const field of ['dependencies', 'peerDependencies'])
      for (const dep of Object.keys(manifest[field] ?? {})) if (dep !== name && packages.has(dep)) production.add(dep)
    graph.set(name, { folder, deps, production })
  }
  return graph
}

/** The cycles in the graph, each as a path that starts and ends at the same package. */
export function findCycles(graph) {
  const cycles = []
  const state = new Map()
  const stack = []
  const visit = name => {
    state.set(name, 'open')
    stack.push(name)
    for (const dep of graph.get(name)?.deps ?? []) {
      if (state.get(dep) === 'open') cycles.push([...stack.slice(stack.indexOf(dep)), dep])
      else if (!state.has(dep)) visit(dep)
    }
    stack.pop()
    state.set(name, 'done')
  }
  for (const name of graph.keys()) if (!state.has(name)) visit(name)
  return cycles
}

/** The role a package plays, from its name and folder. */
export function roleOf(name, folder) {
  if (FOUNDATION.has(name)) return 'foundation'
  if (FRAMEWORK_PLUGINS.has(name)) return 'plugin'
  if (folder.startsWith('apps/') || folder.startsWith('examples/')) return 'app'
  if (folder.startsWith('runtime/')) return 'runtime'
  return 'other'
}

/** Every dependency that points the wrong way, as one sentence each. */
export function directionViolations(graph) {
  const violations = []
  for (const [name, { folder, deps, production }] of graph) {
    const role = roleOf(name, folder)
    // The runtime's integration tests boot a surface with the real composition and import the plugin under test; those edges are test-only
    // (spec 051 T021). A plugin in `dependencies` or `peerDependencies` is shipped and fails.
    const testOnly = (dep) => production?.has(dep) !== true
    for (const dep of deps) {
      const depRole = roleOf(dep, graph.get(dep).folder)
      if (depRole === 'app')
        violations.push(`${name} depends on ${dep}, an app: apps are the top, nothing depends on them`)
      else if (role === 'foundation' && depRole !== 'foundation')
        violations.push(`${name} is framework foundation and depends on ${dep}: the foundation depends only on itself`)
      else if (role === 'runtime' && depRole !== 'foundation' && depRole !== 'runtime' && !testOnly(dep))
        violations.push(`${name} is ACRYL runtime and depends on ${dep}: the runtime depends only on the foundation and itself`)
    }
  }
  return violations
}

/**
 * Framework packages missing from FOUNDATION: every workspace package under framework/ is foundation unless it is a tool that builds or
 * scaffolds apps (create, and the framework's own private root), so a new one cannot slip in without the foundation's protection.
 */
export const FRAMEWORK_TOOLS = new Set([
  '@acryldev/create-blends',
  '@acryldev/monorepo',
  'acrylblends',
  'create-acrylblends',
])
export function unlistedFoundation(graph) {
  return [...graph]
    .filter(([name, { folder }]) => folder.startsWith('framework/') && !FOUNDATION.has(name) && !FRAMEWORK_TOOLS.has(name))
    .map(([name, { folder }]) => `${name} (${folder}) is a framework package but neither FOUNDATION nor FRAMEWORK_TOOLS names it`)
}

/** A build order that follows the graph (dependencies first), for the docs and for a reader checking the direction. */
export function buildOrder(graph) {
  const order = []
  const seen = new Set()
  const visit = name => {
    if (seen.has(name)) return
    seen.add(name)
    for (const dep of [...graph.get(name).deps].sort()) visit(dep)
    order.push(name)
  }
  for (const name of [...graph.keys()].sort()) visit(name)
  return order
}
