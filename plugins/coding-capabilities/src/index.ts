/**
 * How ACRYL's coding capabilities compose on a product surface: which Loader rows each one inserts, which ACRYL-owned packages its
 * surface must make resolvable, and the composers that return exactly the set a surface (or a Blueprint) asks for.
 *
 * A capability is a declaration, not a branch: adding one to a surface is a data change here; a per-surface `if` in a caller (or a
 * row-id filter that silently drops rows for some surfaces) is the bug this table exists to remove. The Blueprint vocabulary (which
 * capability ids exist, and which need the framework router) stays in `@acryldev/harness-runtime`: Blueprint parsing is runtime domain,
 * while the composition of plugins is the surface's. The two tables must name the same ids; the test asserts it both ways.
 *
 * @module @acryldev/coding-capabilities
 */

import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
/** The product surfaces this package composes for; the runtime's Blueprint vocabulary declares the same names, and a runtime test holds the two tables' ids together. */
export type AcrylSurface = 'tui' | 'web' | 'desktop'

/** The capability ids a Blueprint may name; the vocabulary's own table in the runtime is the authority, and the id sets are asserted equal. */
export type AcrylCodingCapabilityId =
  | 'persona'
  | 'agent-roster'
  | 'session-stats'
  | 'authorization'
  | 'acryl-settings'
  | 'workspace'
  | 'plugin-admin'
  | 'sign-in'
  | 'launcher-screen'
  | 'account-callback'
  | 'support'
  | 'agent-control-ui'
  | 'advanced-shell'

/** The shell a surface renders the coding UI in (`compatibility` keeps the stock DSH frame; `advanced` is the ACRYL shell). */
export type AcrylShellMode = 'compatibility' | 'advanced'

/** The input an engine definition takes from the surface that composes it (structurally the runtime's own `CodingCapabilities`). */
export interface CodingCapabilities {
  /** Installations whose `node_modules` may hold a named package, in order: the surface's own, then this package's. */
  readonly anchors: readonly string[]
  patches(surface: ReadonlySet<AcrylSurface>, existingRowIds: ReadonlySet<string>, only: ReadonlySet<AcrylCodingCapabilityId>): readonly PatchOptions[]
  shellPatches(surface: ReadonlySet<AcrylSurface>, shellMode: AcrylShellMode, existingRowIds: ReadonlySet<string>, only: ReadonlySet<AcrylCodingCapabilityId>): readonly PatchOptions[]
  packages(surface: ReadonlySet<AcrylSurface>, only: ReadonlySet<AcrylCodingCapabilityId>): readonly string[]
  readonly appFramePatches: readonly PatchOptions[]
}

