/**
 * Lint coverage for the framework's plugin library (spec 051 T017). The root `lint:library` runs biome over `plugins/`, and `biome.json` decides
 * which files that means: the framework's `framework/**` and one pattern per app-shape library plugin. A new app plugin that is not named there is
 * silently unlinted, so `verify-layout` asks this module who is missing. The vendored packages (sources in `src/`) were never linted by the
 * framework (the old `!plugins/acryl-*` pattern, now gone) and stay out by the same rule.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A biome-style glob as a regular expression: `*` stops at a `/`, `**` crosses folders, `**` before a `/` may match none, `?` is one character. */
function globToRegExp(glob) {
  let source = ''
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]
    if (char === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        source += '(?:.*/)?'
        i += 2
      } else {
        source += '.*'
        i += 1
      }
    } else if (char === '*') source += '[^/]*'
    else if (char === '?') source += '[^/]'
    else source += char.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
  }
  return new RegExp(`^${source}$`, 'u')
}

/** Whether `file` (repository-relative, forward slashes) is included by `patterns`: the last matching pattern wins, and `!` excludes. */
export function coveredBy(patterns, file) {
  let included = false
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!')
    const body = negated ? pattern.slice(1) : pattern
    if (globToRegExp(body).test(file)) included = !negated
  }
  return included
}

/**
 * The folders of root-source library plugins (a `plugins/<name>/plugin.json` whose `entries[""]` is not under `src/`) that `patterns` do not
 * cover, each as the sentence to show the person adding the plugin.
 */
export function uncoveredLibraryPlugins(pluginsRoot, patterns) {
  const uncovered = []
  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifest = join(pluginsRoot, entry.name, 'plugin.json')
    if (!existsSync(manifest)) continue
    const entries = JSON.parse(readFileSync(manifest, 'utf8')).entries ?? {}
    if ((entries[''] ?? 'index.ts').startsWith('src/')) continue
    const file = `plugins/${entry.name}/${entries[''] ?? 'index.ts'}`
    if (!coveredBy(patterns, file))
      uncovered.push(
        `plugins/${entry.name} is a root-source library plugin but biome.json files.includes does not cover it: add "plugins/${entry.name}/**"`,
      )
  }
  return uncovered.sort()
}
