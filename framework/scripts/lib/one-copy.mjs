/**
 * An app must hold one copy of each @acryldev package. A package published with an exact pin of an older sibling (control 0.3.0 next to 0.3.1,
 * instance 0.1.2 next to 0.1.3) installs a second copy, and the older one silently misses the fix. This reads `npm ls --all --json` and names
 * every @acryldev package found at more than one version.
 */
export function duplicateCopies(tree, scope = '@acryldev/') {
  const versions = new Map()
  const walk = (dependencies) => {
    for (const [name, node] of Object.entries(dependencies ?? {})) {
      if (name.startsWith(scope) && typeof node?.version === 'string') {
        if (!versions.has(name)) versions.set(name, new Set())
        versions.get(name).add(node.version)
      }
      walk(node?.dependencies)
    }
  }
  walk(tree?.dependencies)
  return [...versions]
    .filter(([, found]) => found.size > 1)
    .map(([name, found]) => ({ name, versions: [...found].sort() }))
}
