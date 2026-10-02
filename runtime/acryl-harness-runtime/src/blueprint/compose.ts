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
  { id: 'extension-context', surfaces: ['tui', 'web', 'desktop'], rowId: 'extension-context', packageName: 'acryl-extension-context' },
  { id: 'system-prompt', surfaces: ['tui', 'web', 'desktop'], rowId: 'acryl-system-prompt', packageName: 'acryl-system-prompt' },
  { id: 'ui-library', surfaces: ['tui', 'web', 'desktop'], rowId: '@acryl/ui', packageName: '@acryl/ui', libraryOnly: ['tui'] },
  // Saving an app to its own repository (/app save, /app connect): a command, so it works on every surface.
  { id: 'app-save', surfaces: ['tui', 'web', 'desktop'], rowId: 'acryl-app-save', packageName: 'acryl-app-save' },
  // DETACHED on the DSH 0.2 branch (spec 001 R25): 0.2 ships its own `shortcuts` client service (dsh-client-shortcuts) that other
  // upstream UI plugins inject by package name, so a second provider of the same service fails the client boot. Re-attach as a
  // layer over the upstream service (key rebinding persisted through `acrylSettings`), then restore the surfaces.
  { id: 'shortcuts', surfaces: [], rowId: 'acryl-shortcuts', packageName: 'acryl-shortcuts' },
  { id: 'mount-anchors', surfaces: ['web', 'desktop'], rowId: 'acryl-mount-anchors', packageName: 'acryl-mount-anchors' },
]

/** The terminal library is a differently named package than the browser one. */
const TUI_LIBRARY_PACKAGE = 'acryl-ui-tui'

/** Which Blueprint row a package is, if it is one of ACRYL's own rows (used to read a Blends manifest's rows back into a Blueprint). */
export function blueprintRowForPackage(packageName: string): BlueprintRowId | undefined {
  return ROWS.find(row => row.packageName === packageName)?.id
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
  return { packages, patches: structuredClone(patches) }
}
