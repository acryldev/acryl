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

/** Declaration order is mount order. */
const ROWS: readonly RowDeclaration[] = [
  { id: 'community-market', surfaces: ['web'], rowId: 'community-market', packageName: 'cordis-plugin-market' },
  { id: 'extension-context', surfaces: ['tui', 'web'], rowId: 'extension-context', packageName: 'acryl-extension-context' },
  { id: 'system-prompt', surfaces: ['tui', 'web'], rowId: 'acryl-system-prompt', packageName: 'acryl-system-prompt' },
  { id: 'ui-library', surfaces: ['tui', 'web'], rowId: '@acryl/ui', packageName: '@acryl/ui', libraryOnly: ['tui'] },
  { id: 'shortcuts', surfaces: ['web'], rowId: 'acryl-shortcuts', packageName: 'acryl-shortcuts' },
  { id: 'mount-anchors', surfaces: ['web'], rowId: 'acryl-mount-anchors', packageName: 'acryl-mount-anchors' },
]

/** The terminal library is a differently named package than the browser one. */
const TUI_LIBRARY_PACKAGE = 'acryl-ui-tui'

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
  if (surface === 'web') {
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
