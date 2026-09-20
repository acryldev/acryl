# Plan: ACRYL UI library

Priority order follows spec 037's lesson: prove the smallest end-to-end slice on the surface that is cheapest to verify, then widen. Web and
Desktop share one layer, so they go first; the terminal needs its theme service before components can be themed.

## Architecture

```text
tokens.json --compile--> web theme (ctx.theme.register / overrideTokens)   -> Web + Desktop renderer
              \--------> terminal palette (tuiTheme)                        -> CLI
              \--------> Desktop build-time accents (optional)              -> Electron chrome

contracts/*.ts  (props, events, states, a11y, surfaces)
      |-- generates --> pack docs, gallery, conformance cases, verifier lint
      |-- implemented by --> acryl-ui-web (React over dsh-client-ui-primitives)
      \-- implemented by --> acryl-ui-tui (pi-tui components over tuiTheme)
```

Packages (proposed, Q5): `acryl-ui-tokens` (data + compiler), `acryl-ui-contracts` (data), `acryl-ui-web`, `acryl-ui-tui`, and the gallery
inside the desktop and CLI apps. All are workspace packages under `plugins/`, PNPM isolated, following `verify-layout` policy.

## Slices

**Slice 0: research gates (Q1 to Q9).** Answer each with measured evidence in `research.md`. Exit: the layout, exposure mechanism and theme
service placement are decided.

**Slice 1: tokens and terminal theme service.** Token source and compilers; `tuiTheme` service in `acryl-cli`; built-in overlays read it; a
plugin restyles the terminal live. Exit: one token change restyles web and terminal; existing CLI tests green.

**Slice 2: web layer (walking skeleton).** Contracts for Button, TextField, Switch, Tag, Dialog, Card, Tabs; `acryl-ui-web` over primitives;
requirable module; slot helpers; gallery page; conformance (contract, states, contrast). Exit: the `client-ui-components` example rebuilt on the
library and a hand-written bundle uses it in a real browser (Web) and Desktop dev build.

**Slice 3: terminal layer.** `acryl-ui-tui` for the same contracts plus List/Select, Board, Table; width and keyboard conformance; terminal
gallery command. Exit: the `tui-overlay-themed` example rebuilt; a real terminal session shows it.

**Slice 4: composites and the kanban seed.** Board, Table, Form, Empty state, Toast on both layers; migrate the pack's kanban and notes examples.

**Slice 5: pack, verifier, skills.** Generated docs per component and surface, verified examples, skills, router line, `acryl_verify_plugin` lint
(FR-012), eval task "build a settings form" run with the opt-in real-model e2e on Web and CLI.

**Slice 6: migration and release.** Adopt in built-in surfaces one at a time (Q7); publish the packages; document versioning; close out.

## Risks

- **Upstream drift.** `dsh-client-ui-primitives` changes with the pinned harness. Mitigation: the web layer is a thin adapter with conformance
  tests that fail when a primitive's props change.
- **Terminal refactor size.** Every CLI overlay imports the static palette. Mitigation: a compatibility `theme` object backed by the service,
  migrated overlay by overlay.
- **Contract bloat.** Ten components done well beat forty half done. Tier 1 only until the skeleton is proven.
- **Fake parity.** Marking a component unsupported on a surface is a valid outcome; the gallery shows the gap.
- **Agent misuse.** Docs teach the library first, the verifier warns on hand-rolled colors, and the example set stays small and verified.

## Verification approach

Headless first (contracts, width, keyboard, contrast, snapshots); then one real browser pass (Web, Desktop dev build) and one real terminal
pass per slice, as in spec 037; then the opt-in real-model run. Real GUI confirmation is a separate explicit task, never part of the gate.
