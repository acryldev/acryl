# Tasks: ACRYL UI library

Ordered. Each task lands as its own commit with its evidence; a task that cannot show its evidence is not done. Work directly on `main`; record
each landed task in `docs/DEVELOPMENT-LOG.md` in a separate documentation commit. Never stage with `git add .` or `-A`.

## Status (2026-09-20)

Slice 0 mostly answered and the web skeleton landed (2026-09-21): M10 to M13 and the decisions are in `research.md`; Q3 (final token set, terminal light/dark) and Q6 (fabric RFC) remain open. Web layer landed (2026-09-21): the library is a Loader row on the web engine and in the Desktop profile (T011b), with semantic roles (Q3, approved) and a gallery example (T013 partial). Next: the terminal layer, T006/T007 (`tuiTheme`), then Slice 4 onwards. Every T-number and Q-number here refers to THIS spec (038-ui-component-library): tasks.md for tasks, research.md for Q and M numbers.

## Slice 0 - Research gates

- **T001 Exposure mechanism (Q1). DONE**, see M10. Measure how a package becomes a requirable client module without a plugin build step, and whether a
  workspace package ships in installed builds. **Evidence**: a browser run `require`-ing a probe package; notes in `research.md`.
- **T002 Terminal theme placement (Q2). MEASURED** (M11), prototype not built. Prototype `tuiTheme` in `acryl-cli`; convert one overlay; measure the diff size for all overlays.
  **Evidence**: prototype branch result and test.
- **T003 Token mapping (Q3, Q8). Q3 DONE** (approved): `plugins/acryl-ui-web/contracts/tokens.json` maps 13 roles to app tokens and terminal palettes (dark and light); the web roles are live. Q8 (terminal background detection) is built with `tuiTheme`. Curated semantic set to `--dsw-alias-*` and terminal roles; terminal background detection.
  **Evidence**: mapping table, one restyle demo on web and terminal.
- **T004 Contract format and layout (Q4, Q5, Q6). DECIDED** (Q4, Q5; Q6 open), see research decisions. Decide schema format, package layout, fabric RFC relation. **Evidence**: ADR in `plan.md`.
- **T005 Migration order and a11y minimum (Q7, Q9). DECIDED**, see research decisions. **Evidence**: written list and the headless check design.

## Slice 1 - Tokens and terminal theme

