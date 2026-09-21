# Research: ACRYL UI library

Facts already measured (2026-09-20, this checkout) and questions still open. Evidence for the measured facts is in the extension pack
(`plugins/acryl-extension-context`): the generated `docs/maps/*`, the examples, and `docs/extending/{ui-*,desktop-app,tui-components}.md`.

## Measured

- **M1 Requirable primitives.** In a real browser session a hand-written client bundle declared `dsh.client.inject:
  ["@deepseek-ai/dsh-client-ui-primitives"]` and `require`d it: 121 value exports (Button, Modal, Input, Switch, Tag, Pill, Tooltip, Toast, Menu,
  MarkdownText, CodeBlock, DiffBlock, TerminalBlock, JsonTree, icons). `require` also resolved `react`, `react-dom`, `...ui-theme`,
  `...ui-slots`, `...client-store`. A bundle using Button/Modal/Input/Switch/Tag rendered themed (example `client-ui-components`).
- **M2 Web theme service.** `ctx.theme` (client): `register({id,colorScheme,tokens})`, `overrideTokens(sourceId,{token:{light,dark}})` (both
  modes mandatory, validated for model-authored callers), `setTheme`, `setFontSize`, `getTheme`, `exportInspectTokens`, `theme/change` event. The
  Desktop presenter applies the same snapshot to the document body. Verified: a plugin changed the accent token, the font and the page
  background in a real browser.
- **M3 Tokens.** 87 `--dsw-alias-*` design tokens with light and dark values (`docs/maps/theme-tokens.md`, generated from
  `ui-theme/src/styles/design-platform.css`), plus font, size, corner and shadow tokens.
- **M4 Terminal has no theme service.** `apps/acryl-cli/src/tui/theme.ts` is a `const` hex table (primary `#4F6BFE`, secondary `#38BDF8`, accent
  `#818CF8`, reasoning `#A855F7`, success `#34D399`, warning `#FBBF24`, error `#F87171`, info `#4F6BFE`, muted `#94A3B8`) adapted to pi-tui in
  `piTheme.ts`; compiled into the CLI. A plugin can add a `tuiCommands` overlay (read once at TUI start) but cannot read or change the palette.
- **M5 pi-tui component set.** Container, VStack, HStack, Box, Text, TruncatedText, Markdown, SelectList, SettingsList, Input, Editor, ScrollView,
  Loader, CancellableLoader, Spacer, Image; utilities truncateToWidth, visibleWidth, wrapTextWithAnsi, matchesKey. A `Component` is
  `{ render(width): string[], handleInput?, invalidate }`. A themed overlay rendered within width at 12, 24, 40, 80 and 200 columns (example
  `tui-overlay-themed`, tested).
- **M6 Slots.** 58 client slots are declared in source (`interface SlotMap`), with kind (single/list/keyed/chain), scope (root/session/
  session-maybe) and owner props (`docs/maps/mount-points.md`). A root-scoped list slot (`sidebar.footer.action`, props `{ wide }`) renders with no
  session and was used to verify a library-built UI live.
- **M7 Desktop.** Electron main process owns window chrome, icon, tray, menu, product name (`apps/acryl-desktop`); the renderer is the same
  client app. Desktop adds frame slots (`desktop.main`, `sidebar`, `conversation`, `details`, `shell.overlay`) in advanced mode.
- **M8 Runtime title rewrite.** The client rewrites `document.title` at runtime from a single-occupant locale string; ACRYL's brand plugin now
  keeps the ACRYL name with an observer (a library-level "brand" component should own this).
- **M9 Agent-authored UI today.** In real-model runs the agent built a kanban (inline styles), a todo overlay (own palette), a teal restyle
  (both-mode tokens, self-hosted font). Correct and live, but each re-invented components; the docs now point at primitives.

## Open questions

- **Q1 Exposure without a build step.** Can a new package register itself as a requirable client module id (`acryl-ui/web`) with no build step
  in a plugin, or must it be a Loader row with a built client bundle (like `dsh-client-ui-brand-acryl`)? Measure how the module table admits
  a package (`dsh.client` declaration, `ClientModuleLoader`), and whether a workspace package under `plugins/` ships to installed builds.
- **Q2 Where `tuiTheme` lives.** `acryl-cli` is adapted from `dsh-tui`; can the theme service be added in `acryl-cli` only, and can the built-in
  overlays read it without a large refactor (every overlay imports `theme.ts` today)? Options: a live `theme` object with getters; a service
  and a `useTheme()` shim; regeneration at boot.
- **Q3 Token mapping.** How the semantic token file maps onto the 87 `--dsw-alias-*` names (a curated subset with the rest derived), and onto
  the nine terminal roles; whether Desktop native accent can follow at build time.
