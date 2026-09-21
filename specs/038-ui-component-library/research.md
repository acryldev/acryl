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

## Decisions approved 2026-09-21 (Q3, Q6 in this file)

**Q3 - semantic tokens.** Components and the terminal layer name only these roles; one compile file is the only place that knows the `--dsw-alias-*` names, so an upstream rename touches one file.

| Role | Web token | Terminal (dark) |
| --- | --- | --- |
| text, textMuted, textDimmed | `label-primary`, `label-tertiary`, `label-dimmed` | terminal default, `#94A3B8`, dim |
| surface, surfaceRaised, border | `bg-layer-1`, `bg-layer-2`, `border-l4` | none (the terminal owns its background), none, dim rule |
| primary | `brand-primary` | `#4F6BFE` |
| success, warning, error | `state-success-primary`, `state-warn-*`, `state-error-primary` | `#34D399`, `#FBBF24`, `#F87171` |
| info | `button-info-fill` | `#4F6BFE` |
| accent, reasoning | new `--acryl-accent`, `--acryl-reasoning`, registered through `ctx.theme.register` (never overriding `--dsw-*`) | `#818CF8`, `#A855F7` |

Terminal light/dark: `auto` (default) asks the terminal for its background (OSC 11, 100 ms timeout), falls back to `COLORFGBG`, then to dark; `acryl.terminal.theme: auto | dark | light` overrides. A light
palette is a second hex table for the same nine roles. Desktop native accent stays out of scope (build time).

**Q6 - Fabric RFC.** Fabric is draft and documentation only (no schema release, runtime or conformance suite), so do not depend on it. A component contract is a UI vocabulary, not a plugin capability, so it
stays independent. Keep two alignment points so adoption later is a mapping, not a rewrite: the extension manifest's `permissions` words and `apiVersion` correspond to Fabric's requested capabilities,
and provenance origin corresponds to its provenance record (RFC 0004); and if Fabric ships, expose the library as a versioned capability (`ui.components@1`) without changing the contract file. Revisit when
Fabric has a schema release; until then record the mapping here, nothing more.

**Measured while building the web layer.** The app defines its `--dsw-alias-*` tokens on `body`, not `:root`, so the role variables must be declared on `body` too (declared on `:root` they resolved to nothing and borders vanished). Only a real
browser showed it. Dark mode is signalled by `color-scheme`, so CSS `light-dark()` works for the two new roles. Synthetic `.click()` does not open the app's `Menu` (it listens for pointer events); a real click does.

## Measured while building the terminal layer (2026-09-21)

- **Q8 (terminal background detection) answered:** pi-tui already implements what is needed (`queryTerminalColorScheme` with a timeout, `onTerminalColorSchemeChange` and DEC mode 2031 notifications). ACRYL only wires them to the palette
  (`apps/acryl-cli/src/tui/themeDetection.ts`): ask once at startup, follow changes, never when the user pinned `ACRYL_TUI_THEME`. Tested with a fake terminal; not tried in a real terminal.
- **Contrast:** three light-palette colors were below 4.5:1 on a plain white terminal (`secondary` 4.1, `success` 3.8, `textDimmed` 2.6) and a border was under 1.4:1 on a tinted background; all four were adjusted in `tokens.json`. The dark palette is unchanged.
- **Keys:** arrows must go to the focused control first and switch tabs only when unhandled, so `Tab` and `Shift+Tab` are the always-available tab keys (a `Segmented` inside a tab would otherwise trap the arrows).

## Findings from the DSH styling document (added 2026-09-21; the document was supplied at the start of this spec and was not used properly until now)

Source: `docs/ui-design-styling-sytem/dsh-ui-styling-system-libs-styling-ui-tech-stack.md` (sections cited as "doc section N"). Numbering M14 to M22 continues M1 to M13 above and belongs to THIS file
(038-ui-component-library/research.md).

- **M14 The pipeline (doc sections 1 to 3, 33 to 35).** A component is `Foo.tsx` plus `Foo.module.css`, composed with `clsx`. DSH's own tsdown/Rolldown build (`packages/client/tsdown.client.ts`) intercepts `*.module.css`, runs
  Lightning CSS with CSS Modules (`[hash]_[local]`, minified) and emits the compiled CSS and the class map into the bundle. There is no Tailwind and no Vite CSS step for plugins. TypeScript needs only a tiny `*.module.css` declaration.
