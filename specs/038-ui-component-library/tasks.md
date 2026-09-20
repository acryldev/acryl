# Tasks: ACRYL UI library

Ordered. Each task lands as its own commit with its evidence; a task that cannot show its evidence is not done. Work directly on `main`; record
each landed task in `docs/DEVELOPMENT-LOG.md` in a separate documentation commit. Never stage with `git add .` or `-A`.

## Status (2026-09-20)

Not started. Facts M1 to M9 in `research.md` are measured; Q1 to Q9 are open.

## Slice 0 - Research gates

- **T001 Exposure mechanism (Q1).** Measure how a package becomes a requirable client module without a plugin build step, and whether a
  workspace package ships in installed builds. **Evidence**: a browser run `require`-ing a probe package; notes in `research.md`.
- **T002 Terminal theme placement (Q2).** Prototype `tuiTheme` in `acryl-cli`; convert one overlay; measure the diff size for all overlays.
  **Evidence**: prototype branch result and test.
- **T003 Token mapping (Q3, Q8).** Curated semantic set to `--dsw-alias-*` and terminal roles; terminal background detection.
  **Evidence**: mapping table, one restyle demo on web and terminal.
- **T004 Contract format and layout (Q4, Q5, Q6).** Decide schema format, package layout, fabric RFC relation. **Evidence**: ADR in `plan.md`.
- **T005 Migration order and a11y minimum (Q7, Q9).** **Evidence**: written list and the headless check design.

## Slice 1 - Tokens and terminal theme

- **T006** Token source file and compilers (web theme, terminal palette) with a stale-output gate.
- **T007** `tuiTheme` service, provided before rows mount, persisted preference, `overrideTokens`, change event; tests.
- **T008** Built-in CLI overlays read the service (migrate `theme.ts` to a live object); no visual regression (snapshot tests).
- **T009** Document the terminal theme API in the extension pack (`extending/tui-components.md`, mount-points map, skill).

## Slice 2 - Web layer

- **T010** Contracts: Button, TextField, Switch, Tag, Dialog, Card, Tabs (data package).
- **T011** `acryl-ui-web` over primitives; requirable module; declared in `dsh.client.inject`.
- **T012** Slot helpers (`headerAction`, `sidebarTab`, `footerAction`, `settingsCard`).
- **T013** Gallery page and web conformance (contract, states, contrast both modes).
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