- **Q4 Contract format.** Schemastery objects (repo convention) versus JSON Schema; whether the contract also drives generated docs, the
  gallery and the verifier lint. Where contracts live (one package, data only).
- **Q5 Layout.** New workspace packages `plugins/acryl-ui-tokens`, `acryl-ui-web`, `acryl-ui-tui`, `acryl-ui-contracts`, or one package with
  subpath exports. Release: the pack shipping constraint (public package, `verify-layout` policy) applies.
- **Q6 Fabric RFC.** Relation to `plugins/dsh-community-fabric` (manifest/capability draft): does a component contract fit its capability model.
- **Q7 Migration.** Which built-in ACRYL surfaces (Market overlay, settings tabs, Desktop settings, TUI overlays) adopt the library, and in what
  order, without regressing them (each migration is its own task with its own tests).
- **Q8 Terminal light/dark.** Detecting the terminal background (pi-tui has OSC 11 parsing helpers) so the terminal palette can follow it.
- **Q9 Accessibility.** What minimum the web layer guarantees (roles, focus rings, contrast at both token modes) and how conformance checks it
  headlessly.

## Measured in Slice 0 (2026-09-21)

- **M10 Exposure without a build step (answers Q1).** A package whose `client.js` registers a module id equal to its package name is requirable by any other client
  bundle that lists that name in `dsh.client.inject`, with no build step: probe library `acryl-ui-probe` and consumer `acryl-ui-probe-consumer`, real browser, the consumer
  logged `required acryl-ui-probe: keys=AcrylButton,version` and rendered the library's themed button. One trap measured: the client loader treats every module as a plugin, so a pure
  library that exports only components fails the whole page (`Failed to load plugins ... expect function or object with an "apply" method`). A library must also export an (empty) `apply`.
- **M11 Terminal palette refactor size (answers Q2).** 18 files under `apps/acryl-cli/src` import the static `theme.ts`; 77 references to a role (`theme.primary` and so on); 55 of
  them are module-level captures (`const dim = fg(theme.muted)`) evaluated once at import. A compatibility object with getters is therefore NOT enough (the color freezes at import);
  a lazy per-role function (`fgRole('muted')`, reading the live palette at call time) is, and the 55 sites convert mechanically.
- **M12 Web library primitives suffice for a skeleton.** Card, Field, SwitchField, EmptyState and Stack were built over `Input`, `Switch` and the `--dsw-alias-*` tokens with no new primitive
  and rendered themed in a real browser (both light-mode values checked, dark follows the same variables). Accessibility wiring verified live: label associated with the input, error
  `role=alert` and referenced by `aria-describedby`, `aria-invalid`, card `role=group` labelled by its title.
- **M13 Token mapping candidates (Q3, partial).** Existing tokens cover most roles: primary -> `brand-primary`, text -> `label-primary`, muted -> `label-tertiary`, success ->
  `state-success-primary`, error -> `state-error-primary`, warning -> `state-warn-*`, border -> `border-l4`, surface -> `bg-layer-1`. `reasoning` (terminal violet) and `accent` have no
  web alias yet: they need new tokens or stay terminal-only. Not decided: the curated semantic set and terminal light/dark detection.

## Decisions (Slice 0)

- **Q1 decided:** the library is a normal package with a client bundle (M10). First-party wiring into every surface's composition follows the brand package's route (materialize into the
  profile, add a Loader row) and touches Web, Desktop and packaging: it is its own task (T011b), not folded into the skeleton.
- **Q4 decided:** contracts are plain JSON data (`contracts/components.json`: summary, props with type/required/default, children, a11y notes), not Schemastery or JSON Schema. They feed the
  docs generator, the gallery, the conformance tests and the verifier lint, and the terminal layer reads the same file without importing React. A test asserts the library exports exactly
  the contracted components (an export without a contract is undocumented, a contract without an export is a lie).
- **Q5 decided (first cut):** one package per layer: `plugins/acryl-ui-web` now, `acryl-ui-tui` next; tokens and contracts live inside the web package until the terminal layer needs to share
  them, then move to a data package. Splitting earlier would add packages without a second consumer.
- **Q2 direction:** lazy `fgRole` plus a mechanical conversion of the 55 sites, behind a live palette; the `tuiTheme` service is Slice 1.
- **Q7 order proposed:** Market overlay first (already a client slot user), then settings tabs, then TUI overlays; each its own task with tests.
- **Q9 minimum:** every interactive component names itself (label or `aria-label`), announces errors, and keeps focusable order; checked headlessly by the contract test, then once in a real browser.
- **Still open:** Q3 (final semantic token set, terminal background detection), Q6 (fabric RFC relation).

