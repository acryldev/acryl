# ACRYL UI library: one component vocabulary for Web, Desktop and the terminal

**Tracking:** to be filed (`acryldev/acryl` issue) when this moves to `ready-for-agent`

**Feature Directory**: `specs/038-ui-component-library`
**Created**: 2026-09-20
**Status**: proposed (specification and research only; nothing is implemented by this spec)
**Authority**: `.specify/memory/constitution.md` (I everything is a plugin, III compose DSH do not fork it, V generated capabilities
live outside the kernel), `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md` (surfaces render one runtime),
`specs/037-guardrailed-self-extension` (the agent authoring loop this library serves),
`specs/034-plugins-on-every-surface`, `specs/033-acryl-blends-runtime-contract`
**Input**: user direction 2026-09-20: "since we become a framework ... add spec into specs about creating a library of UI/TUI components
for all 3 surfaces". Context: spec 037 made ACRYL able to write its own extensions; agent-authored UI is only as good as the components it
can reach, and today those differ per surface.

## Problem

ACRYL renders one runtime on three surfaces, but its UI has no common vocabulary:

- **Web and Desktop** share one React client app. It already ships a themed component package
  (`@deepseek-ai/dsh-client-ui-primitives`: Button, Modal, Input, Switch, Tag, Pill, Tooltip, Toast, Menu, MarkdownText, CodeBlock, DiffBlock,
  ~75 icons). Measured 2026-09-20 in a real browser: a hand-written plugin bundle CAN `require` it and the components render themed. But it is a
  DSH-internal package (upstream, read-only submodule, `--dsw-*` tokens and CSS modules), has no ACRYL contract, no versioning promise to
  plugin authors, no kanban/board/list/tabs/form/table/empty-state patterns, and no documented props beyond the source.
- **CLI** renders with pi-tui (Container, Text, SelectList, Editor, Markdown, ...). The palette is a compiled TypeScript constant
  (`apps/acryl-cli/src/tui/theme.ts`); a plugin cannot read or change it, no theme service exists in the terminal, and there is no ACRYL
  component layer above pi-tui (no tabs, table, form, board, status badge, toast).
- **No shared design tokens.** Web has `--dsw-alias-*` CSS variables with a runtime theme service (`ctx.theme.overrideTokens`); the terminal
  has a private hex table; Desktop native chrome (icon, title bar, menu) is in the Electron main process. A rebrand touches three unrelated
  places (`docs/maps` in the extension pack describes each).
- **Agent-authored UI drifts.** Measured in spec 037 runs: the agent built a kanban board and a todo overlay with inline styles and its own
  colors. They work, but do not match the app, ignore token overrides, and are not accessible by construction. Every plugin re-invents the same
  list, form and card.

As ACRYL becomes a framework that others (people and agents) build on, the missing piece is a supported UI library with one vocabulary
across surfaces, a shared token source, and a stable contract that plugin authors and the extension pack can teach.

## Objective

Provide `acryl-ui`: a family of packages that gives plugin authors on every surface the same component vocabulary, driven by one token
source, with a versioned public contract, documented examples the agent can copy, and conformance tests that prove each component works on
each surface it claims.

**Definition of done for the feature**: an agent (or person) can build "a board with cards, a form, a list with actions and a confirm dialog" once
as a description of components and get a correct, themed implementation on Web, Desktop and the CLI, with the same tokens, and changing one token
source restyles all three.

## Design principles

1. **Compose, do not fork (constitution III).** Wrap and extend `dsh-client-ui-primitives` and pi-tui; never patch the harness. Anything the
   harness lacks becomes a CORE EXTENSION PROPOSAL.
2. **Everything is a plugin (I).** The library is delivered as plugins/packages mounted through Loader rows, not as kernel code.
3. **One vocabulary, per-surface implementations.** A component has a *contract* (name, props schema, events, states) shared by all
   surfaces and one *implementation* per surface (`web` React for Web+Desktop, `tui` pi-tui). The contract, not the pixels, is shared.
4. **One token source.** Semantic tokens (surface, text, accent, border, success/warning/error/info, radius, spacing, font roles) are defined
   once and compiled to CSS variables (Web/Desktop) and a terminal palette (TUI). Desktop native chrome reads the same source at build time.
5. **Runtime-themable everywhere.** The terminal gains a theme service so a plugin can restyle it as the web `theme` service does.
6. **Authorable without a build step.** A plugin uses the library from a hand-written `client.js` (via `require`) or a plain Node module (TUI);
   the pack teaches it (spec 037 docs and examples).
7. **Honest capability, no fake parity.** A component that has no sensible terminal form says so (`surfaces` field); the library never pretends.
8. **Accessible and width-safe by construction.** Web: roles, focus, contrast in both modes. TUI: never wider than the viewport, wide characters.

## Scope

In scope: token source and compilers; component contracts; the web implementation layer over `dsh-client-ui-primitives`; the TUI implementation
layer over pi-tui; the terminal theme service; a component gallery and conformance tests for each surface; pack documentation, examples and skills
for the library; a migration of the extension pack examples (kanban, todo, notes) onto it.

Out of scope: forking or editing `deepseek-harness/`; replacing pi-tui or React; native (Electron main) component libraries beyond token
consumption; a visual design overhaul of the existing app; a public npm release process (a follow-up).

## Component catalog (v1)

Tier 1 (needed by agent-authored extensions today), each with a contract and implementations per surface:

| Component | Web / Desktop | Terminal | Notes |
| --- | --- | --- | --- |
| Button, IconButton | primitives `Button` | `Button` (focusable label) | variants primary, ghost, outline |
| TextField, TextArea | primitives `Input` | pi-tui `Input` / `Editor` | validation state, hint |
| Switch, Checkbox | primitives `Switch` | `Toggle` row | |
| Select / List | menu + list | pi-tui `SelectList` | keyboard navigation contract |
| Tabs | new | `TabBar` | |
| Card, Panel, Section | new | `Box` with header rule | |
| Badge/Tag, StatusDot | primitives `Tag`, `StateDot` | colored label | tones |
| Dialog / Confirm | primitives `Modal`, `RiskConfirmation` | overlay | Escape closes |
| Toast / Notice | primitives `Toast` | status line message | |
| Empty state, Loading | new | `Loader` | |
| Board (columns of cards) | new | `Board` (columns navigable by keys) | the kanban seed |
| Table / Grid | new | `Table` (width-aware) | |
| Markdown, Code, Diff | primitives | pi-tui `Markdown`, code | |
| Form (fields + submit) | composed | composed | schema-driven from a props schema |

Tier 2: tree, menu, tooltip, progress, stepper, split view, command palette.

Each catalog entry lists which surfaces it supports; a terminal-only or web-only component is allowed when marked.

## Functional requirements

- **FR-001 Token source.** One JSON token file (semantic names, light and dark values, terminal 24-bit values, radius/spacing scales) is the
  only place a token value is written. A compiler emits (a) the `--dsw-alias-*` overrides as a `ctx.theme.register` theme and (b) the terminal
  palette. CI fails if generated outputs are stale.
- **FR-002 Terminal theme service.** A host service `tuiTheme` (in `acryl-cli`, provided before rows mount) exposes `get()`, `register(theme)`,
  `overrideTokens(sourceId, tokens)` with the web service's shape, and an event on change. Built-in overlays read it; a plugin can restyle them.
  Persisted preference lives in the shared user settings.
- **FR-003 Contracts.** Each component has a schema (Schemastery, per repo convention) for props, the events it emits, its states, its
  accessibility notes, and the surfaces it supports. Contracts are the source of the generated docs and of the gallery.
- **FR-004 Web implementation.** Components built on `dsh-client-ui-primitives`, exposed as one requirable module id
  (`acryl-ui/web`) that hand-written bundles can `require` (as measured for primitives), with the dependency declared in `dsh.client.inject`.
- **FR-005 TUI implementation.** Components built on pi-tui exposed as a normal package (`acryl-ui/tui`), themed by `tuiTheme`, width-safe,
  keyboard-complete (arrows, Enter, Escape, Tab).
- **FR-006 Slot helpers.** Helpers that fill the common mount points correctly (`headerAction`, `sidebarTab`, `footerAction`, `settingsCard`,
  `tuiOverlay`) so an author supplies a component and a name, not slot plumbing.
- **FR-007 Gallery and conformance.** A gallery app (Web and Desktop) and a terminal gallery command render every component in every state and
  both color modes. Headless conformance tests: contract validation, width safety at 12/24/40/80/200 columns, focus and Escape handling,
  contrast check for the token pairs, and a snapshot per state.
- **FR-008 Pack integration.** The extension pack gains generated docs from the contracts, verified examples per component and per surface,
  and skills ("build a board", "add a form") that use the library; the router mentions it. The existing kanban and notes examples migrate.
- **FR-009 Versioning.** The public contract carries a semver; breaking changes require a major version and a migration note; the pack records
  which library version its examples were verified against.
- **FR-010 Desktop.** Desktop consumes the web layer unchanged. Native chrome reads the token source at build time (title bar, tray, menu
  accent) where the platform allows; anything it cannot follow is documented.
- **FR-011 Agent safety.** The library exposes no way to run arbitrary HTML/script from props; content is text or components; links open
  through the host. Untrusted text is escaped by default.
- **FR-012 Authoring path.** `acryl_verify_plugin` (spec 037) gains checks for library use: declared `dsh.client.inject`, no hand-rolled
  colors when a token exists (warning), terminal render width checks when a plugin registers a `tuiCommands` overlay.

## Non-functional requirements

- **NFR-001 No fork.** No change inside `deepseek-harness/`.
- **NFR-002 Bundle discipline.** The web layer adds at most one requirable module and no new runtime dependency beyond React and primitives.
- **NFR-003 Terminal cost.** A frame renders in under 16 ms for the tier-1 components at 200 columns.
- **NFR-004 Determinism.** Conformance tests need no network and no model.
- **NFR-005 English first.** Docs are English; other languages later (same note as spec 037).

## Acceptance

- The same "quick board" description renders as a working board on Web, Desktop (advanced and compatibility modes) and the CLI; changing one
  token in the token file restyles all three after regeneration.
- `ctx.theme.overrideTokens` (web) and `tuiTheme.overrideTokens` (terminal) both restyle library components in a real run.
- A real-model run (the opt-in e2e from spec 037) asked for "a settings form with a switch and a confirm dialog" produces a plugin that uses
  library components on both a web session and a CLI session, verified, installed and live.
- Conformance suite green on every claimed component and surface; gallery screenshots reviewed by the owner.
- The pack's docs, examples and skills for the library exist, are indexed, and pass the pack gate.

## Open questions

See `research.md` (Q1 through Q7): how the web layer is exposed to plugins without a build step, whether `tuiTheme` can live in `acryl-cli`
without touching upstream `dsh-tui`, how the token source maps onto the existing `--dsw-alias-*` names, the contract schema format, the
package and repository layout, the relation to the DSH community fabric RFC, and migration of built-in ACRYL surfaces.