- **M15 CSS has plugin identity and lifecycle (sections 15 to 18).** The compiled CSS is mounted as a plugin-owned `<style data-plugin="<package>" data-plugin-css="<package>/<file>">` by the client module system and removed
  with the plugin (HMR, disable, unload). Global sheets belong to `ui-theme` only; "do not casually create another application-wide stylesheet" (section 39).
- **M16 Two token levels (section 7).** Static tokens (`--dsw-static-*`) and semantic aliases (`--dsw-alias-*`). Feature components consume only aliases; light and dark are provided by `ui-theme` outside the component (sections 8, 9): no
  `.dark`/`.light` classes and no theme selectors in components.
- **M17 The theme is a runtime service (sections 10 to 12).** `ThemeRuntime` (`ctx.theme`) registers themes and `overrideTokens()`; every override MUST define light and dark; `ui-layout`'s presenter projects the state onto the DOM. New tokens
  are therefore registered through the service, not declared in a stylesheet.
- **M18 One canonical primitive channel (sections 29, 30, 32).** `ui-primitives` is the shared component source and is static-linked into the baseline client; a variant becomes a prop on the primitive, not a second copy in a feature.
  The bundle purity gate rejects undeclared cross-plugin value imports, so a plugin cannot import another plugin's components: shared visuals go through `ui-theme` and `ui-primitives` only.
- **M19 Components are thin (sections 19, 20, 36, 37).** Behavior and structure in TSX, appearance in the module CSS, inline styles only for real runtime layout values (position, width, columns), never as a second theme engine.
- **M20 The doc's own recommendation (section 41, and 42).** A shadcn-style source-owned registry fits DSH better than a component-library dependency, provided it materializes DSH-native source (`Foo.tsx`, `Foo.module.css`, `Foo.spec.tsx`, a
  manifest) that uses `--dsw-alias-*` and the DSH compiler: `registry -> local source -> agent can inspect and evolve it -> DSH-style compiler -> plugin-owned capability`.
- **M21 Why the app's private screens cannot be imported (sections 29, 32).** Feature packages (settings, sidebar, chat) are separate plugins behind the purity gate and export a store or `apply`, not components. Extraction therefore means copying
  source, not importing it.
- **M22 What the doc says agents must do (section 39).** Co-locate `Foo.tsx` and `Foo.module.css`; colors only from `var(--dsw-alias-*)`; no hex, no static tokens in features; no theme selectors; inline styles only for runtime dimensions; global
  CSS only in `ui-theme`; a genuinely shared primitive goes to `ui-primitives`, not three copies.

### Where the current web layer departs from the doc (plugins/acryl-ui-web, built before this reading)

1. **Styles are a JS string injected into one global `<style id="acryl-ui-web-styles">`,** not CSS Modules compiled by the DSH chain: no hashed class names (collisions are possible), no `data-plugin` ownership, and the style
   is not removed with the plugin (M14, M15).
2. **The semantic roles are CSS variables declared on `body` from a stylesheet** (`--acryl-*`), and `accent`/`reasoning` use `light-dark()` there. The doc's contract is to register new tokens through `ctx.theme` with light and dark values
   (M16, M17). The Q3 decision in this file said "registered through the theme service"; the implementation did not do that.
3. **Components were written from scratch or read off screenshots** (SettingsRow, Segmented, Tabs) instead of being extracted from DSH source as the registry model describes (M20, M21).
4. **No source-owned layout:** one hand-written `client.js` instead of `Foo.tsx` + `Foo.module.css` + `Foo.spec` per component (M19, M22).
What is consistent with the doc: components reuse `ui-primitives` (Button, Menu, Modal, Switch, Tag) instead of duplicating them (M18), colors come from `--dsw-alias-*` through the roles, and the library is a client bundle a plugin
declares in `dsh.client.inject` (the module system's own mechanism).

### Consequence

The web layer needs a rebuild on DSH's own mechanism, not more hand-written components. Decisions and tasks are in plan.md (section "Rework after the DSH styling document") and tasks.md (Slice 2b, T026 to T033), all of this spec.

