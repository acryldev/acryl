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

- **T006** Token source file and compilers (web theme, terminal palette) with a stale-output gate.
- **T007** `tuiTheme` service, provided before rows mount, persisted preference, `overrideTokens`, change event; tests.
- **T008** Built-in CLI overlays read the service (migrate `theme.ts` to a live object); no visual regression (snapshot tests).
- **T009** Document the terminal theme API in the extension pack (`extending/tui-components.md`, mount-points map, skill).

## Slice 2 - Web layer

- **T010** Contracts: Button, TextField, Switch, Tag, Dialog, Card, Tabs (data package). **Done for the web layer**: Stack, Card, Field, SwitchField, SettingsRow, SelectField (over the app's Menu), Segmented, Tabs, Dialog (over the app's Modal), EmptyState are contracted in `plugins/acryl-ui-web/contracts/components.json`; Button, Tag, Pill, Toast, Modal, Tooltip are re-exported from the app's primitives (reuse over rewrite).
- **T011** `acryl-ui-web` over primitives; requirable module; declared in `dsh.client.inject`. **Partial**: package built, contract-tested (4 tests) and verified in a real browser (Card, Field, SwitchField, EmptyState, footerAction; error announced). **T011b DONE**: `acryl-ui-web` is a workspace package (pnpm-workspace, verify-layout, root test/check scripts, desktop package spec) and a Loader row on the web engine (`engine-dsh.ts`) and in the Desktop profile (`profile.ts`); a consumer plugin gets it with no install (checked live: the profile materialized it by itself). Not wired into the CLI (no browser client).
- **T012** Slot helpers (`headerAction`, `sidebarTab`, `footerAction`, `settingsCard`). **Partial**: `footerAction`, `headerAction`, `sidebarTab` done (footerAction verified live); `settingsCard` remains.
- **T013** Gallery page and web conformance (contract, states, contrast both modes). **Partial**: gallery example `client-ui-library` in the extension pack (Components, Settings form, Colors tabs) verified in a real browser; contract tests (7) run headless; contrast in both modes not yet measured.
- **T014** Rebuild `client-ui-components` on the library; real browser and Desktop dev-build check.

## Slice 3 - Terminal layer

- **T015** `acryl-ui-tui` for the Slice 2 contracts plus List/Select; width and keyboard conformance at 12/24/40/80/200.
- **T016** Terminal gallery command; rebuild `tui-overlay-themed`; real terminal pass.

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
