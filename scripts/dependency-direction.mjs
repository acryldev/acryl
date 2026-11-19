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
 * The only runtime -> plugin dependencies allowed, each edge by name: acryl-harness-runtime composes every plugin a surface runs, which is a
 * composition root's job (moving that composition up into apps/ is spec 051 T021). Listing the edges, not the package, means a 21st plugin
 * fails the guard instead of passing silently.
 */
export const RUNTIME_COMPOSITION_EDGES = new Map([
  [
    'acryl-harness-runtime',
    new Set([
      '@acryl/ui', 'acryl-agent-control', 'acryl-app-save', 'acryl-app-shell', 'acryl-brand', 'acryl-command-reply', 'acryl-launcher-desktop',
      'acryl-mount-anchors', 'acryl-plugin-admin', 'acryl-plugin-context', 'acryl-plugin-hub', 'acryl-settings', 'acryl-shortcuts', 'acryl-sign-in',
      'acryl-support', 'acryl-system-prompt', 'acryl-ui-tui', 'acryl-workspace', 'cordis-plugin-market', 'dsh-client-ui-brand-acryl',
    ]),
  ],
])

/** Workspace package folders, as pnpm itself resolves pnpm-workspace.yaml (quoting, globs and `!` negations included); the root is not one. */
export function workspaceFolders(root) {
  const listed = JSON.parse(execFileSync('corepack', ['pnpm', 'ls', '-r', '--depth', '-1', '--json'], { cwd: root, encoding: 'utf8' }))
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
      else if (role === 'runtime' && depRole === 'other' && !RUNTIME_COMPOSITION_EDGES.get(name)?.has(dep))
        violations.push(`${name} is ACRYL runtime and depends on ${dep}: the runtime depends only on the foundation and itself`)
    }
  }
  return violations
}

/**
 * Framework packages missing from FOUNDATION: every workspace package under framework/ is foundation unless it is a tool that builds or
 * scaffolds apps (create, and the framework's own private root), so a new one cannot slip in without the foundation's protection.
 */
export const FRAMEWORK_TOOLS = new Set(['create-acrylblends', 'acrylblends-monorepo'])
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
