/**
 * Compose: the pure translation from a Blueprint to what a surface's Loader needs: which ACRYL-owned packages must be
 * resolvable, and which Loader patches to apply. No I/O and no framework handles; the composition root
 * (`engine-dsh.ts`) does the materializing and mounting. The row table below is the single place a row's package, id
 * and surfaces are declared, in the order the rows must mount (the shortcut registry before anything that reads it).
 *
 * @module acryl-harness-runtime/blueprint/compose
 */

import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { ACRYL_CODING_CAPABILITIES, type AcrylSurface } from '../coding-capabilities.ts'
import { identityLine } from './brand-identity.ts'
import type { Blueprint, BlueprintRowId } from './blueprint.ts'

/** One Loader row: its id, the module it loads (`name`), and the package that module lives in, which the profile must resolve. */
interface RowModule {
  readonly rowId: string
  readonly module: string
  readonly packageName: string
}

interface RowDeclaration extends RowModule {
  readonly id: BlueprintRowId
  readonly surfaces: readonly AcrylSurface[]
  /** A library a plugin imports rather than mounts: the package must resolve, but there is no Loader row. */
  readonly libraryOnly?: readonly AcrylSurface[]
  /**
   * Rows this row's plugin injects services from, mounted just before it (and once, however many rows name them). They are not
   * Blueprint rows of their own: a Blueprint names capabilities, and which plugin provides a service is this table's business.
   */
  readonly needs?: readonly RowModule[]
}

/** The framework's package (spec 049 slice 17): its Cordis plugins are subpaths, and each row's id is its module, by the row-naming rule. */
const FRAMEWORK_PACKAGE = 'acrylblends'

function frameworkRow(plugin: string): RowModule {
  const module = `${FRAMEWORK_PACKAGE}/cordis/${plugin}`
  return { rowId: module, module, packageName: FRAMEWORK_PACKAGE }
}

/** A row whose module is its own package, under the package's name. */
function packageRow(packageName: string): RowModule {
  return { rowId: packageName, module: packageName, packageName }
}

/** The router (`ctx.router`) and its Web adapter (`ctx.routerHttp`), which the Market injects (spec 046). */
const ROUTER_ROWS: readonly RowModule[] = [frameworkRow('router'), frameworkRow('router-http')]

/** The framework base kit (spec 046): routes, shared state and the inspector, served over HTTP on the Web surface. The inspector row pulls in the rest. */
const FRAMEWORK_NEEDS: readonly RowModule[] = [...ROUTER_ROWS, frameworkRow('state')]

/** Declaration order is mount order. The Market is Web-only here: Desktop owns its own provider switch. */
const ROWS: readonly RowDeclaration[] = [
  { id: 'community-market', surfaces: ['web'], rowId: 'community-market', module: 'cordis-plugin-market', packageName: 'cordis-plugin-market', needs: ROUTER_ROWS },
  { id: 'framework-kit', surfaces: ['web', 'desktop'], ...frameworkRow('inspect'), needs: FRAMEWORK_NEEDS },
  { id: 'plugin-context', surfaces: ['tui', 'web', 'desktop'], ...packageRow('acryl-plugin-context') },
  { id: 'system-prompt', surfaces: ['tui', 'web', 'desktop'], ...packageRow('acryl-system-prompt') },
  { id: 'ui-library', surfaces: ['tui', 'web', 'desktop'], ...packageRow('@acryl/ui'), libraryOnly: ['tui'] },
  // Saving an app to its own repository (/app save, /app connect): a command, so it works on every surface.
  { id: 'app-save', surfaces: ['tui', 'web', 'desktop'], ...packageRow('acryl-app-save') },
  // Saving, sharing and pulling plugins (spec 044): the pluginHub service and /plugin, part of every Blend's base kit.
  { id: 'plugin-hub', surfaces: ['tui', 'web', 'desktop'], ...packageRow('acryl-plugin-hub') },
  // ACRYL's keyboard commands on DSH 0.2's own shortcut service (`ctx.shortcuts.register`): upstream owns the registry, persisted rebinding and the
  // editor, so this package no longer provides a service of its own (a second provider fails the client boot).
  { id: 'shortcuts', surfaces: ['web', 'desktop'], ...packageRow('acryl-shortcuts') },
  { id: 'mount-anchors', surfaces: ['web', 'desktop'], ...packageRow('acryl-mount-anchors') },
  // The three-column app frame a domain plugin claims for its own main UI (`desktop.main`), with the conversation beside it, instead of the stock
  // chat frame (blend-instance-design.md 0a). The IDE composes the same frame through its coding capabilities.
  { id: 'app-shell', surfaces: ['web', 'desktop'], ...packageRow('acryl-app-shell') },
]

