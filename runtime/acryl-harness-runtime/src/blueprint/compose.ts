/**
 * Compose: the pure translation from a Blueprint to what a surface's Loader needs: which ACRYL-owned packages must be
 * resolvable, and which Loader patches to apply. No I/O and no framework handles; the composition root
 * (`engine-dsh.ts`) does the materializing and mounting. The row table below is the single place a row's package, id
 * and surfaces are declared, in the order the rows must mount (the shortcut registry before anything that reads it).
 *
 * @module acryl-harness-runtime/blueprint/compose
 */

import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { AcrylSurface } from '../coding-capabilities.ts'
import { identityLine } from './brand-identity.ts'
import type { Blueprint, BlueprintRowId } from './blueprint.ts'

interface RowDeclaration {
  readonly id: BlueprintRowId
  readonly surfaces: readonly AcrylSurface[]
  readonly rowId: string
  readonly packageName: string
  /** A library a plugin imports rather than mounts: the package must resolve, but there is no Loader row. */
  readonly libraryOnly?: readonly AcrylSurface[]
}

/** Declaration order is mount order. The Market is Web-only here: Desktop owns its own provider switch. */
const ROWS: readonly RowDeclaration[] = [
  { id: 'community-market', surfaces: ['web'], rowId: 'community-market', packageName: 'cordis-plugin-market' },
  { id: 'plugin-context', surfaces: ['tui', 'web', 'desktop'], rowId: 'acryl-plugin-context', packageName: 'acryl-plugin-context' },
  { id: 'system-prompt', surfaces: ['tui', 'web', 'desktop'], rowId: 'acryl-system-prompt', packageName: 'acryl-system-prompt' },
  { id: 'ui-library', surfaces: ['tui', 'web', 'desktop'], rowId: '@acryl/ui', packageName: '@acryl/ui', libraryOnly: ['tui'] },
  // Saving an app to its own repository (/app save, /app connect): a command, so it works on every surface.
  { id: 'app-save', surfaces: ['tui', 'web', 'desktop'], rowId: 'acryl-app-save', packageName: 'acryl-app-save' },
  // Saving, sharing and pulling plugins (spec 044): the pluginHub service and /plugin, part of every Blend's base kit.
  { id: 'plugin-hub', surfaces: ['tui', 'web', 'desktop'], rowId: 'acryl-plugin-hub', packageName: 'acryl-plugin-hub' },
  // ACRYL's keyboard commands on DSH 0.2's own shortcut service (`ctx.shortcuts.register`): upstream owns the registry, persisted rebinding and the
  // editor, so this package no longer provides a service of its own (a second provider fails the client boot).
  { id: 'shortcuts', surfaces: ['web', 'desktop'], rowId: 'acryl-shortcuts', packageName: 'acryl-shortcuts' },
  { id: 'mount-anchors', surfaces: ['web', 'desktop'], rowId: 'acryl-mount-anchors', packageName: 'acryl-mount-anchors' },
]

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

/** Packages a Blend once named, read as their current names (spec 044 step 1b); never written. */
const RENAMED_PACKAGES: Readonly<Record<string, string>> = Object.freeze({ 'acryl-extension-context': 'acryl-plugin-context' })

/** Which Blueprint row a package is, if it is one of ACRYL's own rows (used to read a Blends manifest's rows back into a Blueprint). */
export function blueprintRowForPackage(packageName: string): BlueprintRowId | undefined {
  const current = RENAMED_PACKAGES[packageName] ?? packageName
  return ROWS.find(row => row.packageName === current)?.id
}

/** The package that fills a Blueprint row (used to write a Blueprint as a Blends manifest). */
export function packageForBlueprintRow(id: BlueprintRowId): { readonly rowId: string, readonly packageName: string } {
  const row = ROWS.find(candidate => candidate.id === id)
  if (row === undefined) throw new Error(`no row declaration for ${id}`)
  return { rowId: row.rowId, packageName: row.packageName }
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
    if (existingRowIds.has(row.rowId)) continue
    packages.push(row.packageName)
    const identityConfig = row.id === 'system-prompt' && blueprint.brand.kind === 'custom'
      ? { config: { identity: identityLine(blueprint.brand.identity) } }
      : {}
    patches.push({ insert: [{ id: row.rowId, name: row.packageName, ...identityConfig }] })
  }
  // With the plugin hub, DSH's own plugin manager is replaced by the hub's subclass of it, so DSH's "Add plugin" box installs a git address as
  // that repository's released, checked version (spec 044 D7). Swapped, never doubled: Cordis refuses a second `pluginManager` provider.
  if (blueprint.rows.includes('plugin-hub') && !existingRowIds.has(PLUGIN_MANAGER_ROW_ID)) {
    patches.push({ id: DSH_PLUGIN_MANAGER_ROW_ID, disabled: true }, { insert: [{ id: PLUGIN_MANAGER_ROW_ID, name: PLUGIN_MANAGER_ROW_ID }] })
  }
  return { packages, patches: structuredClone(patches) }
}
