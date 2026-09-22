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

## Rework after the DSH styling document (2026-09-21)

Reference: research.md M14 to M22 (this spec). The web layer becomes a **source-owned registry built on DSH's own chain**, not a hand-written bundle:

```text
plugins/acryl-ui-web/
  registry/<Name>/{ <Name>.tsx, <Name>.module.css, <Name>.spec.tsx, manifest.yml }   source of truth per component (copied from DSH source where one exists, with provenance in manifest.yml)
  contracts/{components.json, tokens.json}                                              unchanged: the cross-surface contract and the semantic roles
  build: tsdown + Lightning CSS (the chain dsh-client-ui-brand-acryl already uses)     -> lib/client.js with plugin-owned <style data-plugin=...> and hashed classes
  token registration: ctx.theme.register / overrideTokens (light AND dark) for the roles that have no app token
```

Rules adopted from the doc (M22): components consume only `--dsw-alias-*` and registered `--acryl-*` tokens, no theme selectors, no global stylesheet, inline styles only for runtime layout, a variant is a prop.

**Extraction pipeline.** For each candidate component: (1) locate it in the pinned DSH source (feature package or `ui-primitives`); (2) copy `.tsx` and `.module.css` into `registry/<Name>/` retargeting imports to the primitives the app already exports; (3) record the source path and commit in `manifest.yml`;
(4) add the contract entry and a spec; (5) build. Because feature packages are behind the purity gate (M21) the copy is the only route; the harness submodule stays read-only.

**Candidates in extraction order** (each needs a look at the source first; none is assumed to be copyable as is): the Settings row and select from `ui-settings-general`; the sidebar navigation row from `ui-sidebar`; the tool-call card from `ui-tool`; message blocks from `ui-chat`;
tabs and dock layout from `ui-dockkit`; and the design brief in `acryl-ui-design-system/` for what to build beyond what exists.

**Registry command (later).** `acryl ui add <name>` materializes a registry entry into a plugin's own source so an agent can edit it (the doc's shadcn-style model); not before the build chain and three extracted components are proven.


## Slice 7 - Registry, packaging and hub (added 2026-09-22, spec 038-ui-component-library)

Why: the library is 12 components of our own plus 6 re-exports, while the app's `ui-primitives` holds about 48 and shadcn/ui about 63. A rich library needs a **catalogue that can grow without touching the app**, and a way for an agent to take a component as source (shadcn model) or as a versioned dependency. Reuse first (rule in memory `feedback-reuse-existing-before-building`): the hub form, index generation, ingest validation and CLI already exist in the `blends` repo (`acryl_blends_project/blends`, roadmap decision D6: "a git repo of definition directories plus a generated `index.json`", `packages/blends-cli/src/hub.ts`: `HubIndex`, `HubIndexEntry`, ingest in distribution mode, sha256 digests). The UI registry is that same machinery for a second kind of definition, not a new system.

### Two ways to consume, one source

```text
github.com/acryldev/acryl-ui-registry  (hub form D6)     registry/<id>/{item.yaml, web/<Name>.tsx+.module.css, tui/<Name>.ts, <Name>.spec.tsx}   +  index.json (generated)
        |                                                                    ^
        | built and published from                                          | acryl ui add <id> [--surface web|tui]   copies the SOURCE into a plugin (no dependency; the plugin owns and may edit it)
        v                                                                    |
@acryl/ui  (one versioned npm package, both surfaces)  <---------  plugin `require('@acryl/ui')`   (runtime dependency; build-less plugins; the loader picks the web or tui export by host)
```

Decided 2026-09-22: one package, one registry, `web` folded in. `acryl-ui-web` (the plugin id) and `acryl-ui-tui` are renamed to `@acryl/ui` (npm package) / `acryl-ui` (installed plugin id), each item carries both a `web` and/or `tui` implementation under the same id, and an agent picks the surface it needs from one catalogue instead of two package names. `ui-web`/`ui-tui` naming stays only inside the source tree (`registry/<id>/web/`, `registry/<id>/tui/`) as an implementation detail, never in the public name.