/** The stock rows the ACRYL frame replaces: the same switch the IDE's `advanced-shell` capability makes, declared once there. */
const APP_FRAME_PATCHES: readonly PatchOptions[] = ACRYL_CODING_CAPABILITIES.find(capability => capability.id === 'advanced-shell')?.loaderPatches ?? []

/**
 * The DSH rows that make it a chat: the agent, the model registry and the pi-ai provider. Disabling them leaves the web server, the session
 * store, the client and every ACRYL row running; Cordis parks the consumers that need them as PENDING (measured on 0.2.0-rc.2: 17 rows, among them
 * the chat session controller and the model providers) and reactivates them when the rows come back.
 */
export const DSH_CHAT_ROW_IDS: readonly string[] = ['agent', 'llm', 'llm-pi-ai']

/** DSH's base-bundle row providing `pluginManager`, and the hub's row that takes its place (its id is its module, by the row-naming rule). */
export const DSH_PLUGIN_MANAGER_ROW_ID = 'plugin-manager'
export const PLUGIN_MANAGER_ROW_ID = 'acryl-plugin-hub/manager'

/** The terminal library is a differently named package than the browser one. */
const TUI_LIBRARY_PACKAGE = 'acryl-ui-tui'

/**
 * Modules a Blend once named, read as their current names and never written: `acryl-plugin-context`'s old name (spec 044 step 1b), and the
 * framework packages that became subpaths of `acrylblends` when the framework moved to its own repository (spec 049 slice 17).
 */
export const RENAMED_MODULES: Readonly<Record<string, string>> = Object.freeze({
  'acryl-extension-context': 'acryl-plugin-context',
  'acryl-router': frameworkRow('router').module,
  'acryl-router-http': frameworkRow('router-http').module,
  'acryl-state': frameworkRow('state').module,
  'acryl-inspect': frameworkRow('inspect').module,
  'acryl-node-server': frameworkRow('node-server').module,
  'acryl-door': frameworkRow('door').module,
  'acryl-db': frameworkRow('db').module,
  'acryl-db-sqlite': frameworkRow('db-sqlite').module,
  'acryl-kv': frameworkRow('kv').module,
  'acryl-kv-json': frameworkRow('kv-json').module,
  'acryl-kv-db': frameworkRow('kv-db').module,
})

/** A module as it is named today: a renamed one under its current name, anything else unchanged. */
export function currentModule(module: string): string {
  return RENAMED_MODULES[module] ?? module
}

/** The package a module specifier lives in: `acrylblends/cordis/router` is in `acrylblends`, `@acryl/ui` in itself. */
export function packageOfModule(module: string): string {
  const parts = module.split('/')
  return module.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] ?? module
}

/** Which Blueprint row a module is, if it is one of ACRYL's own rows (used to read a Blends manifest's rows back into a Blueprint). */
export function blueprintRowForModule(module: string): BlueprintRowId | undefined {
  const current = currentModule(module)
  return ROWS.find(row => row.module === current)?.id
}

