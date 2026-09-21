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
- **T028 Extract components from DSH source** into `registry/<Name>/` with provenance. **Step 1 DONE**: fields (verbatim), AppearanceCubes (from ui-theme AppearanceRow), SettingsRow and SelectPill (from ui-permission-presets PermissionRow), Tabs (from ui-settings-plugins PluginsSettingsSection), Card surface (from PluginCard); `registry-manifest.yml` records each origin, tests compare `fields.tsx` and the cube stylesheet byte for byte with the pinned DSH files. **Evidence**: in a real browser the Permission pill and Appearance tiles are the app's own (the tile picker is a full-width row; putting it in a row's control column squeezes it). Still to extract: sidebar row, tool-call card (step 3), message blocks. Not yet compared side by side with the built-in General page pixel for pixel.
- **T029 Migrate the existing components. DONE**: the hand-written `client.js` is removed; Field, Segmented, SelectField, SettingsRow, Tabs, Card are adapters or copies over the extracted components; SwitchField and Dialog are compositions of the app's primitives; EmptyState and Stack are the two genuine gaps (DSH has no equivalent) and are marked so in the manifest. `tests/library.spec.tsx` (markup), `tests/built-bundle.spec.ts`, `tests/contrast.spec.ts`: 16 tests.
- **T030 Conformance for the style lifecycle. DONE except removal**: tests assert plugin-owned hashed CSS with no global selectors on the built bundle, and lint every registry stylesheet for hex colors, static tokens (one documented DSH exception in AppearanceCubes) and theme selectors, and the source for global `<style>` creation (M22). Removal with the plugin is not tested.
- **T031 Registry command** `acryl ui add <name>` (after T028 to T030).
- **T032 Pack docs and skill** rewritten from the registry manifests (props from the contract, source provenance shown).
- **T033 Reconcile the terminal layer** with the same registry idea: `acryl-ui-tui` components stay hand-written (pi-tui has no CSS), but each gets a manifest and shares the contract.

