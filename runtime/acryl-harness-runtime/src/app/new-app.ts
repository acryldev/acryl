/**
 * `acryl new <dir>`: create an ACRYL Blends app, the way `rails new` creates a Rails app. Convention over configuration: every app has the same shape, so
 * the builder inside it (the agent) and every tool know where everything is without being told.
 *
 *   <app>/blend.yaml    what the app is: a Blends manifest (name, brand, the Blueprint it grew from)      commit
 *   <app>/extensions/   the app's own plugins; the agent inside builds them here; they load at every start  commit
 *   <app>/AGENTS.md     the conventions, read by the agent inside at the start of every session            commit
 *   <app>/bin/acryl     start it: bin/acryl web | desktop | cli
 *   <app>/.dsh/         what the runtime keeps (sessions, settings, profile)                                ignored
 *
 * The app folder is the app's ACRYL home, so an app is self-contained like a container: it can be copied, committed, run beside any other app and deleted
 * without touching anything else. It is the user's project from the first second: nothing in it is ACRYL-branded, it gets its own git repository, and its
 * license is the user's choice (closed source and commercial included; the framework and the harness it uses are MIT). Pure file planning plus one write boundary.
 *
 * @module acryl-harness-runtime/app/new-app
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { stringify } from 'yaml'
import { brandIdentity, type BrandIdentity } from '../blueprint/brand-identity.ts'
import { builtInCatalog, type Blueprint } from '../blueprint/blueprint.ts'
import { appManifest } from '../blueprint/manifest.ts'

export const APP_MANIFEST_FILE = 'blend.yaml'
export const APP_EXTENSIONS_DIR = 'extensions'

const APP_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u

export class NewAppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewAppError'
  }
}

export interface NewAppOptions {
  /** Display name; defaults to the folder name. */
  readonly title?: string
  /** Blueprint the app grows from; `acryl.blank` by default. */
  readonly blueprint?: string
  readonly brand?: Partial<Omit<BrandIdentity, 'name'>>
  /** Absolute path of the launcher `bin/acryl` hands off to (the framework's `scripts/blank.mjs`). */
  readonly launcher: string
}

export interface PlannedApp {
  readonly root: string
  readonly name: string
  readonly blueprint: Blueprint
  readonly files: Readonly<Record<string, string>>
}

/** Pure: everything `acryl new` would write, by relative path. */
export function planNewApp(dir: string, options: NewAppOptions): PlannedApp {
  const root = resolve(dir)
  const name = basename(root)
  if (!APP_NAME.test(name) || name.length > 32) throw new NewAppError(`an app folder name is lowercase letters, digits and dashes (at most 32), got ${JSON.stringify(name)}`)
  const blueprintId = options.blueprint ?? 'acryl.blank'
  const blueprint = builtInCatalog().get(blueprintId)
  if (blueprint === undefined) throw new NewAppError(`unknown blueprint ${JSON.stringify(blueprintId)}; known: ${builtInCatalog().list().map(entry => entry.id).join(', ')}`)
  const title = options.title?.trim() || name
  const brand = brandIdentity({ ...(blueprint.brand.kind === 'custom' ? blueprint.brand.identity : {}), ...options.brand, name: title })
  const manifest = appManifest({ id: `app.${name}`, name: title, blueprint, brand })
  const files: Record<string, string> = {
    [APP_MANIFEST_FILE]: `# ${title}: what this app is (name, brand, what it grew from). Edit it and restart. Format: blends.acryl.dev/v1alpha1.\n${stringify(manifest, { lineWidth: 0 })}`,
    [`${APP_EXTENSIONS_DIR}/README.md`]: `# extensions\n\nThis app's own plugins, one folder each. The agent inside the app builds them here when you ask for something\n("add a to-do list"), and every folder here loads when the app starts. Delete a folder to remove that plugin.\n`,
    'AGENTS.md': agentsMd(title),
    'bin/acryl': `#!/usr/bin/env bash\n# Start ${title}:  bin/acryl web | desktop | cli   (flags: --port 3105)\nset -euo pipefail\napp="$(cd "$(dirname "$0")/.." && pwd)"\nexec node ${JSON.stringify(options.launcher)} "\${1:-web}" --dir "$app" "\${@:2}"\n`,
    '.gitignore': '# what the runtime keeps for this app\n.dsh/\ninstance.json\n',
    'README.md': `# ${title}

\`\`\`bash
bin/acryl web       # or desktop, cli
\`\`\`

Tell the assistant inside what to build; it adds plugins to \`extensions/\` while the app runs. \`blend.yaml\` is the app's definition (name, brand,
what it grew from). Runtime data stays in \`.dsh/\` and is not committed. The app has its own port and its own window, so it runs beside any other.

## License

This project is yours: license it however you want, including closed source. It runs on the ACRYL Blends framework and DeepSeek Harness, both MIT
licensed; if you distribute a copy of the framework (for example a carried \`runtime/\`), keep their license notices with it.
`,
  }
  return { root, name, blueprint, files }
}

