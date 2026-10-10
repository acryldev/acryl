/**
 * Node APIs that stock Harness packages import by name and Bun 1.3 does not implement (specs/042 B7). A named import of a missing export is a link-time error, the Cordis
 * Loader skips the plugin without a FAILED row, and everything that injects its service waits forever: `subprocess-local` alone provides `subprocess`, so the shell, file
 * search, terminal and workspace-change rows never activate and no agent session can be created.
 *
 * The Harness submodule is never edited. A Bun runtime plugin answers the load of the few affected built files with the same source minus the missing name, which is defined
 * next to the import instead. `probes/bun-import-census.mjs` is the gate: it imports every Harness package under Bun and lists what still fails, so a new gap after an upstream
 * bump shows up there and not as a silently absent plugin.
 */

interface BunLoadArgs { readonly path: string }
interface BunBuilder { onLoad(constraints: { filter: RegExp }, callback: (args: BunLoadArgs) => Promise<{ contents: string; loader: 'js' }>): void }
interface BunRuntime {
  plugin(plugin: { name: string; setup(build: BunBuilder): void }): void
  file(path: string): { text(): Promise<string> }
  Transpiler: new (options: { loader: 'ts' }) => { transformSync(code: string): string }
}

/** One missing export of a Node module, and the source that stands in for it. */
interface Gap {
  readonly module: string
  readonly name: string
  /** A statement that defines a binding called `name`; it may refer to `globalThis.Bun`. */
  readonly definition: string
}

const GAPS: readonly Gap[] = [
  {
    // Only words a Linux `execve` failure; the errno name stays in the message.
    module: 'node:util',
    name: 'getSystemErrorMessage',
    definition: 'const getSystemErrorMessage = (code) => `system error ${code}`;',
  },
  {
    // Bun's own transpiler strips the types. It reprints the code, so line numbers inside a stripped program differ from Node's whitespace-preserving strip.
    module: 'node:module',
    name: 'stripTypeScriptTypes',
    definition: 'const stripTypeScriptTypes = (code) => new globalThis.Bun.Transpiler({ loader: "ts" }).transformSync(code).trimEnd();',
  },
  {
    // The only caller asks whether the process is a single-executable app, which a Bun host never is.
    module: 'node:sea',
    name: 'isSea',
    definition: 'const isSea = () => false;',
  },
]

/** Built files of the Harness packages that import a gap (matched by their package folder, in the workspace and in a package store alike). */
const AFFECTED_FILES = /(?:subprocess-local|ptc-runtime-node|skill-office)\/lib\/.*\.js$/

/**
 * The source with every gap import removed and defined in its place.
 * @param source - a built ES module.
 * @returns the patched source, or `source` itself when it imports no gap.
 */
export function patchNodeGapImports(source: string): string {
  let patched = source
  const definitions: string[] = []
  for (const gap of GAPS) {
    const importStatement = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${gap.module}["'];?`)
    const found = importStatement.exec(patched)
    if (found === null) continue
    const names = found[1]!.split(',').map(part => part.trim()).filter(part => part !== '')
    if (!names.some(part => part === gap.name)) continue
    const kept = names.filter(part => part !== gap.name)
    patched = patched.replace(importStatement, kept.length === 0 ? '' : `import { ${kept.join(', ')} } from "${gap.module}";`)
    definitions.push(gap.definition)
  }
  return definitions.length === 0 ? source : `${definitions.join('\n')}\n${patched}`
}

let installed = false

/** Install the load-time patch (once per process; a Bun runtime plugin cannot be removed). No-op outside Bun. */
export function installBunNodeGapShims(): void {
  const bun = (globalThis as { Bun?: BunRuntime }).Bun
  if (bun === undefined || installed) return
  installed = true
  bun.plugin({
    name: 'acryl-node-gap-shims',
    setup(build) {
      // A runtime plugin must always answer with a module, so a file with nothing to patch is returned as read.
      build.onLoad({ filter: AFFECTED_FILES }, async ({ path }) => ({ contents: patchNodeGapImports(await bun.file(path).text()), loader: 'js' }))
    },
  })
}
