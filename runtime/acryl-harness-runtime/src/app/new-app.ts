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
import { manifestDigest } from '@webboxes/blends-core'
import { isMap, isSeq, parseDocument, stringify } from 'yaml'
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
  /**
   * Create the app from an existing app or captured Blend (its `blend.yaml`, and its `blend.lock.json` when it has one) instead of a Blueprint: the new
   * app keeps what the source grew (rows, brand, lineage) under its own name and id. Its `extensions/` are copied by `writeNewApp`.
   */
  readonly from?: { readonly manifestText: string, readonly lockText?: string }
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
  const derived = options.from === undefined ? undefined : fromExistingApp(options.from, `app.${name}`, title, options.brand)
  // A derived manifest keeps the source's comments; its header names the app it describes, so it takes the new app's name.
  const manifestText = derived?.manifestText.replace(/^# .*?: what this app is/u, `# ${title}: what this app is`)
    ?? `# ${title}: what this app is (name, brand, what it grew from). Edit it and restart. Format: blends.acryl.dev/v1alpha1.\n${stringify(appManifest({ id: `app.${name}`, name: title, blueprint, brand }), { lineWidth: 0 })}`
  const files: Record<string, string> = {
    [APP_MANIFEST_FILE]: manifestText,
    ...(derived?.lockText === undefined ? {} : { 'blend.lock.json': derived.lockText }),
    ...(derived?.starter === undefined ? {} : { [`blueprints/${derived.starter.id}.yaml`]: derived.starter.text }),
    ...(derived?.notice === undefined ? {} : { 'THIRD-PARTY.md': derived.notice }),
    [`${APP_EXTENSIONS_DIR}/README.md`]: `# extensions\n\nThis app's own plugins, one folder each. The agent inside the app builds them here when you ask for something\n("add a to-do list"), and every folder here loads when the app starts. Delete a folder to remove that plugin.\n`,
    'AGENTS.md': agentsMd(title),
    'bin/acryl': `#!/usr/bin/env bash\n# Start ${title}:  bin/acryl web | desktop | cli   (flags: --port 3105)\nset -euo pipefail\napp="$(cd "$(dirname "$0")/.." && pwd)"\nexec node ${JSON.stringify(options.launcher)} "\${1:-web}" --dir "$app" "\${@:2}"\n`,
    '.gitignore': '# what the runtime keeps for this app\n.dsh/\ninstance.json\n',
    '.github/workflows/app.yml': appWorkflow(title),
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

/**
 * A new project from an existing starter or project (the three levels: the blank canvas, a Blueprint starter kit, a project). The source's rows, brand
 * colors and plugins are kept; the identity becomes the new project's, which is the user's own work: private and Proprietary until they say otherwise.
 *
 *   from a starter (kind: Blueprint, spec.extends)  ->  a Blend whose lineage names the starter; the starter is kept in blueprints/<id>.yaml
 *   from a project (kind: Blend, spec.lineage)       ->  a Blend with the same lineage; the source's blueprints/ travel with it
 *
 * Comments are kept, and the lock is re-pinned to the new definition with the format's digest (local module digests stay valid: extensions/ is copied as is).
 */
function fromExistingApp(source: { readonly manifestText: string, readonly lockText?: string }, id: string, title: string, brand: Partial<Omit<BrandIdentity, 'name'>> | undefined): { manifestText: string, lockText?: string, starter?: { id: string, text: string }, notice?: string } {
  const document = parseDocument(source.manifestText)
  const parsed = document.toJS() as { kind?: unknown, metadata?: { id?: unknown, version?: unknown, license?: unknown, name?: unknown }, spec?: { lineage?: { blueprint?: unknown }, extends?: unknown } } | null
  const sourceId = typeof parsed?.metadata?.id === 'string' ? parsed.metadata.id : undefined
  const sourceVersion = typeof parsed?.metadata?.version === 'string' ? parsed.metadata.version : '0.1.0'
  let starter: { id: string, text: string } | undefined
  if (parsed?.kind === 'Blueprint' && sourceId !== undefined && builtInCatalog().get(sourceId) === undefined) {
    if (typeof parsed.spec?.extends !== 'string') throw new NewAppError(`the starter ${sourceId} names no parent (spec.extends)`)
    starter = { id: sourceId, text: source.manifestText }
    document.set('kind', 'Blend')
    document.deleteIn(['spec', 'extends'])
    document.setIn(['spec', 'lineage'], document.createNode({ blueprint: sourceId, blueprintVersion: sourceVersion }))
  } else if (parsed?.kind !== 'Blend' || typeof parsed.spec?.lineage?.blueprint !== 'string') {
    throw new NewAppError('--from needs a starter (kind: Blueprint with spec.extends) or a project (kind: Blend with spec.lineage)')
  }
  document.setIn(['metadata', 'id'], id)
  document.setIn(['metadata', 'name'], title)
  document.setIn(['metadata', 'description'], `${title}, created from ${sourceId ?? 'another app'}.`)
  document.setIn(['metadata', 'license'], 'Proprietary')
  document.setIn(['metadata', 'visibility'], 'private')
  const rows = document.getIn(['spec', 'rows'])
  if (isSeq(rows)) {
    for (const row of rows.items) {
      if (isMap(row) && row.get('name') === 'acryl-brand') {
        row.setIn(['config', 'name'], title)
        for (const [key, value] of Object.entries(brand ?? {})) if (value !== undefined) row.setIn(['config', key], value)
      }
    }
  }
  const manifestText = String(document)
  const sourceLicense = typeof parsed.metadata?.license === 'string' ? parsed.metadata.license : undefined
  // The source's code (its extensions) keeps its own license: its notice travels with the copy.
  const notice = sourceLicense === undefined || sourceLicense === 'Proprietary' ? undefined
    : `# Third-party code\n\nThis project was created from ${sourceId ?? 'another app'}${typeof parsed.metadata?.name === 'string' ? ` (${parsed.metadata.name})` : ''}, licensed ${sourceLicense}. Code copied from it into\nextensions/ remains under that license; keep this notice, and the source's license text where it requires one, with any copy you distribute.\n`
  const extra = { ...(starter === undefined ? {} : { starter }), ...(notice === undefined ? {} : { notice }) }
  if (source.lockText === undefined) return { manifestText, ...extra }
  const lock = JSON.parse(source.lockText) as { origin?: Record<string, unknown> }
  lock.origin = { ...lock.origin, id, kind: 'Blend', digest: manifestDigest(manifestText) }
  return { manifestText, lockText: `${JSON.stringify(lock, null, 2)}\n`, ...extra }
}

/**
 * CI from the first commit (spec 036, T019): on every push and pull request the app definition must validate the way the engine and the registry validate it,
 * and no tracked file may hold a secret (the same check \`acryl save\` runs, so a key committed outside ACRYL is caught too). Pinned to the published tools.
 */
function appWorkflow(title: string): string {
  return `name: ${JSON.stringify(title)}

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: The app definition is valid
        run: npx --yes --package @webboxes/blends-core@0.1 blends-validate blend.yaml
      - name: No secrets in the repository
        run: npx --yes --package @webboxes/app-persistence@0.1 acryl-secret-check .
`
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
/** A file of the launcher an app carries: copied from the framework, or written with the given content. */
export type LauncherFile = { readonly from: string } | { readonly content: string }

export function writeNewApp(planned: PlannedApp, options: { readonly runtimeDir?: string, readonly launcherFiles?: Readonly<Record<string, LauncherFile>>, readonly git?: boolean, readonly extensionsFrom?: string, readonly blueprintsFrom?: string } = {}): { readonly git: 'initialized' | 'skipped' | 'unavailable' } {
  if (existsSync(planned.root) && readdirSync(planned.root).length > 0) throw new NewAppError(`${planned.root} is not empty; acryl new only creates a new app`)
  if (options.runtimeDir !== undefined && !existsSync(join(options.runtimeDir, 'lib', 'bin.js'))) throw new NewAppError(`${options.runtimeDir} is not an ACRYL Web runtime (no lib/bin.js)`)
  for (const [relative, content] of Object.entries(planned.files)) {
    const target = join(planned.root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  chmodSync(join(planned.root, 'bin', 'acryl'), 0o755)
  // An app created from another brings that app's own plugins, verbatim so the lock's digests still hold (never its node_modules or git history).
  // The starters the source itself grew from travel with it, so the whole chain back to a built-in Blueprint resolves in the new app.
  if (options.blueprintsFrom !== undefined && existsSync(options.blueprintsFrom)) {
    cpSync(options.blueprintsFrom, join(planned.root, 'blueprints'), { recursive: true, force: false, errorOnExist: false })
  }
  if (options.extensionsFrom !== undefined && existsSync(options.extensionsFrom)) {
    cpSync(options.extensionsFrom, join(planned.root, APP_EXTENSIONS_DIR), { recursive: true, filter: source => !['node_modules', '.git'].includes(basename(source)) })
  }
  if (options.runtimeDir !== undefined) {
    // The app carries its own runtime: it then starts with nothing of the framework but Node. Symlinks stay relative to the copy.
    cpSync(options.runtimeDir, join(planned.root, 'runtime'), { recursive: true, verbatimSymlinks: true })
    for (const [relative, file] of Object.entries(options.launcherFiles ?? {})) {
      const target = join(planned.root, '.app', relative)
      mkdirSync(dirname(target), { recursive: true })
      if ('from' in file) cpSync(file.from, target)
      else writeFileSync(target, file.content)
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
