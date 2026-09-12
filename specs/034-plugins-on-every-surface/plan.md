# Plan: plugins on every surface

**Spec**: `specs/034-plugins-on-every-surface/spec.md`
**Status**: active
**Created**: 2026-09-12

## Shape of the change

Two moves, in this order, each independently shippable:

1. **Composition parity** - every surface composes the ACRYL plugin rows it
   can host, through the seam that already exists
   (`acryl-harness-runtime/src/coding-capabilities.ts`). This is what makes the
   Web panel and a CLI command show real plugins.
2. **Ownership parity** - the plugin lifecycle, inventory, install, and health
   implementation moves out of `acryl-desktop` into a shared capability that
   all three surfaces invoke. This is what satisfies the runtime-surface
   contract, and it is what keeps (1) from becoming three copies.

Slice 1 delivers (1) and the smallest honest version of (2): the shared
service boundary, with Desktop still running its own implementation behind it.
Slice 2 relocates Desktop's implementation behind that boundary. Slice 3
removes the duplication.

## Seam inventory (what exists today)

| Concern | Today | Intended home |
| --- | --- | --- |
| Per-surface capability composition | `ACRYL_CODING_CAPABILITIES` + `createAcrylCodingCapabilityPatches(surfaces)` in `acryl-harness-runtime/src/coding-capabilities.ts`; carries `authorization` only | same file, extended with plugin capabilities; the `NON_TUI_SHARED_ROW_IDS` filter replaced by per-capability `surfaces` declarations |
| Engine composition per surface | `createDshEngineDefinition` (tui), `createWebEngineDefinition` (web), `createDshEngineDefinitionFromComposition` (desktop) in `acryl-harness-runtime/src/engine-dsh.ts` | unchanged; they are the call sites that gain rows |
| Plugin inventory | `@deepseek-ai/dsh-host-plugin-inventory` (service `pluginInventory`), composed only where a surface mounts it | composed on all three surfaces |
| Plugin lifecycle (enable/disable) | `acryl-desktop/src/plugin-lifecycle-{contract,controller,state,route}.ts` | contract and controller in `acryl-control/src/plugin/`, Cordis service in the runtime package, route stays with the surface that serves HTTP |
| Plugin install/reconcile | `acryl-desktop/src/desktop-plugin-reconcile.ts` + the profile's own pnpm (`specs/031`) | shared runtime module; surface supplies the install anchor |
| Market provider | `dshmarket` (provider `dshmarket`) and `dsh-community-market` (provider `community-market`), selected by `acryl-desktop/src/desktop-market.ts` | provider selection becomes a runtime capability; the Electron-only parts stay in the surface |
| Presentation | Electron/Web client plugins (`@deepseek-ai/dsh-client-ui-settings-plugins`, `...-plugin-inventory`), TUI has none | unchanged per surface; a plugin declares the slots it ships |

`acryl-control` already follows the contract/provider/controller split for
other domains (`agent/`, `authorization/`, `architecture/`, `credential/`,
`lifecycle/`), so the plugin domain joins an established pattern rather than
inventing one.

## Per-surface composition target

Derived from declarations, not from a per-surface list. Indicative:

| Row / capability | tui | web | desktop |
| --- | --- | --- | --- |
| `authorization`, `system-prompt`, `agent-presets`, `session-stats` | yes | yes | yes |
| `@deepseek-ai/dsh-host-plugin-inventory` | yes | yes | yes |
| `@deepseek-ai/dsh-plugin-package-inventory-deepseek` | yes | yes | yes |
| market provider row (`community-market` / `dshmarket`) | yes (headless provider) | yes | yes |
| client settings plugin UIs | n/a (slot absent) | yes | yes |
| editor tool (`dsh-tool-str-replace-editor`) | yes | yes | yes |
| `acryl-development-canvas` | n/a (slot absent) | yes | yes |
| ACRYL brand client plugin | n/a | yes | yes |

Two deliberate exclusions, per FR-007: a row whose package only ships a
client UI slot is skipped on `tui`, and a native-window-only feature is
skipped where no such window exists.

## Migration path (no big-bang rewrite)

- Desktop keeps working after every step. Each relocation leaves a passing
  desktop suite; the private module is deleted only once the shared path is
  the one the desktop actually exercises (rule: "do not delete old
  implementations without user approval" - each deletion is listed in
  `tasks.md` and confirmed at that task).
- The profile install anchor is the one genuinely surface-specific input:
  Electron resolves it from packaged resources, CLI/Web from their own
  installation directory (`materializeProfilePackage`'s
  `installPackageUrl` pattern in `engine-dsh.ts:209` is the precedent).
- Row identity collides across surfaces only when two providers claim the same
  id; the market selection already guards this
  (`assertNoBlendRowCollisions`, `DESKTOP_MARKET_IDENTITIES`), and the shared
  table must keep that guard rather than duplicate ids per surface.

## Verification

Per surface, real evidence:

- **tui**: `specs/019`-style Loader smoke plus a cold start with a throwaway
  `ACRYL_HOME` running the plugin command; assert the composed ACRYL plugin ids
  and that disabling one drops it from the next boot.
- **web**: cold start `acryl-web`, assert the host reports the same ids
  (client-independent), and that the Settings panel renders them (Playwright or
  a real browser check, per this repo's GUI-confirmation rule).
- **desktop**: unchanged suite plus a real GUI launch for install/enable/
  disable, extending `specs/031`'s `ready-for-human` flow.
- **parity**: one profile, three surfaces, one list (FR-008), asserted by a
  test that boots each engine definition's composition and compares the
  resulting plugin row id sets.

## Risks

- **Market under a non-Electron host**: `dsh-community-market` may assume an
  Electron main process. Resolve in `research.md` Q1 before committing Web to
  it; the fallback is that Web lists and enables plugins but installs through
  the CLI path.
- **Install without Electron**: no `app.getPath` outside Electron; the pnpm
  reconcile path must accept an injected anchor (Q2).
- **Panel semantics**: if the panel enumerates session-scoped preset rows only,
  FR-005 needs a host provider the TUI can also read (Q3).
- **Desktop regression surface** is large (`desktop-plugins.ts` is ~900 lines);
  every relocation step is gated on the desktop suite staying green and on the
  `verify:loader` / `verify:profile` checks.

## Ledger updates

- `docs/DEVELOPMENT-LOG.md`: one entry per landed task.
- `specs/031-desktop-plugin-install/spec.md`: cross-reference this spec instead
  of leaving install ownership implicitly desktop-only.
- `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`: no change expected; this spec
  implements what it already decides.