function agentsMd(title: string): string {
  return `# ${title}: conventions for the builder inside

You are the builder inside ${title}. The user asks for what they want; you build it here, as plugins, while the app runs. The project and its git repository
belong to the user: commit with clear messages when a change works and the user agrees, never push unless asked.

- **Where things go.** Every capability you add is one plugin in \`extensions/<name>/\` of this app (the app's own folder, which is its ACRYL home). Install it with
  \`acryl_install_plugin\` using its absolute path; it goes live without a restart and loads at every start. Never put the app's plugins anywhere else.
- **What the app is.** \`blend.yaml\` is the app's definition (name, brand, the Blueprint it grew from). Change the brand there when the user asks to rename or restyle the app.
- **Data.** A plugin keeps its data in the app folder (\`data/<plugin>.json\`) or in the project the user opens, never inside its own code folder.
- **Capture.** \`/blend snapshot\` records what the app has become so it can be re-created; publishing is the user's decision.
- **How.** Your ACRYL extension docs (in your system prompt) have a routed doc and a verified example for every kind of plugin; read the nearest one before writing.
`
}

/** Write the app. The folder must not exist or must be empty: `new` never overwrites. `runtimeDir` hands the app its own Web runtime (see below). */
export function writeNewApp(planned: PlannedApp, options: { readonly runtimeDir?: string, readonly launcherFiles?: Readonly<Record<string, string>>, readonly git?: boolean } = {}): { readonly git: 'initialized' | 'skipped' | 'unavailable' } {
  if (existsSync(planned.root) && readdirSync(planned.root).length > 0) throw new NewAppError(`${planned.root} is not empty; acryl new only creates a new app`)
  if (options.runtimeDir !== undefined && !existsSync(join(options.runtimeDir, 'lib', 'bin.js'))) throw new NewAppError(`${options.runtimeDir} is not an ACRYL Web runtime (no lib/bin.js)`)
  for (const [relative, content] of Object.entries(planned.files)) {
    const target = join(planned.root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  chmodSync(join(planned.root, 'bin', 'acryl'), 0o755)
  if (options.runtimeDir !== undefined) {
    // The app carries its own runtime: it then starts with nothing of the framework but Node. Symlinks stay relative to the copy.
    cpSync(options.runtimeDir, join(planned.root, 'runtime'), { recursive: true, verbatimSymlinks: true })
    for (const [relative, source] of Object.entries(options.launcherFiles ?? {})) {
      const target = join(planned.root, '.app', relative)
      mkdirSync(dirname(target), { recursive: true })
      cpSync(source, target)
    }
    writeFileSync(join(planned.root, 'bin', 'acryl'), `#!/usr/bin/env bash\n# Start this app:  bin/acryl web\nset -euo pipefail\napp="$(cd "$(dirname "$0")/.." && pwd)"\nexec node "$app/.app/launch.mjs" "\${1:-web}" --dir "$app" "\${@:2}"\n`)
    chmodSync(join(planned.root, 'bin', 'acryl'), 0o755)
  }
  // Like `rails new`: the app starts as its own repository (no commit is made for the user). The carried runtime is large and rebuildable, so it is not tracked.
  if (options.git === false) return { git: 'skipped' }
  if (options.runtimeDir !== undefined) writeFileSync(join(planned.root, '.gitignore'), `${planned.files['.gitignore'] ?? ''}runtime/\n`)
  const init = spawnSync('git', ['init', '--quiet', planned.root], { stdio: 'ignore' })
  return { git: init.status === 0 ? 'initialized' : 'unavailable' }
}
