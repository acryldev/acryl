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
