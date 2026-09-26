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
  | 'workspace'
  | 'plugin-admin'
  | 'advanced-shell'

/**
 * The shell a surface renders the coding UI in. `advanced` replaces the stock DSH frame with the ACRYL
 * shell (Projects list, tabbed canvas, right panel); `compatibility` keeps the stock frame. Desktop lets
 * the user choose; Web always runs `advanced`, so both surfaces share one workspace.
 */
export type AcrylShellMode = 'compatibility' | 'advanced'

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
  /**
   * ACRYL-owned packages the composing surface must make resolvable from its profile before the row can
   * load (Web links them into the profile's `node_modules`; Desktop resolves them through its own hook).
   */
  readonly requiresPackages?: readonly string[]
  /**
   * When set, the capability composes only for a surface running that shell mode, through
   * {@link createAcrylShellCapabilityPatches}; it is left out of {@link createAcrylCodingCapabilityPatches}.
   */
  readonly shellMode?: AcrylShellMode
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
  {
    // The ACRYL workspace (spec 040): Projects list, per-worktree tabbed canvas, Changes, Review, Checks and
    // Files panels, and the file editor. Composed once for both surfaces that render it; TUI has no slot for
    // it. Its client half only takes over the frame when the shell mode is `advanced`.
    id: 'workspace',
    surfaces: ['desktop', 'web'],
    requiresPackages: ['acryl-workspace'],
    loaderPatches: [
      { insert: [{ id: 'acryl-workspace', name: 'acryl-workspace' }] },
    ],
  },
  {
    // Settings > Plugins > Lifecycle and Architecture: one Cordis plugin (Host routes, Client tabs) driven by
    // the `ctx.acrPluginLifecycle` service every surface publishes. It was Desktop-only inside `acryl-desktop`.
    id: 'plugin-admin',
    surfaces: ['desktop', 'web'],
    requiresPackages: ['acryl-plugin-admin'],
    loaderPatches: [
      { insert: [{ id: 'acryl-plugin-admin', name: 'acryl-plugin-admin' }] },
    ],
  },
  {
    // Rows toggled so the ACRYL shell owns the frame: the stock layout off, the sidebar and conversation on.
    // The rows exist in the shared `dsh-web-app` bundle both surfaces build on.
    id: 'advanced-shell',
    surfaces: ['desktop', 'web'],
    shellMode: 'advanced',
    loaderPatches: [
      { id: 'ui-layout', disabled: true },
      { id: 'ui-sidebar', disabled: false },
      { id: 'ui-conversation', disabled: false },
    ],
  },
]

/**
 * The patches one root composes, for the surfaces that root serves.
 *
 * `existingRowIds` names rows the target profile's own bundle already
 * composes before these patches apply (e.g. a `desktop`/`web`-flavored
 * profile booted through the CLI/TUI's own generic `--profile <name>` path,
 * whose `dsh-web-app`-based bundle already carries `agent-presets` natively).
 * An `insert` is a Loader row that must not already exist - unlike a plain
 * `id`-targeted patch, which only overrides one - so an `insert` entry whose
 * id is already present is dropped rather than composed a second time: the
 * capability's actual intent ("this profile ends up with the row") is
 * already satisfied by the bundle, and inserting again throws `duplicate
 * loader entry id` at boot (spec 034 T008). This does not special-case any
 * one row id; it holds for every declared capability.
 *
 * Returns fresh objects on every call (`structuredClone`), because callers hand
 * the result to a Loader composition that mutates it, and a shared frozen
 * declaration would leak one surface's edits into the next root.
 */
export function createAcrylCodingCapabilityPatches(
  surfaces: ReadonlySet<AcrylSurface>,
  existingRowIds: ReadonlySet<string> = new Set(),
): readonly PatchOptions[] {
  return composePatches(
    ACRYL_CODING_CAPABILITIES.filter(capability => capability.shellMode === undefined),
    surfaces,
    existingRowIds,
  )
}

/**
 * The patches that put a surface into one shell mode. Kept apart from
 * {@link createAcrylCodingCapabilityPatches} because Desktop learns its mode only after the base rows
 * (and its settings file) are composed, while Web is always `advanced`.
 */
export function createAcrylShellCapabilityPatches(
  surfaces: ReadonlySet<AcrylSurface>,
  shellMode: AcrylShellMode,
  existingRowIds: ReadonlySet<string> = new Set(),
): readonly PatchOptions[] {
  return composePatches(
    ACRYL_CODING_CAPABILITIES.filter(capability => capability.shellMode === shellMode),
    surfaces,
    existingRowIds,
  )
}

/** The ACRYL-owned packages a surface must make resolvable for the capabilities it composes. */
export function acrylCodingCapabilityPackages(surfaces: ReadonlySet<AcrylSurface>): readonly string[] {
  return [...new Set(
    ACRYL_CODING_CAPABILITIES
      .filter(capability => capability.surfaces.some(surface => surfaces.has(surface)))
      .flatMap(capability => capability.requiresPackages ?? []),
  )]
}

function composePatches(
  capabilities: readonly AcrylCodingCapability[],
  surfaces: ReadonlySet<AcrylSurface>,
  existingRowIds: ReadonlySet<string>,
): readonly PatchOptions[] {
  const patches = capabilities
    .filter(capability => capability.surfaces.some(surface => surfaces.has(surface)))
    .flatMap(capability => capability.loaderPatches)
    .flatMap((patch): readonly PatchOptions[] => {
      if (patch.insert === undefined) return [patch]
      const insert = patch.insert.filter(row => row.id === undefined || !existingRowIds.has(row.id))
      return insert.length > 0 ? [{ ...patch, insert }] : []
    })
  return structuredClone(patches)
}
