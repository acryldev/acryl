/**
 * Which ACRYL coding capabilities each product surface composes.
 *
 * A capability is a declaration, not a branch: each one names the surfaces it
 * applies to and the Loader patches that compose it, and
 * {@link createAcrylCodingCapabilityPatches} returns exactly the declared set
 * for the surfaces a caller passes. Adding a capability to a surface is a data
 * change here; a per-surface `if` in a caller (or a row-id filter that silently
 * drops rows for some surfaces) is the bug this file exists to remove.
 *
 * The declarations describe applicability, not proof: a surface still has to
 * call this function, and a row only composes where the package behind it is
 * resolvable from that surface's profile. A capability a surface cannot host
 * belongs in `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`'s slot-absence category,
 * and its row is simply not declared for that surface (FR-007).
 *
 * @module acryl-harness-runtime/coding-capabilities
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

export type AcrylSurface = 'tui' | 'web' | 'desktop'

export type AcrylCodingCapabilityId =
  | 'persona'
  | 'agent-roster'
  | 'session-stats'
  | 'authorization'

export interface AcrylCodingCapability {
  readonly id: AcrylCodingCapabilityId
  /**
   * Product surfaces this capability declares itself for. A surface that hosts
   * the row's package should be listed; one that has no slot for it (a client
   * UI on a TUI, a native window off Electron) stays out, and its absence is
   * not an error.
   */
  readonly surfaces: readonly AcrylSurface[]
  readonly loaderPatches: readonly PatchOptions[]
}

const require = createRequire(import.meta.url)

/**
 * The shipped agent presets, resolved from the pinned
 * `@deepseek-ai/dsh-agent-presets` package this runtime declares.
 *
 * Derived, never a repository path: the npm package ships `presets/`
 * (`files` in its manifest), so the same directory resolves in a development
 * checkout and in a packaged CLI/Desktop build. It previously pointed at
 * `deepseek-harness/packages/preset/agent-presets/presets`, which exists only
 * in a full source checkout - a shipped build then composed an `agent-presets`
 * row with `roots: []` and `includeShippedRoot: false`, i.e. a roster with no
 * presets at all.
 */
function shippedPresetsDir(): string {
  const manifest = require.resolve('@deepseek-ai/dsh-agent-presets/package.json')
  return join(dirname(manifest), 'presets')
}

const agentPresetConfig: Record<string, unknown> = {
  default: 'standard',
  // An explicit system root rather than `includeShippedRoot: true`: the roster
  // order is then the one written here, not a package-internal default.
  roots: [{ path: shippedPresetsDir(), trust: 'system' }],
  includeShippedRoot: false,
  includeUserRoot: true,
}

/*
 * Rows the ACRYL runtime composes on top of a base profile. dsh-base alone
 * mounts no persona, no agent-preset service, and no session-stat projection;
 * these are what let a surface open a real coding agent. `hmr` is deliberately
 * NOT forced here: the boot guard in `engine-dsh.ts` must keep rejecting an
 * HMR-enabled profile in a non-exposed process, and each surface decides its
 * own HMR policy. Values are defaults a surface or user patch layer may
 * override.
 *
 * `system-prompt` is already in dsh-base's include tree, so a plain
 * id-targeted row overrides its config. `agent-presets`, `session-stats` and
 * `authorization` are NOT in the base include set, so they must be `insert`ed -
 * a plain row only overrides an existing entry, it does not create one (that is
 * why they silently never composed before).
 *
 * Why the split: web and desktop build on bundles (`dsh-web-app`) that already
 * compose their own persona, roster and session-stat rows, so ACRYL declares
 * those capabilities for `tui` only and lets those surfaces keep the bundle's
 * rows. The authorization service is the opposite case - every surface needs it
 * so `dsh-llm-pi-ai` has a seam to register OAuth sign-in flows into; without
 * it the pi-ai adapter stays PENDING and `/login` has no providers to offer.
 */
export const ACRYL_CODING_CAPABILITIES: readonly AcrylCodingCapability[] = [
  {
    id: 'persona',
    surfaces: ['tui'],
    loaderPatches: [
      {
        id: 'system-prompt',
        name: '@deepseek-ai/dsh-system-prompt',
        config: {
          persona: 'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.',
        },
      },
    ],
  },
  {
    id: 'agent-roster',
    surfaces: ['tui'],
    loaderPatches: [
      {
        insert: [
          { id: 'agent-presets', name: '@deepseek-ai/dsh-agent-presets', config: agentPresetConfig },
        ],
      },
    ],
  },
  {
    id: 'session-stats',
    surfaces: ['tui'],
    loaderPatches: [
      { insert: [{ id: 'session-stats', name: '@deepseek-ai/dsh-session-stats' }] },
    ],
  },
  {
    id: 'authorization',
    surfaces: ['tui', 'web', 'desktop'],
    loaderPatches: [
      { insert: [{ id: 'authorization', name: '@deepseek-ai/dsh-authorization' }] },
    ],
  },
]

/**
 * The patches one root composes, for the surfaces that root serves.
 *
 * Returns fresh objects on every call (`structuredClone`), because callers hand
 * the result to a Loader composition that mutates it, and a shared frozen
 * declaration would leak one surface's edits into the next root.
 */
export function createAcrylCodingCapabilityPatches(
  surfaces: ReadonlySet<AcrylSurface>,
): readonly PatchOptions[] {
  return structuredClone(
    ACRYL_CODING_CAPABILITIES
      .filter(capability => capability.surfaces.some(surface => surfaces.has(surface)))
      .flatMap(capability => capability.loaderPatches),
  )
}
