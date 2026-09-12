# Plugins on every surface

**Feature Directory**: `specs/034-plugins-on-every-surface`
**Created**: 2026-09-12
**Status**: ready-for-agent
**Authority**: `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`,
`specs/021-acryl-agent-plugin-ecosystem/spec.md`,
`specs/016-plugin-lifecycle-control`, `specs/031-desktop-plugin-install`,
`specs/028-harness-engine-swap/spec.md`
**Input**: user report 2026-09-12 - Web `Settings > Plugins > Plugin list`
reports `Session plugins 0 plugins` / `Global plugins 0 plugins` while
searching for `editor`, and `acryl-cli` has no plugin surface at all. User
instruction: "first plan it in spec, then do. add this as spec. for each
surface."

## Problem

ACRYL's own contract says the runtime owns plugin lifecycle and the surfaces
only render it:

> ACRYL implements coding-agent behavior once in the ACRYL Runtime. CLI/TUI,
> Electron, and Web are surfaces that invoke and render the same runtime
> semantics. They do not own copied agent loops, session mutations, plugin
> lifecycle logic, or durable state.
> (`docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md:8`)

> Dynamic ACRYL plugins load into the runtime. They may contribute
> capabilities, commands, events, and declared TUI, Electron, or Web
> presentation slots. (`docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md:31`)

For plugins, the implementation is the inverse of that decision. The whole
plugin stack is owned by the Electron surface:

- `acryl-desktop/src/desktop-plugins.ts` (`DesktopPluginsService`),
  `desktop-market.ts`, `desktop-plugin-reconcile.ts`, `desktop-plugin-watch.ts`,
  `plugin-lifecycle-{contract,controller,state,route}.ts`,
  `plugin-architecture-{contract,inspector,route}.ts`.
- `acryl-cli/src` and `acryl-web/src` contain no reference to plugin
  inventory, the market provider, plugin lifecycle, or a plugins service.

The composition asymmetry is already baked into the packages, not just into
the composition:

| Surface | plugin-relevant packages it declares |
| --- | --- |
| `acryl-desktop` | market (`dsh-community-market`, `dshmarket`), `@deepseek-ai/dsh-host-plugin-inventory`, both client settings plugin UIs, `@deepseek-ai/dsh-plugin-package-inventory-deepseek`, `acryl-development-canvas`, brand |
| `acryl-web` | `@deepseek-ai/dsh-host-plugin-inventory`, both client settings plugin UIs, `@deepseek-ai/dsh-plugin-package-inventory-deepseek`, brand - no market, no canvas |
| `acryl-cli` | `@deepseek-ai/dsh-plugin-package-inventory-deepseek` only |
| `acryl-harness-runtime` | `@deepseek-ai/dsh-tool-str-replace-editor` (declared, composed by no surface's global rows - it exists only inside the shipped `minimal` agent preset) |

Measured on 2026-09-12 (boot each real definition headlessly and dump
`ctx.loader.entries()`; commands and full tables in `research.md`): tui 88 rows,
web 157, desktop 168. The surfaces do not differ by "has plugins" - the client
stack is correctly web+desktop only - but by **which** rows each declares. The
one plugin-relevant row tui is missing that it could host is the Host
inventory service itself (`@deepseek-ai/dsh-host-plugin-inventory`); ACRYL's
plugin *management* is Desktop-only because it is implemented there
(`desktop-plugins.ts`, `plugin-lifecycle-*`, `plugin-architecture-*`, the
`PluginLifecycleSettingsTab` client tab), not because a declaration excludes it.
The panel's `0 plugins` in the original report is a post-search-filter count for
the query `editor`; the editor row lives in the `minimal` preset, which is what
its "1 more matches in other presets" line says.

The per-surface composition seam that should carry this already exists and is
under-used: `acryl-harness-runtime/src/coding-capabilities.ts` declares
`ACRYL_CODING_CAPABILITIES` with an explicit `surfaces` field per capability,
and `createAcrylCodingCapabilityPatches(surfaces)` composes what a surface
declares. It carries exactly one capability today (`authorization`), and for
non-TUI surfaces it filters to a single row id set
(`NON_TUI_SHARED_ROW_IDS`) rather than composing the real per-surface set.
All three surfaces already call it (`engine-dsh.ts:178` for tui,
`engine-dsh.ts:252` for web, `acryl-desktop/src/profile.ts:689` for desktop),
so the seam is live and proven; plugins simply are not in it.

Consequence for a user: attach the same ACRYL profile from Web or the CLI and
the plugin capability disappears. There is one writable runtime per profile
(`specs/021` Decisions), so the plugin set must not depend on which surface
happens to be attached.

## Objective

Make plugin capability a runtime capability with a surface-appropriate
transport, per the existing surface contract: the runtime owns inventory,
lifecycle, install, and durable plugin records; each surface renders and
drives it. A user who attaches any surface to one profile sees the same plugin
set and can act on it.

## Functional requirements

- **FR-001**: One implementation of plugin inventory, lifecycle
  (enable/disable), install/reconcile, and health exists in a shared package,
  not in a surface. The Electron surface's current implementation moves there
  or becomes a thin adapter over it; no surface keeps a private copy.
- **FR-002**: Every ACRYL plugin and capability declares the surfaces it
  supports, using the existing `AcrylSurface` (`'tui' | 'web' | 'desktop'`)
  vocabulary. Composition is derived from those declarations; a per-surface
  hand-maintained row list is not the mechanism.
- **FR-003**: Each surface's engine definition composes exactly the plugin
  rows its declared surfaces cover - `acryl-cli` through
  `createDshEngineDefinition`, `acryl-web` through `createWebEngineDefinition`,
  `acryl-desktop` through `createDshEngineDefinitionFromComposition`.
- **FR-004**: CLI/TUI exposes the plugin capability as commands
  (`acryl plugin list|enable|disable|add|remove|doctor`, exact spelling fixed
  in `plan.md`), each invoking the shared capability. It never requires a
  presentation slot to be useful.
- **FR-005**: Web's existing `Settings > Plugins` panel reports the runtime's
  real composed rows for the attached profile, and install/enable/disable act
  through the shared capability rather than through Electron-only APIs.
- **FR-006**: Electron keeps its current user-visible behavior. Where it
  currently owns lifecycle logic, that logic relocates; the surface keeps only
  presentation and transport.
- **FR-007**: A plugin that declares no slot for a surface is skipped on that
  surface without error. Absence of a TUI slot is not a defect in a plugin
  that declares only Web/Electron slots.
- **FR-008**: Parity is observable and testable: for one profile, all three
  surfaces report the same plugin ids. The check is part of the gate, not a
  convention.

## Acceptance

Per surface, with real evidence (not unit tests alone):

- **CLI/TUI**: cold start with a throwaway `ACRYL_HOME`; the plugin command
  lists the composed ACRYL plugins for that profile.
- **Web**: real cold start of `acryl-web`; the Settings panel shows the same
  plugin ids as the CLI for the same profile.
- **Electron**: real launch; same ids; install, enable, and disable still work
  end to end (extends the `ready-for-human` flow of `specs/031`).
- Cross-surface: one profile, three surfaces, one list. A plugin present on
  Desktop but absent on Web/CLI is either a declared slot absence (allowed,
  documented) or a defect.

## Non-goals

- The public registry, commerce, and federated catalogs of `specs/021` and
  `specs/030`.
- Blends as a runtime contract (`specs/033`).
- A detached control daemon, active-controller leases, or cross-process
  authority (`docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md` explicit non-goals).
- Engine #2 (pi) work from `specs/028`; this spec stays engine-neutral and
  assumes the `dsh` engine.

## Open questions

Tracked in `research.md`; each one is a gate on a task in `tasks.md`:

1. Can `dsh-community-market` (Host + Client faces) mount under the Web host
   without Electron-only APIs?
2. Does the install/reconcile path of `specs/031` (`desktop-plugin-reconcile.ts`
   plus the profile's own pnpm) work outside an Electron process, where there
   is no `app.getPath` and no packaged-app resource resolution?
3. What exactly does the `Settings > Plugins` panel enumerate - and can the
   `tui` surface be served by the same host provider without a client UI?