export interface CodingCapabilityComposition {
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

/**
 * Agent presets for the TUI surface. DSH 0.2 removed the `dsh-agent-presets` package and its shipped `presets/` directory:
 * preset compositions are now declared in profile YAML and the `agent-preset-registry` row only selects among them
 * (spec 001 R18, R24). The `dsh-web-app` bundle declares its presets natively, so Web and Desktop need nothing here.
 * The TUI composes the registry with the default selection only, which leaves its roster empty until ACRYL declares
 * presets for it. DETACHED: re-attach by shipping preset patch files for the TUI.
 */
const agentPresetConfig: Record<string, unknown> = {
  default: 'standard',
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
export const CODING_CAPABILITY_COMPOSITIONS: readonly CodingCapabilityComposition[] = [
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
          { id: 'agent-preset-registry', name: '@deepseek-ai/dsh-agent-preset-registry', config: agentPresetConfig },
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
    // ACRYL's own surface preferences (shortcuts, desktop shell mode, notifications, market): one small settings
    // service backed by a YAML file in the ACRYL home, so these do not depend on the harness settings design
    // (spec 001 R22, R24). Every surface composes it; consumers use `ctx.acrylSettings`.
    id: 'acryl-settings',
    surfaces: ['tui', 'web', 'desktop'],
    requiresPackages: ['@acryldev/settings'],
    loaderPatches: [
      { insert: [{ id: 'acryl-settings', name: '@acryldev/settings' }] },
    ],
  },
  {
    // The ACRYL workspace (spec 040): Projects list, per-worktree tabbed canvas, Changes, Review, Checks and
    // Files panels, and the file editor. Composed once for both surfaces that render it; TUI has no slot for
    // it. Its client half only takes over the frame when the shell mode is `advanced`.
    // Re-attached on the DSH 0.2 branch (spec 001 R25): the tab strip and Projects panel own the main view through
    // `sessions/main-session.ts` (`retain(..., { source: 'mainView' })`) instead of the removed `ISessions.open`.
    id: 'workspace',
    surfaces: ['desktop', 'web'],
    // `@acryldev/workspace`'s client bundle does `require('@acryldev/app-shell/client')`; the client-modules Host
    // only resolves a `require()` target into a real browser module when that package is itself a scanned,
    // active Loader entry (`deepseek-harness/packages/client/modules/src/index.ts`'s manifest scan is over
    // Loader entries, not over any plugin's own `dsh.client.inject` list or its npm dependency graph) - found
    // live: `@acryldev/app-shell` shipped as a package.json dependency and a prebuild step but never as its own
    // row, so the Host booted clean (headless Loader smoke never renders a page) while the real browser threw
    // `require("@acryldev/app-shell/client") missed the module table` the first time anything actually opened
    // `desktop.main`.
    requiresPackages: ['@acryldev/app-shell', '@acryldev/workspace'],
    loaderPatches: [
      { insert: [{ id: 'acryl-app-shell', name: '@acryldev/app-shell' }, { id: 'acryl-workspace', name: '@acryldev/workspace' }] },
    ],
  },
  {
    // Settings > Plugins > Lifecycle and Architecture: one Cordis plugin (Host routes, Client tabs) driven by
    // the `ctx.acrPluginLifecycle` service every surface publishes. It was Desktop-only inside `acryl-desktop`.
    id: 'plugin-admin',
    surfaces: ['desktop', 'web'],
    requiresPackages: ['@acryldev/plugin-admin'],
    loaderPatches: [
      { insert: [{ id: 'acryl-plugin-admin', name: '@acryldev/plugin-admin' }] },
    ],
  },
  {
    // Sign in to a model provider with an account (OAuth: Claude, ChatGPT/Codex and the rest of the catalog's flows) from
    // Settings > Models, over the harness's authorization flows; API keys stay on the Models page's own editor.
    id: 'sign-in',
    surfaces: ['web', 'desktop'],
    requiresPackages: ['@acryldev/sign-in'],
    loaderPatches: [
      { insert: [{ id: 'acryl-sign-in', name: '@acryldev/sign-in' }] },
    ],
  },
  {
    // The ACRYL screen (spec 050 T012): every app made with ACRYL on this machine, with New app, Add a folder, Start and Stop. A full-window layer over the
    // workspace in the frame's `shell.overlay` seat, open when the desktop app starts; the Host half lists, makes, starts and stops apps through the machine's
    // Node and npm. On Web and Desktop alike (surface sharing, spec 040); the terminal has its own screen (`acryl-launcher-tui`) over the same list.
    id: 'launcher-screen',
    surfaces: ['desktop', 'web'],
    requiresPackages: ['@acryldev/launcher-desktop'],
    loaderPatches: [
      { insert: [{ id: 'acryl-launcher-desktop', name: '@acryldev/launcher-desktop' }] },
    ],
  },
  {
    // DeepSeek account sign-in from the terminal's /login. The terminal has no web server for DeepSeek's browser callback,
    // and DSH's would also wake the API gateway; this row serves the callback on its own loopback port, as `webServer` in
    // a realm only the `deepseek-account` row shares. The row id names the shared realm's capability, not only a package
    // (the documented exception: two rows share the realm `acryl-account-callback`).
    id: 'account-callback',
    surfaces: ['tui'],
    requiresPackages: ['@acryldev/sign-in'],
    loaderPatches: [
      { insert: [{ id: 'acryl-sign-in-account-callback', name: '@acryldev/sign-in/account-callback', isolate: { webServer: 'acryl-account-callback' } }] },
      { id: 'deepseek-account', name: '@deepseek-ai/dsh-deepseek-account-platform', isolate: { webServer: 'acryl-account-callback' } },
    ],
  },
  {
    // Web keeps log files and offers Settings > Support > Export diagnostics. Desktop already has both natively
    // (the file logger in the main process and the tray export), so this stays off Desktop on purpose.
    id: 'support',
    surfaces: ['web'],
    requiresPackages: ['@acryldev/support'],
    loaderPatches: [
      { insert: [{ id: 'acryl-support', name: '@acryldev/support' }] },
    ],
  },
  {
    // Agent Control (spec 041): the agent can look at and operate the ACRYL window, on the same terms on both
    // surfaces. One package (Host tools plus the in-page driver), joined by a same-origin WebSocket; every
    // click, type, select and key press is approved per call. A TUI has no page, so it is not declared here.
    id: 'agent-control-ui',
    surfaces: ['desktop', 'web'],
    requiresPackages: ['@acryldev/agent-control'],
    loaderPatches: [
      // `online`: the loopback gateway (secret-gated, this machine only) on, so the assistant's Claude agent and an outside CLI agent reach ACRYL's tools,
      // the launcher's among them (spec 050 T013). Every click, type and key press of the window driver is still approved per call.
      { insert: [{ id: 'acryl-agent-control', name: '@acryldev/agent-control', config: { online: true } }] },
    ],
  },
  {
    // Rows toggled so the ACRYL shell owns the frame: the stock layout off, the sidebar and conversation on.
    // The rows exist in the shared `dsh-web-app` bundle both surfaces build on.
    // Re-attached on the DSH 0.2 branch (spec 001 R25): `@acryldev/app-shell`'s layout state now implements 0.2's whole `ILayout`
    // (panelInfo, selectPanel, beginNavigation) and renders upstream's keyed `main` panels, so upstream's sidebars work on it.
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

/** The stock rows the ACRYL frame replaces: the advanced-shell capability's own patches, which a Blueprint with an `app-shell` row composes. */
export const ADVANCED_SHELL_PATCHES: readonly PatchOptions[] =
  CODING_CAPABILITY_COMPOSITIONS.find(capability => capability.id === 'advanced-shell')?.loaderPatches ?? []

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
  only?: ReadonlySet<AcrylCodingCapabilityId>,
): readonly PatchOptions[] {
  return composePatches(
    CODING_CAPABILITY_COMPOSITIONS.filter(capability => capability.shellMode === undefined && isSelected(capability, only)),
    surfaces,
    existingRowIds,
  )
}

/** `only` undefined means every declared capability; a Blueprint passes the subset it composes. */
function isSelected(capability: CodingCapabilityComposition, only: ReadonlySet<AcrylCodingCapabilityId> | undefined): boolean {
  return only === undefined || only.has(capability.id)
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
  only?: ReadonlySet<AcrylCodingCapabilityId>,
): readonly PatchOptions[] {
  return composePatches(
    CODING_CAPABILITY_COMPOSITIONS.filter(capability => capability.shellMode === shellMode && isSelected(capability, only)),
    surfaces,
    existingRowIds,
  )
}

/** The ACRYL-owned packages a surface must make resolvable for the capabilities it composes. */
export function acrylCodingCapabilityPackages(
  surfaces: ReadonlySet<AcrylSurface>,
  only?: ReadonlySet<AcrylCodingCapabilityId>,
): readonly string[] {
  return [...new Set(
    CODING_CAPABILITY_COMPOSITIONS
      .filter(capability => isSelected(capability, only) && capability.surfaces.some(surface => surfaces.has(surface)))
      .flatMap(capability => capability.requiresPackages ?? []),
  )]
}

function composePatches(
  capabilities: readonly CodingCapabilityComposition[],
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

/**
 * The composition a surface hands to its engine definition, anchored at the surface's own `package.json` so capability packages
 * materialize from the app that composes them, not from the runtime.
 */
export function codingCapabilitiesFor(anchor: string): CodingCapabilities {
  return {
    anchors: [anchor, new URL('../package.json', import.meta.url).href],
    patches: createAcrylCodingCapabilityPatches,
    shellPatches: createAcrylShellCapabilityPatches,
    packages: acrylCodingCapabilityPackages,
    appFramePatches: ADVANCED_SHELL_PATCHES,
  }
}

/**
 * The composition anchored at this package itself, for a consumer that does not depend on the plugin packages: the runtime's integration
 * tests boot a surface with the real composition this way (spec 051 T021's one dev-only edge). A surface anchors at its own `package.json`
 * instead, via {@link codingCapabilitiesFor}.
 */
export const codingCapabilities: CodingCapabilities = codingCapabilitiesFor(new URL('../package.json', import.meta.url).href)