- **Copy source** (`acryl ui add <id> [--surface web|tui]`): for scaffolded, built (web) or plain-JS (tui) plugins. Reads `index.json`, verifies the item's sha256, writes the files for the requested surface into the plugin, records `{id, version, digest, surface}` in the plugin's `ui.lock.json` so a later `acryl ui diff` can show local edits against the registry version. `acryl ui list` shows both surfaces per id so an agent sees the whole range before choosing.
- **Dependency** (`@acryl/ui`): for plugins written as plain `client.js` (web) or the CLI host (tui) with no build step. Same items, prebuilt; the package exports `client.js` (web, DSH client loader) and a `tui` entry (pi-tui components) side by side, so `require('@acryl/ui')` on Web/Desktop and `require('@acryl/ui/tui')` in the CLI draw from the same catalogue. Registry item ids stay dot-namespaced lowercase per D6 (`acryl.ui.card`).

### Registry item (one directory, generated index)

`item.yaml`: `id` (`acryl.ui.<name>`), `version` (semver, per D6), `surfaces` (`web`, `tui`), `requires` (other item ids; the app primitives it composes), `tokens` (the `--dsw-alias-*` and `--acryl-*` names it reads), `origin` (provenance: `extracted` from the pinned DSH path and commit, `ported` from shadcn with its licence, or `original`), `contract` (the props block from `contracts/components.json`), `a11y`. `index.json` is generated, never hand-edited: `{formatVersion, items: [{id, kind: 'ui-component', version, path, digest, surfaces, requires}]}`, the same shape as `HubIndexEntry` with a new `kind`.

### Ingest gate (distribution mode, as D4 does for `!!js`)

An item is rejected unless: it has `origin` and a licence; its stylesheet passes the lint already written for T030 (no hex colors, no static tokens, no theme selectors, no global selectors); its imports are only `react`, `clsx` and the app primitives; it has a contract entry and a spec; it builds. This is where the shadcn conversion pipeline plugs in: a ported item enters only if it already passes.

### Blends connection (what is decided and what is not)

Nothing in spec 036-cordis-ecosystem-and-acryl-blends blocks this. What I called "the Blends decision" is narrow: **lock v2 (`modules`)** is an additive change to `blends-core`, the `blends` repo's own format, and that repo currently has uncommitted files that are not from this work (`.gitignore`, `.ignore`, `scripts/`), so the change must land there through its own methodology (`docs/workmethodology`, a `specs/00N` folder) and not be edited over someone else's work-in-progress. The plan:

1. UI items reach a Blend as **modules**: a Blueprint that uses the library lists `@acryl/ui-web@<version>` (registry origin) or vendored copied items (local origin, digest-verified) exactly as spec 036 `blend-instance-design.md` section 2 already defines. No new module kind is needed for either.
2. The registry repo reuses the hub form (D6) and ingest (D16 to D19) with `kind: ui-component`. Adding a `kind` to the index is additive; it is proposed in the `blends` repo's own spec.
3. The UI library itself is published as one **Blueprint-visible module**, so `acryl init --blend <id>` gets the library without a special path.

### Repo

The registry lives at `github.com/acryldev/acryl-ui-registry` (hub form D6: definition directories plus generated `index.json`), separate from this product repo, matching how `acryl_blends_project/blends` is its own repo with its own methodology.

### Slice 7 exit

`acryl ui add acryl.ui.card` in a scaffold produces a plugin that builds and renders the component with no dependency on `@acryl/ui`; `acryl ui add acryl.ui.card --surface tui` does the same for a terminal plugin from the same catalogue entry; `@acryl/ui` installs from the registry into a plugin outside this repo on either surface; the registry repo validates and regenerates its index in CI; and a Blueprint containing the library round-trips through `/blend snapshot`, `verify` and `apply` on a fresh app.