/** The row that fills a Blueprint row (used to write a Blueprint as a Blends manifest). */
export function rowForBlueprintRow(id: BlueprintRowId): RowModule {
  const row = ROWS.find(candidate => candidate.id === id)
  if (row === undefined) throw new Error(`no row declaration for ${id}`)
  return { rowId: row.rowId, module: row.module, packageName: row.packageName }
}

export interface BlueprintComposition {
  /** ACRYL-owned packages to make resolvable from the profile. */
  readonly packages: readonly string[]
  readonly patches: readonly PatchOptions[]
}

/**
 * The ACRYL-owned rows and brand for one surface. `existingRowIds` are rows the profile's own bundle already composes:
 * an `insert` of the same id would throw at boot, so those rows are skipped rather than composed twice.
 */
export function composeBlueprintRows(
  blueprint: Blueprint,
  surface: AcrylSurface,
  existingRowIds: ReadonlySet<string> = new Set(),
): BlueprintComposition {
  const packages: string[] = []
  const patches: PatchOptions[] = []
  const mountedNeeds = new Set<string>()

  // Brand first: it swaps the stock identity row and must exist before any client row reads it.
  if (surface === 'web' || surface === 'desktop') {
    if (blueprint.brand.kind === 'acryl') {
      packages.push('dsh-client-ui-brand-acryl')
      patches.push(
        { id: 'ui-brand-official', disabled: true },
        { insert: [{ id: 'ui-acryl', name: 'dsh-client-ui-brand-acryl', disabled: false }] },
      )
    } else {
      packages.push('acryl-brand')
      patches.push(
        { id: 'ui-brand-official', disabled: true },
        { insert: [{ id: 'brand', name: 'acryl-brand', config: { ...blueprint.brand.identity } }] },
      )
    }
  }

  // After the brand and before ACRYL's own rows: a disabled stock row must not be re-enabled by anything composed later.
  if (!blueprint.dshChat && (surface === 'web' || surface === 'desktop')) {
    for (const id of DSH_CHAT_ROW_IDS) patches.push({ id, disabled: true })
  }

  for (const row of ROWS) {
    if (!blueprint.rows.includes(row.id) || !row.surfaces.includes(surface)) continue
    if (row.libraryOnly?.includes(surface) === true) {
      packages.push(TUI_LIBRARY_PACKAGE)
      continue
    }
    for (const need of row.needs ?? []) {
      if (existingRowIds.has(need.rowId) || mountedNeeds.has(need.rowId)) continue
      mountedNeeds.add(need.rowId)
      packages.push(need.packageName)
      patches.push({ insert: [{ id: need.rowId, name: need.module }] })
    }
    if (existingRowIds.has(row.rowId)) continue
    packages.push(row.packageName)
    const identityConfig = row.id === 'system-prompt' && blueprint.brand.kind === 'custom'
      ? { config: { identity: identityLine(blueprint.brand.identity) } }
      : {}
    patches.push({ insert: [{ id: row.rowId, name: row.module, ...identityConfig }] })
  }
  // A Blend that owns its frame turns the stock layout off and the sidebar and conversation rows on, for its domain plugin to render into.
  if (blueprint.rows.includes('app-shell') && (surface === 'web' || surface === 'desktop')) patches.push(...APP_FRAME_PATCHES)
  // With the plugin hub, DSH's own plugin manager is replaced by the hub's subclass of it, so DSH's "Add plugin" box installs a git address as
  // that repository's released, checked version (spec 044 D7). Swapped, never doubled: Cordis refuses a second `pluginManager` provider.
  if (blueprint.rows.includes('plugin-hub') && !existingRowIds.has(PLUGIN_MANAGER_ROW_ID)) {
    patches.push({ id: DSH_PLUGIN_MANAGER_ROW_ID, disabled: true }, { insert: [{ id: PLUGIN_MANAGER_ROW_ID, name: PLUGIN_MANAGER_ROW_ID }] })
  }
  return { packages: [...new Set(packages)], patches: structuredClone(patches) }
}