- **T006** Token source file and compilers (web theme, terminal palette) with a stale-output gate. **Terminal side DONE**: `apps/acryl-cli/scripts/compile-palette.mjs` generates `palette.generated.ts` from `plugins/acryl-ui-web/contracts/tokens.json`, a test fails when it is stale and pins the dark palette to the previous hex values. Web side: the role CSS is hand-written and a test asserts it matches `tokens.json` exactly (a generator is not needed until a second web consumer exists).
- **T007** `tuiTheme` service, provided before rows mount, persisted preference, `overrideTokens`, change event; tests. **DONE except a persisted preference and `overrideTokens` (a plugin must not change the user's palette): the read-only `tuiTheme` service (`mode`, `hex`, `color`, `onChange`) is provided on the CLI host with tests; Q8 is done (see below). Earlier partial note:** a live module-level theme (`theme.ts`: `setPaletteMode`, `resolvePaletteMode` from `ACRYL_TUI_THEME` then `COLORFGBG`, `fgRole`) with tests. Not done: exposing it as a service to plugins, a persisted preference, `overrideTokens`, the change event, and OSC 11 background detection (Q8 in research.md).
- **T008** Built-in CLI overlays read the service (migrate `theme.ts` to a live object); no visual regression (snapshot tests). **DONE**: 59 import-time captures in 19 files converted to `fgRole`, two lookup tables in `liveText.ts` now store roles; typecheck clean, 360 CLI tests pass, the dark palette equals the old one.
- **T009** Document the terminal theme API in the extension pack (`extending/tui-components.md`, mount-points map, skill).

## Slice 2 - Web layer

- **T010** Contracts: Button, TextField, Switch, Tag, Dialog, Card, Tabs (data package). **Done for the web layer**: Stack, Card, Field, SwitchField, SettingsRow, SelectField (over the app's Menu), Segmented, Tabs, Dialog (over the app's Modal), EmptyState are contracted in `plugins/acryl-ui-web/contracts/components.json`; Button, Tag, Pill, Toast, Modal, Tooltip are re-exported from the app's primitives (reuse over rewrite).
- **T011** `acryl-ui-web` over primitives; requirable module; declared in `dsh.client.inject`. **Partial**: package built, contract-tested (4 tests) and verified in a real browser (Card, Field, SwitchField, EmptyState, footerAction; error announced). **T011b DONE**: `acryl-ui-web` is a workspace package (pnpm-workspace, verify-layout, root test/check scripts, desktop package spec) and a Loader row on the web engine (`engine-dsh.ts`) and in the Desktop profile (`profile.ts`); a consumer plugin gets it with no install (checked live: the profile materialized it by itself). Not wired into the CLI (no browser client).
- **T012** Slot helpers (`headerAction`, `sidebarTab`, `footerAction`, `settingsCard`). **Partial**: `footerAction`, `headerAction`, `sidebarTab` done (footerAction verified live); `settingsCard` remains.
- **T013** Gallery page and web conformance (contract, states, contrast both modes). **DONE for what is measurable headlessly**: `plugins/acryl-ui-web/tests/contrast.test.mjs` enforces WCAG contrast for every terminal role in both palettes (text 4.5:1 on a plain terminal, 3:1 tinted; dimmed 3:1; border 1.4:1) and for the two web roles the library defines; it found three light colors below 4.5:1 and they were darkened. The web roles that reuse the app's tokens are the app's own. Earlier note: gallery example `client-ui-library` in the extension pack (Components, Settings form, Colors tabs) verified in a real browser; contract tests (7) run headless; contrast in both modes not yet measured.
- **T014** Rebuild `client-ui-components` on the library; real browser and Desktop dev-build check.

## Slice 3 - Terminal layer

- **T015** `acryl-ui-tui` for the Slice 2 contracts plus List/Select; width and keyboard conformance at 12/24/40/80/200. **DONE**: `plugins/acryl-ui-tui` implements all ten contracted components on pi-tui (the contract file now carries `surfaces`); 8 conformance tests check widths 12/24/40/80/200 and keyboard behavior; the CLI profile makes it importable.
- **T016** Terminal gallery command; rebuild `tui-overlay-themed`; real terminal pass. **Partial**: the `/gallery` command exists as pack example `tui-ui-library` (tested headlessly at five widths with the keyboard walk); `tui-overlay-themed` is not rebuilt and no real terminal pass has been done.

## Slice 4 - Composites

- **T017** Board, Table, Form, Empty state, Toast (contracts, both layers, conformance).
- **T018** Migrate the pack's kanban and notes examples onto the library.

## Slice 5 - Pack, verifier, skills, eval

- **T019** Generate per-component docs and the maps from the contracts; sync into the pack; router line.
- **T020** Skills ("build a board", "add a form") and verified examples per surface.
- **T021** `acryl_verify_plugin` lint for library use (FR-012).
- **T022** Opt-in real-model eval: "settings form with a switch and confirm dialog" on Web and CLI; record results.

## Slice 6 - Migration and release

- **T023** Adopt in one built-in surface at a time (Market overlay, then settings tabs, then TUI overlays), each with tests.
- **T024** Publish packages, versioning policy, migration notes.
- **T025 Ledger.** Log every landed task with its full hash; cross-reference specs 033, 034, 037; set `spec.md` status.

## Slice 2b - Rework on DSH's own mechanism (added 2026-09-21 after re-reading the DSH styling document; T-numbers here are in THIS file, spec 038-ui-component-library)

- **T026 Build chain. DONE (2026-09-21).** `plugins/acryl-ui-web` is TSX plus CSS Modules built with tsdown and Lightning CSS. DSH's `clientBundle` preset cannot be called for a non-DSH package (it looks the package up in DSH's own workspace), so `build/css-modules-plugin.ts` is DSH's CSS Modules plugin copied with provenance (same output). **Evidence**: `lib/client.js` requires only react and the app primitives from the loader, class names are hashed (`[hash]_[local]`), and a real browser shows 8 `<style data-plugin="acryl-ui-web" data-plugin-css=...>` tags and no global stylesheet; `tests/built-bundle.spec.ts` checks the same on the built file. Removal with the plugin is the loader's lifecycle and was not separately exercised.
- **T027 Tokens through the theme service. DONE.** `apply(ctx)` calls `ctx.theme.overrideTokens('acryl-ui-web', { '--acryl-accent', '--acryl-reasoning' })` with a light and a dark value each (the service's dynamic-token path); the effect removes them with the plugin. **Evidence**: in a real browser `--acryl-accent` and `--acryl-reasoning` resolve on `body` from the service, and there is no stylesheet declaring them; contrast test passes. Checked in the light scheme only; dark not looked at in a browser.
- **T028 Extract components from DSH source** into `registry/<Name>/` with provenance. **Step 1 DONE**: fields (verbatim), AppearanceCubes (from ui-theme AppearanceRow), SettingsRow and SelectPill (from ui-permission-presets PermissionRow), Tabs (from ui-settings-plugins PluginsSettingsSection), Card surface (from PluginCard); `registry-manifest.yml` records each origin, tests compare `fields.tsx` and the cube stylesheet byte for byte with the pinned DSH files. **Evidence**: in a real browser the Permission pill and Appearance tiles are the app's own (the tile picker is a full-width row; putting it in a row's control column squeezes it). **Step 3 DONE (code and unit tests; not yet checked in a real browser)**: SidebarRow (the New Session bar of ui-sidebar SidebarRoot) and ToolCallCard (the disclosure header, state dot, running sweep, error summary and IN/OUT card of ui-tool ToolRow; specialised cards stay the app's own blocks passed as children); a test asserts every class in the two extracted stylesheets exists in the DSH stylesheet it came from. Still to extract: message blocks. Not yet compared side by side with the built-in General page pixel for pixel.
- **T029 Migrate the existing components. DONE**: the hand-written `client.js` is removed; Field, Segmented, SelectField, SettingsRow, Tabs, Card are adapters or copies over the extracted components; SwitchField and Dialog are compositions of the app's primitives; EmptyState and Stack are the two genuine gaps (DSH has no equivalent) and are marked so in the manifest. `tests/library.spec.tsx` (markup), `tests/built-bundle.spec.ts`, `tests/contrast.spec.ts`: 16 tests.
- **T030 Conformance for the style lifecycle. DONE except removal**: tests assert plugin-owned hashed CSS with no global selectors on the built bundle, and lint every registry stylesheet for hex colors, static tokens (one documented DSH exception in AppearanceCubes) and theme selectors, and the source for global `<style>` creation (M22). Removal with the plugin is not tested.
- **T031 Registry command** `acryl ui add <name>` (after T028 to T030).
- **T032 Pack docs and skill** rewritten from the registry manifests (props from the contract, source provenance shown).
- **T033 Reconcile the terminal layer** with the same registry idea: `acryl-ui-tui` components stay hand-written (pi-tui has no CSS), but each gets a manifest and shares the contract.


## Slice 7 - Registry, packaging and hub (added 2026-09-22; T-numbers here are in THIS file, spec 038-ui-component-library; design in plan.md "Slice 7")

Order matters: T034 and T035 first (cheap, our own stack), then the registry and command, then publish.

- **T034 Move the gallery out of Settings. DONE (2026-09-22).** Checked: no engine or profile composition ever installs `acryl-example-ui-library` by default (`apps/acryl-web`, `apps/acryl-desktop/src/profile.ts`, `runtime/acryl-harness-runtime/src/engine-dsh.ts` don't reference it); every pack example, this one included, is already opt-in per `example-plugins/README.md`. The gap was only that `docs/extending/ui-library.md` never said so explicitly, so a person installing it (as I did, to test) had no signal to remove it afterward. Fixed: the doc now states install/`/reload remove-stale` as a pair, like any other local extension. 54 pack tests pass. Real-profile note: I installed a copy of this example into the user's own `~/.acryl/extensions` and Web profile this session for testing; it is still there and should be removed with `/reload remove-stale` once no longer wanted, same as `acryl-header-note`.
- **T035 Expose the app's primitives.** Inventory the ~48 exports of DSH `ui-primitives`; for each add a contract entry, a re-export or extraction, and a live demo in the gallery. Only ones that pass the T030 lint. Report the count from the built bundle, not from the source. Done when: the gallery lists every exposed name and each one has been clicked in a real browser.
- **T036 Registry format and repo.** Create `github.com/acryldev/acryl-ui-registry` (hub form D6): `registry/<id>/item.yaml` plus `web/` and/or `tui/` source, generated `index.json` (kind `ui-component`, entries list which surfaces exist per id), a validate command reusing the blends ingest shape. Seed with the existing 12 web components (T028) and the 10 tui components (T015); most ids will have only one surface until the other is built. Done when: the repo validates, the index regenerates identically twice, a bad item (hex color, no origin) is rejected, and `acryl ui list` shows, per id, which surfaces it has.
- **T037 Ingest gate as code.** The lint from T030 plus origin, licence, import allow-list, contract and spec presence, as a script the registry runs in CI. Done when: each rule has a failing fixture.
- **T038 `acryl ui add`.** In `acryl-cli`, plus `acryl ui list`, `acryl ui diff`. Reads a registry (git URL or local path), verifies the digest, writes the `--surface web|tui` source (defaulting to the host's own surface) into the plugin, records `ui.lock.json`. Done when: a scaffolded web plugin adds `acryl.ui.card`, builds, and renders in a real browser with no `@acryl/ui` import; the same id added `--surface tui` renders in a real terminal.
- **T039 Scaffold template.** A small tsdown plus CSS Modules plugin template that `acryl ui add` targets (the Lovable-style bounded project: the agent works inside it). Done when: an agent (the opt-in real-model e2e) builds a settings page in it using only added items.
- **T040 shadcn conversion pipeline (spike, then batch).** One component (combobox or table) ported: Tailwind classes compiled to CSS, rewritten to `.module.css` on our tokens, licence recorded, passing T037. Decide Radix (dependency or reuse the app's Menu/Modal behaviour) after checking what DSH already ships. Done when: one ported item is in the registry and its conversion is a repeatable script; then a batch of the missing ones.
- **T041 Rename and publish `@acryl/ui`.** Rename the installed plugin `acryl-ui-web` to `acryl-ui` and its package to `@acryl/ui` (drop `web`; `acryl-ui-tui` folds in as the package's `tui` entry point), across `apps/acryl-web`, `apps/acryl-desktop/src/profile.ts`, `runtime/acryl-harness-runtime/src/engine-dsh.ts`, `pnpm-workspace.yaml`, `scripts/verify-layout.mjs`, the pack's example plugins and docs, and every test that names `acryl-ui-web`/`acryl-ui-tui`. This is a real rename touching working code, not just docs; run in its own commit with `pnpm -r type-check` and both packages' tests green before and after, and a real-browser plus real-terminal check that nothing broke. Then publish the npm package with release notes and a compatibility line against the app version. Done when: a plugin outside this repo installs `@acryl/ui` and `require`s it in a real browser and in a real terminal.
- **T042 Blends module and lock v2.** Write the change as a spec in the `blends` repo (its own methodology; do not edit its uncommitted files), adding `modules` to the lock and `kind: ui-component` to the hub index, then apply it. Done when: a Blueprint containing the library round-trips `/blend snapshot`, `verify`, `apply` on a fresh app.
- **T043 Hub publish.** Publish the registry and the library Blueprint to the hub form (D6). Done when: `blends list` shows them and `acryl ui add` works against the published index.
- **T044 Pack docs and skill** from the registry manifests (this is T032 folded in): props from the contract, provenance shown, the two consumption modes explained.
