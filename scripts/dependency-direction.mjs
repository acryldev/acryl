/**
 * The direction of dependencies between workspace packages (spec 051, the Pi model). Folders stay flat; the layers live only in the graph that
 * every package.json already declares (dependencies, peerDependencies and devDependencies alike, since all three decide the build order).
 * Two checks keep that graph predictable:
 *
 * 1. No cycles. With none, the packages have one straight build order, foundation first, surfaces last.
 * 2. A short list of "never depends on" rules for what must stay at the bottom. Roles are package names, not folders, so a package can move
 *    without changing the rule.
 *
 * The picture for people (docs/acryl/MONOREPO.md): framework foundation (0) <- ACRYL runtime (1) <- ACRYL plugins (2) <- apps (3).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The framework's foundation: acrylblends and its library packages. They depend on nothing else in the repository. */
export const FOUNDATION = new Set([
  'acrylblends',
  'acrylblends-framework',
  'acryl-db',
  'acryl-db-sqlite',
  'acryl-door',
  'acryl-inspect',
  'acryl-kv',
  'acryl-kv-db',
  'acryl-kv-json',
  'acryl-node-server',
  'acryl-page',
  'acryl-router',
  'acryl-router-http',
  'acryl-state',
  'acryl-web-server',
])

/**
 * Runtime packages that may depend on ACRYL plugins, each with why. Temporary: acryl-harness-runtime composes the whole product (it mounts
 * every plugin a surface runs), which is a composition root's job; moving that composition up into apps/ is spec 051 T016.
 */
export const RUNTIME_COMPOSITION_EXCEPTIONS = new Map([
  ['acryl-harness-runtime', 'composes every plugin a surface runs (a composition root); move it up into apps/ (spec 051 T016)'],
])

/** Workspace package folders from pnpm-workspace.yaml's `packages:` list (plain folders and `<dir>/*` or `<dir>/acryl-*` globs). */
export function workspaceFolders(root) {
  const text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const block = text.split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? ''
  const folders = []
  for (const line of block.split('\n')) {
    const match = /^\s+-\s+'?([^'#\s]+)'?/.exec(line)
    if (match === null || match[1].startsWith('!')) continue
    const pattern = match[1]
    const star = pattern.indexOf('*')
    if (star === -1) folders.push(pattern)
    else {
      const parent = pattern.slice(0, pattern.lastIndexOf('/', star))
      const prefix = pattern.slice(parent.length + 1, star)
      if (!existsSync(join(root, parent))) continue
      for (const entry of readdirSync(join(root, parent), { withFileTypes: true }))
        if (entry.isDirectory() && entry.name.startsWith(prefix)) folders.push(`${parent}/${entry.name}`)
    }
  }
  return folders.filter(folder => existsSync(join(root, folder, 'package.json')))
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
    graph.set(name, { folder, deps })
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
  if (folder.startsWith('apps/') || folder.startsWith('examples/')) return 'app'
  if (folder.startsWith('runtime/')) return 'runtime'
  return 'other'
}

/** Every dependency that points the wrong way, as one sentence each. */
export function directionViolations(graph) {
  const violations = []
  for (const [name, { folder, deps }] of graph) {
    const role = roleOf(name, folder)
    for (const dep of deps) {
      const depRole = roleOf(dep, graph.get(dep).folder)
      if (depRole === 'app')
        violations.push(`${name} depends on ${dep}, an app: apps are the top, nothing depends on them`)
      else if (role === 'foundation' && depRole !== 'foundation')
        violations.push(`${name} is framework foundation and depends on ${dep}: the foundation depends only on itself`)
      else if (role === 'runtime' && depRole === 'other' && !RUNTIME_COMPOSITION_EXCEPTIONS.has(name))
        violations.push(`${name} is ACRYL runtime and depends on ${dep}: the runtime depends only on the foundation and itself`)
    }
  }
  return violations
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
