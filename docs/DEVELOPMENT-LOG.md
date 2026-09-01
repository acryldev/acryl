## 2026-09-01 - target-specific npm CLI runtime distribution

Commit: `dc5e978fa384efe52e8b669a8b6a91a1fad86c0d`

Defined a versioned CLI target and receipt contract for the five supported npm
OS/CPU targets. The public `acryl` package is now assembled as a selector-only
package with exact optional target dependencies. Each `acryl-cli-<target>`
package carries the prepared native TUI runtime, target receipt, and OS/CPU
constraints. The selector validates installed package metadata and receipts
before launching, with reinstall guidance for unsupported, missing, or mismatched
runtimes. Artifact inspection now validates receipt metadata.

## 2026-09-01 - separate the web surface from the lightweight CLI

Commit: `42fe0bf`

Split the web server out of the terminal CLI so `acryl` is lightweight and ships only
`acryl-harness-runtime` (not the browser client). `acryl-tui/src/cli/run.ts` is now TUI-only
(removed the static `bootAcrylWebProfile` import + `serveWeb`; `acryl web`/`acryl gui` throw a
clear surface-separation error pointing to the separate distributions).
`scripts/publish-npm-cli.mjs` dropped `@deepseek-ai/dsh-web-app` from the `SHARED_CLI_PACKAGES`
closure, so the npm `acryl` package no longer pulls the web host/client/api bundle (the >200MB
source). Added a new `acryl-web` workspace package as the 3rd-surface browser distribution: it
boots `bootAcrylWebProfile` and serves, bundles `acryl-harness-runtime` + `acryl-control`
(self-contained bin), and declares the audited web closure (22 `dsh-*` deps incl `dsh-web-app`).
Root typecheck + all 262 `acryl-tui` tests pass.

## 2026-09-01 - correct the TUI surface vs DSH launcher distinction

Commit: `1428d40`

Per-file verification corrected the surface model. DSH `apps/cli` is only the `dsh` launcher
(841 lines: bin/args/profile-boot/plugin/dump-config/shutdown; no TUI; DSH's GUI is the web
surface). ACRYL's CLI is a distinct, full-featured pi-tui TUI coding agent adapted from
`tomowang/dsh-tui` (`@tomowang/dsh-tui` 0.7.0 @ `f7663341`, `@earendil-works/pi-tui` 0.84.2),
driving the runtime in-process via `startDirectHost()` + `createAcrylSessionBridge()` (not RPC).
Updates: the provenance doc's feature overlays (`/model /presets /trajectory /tools /context
/plugins /goal /plan /compact` + approvals) are verified present, no longer deferred; the ideas
register notes "thin consumer" is exact for web/desktop RPC renderers but not the in-process
TUI; the Cordis cheatsheet adds a three-surface-kinds section. DSH `apps/cli` is explicitly NOT
the model for ACRYL's CLI.

## 2026-09-01 - source-validated Cordis usage cheatsheet

Commit: `18a1000`

Added `docs/cordis/cordis-usage-cheatsheet.md`, a condensed operational reference that
validates `docs/cordis/` + `docs/cordisplugins/` against the vendored
`@deepseek-ai/cordis` 4.0.1 source. Covers the Cordis kernel (Context / Services+inject /
Events / Fiber / Effects / Loader), the plugin contract (`name` / `inject` / `Config` /
`apply` + bundle→profile→patch chain), the AGENTS.md Harness Tool rule
(`ctx.tools.register(defineTool(...))`), and seven doc-vs-source corrections that matter for
implementation (sync StandardSchema `Config`; `timer`/`hmr`/`loader` are not core; `root` is
experimental; `parallel` mislabels its dispatch mode; `FiberState` enum order; real API docs at
docs/cordis-api/*; fork version 4.0.1). Produced via a three-scout fleet study plus direct
source validation.

## 2026-09-01 - land the first real ACRYL model-facing Tool (T008 gate)

Commit: `9c5f489`

Implemented `acryl_workspace_status` as a genuine Cordis plugin in
`acryl-harness-runtime/src/plugin-acryl-workspace-status.ts`: it injects `ctx.tools`, registers
via `ctx.tools.register(defineTool(...))`, declares a canonical typed `output.schema` plus a
separate `render()` for model-facing text, honours `exec.signal`, and disposes with its owning
Fiber. It is auto-mounted on both the TUI and web boot paths (guarded on `ctx.tools` presence),
so it is present in every real ACRYL profile. Adds a spec that boots the profile, asserts
auto-mount on the native `ctx.tools` seam, executes, and renders canonical typed output, plus a
plugin-entry (`name`/`inject`/`apply`) assertion. All 17 `acryl-harness-runtime` tests pass;
typecheck and build are clean. This closes the ACRYL hard gate (one real model-facing Tool as a
Cordis plugin) identified by the alignment audit.

## 2026-09-01 - register coding-agent ideas and ACRYL rebase plan

Commit: `f328459`

Registered the verified best-idea extraction across the coding-agent codebases (pi.dev,
CodeWhale, OpenClaude, DeepSeek Harness) and the Cordis reference metaframework in
`docs/acryl/IDEAS-TO-TAKE-FOR-ACRYL.md`, treating each pre-existing analysis doc as a
hypothesis and verifying it against source (corrections recorded: OpenClaude guardrails are
not removed and its `sessionTranscript` is a stub; pi.dev is directionally accurate;
CodeWhale adds a monotonic fail-closed authorization pipeline and a KV-cache pinned-prefix
discipline as load-bearing ideas). Laid out a new Spec Kit ledger `specs/026-acryl-rework/`
(spec.md / research.md / plan.md / tasks.md) that plans removing the parallel-framework debt
in ACRYL-owned packages (hand-rolled session projection, custom agent/provider registry,
Cordis-internals architecture inspector, duplicate desktop terminal and web server) by
re-basing the control plane onto the native `@deepseek-ai/dsh-*` / Cordis seams, and proves
the plugin path with one real model-facing Tool as the hard gate. Follow-on differentiators
(authorization pipeline, room identity, relay/handoff, capability package, agent-agnostic
canvas) are intentionally recorded as subsequent ledgers.

## 2026-08-31 - shared coding capability composition implementation plan

Commit: `8b6a955`

Added the implementation plan for authorization parity across TUI, Web, and Desktop. It sequences shared Loader-patch extraction, Desktop/Web composition, a secret-free authorization Host/Client adapter, three-surface parity gates, and release-relevant verification without embedding the TUI in Electron or introducing a generic capability runtime.

## 2026-08-31 - shared coding capability composition design

Commit: `ad6a510`

Defined the product rule that all applicable user-facing coding capabilities are composed once and exposed through TUI, Web, and Desktop adapters. The design makes `acryl-harness-runtime` the narrow shared Loader-patch boundary, preserves Desktop's owned Web server and native concerns, and starts the migration with authorization parity rather than a generic capability framework.

## 2026-08-31 - release 0.1.18 prepared

Commit: `c3b1192`

Bumped the root, TUI, Harness runtime, Control, and Desktop workspace packages together from `0.1.17` to `0.1.18`. The synchronized version is ready for the required non-publishing Release matrix; a `v0.1.18` tag must not be created until that matrix completes successfully.

## 2026-08-31 - version-independent npm closure verification

Commit: `c6e76db`

Made the focused packed-CLI closure test discover the produced tarball rather than assuming version `0.1.17`, so the same release guard survives every package bump. The test passes against the current shared TUI and Web-host closure.

## 2026-09-01 - v0.1.19 separate Web distribution

Commit: `ae47b14`

Released `acryl-web` as a public npm distribution for the local browser surface, distinct from the lightweight terminal CLI and Desktop installers. The package bundles ACRYL-owned runtime code, declares the pinned DSH Web runtime, and ships the `acryl-web` command. Its release gate packs the package, installs it into an empty temporary project with pnpm, boots `acryl-web --json`, and verifies the local readiness URL. Tagged releases now verify the version across the root, CLI, Web, Desktop, Control, and Harness Runtime packages, publish `acryl-web` and `acryl` to npm, then publish Desktop and CLI artifacts through the GitHub Release.

Commit: `ed9c80d`

Updated the workspace and package-script release contracts so the public Web surface is included in repository validation.

Commit: `fbea6f5`

Made npm publication wait for both the Desktop and CLI artifact matrices, so a failed Desktop build cannot leave a separately published Web or CLI package without its matching release.

## 2026-09-01 - Desktop Web profile dependency closure restored

Commit: `709728d`

Fixed Recovery startup for the Desktop `web` profile. Its Loader dynamically mounts every dependency declared by the pinned `@deepseek-ai/dsh-web-app` bundle, but the Desktop package resolver deliberately only exposes direct `acryl-desktop` dependencies or profile-local packages. The package had omitted 30 Web bundle dependencies, so production-style resolution failed despite root-workspace hoisting masking the issue. `acryl-desktop` now declares the exact pinned bundle dependency set and a regression test compares the two manifests. The full `build:canvas -> build -> verify:loader` preflight passes.

## 2026-09-01 - Desktop Web-profile loader regression coverage

Commit: `b4a8d55`

The Desktop Loader smoke now creates and boots the shipped `web` profile rather than only the default Desktop profile. This covers the exact runtime surface that previously reached Recovery with aggregate Loader errors. The current rebuilt Web-profile smoke passes; diagnostics from the failed local run identified missing Web UI package resolution in an incomplete earlier local dependency state. No Loader composition or dependency workaround was added.

## 2026-08-31 - reproducible shared CLI closure verification

Commit: `c3f0aff`

Added a focused publish-closure test that packs the npm CLI and verifies the manifest retains the shared Web bundle while excluding Canvas, Market, and PNPM roots. The product contract now accurately states that Desktop shares the upstream Web profile bundle but replaces the ordinary Web server Loader row with `acryl-desktop/webserver`; it does not reuse the CLI host implementation verbatim. Committed smoke evidence records the exact clean-install commands, 23-package candidate manifest, and successful `--version`, TUI JSON, and Web JSON output. The compatible `cordis-plugin-group@1.0.1` is now explicitly selected, eliminating the peer warnings observed on the first candidate install.

## 2026-08-31 - minimal shared TUI and Web npm closure

Commit: `75b1dea`

The npm publish assembler no longer copies every package from the deployed workspace closure. It now selects the audited shared TUI plus existing Web-host package list: publish-bundle external imports, the dynamic base/Web profile bundles, ACRYL terminal rows, and required Loader plugins. A clean packed-tarball global install exposed and added the one profile-resolution anchor (`@deepseek-ai/dsh`). The installed candidate passed `acryl --version`, `acryl tui --json`, and `acryl web --json`. No new Web server, runtime daemon, capability framework, or Desktop packaging work was introduced.

## 2026-08-31 - shared Web host restored to base npm CLI

Commit: `61f1e70`

Restored the existing shared Web host as the required `acryl web` command. This reverses the preceding terminal-only product interpretation: the base npm CLI is now the focused TUI plus shared Web-host product, while Electron/Desktop remains its separate shell. The existing grammar, dispatch, shared `bootAcrylWebProfile` export, and runtime path are restored unchanged. Focused CLI tests and TUI/runtime TypeScript checks pass.

## 2026-08-31 - base npm CLI no longer boots Web

Commit: `e2768b2`

Removed the `web` command from base ACRYL CLI grammar, help, dispatch, dependencies, and tests. `acryl web` now fails as an unknown command rather than importing or starting a Web runtime. The unused Web profile boot export and its command-line dependency were removed from `acryl-harness-runtime`; the separately distributed Desktop product is unaffected. Focused CLI tests and TUI/runtime TypeScript checks pass.

## 2026-08-31 - npm CLI scope correction

Commit: `daaaad0`

The runtime/distribution milestone was reduced to one concrete user outcome: a lean terminal-only npm CLI. The exploratory package-count, byte, time-budget, and generic measurement framework commits are intentionally removed from the active product surface. The remaining work is a TUI profile/import audit, removal of base `acryl web`, an explicit minimal publish manifest, and one clean packed-tarball global-install smoke. Desktop optimization, CI expansion, runtime/server architecture, capability metadata, and installer UX are deferred.

## 2026-08-31 - npm distribution budget gate

Commit: `4bb0773`

Added executable terminal-package budgets against the reproducible v0.1.17 clean-install baseline: candidates must reduce both canonical realpath-deduplicated installed package count and regular-file bytes by 20%, while install wall time may rise by no more than 10%. Tests prove compliant evidence is accepted and all over-budget dimensions are reported together. CI wiring remains the next P1 item; no terminal closure or publish-manifest change has started.

## 2026-08-31 - clean npm install evidence harness

Commit: `a171777`

Added the release measurement foundation for the real global npm product. The harness installs an already-packed candidate into a fresh temporary prefix, npm cache, and HOME; discovers the installed global root through isolated `npm root --global`; measures regular-file bytes and files; runs the installed `acryl --version` and `acryl tui --json`; and counts realpath-deduplicated package roots under `acryl/node_modules` while ignoring `.bin` and `.pnpm`. A fixture proves symlink aliases cannot inflate the canonical package metric. The fresh published v0.1.17 baseline is 557 canonical packages, 244,467,079 regular-file bytes, 32,260 files, and a 24.124-second isolated global install on Darwin ARM64 with Node 24.19.0/npm 11.17.0.

## 2026-08-31 - Desktop target-native payload pruning

Commits: `ac413a5`, `5e061be`

Electron Builder's `afterPack` hook now removes target-qualified native paths for another operating system or CPU before the existing runtime verifier and signing stages. Thin macOS/Linux/Windows builds retain only their target; universal macOS retains both Darwin CPU trees while removing Linux and Windows trees. Focused Desktop and shared-pruner tests cover target selection, universal behavior, and unsupported Electron Builder target combinations; Desktop typecheck passes.

## 2026-08-31 - Desktop-owned release map exclusion

Commit: `2806c26`

Electron Builder now excludes ACRYL Desktop's own `lib/**/*.map` files from packaged applications while preserving maps in local development output. The package contract test fails if the exclusion is removed. Dependency-map pruning and package-specific runtime allowlists remain separate work because broad dependency deletion is unsafe until the artifact manifest has an explicit allowlist.

## 2026-08-31 - Desktop Electron locale pruning

Commit: `8d2e470`

Desktop release configuration now asks Electron Builder to ship only the English and Simplified Chinese locale resources declared by the application. The package contract test was written first and failed until `electronLanguages` was set. This removes unused Chromium locale payload without changing ACRYL's supported application localizations.

## 2026-08-31 - CLI release source-map removal

Commit: `7a99b84`

Portable CLI archive assembly now removes `.map` files after the production dependency graph is materialized and target-native pruning has completed. The release pruner is intentionally narrow: runtime JavaScript, assets, and license files remain untouched. Focused tests prove map removal and required-file retention. Declarations, tests, docs, and source pruning remain explicitly deferred until an allowlist can prove that dynamic module resolution and required notices are retained.

## 2026-08-31 - target-specific CLI native payload pruning

Commit: `a56b498`

Portable CLI assembly now flattens its production closure and removes native paths that are qualified for another operating-system/CPU target. The pruner preserves generic JavaScript plus the selected target's `node-pty`, ripgrep, Sharp/libvips, Koffi, and other prebuild paths. Focused tests cover retained target files and foreign OS/architecture rejection. On a fresh Darwin ARM64 deployed closure, the pre-archive pruning removed 136,468 KiB of foreign native payload (450,728 KiB → 314,260 KiB). Archive smoke and payload manifests remain the next gate before release publication.

## 2026-08-31 - runtime distribution milestone safety gate

Commit: `0999312`

Created the first executable guard for the approved runtime/distribution milestone. `scripts/inspect-artifact.mjs` validates a release artifact inventory against explicit required paths, forbidden release files, target-native allowlists, and byte budgets. Its Node tests prove it rejects missing runtime files, source maps/test paths, foreign native binaries, and budget overflow. This is intentionally a safety foundation only: no package payload has been pruned yet, so it cannot regress the v0.1.17 authorization-enabled TUI or Desktop release behavior.

## 2026-08-31 - release 0.1.17 (authorization rewire + interactive prompt)

Bumped the workspace 0.1.16 → 0.1.17 and cut the release, keeping npm and
GitHub in lockstep (the standing invariant: tag ⇔ 5 packages ⇔ npm ⇔ GitHub
release). All 10 build jobs (5 CLI + 5 desktop) succeeded; `acryl` published to
npm at 0.1.17 and the `v0.1.17` GitHub release created with 14 assets. Ships
`/login` on `ctx.authorization` plus the interactive prompt
(manual-code/secret/select).

## 2026-08-31 - TUI paste fixed: bracketed paste in form fields + right-click paste

Two paste paths were broken in the terminal client.

1. **Bracketed paste (Cmd+V) into single-line form fields** (API key, base
   URL, model id, `/trajectory` filter, question answer). The terminal wraps
   pastes in `\x1b[200~ ... \x1b[201~`, but `miniTextFieldInput` only handled
   raw printable keys — its leading `ESC` failed the printable check, so the
   paste was silently dropped. It now unwraps bracketed paste and inserts it
   atomically (collapsing line breaks for the single-line field).

2. **Right-click / middle-click paste.** `pi-tui` enables mouse reporting (the
   TUI owns scroll/selection), which turns a secondary click into an SGR mouse
   event instead of a native paste — and its `onRightClickPaste` hook was gated
   behind `process.platform === 'win32'`. A `pnpm` patch removes that gate, and
   `TuiApp` wires `onRightClickPaste` to read the system clipboard
   (`pbpaste`/`xclip`/`Get-Clipboard`) and inject it as a bracketed-paste
   sequence, so it routes through the same path as Cmd+V.

### Change (`71482d4`)

- `miniTextField.ts`: unwrap and insert bracketed paste.
- `clipboard.ts` (new): cross-platform system-clipboard read.
- `TuiApp.ts`: `onRightClickPaste` wiring.
- `patches/@earendil-works__pi-tui@0.84.2.patch`: remove the win32 gate.
- `pnpm-workspace.yaml` / `verify-layout.mjs` / lockfile: record the patch.
- `tests/tui/miniTextField.spec.ts`: bracketed-paste unit tests.

## 2026-08-31 - interactive authorization prompt (manual-code/secret/select)

Completes the `/login` flow's prompt handling so a running authorization can
collect real input instead of settling on the browser callback. The
`interaction.prompt()` now renders inline in the `LoginOverlay`: `select` shows
a cursor list, `text`/`secret` a masked single-line field (reusing the shared
`miniTextField` primitive, same as `QuestionOverlay`). Enter submits through a
new `answerAuthorizationPrompt` action that resolves the pending promise; the
flow's own signal still withdraws the prompt when the browser loopback wins the
race.

### Change (`6781b14`)

- `login/types.ts`: `LoginPromptState` (`text`/`secret`/`select`) + `prompt` on
  the overlay state.
- `LoginOverlay.ts`: `renderPrompt` + `handlePromptInput` (miniTextField for
  text, `•` mask for secret).
- `session.ts`: `pendingPromptResolve` closure + `answerAuthorizationPrompt`.
- `store.ts`: `openLogin` initializes `prompt: undefined`.

## 2026-08-31 - /login rewire: ctx.authorization seam (real pi-ai OAuth)

`/login` now renders the sign-in flows `dsh-llm-pi-ai` registers through the
`ctx.authorization` seam, instead of a hand-rolled loopback+PKCE flow. Selecting
a provider runs pi-ai's own OAuth strategies (Anthropic, OpenAI Codex, GitHub
Copilot, xAI, OpenRouter, Kimi) and persists the grant under
`llm-pi-ai/<providerId>`.

### Key finding

`dsh-llm-pi-ai` (the pi-ai-backed multi-provider adapter) already implements
the full OAuth path: it registers one authorization flow per catalog provider
that ships a login, runs pi-ai's strategies via `models.login()`, and persists
grants through its credential store under `llm-pi-ai/<providerId>`. The only
missing piece was composing `dsh-authorization` in the profile, so
`llm-pi-ai`'s `ctx.inject(['authorization'])` resolves and its flows register.

### Change (`a3c5585`)

- `harness-runtime`: insert `@deepseek-ai/dsh-authorization` into the profile.
- `login/types.ts` + `LoginOverlay`: sign-in flow list + `enter` to begin.
- `store`: `login` overlay kind + `openLogin`/`updateLogin`.
- `session`: `loadAuthorizationFlows` + `beginAuthorization` with a
  notify/prompt interaction (notify opens the browser; prompt settles on the
  flow's own signal).

## 2026-08-31 - reconcile 0.1.16 (npm had run ahead of GitHub)

The 0.1.16 manual publish bumped only the root + `acryl-tui` (the other three
workspace packages stayed at 0.1.15) and never tagged, so npm sat ahead of the
GitHub release. Completed the bump across all five packages and tagged
`v0.1.16`, which rebuilt the GitHub release with matching binaries.

## 2026-08-31 - OAuth login (Stage 2): PKCE + loopback + grant persistence

`specs/024-acryl-cli-login` Stage 2. Adds the generic OAuth2
authorization-code flow riding the credentials record seam. No new Cordis
plugin: the grant storage is the existing `ctx.credentials` capability
(`GrantRecord` via `modifyRecord`/`readRecord`/`deleteRecord`), and the browser
dance is TUI-surface logic. The `/model` provider list marks OAuth-capable
providers (`[oauth]`/`[oauth ✓]`); pressing `o` runs the flow, and `/logout`
revokes the grant.

### Key finding

`credentials-local` already implements the record half of the seam
(`readRecord`/`modifyRecord`/`deleteRecord`), so OAuth grants need no new
service — only the flow. `modifyRecord` is a serialized read-modify-write, which
makes refresh-token rotation safe across processes.

### Change (`aa44f23`)

- `oauth/metadata.ts`: `OAuthProviderMetadata`, `grantKey`, provider table.
- `oauth/flow.ts`: PKCE (S256), one-shot `127.0.0.1:0` loopback listener,
  code + refresh exchange, read/refresh/revoke over `ctx.credentials`.
- `modelProfile`: `o` keybinding + row status; `session`: `loginWithOAuth`,
  `logout` revokes grants, `loadProviders` reads grant status.
- `tests/tui/oauth/flow.spec.ts`: stub-provider integration test (L013).

## 2026-08-31 - dshmarket: scoped to desktop only (CLI drops it, warning gone)

The `npm i -g acryl` ERESOLVE warning came from `dshmarket@1.17.1` leaking
into the CLI's publish closure via `acryl-harness-runtime`. An initial fix
(`c5fdd2f`) over-removed it from both `acryl-harness-runtime` AND
`acryl-desktop`, which red-shifted the v0.1.15 release: `verify-layout.mjs`
(its hardcoded `pnpm-workspace.yaml` snapshot) and the `dshmarket-compat` /
`package` / `profile` desktop tests all failed, because `dshmarket` is a
first-class desktop concept (`desktop-market.ts`, `profile.ts`, `pnpm.ts`
use the patched `runExternalMarketPluginInstall`).

### Key finding

`dshmarket` is NOT dead. It is the desktop's market package identity, and the
`patches/dshmarket@1.17.1.patch` adds the `runExternalMarketPluginInstall`
boundary used by `acryl-desktop/src/pnpm.ts`. It belongs in `acryl-desktop`
only, never in `acryl-harness-runtime` (the CLI's dependency path).

### Change

- `7b536e8` / `06a6075`: revert the over-broad removal + snapshot sync.
- `d5d3634`: scope `dshmarket` to `acryl-desktop` only. Result: CLI publish
  manifest drops `dshmarket` (536 deps, `dshmarket in deps: false`), desktop
  keeps it via its own direct dep (795 tests green). Release v0.1.15 rebuilt
  green: 5 CLI archives + 5 desktop installers + checksums published to the
  GitHub release.

## 2026-08-31 - /login + /logout provider auth (Stage 1: API key)

`specs/024-acryl-cli-login` (two-stage plan; OAuth is Stage 2). Stage 1 adds
`/login` + `/logout` slash commands and wires the model-profile persistence,
which was previously stubbed.

### Key finding

`/model`'s `saveProvider`/`deleteProvider`/`editProvider` actions were empty
stubs in `session.ts` — the overlay rendered but never persisted. The write
path is the DSH `CredentialProvider` (`set`/`unset` for API-key env refs;
`modifyRecord`/`deleteRecord` for OAuth grants) plus `settings.update`.

### Change (`c972eb3`)

- `commands.ts`: `/login` + `/logout` in `SLASH_COMMANDS` + dispatch.
- `actions.ts`: `login()` + `logout()` on `TuiActions`.
- `auth-guidance.ts` (new): guidance strings, modeled on Pi.
- `session.ts`: implement `editProvider`/`saveProvider`/`deleteProvider`
  (`credentials.set/unset` + `settings.update`) and `login()`/`logout()`.
- Reuse `ModelProfileOverlay` as the auth surface (no separate `LoginOverlay`).

### Verification

257 tests + typecheck + build green; `acryl tui --json` boot smoke passes.

## 2026-08-31 - removed dead `dshmarket` dependency (root cause of ERESOLVE warning)

The `npm i -g acryl` ERESOLVE warning traced to `dshmarket@1.17.1` (upstream
DeepSeek Harness visual plugin market). Investigation showed it is a **dead
dependency**:

- Declared as a direct dep of `acryl-harness-runtime` and `acryl-desktop`
  (added speculatively in `41af5c8`'s "declare all ~200 DSH packages"
  approach), but never mounted by any profile — `DEFAULT_PROFILE_BUNDLES`
  is `['@deepseek-ai/dsh-base']` (+ `dsh-web-app` for the web profile).
- Never referenced by any owned source, preset, or include tree.
- Superseded by the ACRYL-owned `dsh-community-market` ("Community plugin
  discovery and managed package operations"), which does not depend on it.

Its narrow peer range (`@deepseek-ai/dsh-settings@^0.1.0-rc.7`) conflicted
with the shipped `0.1.1-rc.2`, causing the warning.

### Change (`c5fdd2f`)

- Removed `dshmarket@1.17.1` from `acryl-harness-runtime` + `acryl-desktop`
  `dependencies`.
- Removed `dshmarket@1.17.1` from `patchedDependencies` (`pnpm-workspace.yaml`).
- Deleted `patches/dshmarket@1.17.1.patch`.

### Verification

- `pnpm why dshmarket` → empty; `grep -c dshmarket pnpm-lock.yaml` → 0.
- `acryl-harness-runtime` tests: 11/11 pass (host profile boots).
- `acryl-tui` tests: 255/255 pass.
- `acryl web --json` → exit 0, `http://127.0.0.1:3080` (web profile boots).

## 2026-08-31 - npm 0.1.14 published: self-contained CLI, full boot verified

Resolution of the 0.1.13 broken-boot defect. The publish script now builds the
self-contained bundle and the release is green end to end.

### Change

- **`scripts/publish-npm-cli.mjs`** (`dc447f7`): build with
  `tsdown -c tsdown.publish.config.ts` (emits bundled `lib-publish/`) and copy
  `lib-publish/` instead of `lib/`. The publish config's `noExternal` inlines
  `acryl-control` / `acryl-harness-runtime`, so the shipped `bin.js` is
  self-contained and no longer carries bare workspace imports.
- **Bump** (`7b29179`): five workspace packages `0.1.13` → `0.1.14` (0.1.13 is
  already published and cannot be overwritten).
- Tag `v0.1.14` → release run `33347151982` all green (build x5, cli x5,
  `Publish to npm`, `Publish GitHub release`).

### Verification (external-user, fresh prefix, no host workspace)

| Check | Result |
|---|---|
| `npm view acryl version` | `0.1.14` (`dist-tags.latest` = `0.1.14`) |
| `npm i -g acryl` (isolated) | ✅ installs |
| `acryl --version` | ✅ `0.1.14` (was ERR_MODULE_NOT_FOUND on 0.1.13) |
| `acryl --help` | ✅ prints usage |
| `acryl tui --json` | ✅ exit 0 → `{"mode":"direct","profile":"acryl","generationId":"…"}` |

The published npm CLI now boots end to end; the entrypoint and the plugin tree
both work from a clean `npm install -g acryl`.

## 2026-08-30 - npm 0.1.13 published, but external-user boot is BROKEN (new pipeline bug)

The `NPM_TOKEN` secret was rotated by the human (GitHub web), and the
`npm-publish` job now succeeds: `npm view acryl version` → `0.1.13`,
`dist-tags.latest` → `0.1.13`. The version invariant is closed. **However**, an
isolated external-user smoke test (`npm i -g acryl` into a fresh prefix) found
the published CLI crashes at startup — the same "published but broken" class
this project has hit repeatedly (0.1.8 / 0.1.10 / 0.1.12).

### Verified failure (fresh prefix, no host workspace)

```text
$ acryl --version
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'acryl-harness-runtime'
  imported from .../lib/node_modules/acryl/lib/bin.js
```

The published `lib/bin.js` still carries a bare
`import { bootAcrylHarnessProfile, ... } from "acryl-harness-runtime"`, but
`acryl-harness-runtime` is absent from the published dependency map (it is a
`workspace:*` dep of `acryl-tui`, excluded from npm by design).

### Root cause (definitive)

A dedicated publish build already exists and documents this exact failure:
`acryl-tui/tsdown.publish.config.ts` bundles the internal workspace packages
via `noExternal: ['acryl-control', 'acryl-harness-runtime']` and emits to
`lib-publish/`. Its header states the default `tsdown.config.ts` "leaves
node_modules dependencies external ... an external `npm install -g acryl`
cannot resolve `acryl-harness-runtime`, so the CLI fails at startup with
ERR_MODULE_NOT_FOUND."

But `scripts/publish-npm-cli.mjs` step 0 runs
`pnpm --filter acryl-tui run build` (the DEFAULT config → `lib/`) and step 1
copies `lib/` into the publish package. It never invokes
`tsdown.publish.config.ts` and never reads `lib-publish/`. So the publish
config fix was authored but never wired into the release path.

### Recommended fix

1. Wire `publish-npm-cli.mjs` to build with `tsdown.publish.config.ts`
   (e.g. `pnpm --filter acryl-tui exec tsdown -c tsdown.publish.config.ts`)
   and copy `lib-publish/` instead of `lib/`.
2. Bump workspace packages to `0.1.14` (0.1.13 is already published and cannot
   be overwritten), tag `v0.1.14`, re-release.
3. Re-run the isolated external-user smoke (`--version` and `tui --json` boot)
   before declaring the release complete.

## 2026-08-30 - npm 0.1.13 publish blocked: token-permission root cause verified

Follow-up to the v0.1.13 release. The GitHub Release and all 10 binaries are
live (run `33322431850`, 11/12 jobs green), but the `npm-publish` job failed,
leaving npm `acryl` at 0.1.12. This entry records the verified diagnosis; the
fix is a human-approved token rotation (see Blocker).

### Verified state

- `gh run view 33322431850` → 11 jobs success (build matrix x5, cli matrix x5,
  `Publish GitHub release`); only `Publish to npm` failed.
- `npm view acryl version` → `0.1.12` (0.1.13 not published); `maintainers` =
  `musichen`, `webboxescom`, `acryldev`.
- Job log (exact): `npm error 404 Not Found - PUT https://registry.npmjs.org/acryl`
  → "could not be found or you do not have permission to access it."
- `scripts/publish-npm-cli.mjs` assembled the package correctly (0.1.13, 54
  files, 464 KB) and failed only at the actual `npm publish`. Auth plumbing and
  closure derivation are sound; this is a token-permission failure, not a
  script or build defect.

### Token probe (correction to the prior handoff)

Probed both local tokens with `npm whoami` / `npm token list` /
`npm access list packages` (token values never echoed):

- `~/.npmrc` (`npm_…7eVf`) → **401** on `whoami` — dead/stale, does not
  authenticate. The prior handoff said it "authenticates"; it does not.
- `~/.secure-storage/npm/npm.json` → `npm_webboxes` (`npm_9LMU…rSyH`) →
  `whoami` = `webboxescom` (authenticates), but `npm access list packages` →
  **403** and the publish → **404**. It is scope-limited without write access to
  `acryl`, even though `webboxescom` is a listed maintainer.

### Root cause

`NPM_TOKEN` (GitHub secret, last set 2026-08-30 19:19:22Z, immediately before
the failed run) holds a scope-limited token. The token that published 0.1.12
earlier the same day (13:26Z) was rotated out and not replaced with one
carrying write access to `acryl`.

### Blocker (human approval gate)

npm auth is a documented human-controlled release boundary
(`docs/npm-test-external-user.md`). A fresh token with read+write publish
access to `acryl` is required from any maintainer (`musichen` / `webboxescom` /
`acryldev`). Options: a granular token scoped read+write on `acryl` (npm web),
`npm token create` (classic full-access), or the exact token that published
0.1.12. Then `gh secret set NPM_TOKEN`, `gh run rerun 33322431850 --failed`,
`npm view acryl version` → `0.1.13`.

## 2026-08-30 - version reconciled to 0.1.12; release auto-syncs npm and the GitHub release

Follow-up version-reconciliation pass. The prior npm publish used the
`ACRYL_NPM_VERSION` override to ship `0.1.12`, while the workspace packages and
the GitHub release tag stayed at `0.1.10` — a silent drift between the release
and the npm package.

### Change

- **Bump:** the five core workspace packages (`package.json`,
  `acryl-control`, `acryl-desktop`, `acryl-harness-runtime`, `acryl-tui`) now
  all read `0.1.12`, matching the published npm package. (`b06bca5`)
- **CI auto-sync (`f3103a4`):** `.github/workflows/release.yml` gains an
  `npm-publish` job (runs on `v*` tags, `needs: [cli]`) that builds the CLI and
  runs `scripts/publish-npm-cli.mjs` with `NPM_TOKEN`. Both the `npm-publish`
  job and the `release` job now verify that `GITHUB_REF_NAME` (the tag,
  without the leading `v`) equals the `acryl-tui` package version, and **fail
  loudly** on any mismatch. So the GitHub Release, the workspace package
  version, and the npm package version can never diverge again — the tag is the
  single source of truth, and the workspace must (and is checked to) match it
  before either a Release or an npm publish is created.
- **Publish guard (`f3103a4`):** `publish-npm-cli.mjs` now refuses to publish a
  version that differs from the workspace package version. An
  `ACRYL_NPM_VERSION` override that diverges throws instead of silently shipping
  a drifted package — closing the exact mechanism that caused the 0.1.10↔0.1.12
  drift.

### Resulting invariant

```text
git tag v<X>  ⇔  all five workspace package.json = <X>  ⇔  npm acryl = <X>
```

A tag cannot produce a GitHub Release or an npm publish at any other version.

Primary sources: `.github/workflows/release.yml`, `scripts/publish-npm-cli.mjs`,
the five workspace `package.json`.

## 2026-08-30 - external npm CLI: full-boot verified and closure-completeness gated

Follow-up to the npm publish-path fix. An external-user simulation on macOS
(fresh `npm install -g acryl`, isolated HOME, no host workspace) proved the
**published package could not actually boot**, even though the prior entries
claimed it "installs and runs":

| Check | Result |
|---|---|
| `npm install -g acryl` | ✅ installs (0.1.12, 464 pkgs) |
| `acryl --version` | ✅ prints `0.1.12` (entrypoint fix works) |
| `acryl --help` | ❌ `unknown option: --help` |
| `acryl tui --json` | ❌ ~45s then `plugin tree failed to load: failed to apply loader entry include (cordis:include): loader entries failed to apply` |
| `acryl web --json` | ❌ same crash ~33s |

The "installs and runs" claim rested only on `--version` (a pure print) — the
actual CLI/TUI/Web surfaces never booted from the npm package.

### Root cause (definitive, via loader instrumentation)

The Cordis Loader applies the DSH profile-bundle include via
`cordis-plugin-loader`, resolving each loader entry by package name. On the
published package three entries are absent and two cannot load their native
addon:

1. `@deepseek-ai/cordis-plugin-timer` — not in the shipped dep map
2. `@deepseek-ai/cordis-plugin-hmr` — not in the shipped dep map
3. `@deepseek-ai/dsh-typert-loader` — not in the shipped dep map
4. `@deepseek-ai/dsh-subprocess-local` — koffi native module not resolvable
5. `@deepseek-ai/dsh-sandbox-local` — koffi native module not resolvable

The dependency map was hand-curated from `acryl-tui`'s own `dependencies`, which
does not list the DSH profile-bundle plugin packages. The workspace's pnpm
resolution (hoisted, with all DSH plugins and the `@koromix/koffi-*` natives) is
NOT reproduced by npm, which installs only the declared map. The prior fix
stripped `workspace:*` deps and bundled `acryl-harness-runtime`, but left the
runtime plugin closure incomplete — so `--version` printed but the plugin tree
could not be assembled.

### Fix (commit `3d12e82`)

- **`scripts/publish-npm-cli.mjs`** now derives the publish manifest's dependency
  map from the real production closure via
  `pnpm --filter acryl-tui deploy --prod --legacy` — the same closure the proven
  portable CLI archive uses — excluding internal workspace packages
  (`acryl-control`, `acryl-harness-runtime`, `acryl-development-canvas`,
  `dsh-community-market`) and os/cpu-scoped native addons (transitive, so npm
  selects the correct platform build). This puts the missing loader entries into
  the published `dependencies`.
- **Gates the assembly**: refuses to assemble/publish any package missing a
  required Cordis loader entry (`cordis-plugin-timer`, `-hmr`, `dsh-typert-loader`,
  `dsh-subprocess-local`, `dsh-sandbox-local`), so this regression cannot recur.
- **`--pack-only <outdir>`**: emit a tarball so an external-install gate can
  consume it.
- **Fixed the broken build/copy path**: the script referenced a missing
  `tsdown.publish.config.ts` and `lib-publish/` output dir (neither was
  committed — the prior entry's documented fix was not present in the repo). It
  now runs the standard `pnpm run build` and copies the real `lib/` output.
- **`acryl-tui/tsdown.publish.config.ts`** (created, was absent): bundles the
  internal workspace packages `acryl-control` **and** `acryl-harness-runtime`
  into `lib-publish/bin.js` so the shipped CLI is self-contained and does not
  need them as npm deps.
- **`acryl-tui/src/cli/grammar.ts` + `run.ts`**: support `--help`/`-h` and print
  usage (the `--help` gap found by the external-user probe).

### Verification

- `corepack pnpm --filter acryl-tui run typecheck` → passes.
- The workspace-built CLI boots end-to-end: `acryl --version` → version,
  `acryl --help` → usage, `acryl tui --json` →
  `{"mode":"direct","profile":"acryl","generationId":"…"}`, `acryl web --json` →
  `http://127.0.0.1:3080`.
- Closure derivation validated against the deployed production closure: **538
  packages**, all five loader entries present, `koffi 3.1.5`, `node-pty` +
  `sharp` pinned, no flattened platform natives.

### Residual / not yet resolved (recorded, not hidden)

- **tsdown/vitest `.bin` links are broken on this dev machine** (Node 22 + this
  pnpm install), so a full local `npm i -g` of the freshly packed artifact could
  not be re-run here. This is environmental: the release CI builds the CLI/Koffi
  natively (the portable archive smoke passed). Re-link with a clean
  `pnpm install` in a TTY, then re-run the external-install smoke.
- **koffi native load is intermittent under the loader's concurrent entry
  creation** (`Promise.allSettled`); imported directly `dsh-subprocess-local`
  and `dsh-sandbox-local` load fine and `require('koffi')` reports 3.1.5 with a
  working native. Upstream DSH/koffi behavior; a follow-up should make
  subprocess/sandbox resilient or optional in the base include so the tree boots
  without them.
- **Version skew:** npm `acryl` is at `0.1.12`, the repo `acryl-tui` package is
  at `0.1.10`, and the GitHub release tag is `v0.1.10`. Publish used
  `ACRYL_NPM_VERSION` override without bumping the five workspace packages. Needs
  a coordinated decision (republish to match, or bump the workspace + a new
  tag).

Primary sources:
`scripts/publish-npm-cli.mjs`, `acryl-tui/src/cli/grammar.ts`,
`acryl-tui/src/cli/run.ts`, `acryl-tui/tsdown.publish.config.ts`,
`docs/npm-test-external-user.md`.

## 2026-08-30 - npm publish path fixed: acryl CLI now installs and runs

External-user test on Linux proved `npm i -g acryl` shipped a broken package
(0.1.8 / 0.1.10 / 0.1.11). Three root causes fixed in `scripts/publish-npm-cli.mjs`:

1. **workspace:* deps leaked into the published manifest.** `acryl-tui` declares
   `acryl-control` and `acryl-harness-runtime` as `workspace:*` (internal pnpm).
   npm cannot resolve `workspace:*` from the public registry, so install failed.
   The publish script now strips any dep whose value is `workspace:*`.
2. **The bin path was invalid.** npm auto-removed `bin[acryl]` during publish,
   leaving no executable. Now emitted as `./lib/bin.js`.
3. **The runtime bundle did not inline the workspace package.** The default
   `tsdown.config.ts` leaves `import "acryl-harness-runtime"` external, so the
   published CLI crashed with ERR_MODULE_NOT_FOUND. The publish now builds with
   `tsdown.publish.config.ts` (which sets `noExternal: ['acryl-harness-runtime']`)
   and copies `lib-publish/` so the bundle is self-contained.

Also added an `ACRYL_NPM_VERSION` override. Verified: `acryl@0.1.12` (tag latest)
installs via `npm i -g acryl` and `acryl --version` prints `0.1.12`. 0.1.10 and
0.1.11 are unpublishable-again under npm's 72h version guard, so the working fix
shipped as 0.1.12.

## 2026-08-30 - v0.1.10 shipped as an OpenCode-style combined release

The non-publishing matrix and then the tag-gated release both ran fully green
(5 desktop + 5 CLI jobs), and **v0.1.10 is published** at
https://github.com/acryldev/acryl/releases/tag/v0.1.10 with both asset families
in one release (the OpenCode distribution model):

- CLI portable archives (5): `acryl-cli-darwin-arm64/x64.tar.gz`,
  `acryl-cli-linux-arm64/x64.tar.gz`, `acryl-cli-windows-x64.zip`.
- Desktop installers (5 + blockmaps): `acryl-desktop-mac-arm64/x64.dmg`,
  `acryl-desktop-win-x64.exe`, `acryl-desktop-linux-amd64/arm64.deb`.
- `checksums.txt` (SHA-256 for every CLI archive, basename format).

Release run: `33311328070` (all 10 jobs success; `Publish GitHub release`
success). Non-publishing validation: `33310901665` (green). Shipped-artifact
verification: downloaded `acryl-cli-darwin-arm64.tar.gz` from the release,
SHA-256 matched (`75cc0ec8…`), extracted, `acryl --version` -> 0.1.10 and
`acryl tui --json` boots with PATH=/usr/bin:/bin and an isolated HOME, zero
symlinks in node_modules (Zip-safe flatten). npm `acryl` is still at 0.1.8
(the pre-entrypoint-fix build); publishing 0.1.10 to npm is a separate,
credential-gated step (no npm auth in this environment).

Remaining/next: publish `acryl@0.1.10` to npm (does the fixed entrypoint via
`acryl-tui` under the `acryl` name); add the cross-surface capability
integration test (one shared ACRYL runtime capability surfaced through CLI,
Desktop, and Web adapters).

Three fixes landed to make the non-publishing CLI/desktop matrix green and the
split credible, plus fresh evidence.

1. **Windows CLI smoke extracted a Zip with GNU tar.** The cli job runs under Git
   Bash, where `tar` is GNU tar and cannot read a Zip, so `cli-windows-x64`'s
   smoke step failed instantly at extraction — the only red job in the run. It
   now extracts the Zip with `unzip` (falling back to PowerShell
   `Expand-Archive`) and invokes the `.cmd` launcher through `cmd.exe` with a
   `cygpath -w` Windows path.
2. **The real Windows bug: pnpm's `.pnpm` symlinked layout does not survive Zip.**
   After fixing extraction the runtime still failed with `ERR_MODULE_NOT_FOUND`
   for `@deepseek-ai/cordis` — pnpm `deploy --legacy` writes an isolated
   `.pnpm` tree of relative symlinks that tar.gz preserves but Zip/Windows
   extractors do not. `scripts/flatten-node-modules.mjs` now hoists every store
   package to the top level, drops `.pnpm`, and removes all symlinks, so the
   archive is a flat, extractor-agnostic node_modules. Verified: darwin-arm64
   rebuilt, extracted, `acryl --version` -> 0.1.9 and `acryl tui --json` boots
   with PATH stripped and zero symlinks. This is a product-correctness fix (real
   Windows users extracting the zip) not just a CI fix.
3. **npm entrypoint regression guard.** `scripts/verify-npm-entrypoint.mjs`
   reproduces npm's global-bin symlink, then asserts `acryl --version` prints
   the package version and `acryl tui --json` boots. The published
   `acryl@0.1.8` shipped the pre-canonicalization entrypoint and `--version`
   exited 0 silently; the source fix now runs in every CLI matrix job.

Additional evidence: `acryl web --json` from the extracted darwin archive prints
`http://127.0.0.1:3080`; npm-symlink `acryl --version` -> 0.1.9; acryl-tui
255/255 tests pass. The authoritative non-publishing matrix runs are
`33309174496`, `33309895558`, `33310901665`; all desktop jobs and the four unix
CLI jobs are green, `cli-windows-x64` is the one under repair.

The first non-publishing authoritative release run exposed a Windows-only CLI
archive failure: Node's `execFileSync('corepack', ...)` cannot resolve the
Windows command shim. The first repair selected `corepack.cmd`, but the next
matrix run showed that Windows also requires `shell: true` to spawn a `.cmd`
file. The builder now applies both rules. A focused platform helper test covers
both paths.

The CLI matrix also now runs TUI typechecking, tests, and the helper test before
creating an archive. Local darwin-arm64 proof was repeated: the extracted
archive's bundled launcher returned `0.1.9`, booted `acryl tui --json` with
`PATH=/usr/bin:/bin`, and passed `shasum -a 256 -c checksums.txt`.

A new non-publishing matrix dispatch is required after this commit. No tag or
GitHub Release was created by the failed run.

## 2026-08-30 - Release-gate repair: one authoritative per-architecture workflow

Implementation: `9c442facf129d4440e74d9f01611378f3c3576ec`.

Fresh verification (offline, this pass) plus exact root causes for the two
Release Candidate failures.

Portable CLI archive re-proven (darwin-arm64): `release-artifacts/acryl-cli-
darwin-arm64.tar.gz` extracts to an empty temp dir, the bundled launcher runs
`acryl --version` -> `0.1.9` and `acryl tui --json` -> `{"mode":"direct",...}`
with `PATH=/usr/bin:/bin` and an isolated HOME (no host Node/npm/pnpm); the
bundled `bin/node` is a Mach-O arm64 executable. SHA-256 `93a43a10…` matches
`checksums.txt`. NPM CLI is a Node script, not a binary: workspace `acryl-tui`
bin `acryl -> lib/bin.js`, `engines.node >= 22` (published `acryl` needs host
Node >= 22).

Root cause 1 (Windows long-path): the former methodology filename was 232
characters, producing a 253-character relative path that exceeds Windows
MAX_PATH on `D:\a\acryl\acryl\…` checkout. It is renamed to
`docs/workmethodology/acryl-hybrid-engineering-methodology.md`; `core.longpaths`
remains only a compatibility mitigation.

Root cause 2 (macOS node-pty): the legacy `release-candidate.yml` macOS job runs
`dist:mac-smoke` -> `scripts/package-mac.ts` -> `prepareInstalledMacUniversalRuntime`,
which requires BOTH `node-pty/prebuilds/darwin-arm64` and `darwin-x64` in one
universal build — incompatible with per-arch packaging. `release.yml` already
packages per-arch; `release-candidate.yml` is now redundant with it.

Implemented:
- `.github/workflows/release.yml`: every desktop matrix job runs
  `corepack pnpm --filter acryl-desktop run verify:closure`; its release
  `checksums.txt` normalizes paths to basenames, matching the archive builder
  and installer lookup.
- `acryl-desktop/tests/package.spec.ts`: the packaging gate asserts the five
  per-architecture desktop jobs, five CLI targets, verify-before-package gates,
  and `needs: [build, cli]`.
- The overlong methodology file was renamed and the obsolete
  `release-candidate.yml` universal-mac workflow was deleted. `release.yml` is
  the only tag-triggered release path.

Remaining verification:
1. Run an isolated `npm install -g acryl@<version>` smoke with registry access.
2. Run the authoritative release matrix via `workflow_dispatch` before another
   tag, then record every desktop and CLI target result.


Explicitly deferred (recorded per the OpenCode-style foundation goal, not built):
AppImage, RPM, auto-update manifests (latest*.yml), code signing/notarization
for the CLI, Homebrew, Scoop, Chocolatey, Pacman/AUR, mise, and Nix packaging.
The desktop stays on DMG/EXE/DEB (macOS ARM64 + Intel, Windows x64, Linux
x64/arm64 DEB); the CLI stays on npm (`npm install -g acryl`, canonical),
portable archives (`acryl-cli-<os>-<arch>`, 5 targets) + checksums, and the
`acryl.dev/install` seam. `acryl-cli-windows-x64.zip` assembly is structured and
verified locally; its first live run happens on a windows-latest runner during
the next tagged release.

## 2026-08-30 - CLI installer seam (Priority 3)

Commit: `installer-seam`

`scripts/acryl-cli-install.sh` is the tested implementation seam for
`curl -fsSL https://acryl.dev/install | bash` (hosted externally at acryl.dev;
not advertised until hosting + release archives + checksums are live). It
selects a versioned OS/arch archive (darwin/linux x arm64/x64; latest resolved
via the GitHub API or pinned via ACRYL_VERSION), downloads
`acryl-cli-<os>-<arch>.tar.gz`, verifies the SHA-256 against the release
`checksums.txt`, extracts to a user-owned directory (default `~/.acryl/bin`),
never uses sudo, never installs the GUI and never starts Web, and reports
PATH/unsupported-platform issues clearly.

`scripts/acryl-cli-launcher.sh` now resolves its own symlink chain (POSIX
readlink loop) so a user-dir symlink to the launcher still finds the bundled
node/lib — the first installer test failed exactly because the archive carried
the pre-hardening launcher; rebuilding the archive fixed it.

Verification (2026-08-30, darwin-arm64): served the built archive + checksums
from a local HTTP mirror; the installer downloaded, verified, extracted,
symlinked, and the installed `acryl --version` -> 0.1.9 and `acryl tui --json`
booted with PATH=/usr/bin:/bin. A tampered checksums.txt was refused with
`SHA-256 mismatch ... refusing to install` (exit 1).

## 2026-08-30 - dsh-plugin** renamed to acryl-*; portable CLI archive proven

Commits: `933ee2e`, `5558721`, `16ba098`

The two desktop/development packages are renamed so no confusing dsh-plugin
names remain in live code, config, or docs: `dsh-plugin-desktop` ->
`acryl-desktop` and `dsh-plugin-development-canvas` -> `acryl-development-canvas`
(directories, package.json name/bin/exports, pnpm workspace membership +
regenerated lockfile, Cordis patch rows, release workflows, root scripts,
source/tests self-references, READMEs/CONTRIBUTING/AGENTS, i18n hash records).
Desktop release assets are now version-less OpenCode-style names
(`acryl-desktop-mac-arm64.dmg`, `acryl-desktop-win-x64.exe`, ...) with dmg/exe
blockmaps, so one GitHub Release can list CLI and desktop binaries together.

The CLI reported a hardcoded stale `0.1.0-dev.0`; `ACRYL_VERSION` now derives
from package.json. `isEntrypoint()` compared a non-canonicalized argv path
against `import.meta.url`, so a script reached through a symlink (/tmp ->
/private/tmp, or any extracted portable archive) silently never ran; both sides
are now realpath()'d.

Priority 2 vertical slice: `scripts/build-cli-archive.mjs` assembles one portable
CLI archive (pinned Node v24.19.0 + built acryl-tui + production dependency
closure + launcher running bundled node --expose-internals). Proven on
darwin-arm64: archive extracted to an empty temp dir, `acryl --version` -> 0.1.9
and `acryl tui --json` boot the harness runtime with PATH=/usr/bin:/bin (no host
Node/npm/pnpm), SHA-256 generated and verified
(`39697c8240f05865f0a2d78d1bf9e189501f0fdd09250ebf6aa09004eca364c8`).
release.yml gains a cli matrix job (darwin-arm64/x64, linux-arm64/x64,
windows-x64 via a .cmd launcher) that builds, smoke-tests without host runtime,
then uploads; checksums.txt covers both tar.gz and zip and is generated at
publish time.

Verification: `corepack pnpm run verify` green (typecheck + all tests +
dev-local), full build green, bilingual docs + verify-layout green except the
pre-existing dirty deepseek-harness submodule (untouched per repo policy). The
built darwin-arm64 archive was smoke tested end-to-end after extraction.

## 2026-08-29 - Development Canvas lifecycle restart and advanced clean-install default

Commit: `be52e32`

The Canvas could report Enabled and reload its Host Fiber without appearing because browser plugin membership is fixed in the Client boot graph for one Desktop generation. Lifecycle enable, disable, and reload routes now finish their successful response and schedule the existing Desktop generation restart, which recomposes the Host and Client graphs from the persisted lifecycle state. Failed operations do not restart. The launcher startup fallback also now matches the Desktop and schema defaults: a settings document without an explicit mode starts in `advanced`, while an explicitly persisted `compatibility` choice remains supported.

Verification: the regression tests first failed because no restart was requested and because absent settings still resolved to `compatibility`; after the fix, 27 profile tests, 20 focused lifecycle tests, the complete Desktop suite (795 passed, 4 skipped), Desktop typecheck, and the native Apple Silicon electron-builder path passed. A mounted `ACRYL-0.1.7-arm64.dmg` was verified to contain an arm64 executable and the packaged Development Canvas Client.

Local unsigned Apple Silicon packaging uses the same per-architecture path as release CI: build Community Market, Canvas, and Desktop; invoke electron-builder with `--mac dmg --arm64`, disabled identity discovery and notarization; then copy the DMG to the gitignored `release-artifacts/` directory. `pnpm dist:mac` remains the signed/notarized production path and intentionally requires a Developer ID Application certificate plus notarization credentials.

## 2026-08-29 - README distinguishes Desktop GUI, Terminal CLI, and local Web

Commit: `fe7192c6b90972fd284d85f4424610b6756f17c8`

The release-facing README now explicitly separates three ACRYL surfaces: Desktop GUI installers, the npm-installed terminal CLI, and the opt-in local browser surface (`acryl web`). It states that the Desktop app carries its own runtime but neither adds a global CLI executable nor leaves a server running. The current links are synchronized to v0.1.4. The release README syncer now preserves this Install heading on all future tag releases.

Verification: `corepack pnpm check:bilingual-docs` and `git diff --check` passed.

## 2026-08-29 - Release workflow synchronizes README installer links

Commit: `967f33a5b30d38126e6bc3035463344e2242d755`

Tag releases now run `scripts/sync-release-readme.mjs <tag>` before publication. The script updates the root English and Chinese README release label and every platform-specific artifact URL, recomputes bilingual README blob hashes, and the workflow commits the synchronized documentation to `main`. A future tagged release cannot leave README downloads pointing at an earlier version.

Verification: exercised the script against `v0.1.1`, verified all five renamed artifact links, restored the current `v0.1.0` README without a diff, then ran `corepack pnpm check:bilingual-docs` and `git diff --check`.

## 2026-08-29 - v0.1.0 download links and Context7 indexing configuration

Commit: `b99daf1f3260f3a64fb00b20c7ad7b92e45013ab`

Published platform-specific v0.1.0 links for macOS Apple Silicon and Intel, Windows x64, and Debian Linux x64 and arm64 in the root documentation and GitHub Release notes. The published `acryldev@0.1.0` npm terminal package is now linked as `npm install -g acryldev`. Added the user-supplied `context7.json` public indexing configuration. The standalone `acryl.dev` deployment source is not present in this repository, so it was not modified.

Verification: GitHub release body was read back after mutation; `corepack pnpm check:bilingual-docs` passed.

## 2026-08-29 - acryl-harness-runtime: compose agent-presets + session-stats (fixes /presets)

- `7321c1d` — the ACRYL_RUNTIME_ROWS added `agent-presets` and `session-stats` as
  plain id-targeted rows, but dsh-base mounts plugins through a `cordis:include`
  tree: a plain row only overrides an EXISTING entry, it does not create one. The
  two rows silently never composed, so `/presets` fell back to 'No agent presets
  configured' because the service was absent. Insert them instead. Also point the
  agent-presets roster at the DSH submodule's shipped presets dir (the published
  npm bundle does not carry the presets), so `/presets` lists the real set
  (standard / ptc / minimal / cordis); the `~/.agent-presets` user root stays
  mounted. Verified in a PTY: `/presets` now shows Standard/PTC/Minimal/Creator
  rows; runtime still boots with agents + settings. runtime 11 + acryl-tui 252
  tests, typecheck, build green.

**Status.** The last verifiable functional gap is closed. All three entrypoints
run (`pnpm acryl`, `pnpm acryl-web` on 127.0.0.1:3080, `pnpm acryl-gui` launches),
all slash commands render their real surface (including `/presets` roster), and
the YLY sprite aspect distortion is fixed. Remaining work is branding parity
(web-client DeepSeek logo, gui ACRYL runtime confirmation) and a visual
confirmation of the animation — both need the user's eyes.

## 2026-08-29 - development-canvas rendering + default advanced shell (v0.1.4 -> v0.1.6)

The user's acryl-development-canvas (self-extensibility test: a topbar of
PTY terminals) was not rendering, and the renderer showed 'Failed to load plugins'.

Root cause: acryl-development-canvas registers the desktop.main slot, which
is declared ONLY by the desktop's advanced shell. The desktop booted in
compatibility mode, so: (1) the slots runtime threw 'slot desktop.main is not
declared' inside the canvas apply, failing the whole client plugin tree
('Failed to load plugins'), and (2) desktop.main was undeclared so the canvas
could never render.

Fixes:
- v0.1.4: gate the canvas apply (catch the slots 'is not declared' guard, skip;
  rethrow real errors), so compatibility mode no longer crashes the tree.
- v0.1.4/v0.1.5/v0.1.6: the renderer mode is fed from persisted settings
  (dsh-desktop.mode), which defaulted to compatibility, not the cordis patch or
  Config default. Default both the plugin Config and the DesktopSettingsSchema
  mode to advanced, so a fresh install (no persisted mode) boots the advanced
  shell where desktop.main is declared and the dev-canvas renders. A user who
  saved compatibility (or whose app-data is stale from v0.1.0-0.1.5) must switch
  shell mode to Advanced in Settings, or clear ~/Library/Application Support/ACRYL.

Note: v0.1.0 / v0.1.1 did not start (missing natives). v0.1.2 starts but had the
sidebar brand conflict. v0.1.3 fixed the brand. v0.1.4+ fixed the dev-canvas
crash. **v0.1.6 defaults to advanced mode and is the working release to test the
dev-canvas** (switch to Advanced in Settings if it shows compatibility).

## 2026-08-29 - Desktop app release fixes (v0.1.0 -> v0.1.3): native modules + brand shadow

The first DMG the user installed (v0.1.0) did not start: the Cordis plugin tree
failed to apply because the bundled koffi/subprocess/sandbox natives were
missing ('Cannot find the native Koffi module; did you bundle it correctly?').

Root cause (verified from the packaged asar): electron-builder's dependency
collector does not copy pnpm-optional native subpackages (@koromix, @img/sharp,
@vscode/ripgrep, node-addon-require-builtin) — they are optionalDependencies of
base packages and only linked as pnpm siblings, so they never reach
app.asar(.unpacked). dev works; packaged does not.

Fixes shipped across v0.1.1/v0.1.2/v0.1.3:
- After an afterPack-staging experiment (rejected: the desktop node_modules on CI
  does not carry the pnpm siblings), the natives are now declared as regular
  dependencies of acryl-desktop. They declare os/cpu, so pnpm installs only
  the matching per-platform/arch package per runner and electron-builder's
  dependency collector copies them into app.asar(.unpacked). Verified: v0.1.2's
  packaged app has koffi/sharp/ripgrep in app.asar.unpacked and the plugin tree
  applies.
- release.yml: pin pnpm via pnpm/action-setup (newer setup-node v5 runners no
  longer resolve corepack pnpm reliably), enable core.longpaths for Windows (the
  repo's long docs filename), and use macos-14 for the Intel runner (macos-13 was
  deprecation-queued).
- v0.1.3: the ACRYL sidebar brand shadowed the DeepSeek brand at the same
  priority, so the renderer logged 'single slot sidebar.brand.mark already has a
  registration at priority 0'. Register both brand slots at a negative priority
  (lowest renders).

Verified from the fresh v0.1.3 arm64 DMG: the app launches, the plugin tree
applies (natives present), the process stays alive, and no sidebar-brand-slot
conflict is logged. Local DMG at `release-artifacts/ACRYL-0.1.3-arm64.dmg`.

Note: v0.1.0 / v0.1.1 artifacts do not start (missing natives). v0.1.2 starts
but has the sidebar brand conflict. **v0.1.3 is the working release.**

## 2026-08-29 - ACRYL v0.1.0 first GitHub release shipped

First release cut and published (user-requested). The release ledger
`specs/022-acryl-v0.1.0-alpha.1/` was the readiness input; the user asked for a
published first-minor release plus a 5-platform CI and a local macOS DMG.

- Version bumped to `0.1.0` across the ACRYL-owned packages (root, acryl-control,
  acryl-harness-runtime, acryl-tui, acryl-desktop). The prior `2.0.2`/
  `0.1.0-dev.0` were dev placeholders.
- `.github/workflows/release.yml` added: a 5-target matrix (macos arm64 + x64
  dmg, linux deb arm64 + x64, windows x64 nsis) that builds per-arch and, on a
  `v*` tag, publishes a GitHub Release (`permissions: contents: write`,
  softprops/action-gh-release).
- Fixed the first-run failures: (a) linux `.deb` needed an `author`/`build.linux`
  maintainer, (b) Windows checkout failed on the very long
  `docs/workmethodology/...md` filename — enabled `core.longpaths`, (c) macos-x64
  `macos-13` Intel runner never provisioned (deprecation-queued) — moved to
  `macos-14`. Also fixed the pre-existing red `ci.yml`: `acryl-tui` typechecks
  against `acryl-harness-runtime`, whose types are generated into `lib/`, so the
  workspace type-providers (acryl-control -> acryl-harness-runtime) must be
  built before the typecheck step.
- Published `v0.1.0` on GitHub with all five artifacts:
  `ACRYL-0.1.0-arm64.dmg`, `ACRYL-0.1.0.dmg` (x64), `acryl-desktop_0.1.0_arm64.deb`,
  `acryl-desktop_0.1.0_amd64.deb`, `ACRYL-0.1.0-x64-Setup.exe`.
- The local macOS DMG build was BLOCKED on this host: `electron-builder` hung at
  the electron download/extract step and its universal build needs cross-arch
  native prebuilds that a single-arch host does not stage (the documented
  blocker). The DMG was built on the GitHub macOS ARM64 runner instead and
  downloaded locally (`release-artifacts/ACRYL-0.1.0-arm64.dmg`, validated via
  `hdiutil verify`) for the user to test on Apple Silicon.

## 2026-08-29 - acryl-tui: all three surfaces launch/serve; gui launch verified

Follow-up on the web host. `pnpm acryl-gui` = `pnpm --filter acryl-desktop run start`
(runs `acryl-desktop/lib/bin.js`, an Electron launcher). A guarded launch
stayed alive past 12s with no crash, and the process was then killed cleanly —
so the desktop surface launches. Confirming it boots the ACRYL runtime (vs a
pristine DSH profile) and shows ACRYL branding requires a display + the user's
eyes; it is not verifiable headlessly.

**Status.** All three entrypoints now run: `pnpm acryl` (terminal),
`pnpm acryl-web` (serves the DSH SPA on 127.0.0.1:3080, HTTP 200),
`pnpm acryl-gui` (launches Electron). All slash commands work; the YLY sprite
aspect distortion is fixed. Remaining polish: web-client + gui DeepSeek/ACRYL
branding (separate client-side tasks), and a visual confirmation of the animation.

## 2026-08-29 - acryl-tui: ACRYL web host wired (pnpm acryl-web)

- `49e7dae` (full `49e7dae24fd8754fb424ab46c3ad78c46be3cd22`) — `pnpm acryl-web` no longer exits with a not-implemented error. The
  DSH web surface is the `web` profile (`dsh-base` + `dsh-web-app`), whose
  packages and built SPA dist are already installed in the ACRYL workspace.
  `bootAcrylWebProfile()` composes the standard `web` profile as one normal ACRYL
  runtime (ACRYL_RUNTIME_ROWS not re-inserted — the web bundle already supplies
  `system-prompt`, and duplicating it breaks the loader); `provideCmdline()` seeds
  the `web-startup` provider (defaults 127.0.0.1:3080); host/port are read back
  into a canonical url. `runAcryl` dispatches `web` to `serveWeb` (boot, print
  `ACRYL web: <url>`, serve until SIGINT/SIGTERM, dispose). `web --json` is a
  headless readiness probe. Verified: `node bin.js web` serves HTTP 200 on
  http://127.0.0.1:3080 with the SPA boot HTML; runtime 11 + acryl-tui 252 tests,
  typecheck, build green.

**Remaining.** `pnpm acryl gui` (Electron) is the one surface still not wired;
need the desktop plugin to launch the same ACRYL runtime (not verifiable
headlessly). The web client still shows DeepSeek brand (`dsh-client-ui-brand`);
ACRYL web branding is a separate client-side task. The terminal surface is
complete.

## 2026-08-29 - acryl-tui: fix YLY sprite aspect distortion (root cause of 'simplified' look)

- `9a85967` (full `9a85967d4ef3f3ac22d203c9ac079458a27302b0`) — the frame compiler resized each 96x84 sheet cell to the preset
  grid with `fit:'fill'`, stretching the cell non-uniformly (large 20x11 ->
  aspect 0.91 vs the pet's ~1.15). That non-uniform stretch is what made the
  mascot look distorted/simplified at low resolution. Now scan alpha for the
  pet's opaque bbox (sharp's `.trim()` resets geometry when chained after
  `.extract()`, so scan manually) and resize just the bbox into the grid with
  `fit:'contain'`, preserving the native aspect and keeping every frame the
  same height. All 13 frames x 3 presets still render at the preset row count;
  252 tests + typecheck + build green.

**Remaining.** `acryl web` host (needs the SPA frontend built plus
`@deepseek-ai/dsh-web-app`/`dsh-host-frontend-static` installed and the web
rows composed into the ACRYL runtime — a deliberate large task) and `acryl gui`
(Electron). The terminal surface itself is functionally complete.

## 2026-08-29 - acryl-tui: /presets roster settle + sessionBlank semantics fix

- `16f3a3d` (full `16f3a3d7f7d6de7185e746e447bc4c38307b388a`) — `/presets` no longer sits on a perpetual `Loading...`: port Tomo's
  `loadAgentPresets` (read `ctx.agentPresets.list()` into `AgentPresetRow`s). The
  agent-presets service needs `ctx.baseUrl` and is not composed in the TUI
  profile, so when absent the overlay settles to the neutral empty message. Also
  fixes `sessionBlank` to mirror Tomo/harness semantics (blank until the first
  `turn/start`, not until the event log is empty), so injected context no longer
  counts as a started session.

**Terminal-surface status (all slash commands verified in a real PTY).**
`/help`, `/model` (real provider directory), `/trajectory`, `/tools`, `/context`,
`/plugins` (full 79-row tree), `/presets`, `/goal`, `/plan`, `/compact`, `/clear`
(fresh-session re-attach), `/exit`/`/quit` all render their real surface or a
clear degradation message. `pnpm acryl` boots the full-screen pi-tui with the
YLY pet + ACRYL branding. 252 acryl-tui tests + typecheck + build green.

## 2026-08-29 - acryl-tui: /model wired to the real provider directory; web/gui gap recorded

Follow-up on the slash-command parity checkpoint above.

- `3ac70ab` (full `3ac70ab13cbe4a89238110b88e55743dbfe5112c`) — `/model` re-join of `ctx.llm`'s provider
  directory with `ctx.settings.describe({redactSecrets:true})` (persisted
  overrides) and `ctx.credentials.describe()` (API-key presence), folded into
  `ProviderRow` entries and pushed into the store. The overlay previously
  opened but stayed on `Loading...`. Local `getAtPath`/`deriveApiKeyRef` helpers
  ported; no new dependency. PTY proof: `/model` now renders the full provider
  list (deepseek, openai, google, ...) marked live/configured and `[no api key]`.
- `8c52e02` (full `8c52e02334ca332943a0373e0bd967941512cc3b`) — `pnpm acryl-web` / `pnpm acryl gui` now fail with a clear,
  surface-specific message (web vs desktop Electron) pointing at the working
  `pnpm acryl` terminal surface, instead of a generic `use "acryl tui"` throw.

**Known gap / next work.** `acryl web` and `acryl gui` hosts are NOT wired into
this build. The web surface needs the ACRYL runtime to compose the DSH web
rows (serve the frontend on 127.0.0.1) rather than delegating to the pristine
`dsh --profile web`; the gui surface needs the Electron desktop plugin to
launch the same ACRYL runtime. Neither is a small change, and both are recorded
here so the next session picks them up deliberately. The terminal surface is
functionally complete: `pnpm acryl` boots, YLY pet animates, and every slash
command works.

## 2026-08-29 - acryl-tui: /clear session reset, auto-build launcher, slash-command parity

Follow-up on the M1 terminal surface and the YLY/branding work. The interactive
host adapter is now a live session loop instead of a single-shot mount, and the
root `pnpm acryl` / `pnpm tui` commands build-first so a stale checkout still
starts.

- `a4fac87` (full `a4fac8779e5459b1c43d8aff09a895325027f2d9`) — `/clear` session reset. The host
  adapter is refactored around `attachSession` (one bridge + store + actions +
  `TuiHandle` per session) and `runAcrylTui` now listens on each session's
  `exitPromise`: `'exit'` restores the terminal and returns the resume hint,
  `'clear'` disposes the current session with `preserveScreen=true` and
  re-attaches a fresh native durable DSH session on the same runtime. Durable
  history stays on disk. PTY proof: session A -> `clearing...` -> fresh session B
  -> exit 0 with a resume hint. Typecheck + 251 acryl-tui tests green.
- `e165c99` (full `e165c99ebfa336dff6d5bd952bfdef7a8c57fd17`) — `pnpm acryl` / `pnpm tui` auto-build.
  Root scripts now route through `scripts/tui-run.mjs`, which rebuilds acryl-tui
  when `lib/bin.js` is missing or older than the newest source file, then execs
  the real CLI. Verified `pnpm acryl --version` / `pnpm tui --version` print
  `0.1.0-dev.0`; a warm launch skips the rebuild.

Slash-command parity was verified end-to-end under a real pseudo-terminal
(one command per fresh session, exact overlay title / notice string):
`/help` (available-commands list), `/model` (Model providers overlay),
`/trajectory` (Trajectory ledger overlay), `/tools` (Tool Cards overlay),
`/context` (Context usage overlay), `/plugins` (Plugins (79) — 0 active tree),
`/presets` (Agent presets overlay), `/goal` (No goal is currently set...),
`/plan` (Plan mode on...), `/compact` (no compactable history yet),
`/clear` (clearing... + fresh session), `/exit`/`/quit` (exit 0).

Source/verification: `acryl-tui/src/tui-app/session.ts`,
`acryl-tui/src/cli/{run,grammar}.ts`, `scripts/tui-run.mjs`, `package.json`;
`pnpm --filter acryl-tui run check` (typecheck + 251 tests + build) green.

## 2026-08-29 - M1 pi-tui terminal surface: runtime seam and Tomo port foundation

The M1 terminal milestone moved from the re-scoped runtime contract into code.
The ACRYL runtime now has a durable-session event seam and a coding-agent
profile composition, and `acryl-tui` carries Tomo's real presentation and
editor/input code rather than a re-authored renderer.

- `33439ec` (full `33439ec88c3e4c1f575b9e4d905bb2f01a2b3242`) — session bridge:
  `AcrylSessionBridge.subscribeEvents` streams incremental durable `SessionEvent`
  records (the streaming seam the terminal needs), and `dispose()` waits idle and
  `sessions.flush`es before releasing native handles so durable resume survives
  a clean exit. RED test first.
- `67bbaca` (full `67bbaca72db3af50d32238eec0f6358affcd3866`) — `bootAcrylHarnessProfile` composes the
  coding-agent rows dsh-base does not mount (`system-prompt` persona,
  `agent-presets` default `standard`, `session-stats`) as runtime-owned rows.
- `0b0cba5` (full `0b0cba5b5ccc5e78c0d127ab7d051005afde6e6b`) — ported Tomo presentation core into `acryl-tui`
  verbatim (`store.ts`, `render.ts`, `markdown.ts`, `sessionId.ts`,
  `tui/{theme,piTheme,text,liveText,Spinner,bannerText,statsFormat}` and the
  overlay type modules) with their vitest suites, renamed to the repo `.spec`
  convention, plus exact `@earendil-works/pi-tui@0.84.2` and `diff` deps.
  Type accommoda tions: `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`
  relaxed to Tomo's baseline in `acryl-tui`; compaction `SessionEvent`
  augmentation imported.
- `ecefaf4` (full `ecefaf4bcc5267ca42cf16e70f7ef2886642313a`) — ported Tomo input/editor chain
  (`CustomEditor`, `promptAutocomplete`, `commands`, `fileMention`, `fileIndex`,
  `miniTextField`, `actions`) + command/file-mention tests.

Source/verification: `specs/019-acryl-harness-runtime/` (re-scoped),
`acryl-harness-runtime/src/session-bridge.ts`, `acryl-harness-runtime/src/index.ts`,
`acryl-tui/src/{render,markdown,sessionId}.ts`, `acryl-tui/src/tui/*`, and their
tests. Upstream provenance: `docs/acryl/tomowang-dsh-tui-provenance.md`.

Next parity gap (not yet wired): TuiApp application shell + overlays, the ACRYL
host adapter over the bridge, Ink removal, and the TTY smoke — then approvals,
questions, overlays, model/preset controls, prompt history.
# ACRYL Development Log

This human-readable log records important project evolution. It explains what
changed, why it matters, where the implementation lives, and which Git commit
is the exact recovery point. It complements Git history, specifications, and
architecture notes rather than replacing them.

## Recording rules

- Add the newest evolution first.
- Record the full canonical commit hash after the implementation is committed.
- Explain the user-visible result and the architectural decision, not only the
  files changed.
- Name the primary source, specification, and verification locations.
- If Git history is rewritten or commits are squashed, update affected hashes
  so this document continues to point at canonical `main` history.
- A log-maintenance-only commit does not need to describe itself. Product,
  architecture, workflow, or operational changes do need entries.

Recommended workflow:

1. Implement and verify one coherent change.
2. Commit that change on `main`.
3. Add its canonical commit hash and explanation here.
4. Commit the log update as a separate documentation checkpoint.

---

## 2026-08-28 - One runtime, many surface adapters selected

Commit: `1549539f1c2d78e498fd42567c4f5d840ff9130a`

ACRYL now implements coding-agent behavior once in its DeepSeek Harness/Cordis runtime. TUI, Electron, and Web invoke the same typed capabilities through direct, existing IPC/API, and existing HTTP/WebSocket adapters. Durable DSH sessions provide continuity across launches. A detached control daemon and cross-process attachment protocol are deferred until a real simultaneous-live-surface requirement exists.

Primary record: `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`. This decision supersedes the cross-process ownership sections of Spec 019.

## 2026-08-28 - Unused ownership and endpoint modules removed

Commit: `89a2de16848bc5ffe79f0901356385e410f27c9e`

The remaining speculative ownership, lease, local endpoint, attachment, and polling modules and their tests were deleted. The runtime retains its native durable-session bridge and normal profile boot path; control keeps only surface-neutral contracts still used today.

Verification: control (22 tests), runtime (9 tests), and TUI (20 tests) package checks.

## 2026-08-28 - P001 ownership experiment deliberately removed

Commit: `3285a7f182f1b8780f22c7947067d01844bda79f`
Reverted commit: `99af4c14871caa3e7fca1bddf4e3638c5953f7d8`

Under the one-runtime/many-surfaces decision, each launched surface now starts its ordinary local Harness/Cordis runtime. Durable DSH sessions, rather than control records, leases, sockets, or owner discovery, provide continuity across later launches. The direct TUI bootstrap ignores stale `.acryl/control` experiment state.

Primary sources: `acryl-tui/src/host/direct.ts` and `acryl-tui/tests/direct.spec.ts`. Verification: control, runtime, and TUI package checks.

## 2026-08-28 - Profile ownership and active-control protections added

Commit: `99af4c14871caa3e7fca1bddf4e3638c5953f7d8`

P001 adds guarded profile-lease recovery and an explicit server-side active-control authority, then routes session mutation through that authority. The legacy TUI host no longer owns direct Harness boot. This remains a local-process baseline; cross-process discovery and attachment orchestration require further independent review.

Primary sources: `acryl-control/src/ownership/active-control.ts`, `acryl-control/src/ownership/lease-store.ts`, `acryl-harness-runtime/src/session-control-endpoint.ts`, and `acryl-tui/src/host/direct.ts`. Verification: package checks and ownership/control tests.

## 2026-08-28 - Full pi-tui terminal baseline selected

Commit: `00b2da5f2bf519f0eca154b77fb5e6f4704df51d`

ACRYL now adopts the MIT-licensed `tomowang/dsh-tui` upstream snapshot `f7663341f604c3ad96e9b2b838a7ca2de8e84fd1` as its complete terminal behavior reference. Its pi-tui component and feature inventory replaces the earlier minimal `dsh-pi-tui` direction. ACRYL will preserve this terminal experience through `acryl-control` projections rather than shipping the upstream direct-Cordis bundle, so every surface continues to share one runtime and durable session authority.

Primary record: `docs/ACRYL-ROADMAP.md`. The upstream snapshot is `@tomowang/dsh-tui` 0.7.0 using pi-tui 0.84.2. No source integration has started.

## 2026-08-28 - Session endpoint polling lifecycle completed

Commit: `00b77eaf09adfd05b994a34555bda6124ad34815`

The temporary local endpoint subscription transport now performs one snapshot request at a time, schedules a later poll only after that request settles, and stops cleanly after disposal or a terminal endpoint error. Socket close, error, and request timeout now settle every client request. Integration coverage proves endpoint cancellation reaches a native aborted turn, fresh clients replay durable assistant messages, and disposed subscriptions do not receive later session events.

Primary sources: `acryl-control/src/protocol/endpoint-client.ts`, `acryl-control/tests/endpoint-client.spec.ts`, and `acryl-control/tests/session-control.integration.spec.ts`. Verification: `corepack pnpm --filter acryl-control run check` (51 tests) and `corepack pnpm --filter acryl-harness-runtime run check` (13 tests).

## 2026-08-28 - Local session endpoint capability and readiness correction

Commit: `0cb802aa978bc8fe8c6acf826837ee189d5758d4`

The local session endpoint now authorizes requests with endpoint-scoped random capabilities held only by the live runtime, rather than trusting caller-selected attachment mode. It waits for Unix socket readiness, reports bounded polling failures through `onError` and `whenError()`, and accepts prompts once their durable user event is committed without treating the model turn as complete. The control package test command now builds the runtime artifact first, making this artifact-plane integration test reproducible.

Primary sources: `acryl-harness-runtime/src/session-control-endpoint.ts`, `acryl-control/src/protocol/endpoint-client.ts`, and `acryl-control/tests/session-control.integration.spec.ts`. Verification: both package checks.

## 2026-08-28 - Native sessions exposed through the local control endpoint

Commit: `9a42d1da810db7c43dd907c1b3c7e3960adf0bc1`

The owner runtime now mounts its native durable session bridge behind the existing local control protocol. Endpoint clients exchange only session DTOs: snapshots, subscription polling, prompt commands, and cancellation. Fresh connections replay durable session state, attached clients remain read-only, and owner shutdown disposes the endpoint before native bridge and Harness root resources.

Primary sources: `acryl-harness-runtime/src/session-control-endpoint.ts`, `acryl-harness-runtime/src/owner-or-attach.ts`, and `acryl-control/src/protocol/endpoint-client.ts`. Verification: `acryl-control/tests/session-control.integration.spec.ts`, `corepack pnpm --filter acryl-control run check`, and `corepack pnpm --filter acryl-harness-runtime run check`.

## 2026-08-28 - Native session bridge and ownership hardening

Commit: `adff40026abd6c773cba63e315f5e31412e8f39b`

The native session bridge now proves durable transcript replay across a real resume, projects durable assistant and tool facts, forwards an active-turn cancellation, and releases subscriptions deterministically. Profile ownership is reserved before boot, remains reserved through ordered shutdown, carries a unique generation ID, and gives attached clients read-only session access. The bridge refuses a second active native session rather than leaking an additional agent handle.

Primary sources: `acryl-harness-runtime/src/session-bridge.ts` and `acryl-harness-runtime/src/owner-or-attach.ts`. Verification: `acryl-harness-runtime/tests/session-bridge.spec.ts`, `acryl-harness-runtime/tests/owner-or-attach.spec.ts`, and `corepack pnpm --filter acryl-harness-runtime run check`.

## 2026-08-28 - Single-root session owner-or-attach established

Commit: `218f28f615662fdd98b924c7182ec586ec96016b`

The runtime now has one owner-or-attach entry point for a profile. The first caller boots the native Harness root and selects a durable session; subsequent in-process callers receive an attached, projection-only client for that same root and session. Failed startup disposes the attempted bridge and root before later ownership can proceed. The remote control-endpoint path remains the next task.

Primary sources: `acryl-harness-runtime/src/owner-or-attach.ts` and `acryl-harness-runtime/tests/owner-or-attach.spec.ts`. Verification: `corepack pnpm --filter acryl-harness-runtime run check`.

## 2026-08-28 - Native durable Harness session bridge added

Commit: `35a166708bd69266377b84f1c2c15a8e4ab910fc`

`acryl-harness-runtime` now owns a small bridge that creates or resumes one pinned-Harness agent/session, derives its initial transcript and compact tool state from durable session events, and routes submitted prompts and cancellation to that native agent. It adds no alternate transcript store or presentation-layer access to Cordis or DSH objects.

Primary sources: `acryl-harness-runtime/src/session-bridge.ts` and `acryl-harness-runtime/src/index.ts`. Verification: `acryl-harness-runtime/tests/session-bridge.spec.ts`, `corepack pnpm --filter acryl-harness-runtime run typecheck`, and focused runtime tests.

## 2026-08-28 - Outer ACRYL workspace migrated to PNPM

Commit: `26aa4f872132757e2f890de34fe26e5b8a64f73b`

The ACRYL-owned workspace now uses Corepack PNPM 11.7.0 with a committed lockfile, translated dependency patches, explicit native-build permissions, and macOS architecture policy. The pinned `deepseek-harness/` submodule remains a separate, read-only PNPM workspace at `b150a551b8`; it is not included in the outer dependency graph.

The migration passed frozen installation, layout and architecture gates, typecheck, 1,144 tests, production build, and packaged macOS arm64 Electron smoke. Manual testing confirmed Electron chat, model responses, the advanced embedded renderer, and Development Canvas lifecycle controls. The bare embedded server URL is not a standalone Web surface and is deferred to the planned owner-or-attach `acryl-web` runtime.

Primary sources: `pnpm-workspace.yaml`, `.npmrc`, and `specs/020-pnpm-outer-workspace-migration/`. Verification: `specs/020-pnpm-outer-workspace-migration/evidence/verification.md`.

## 2026-08-27 - pi-tui selected as the ACRYL terminal surface

Commit: `ff9d4f1352538676ff969bf5451979a9fcf3d329`

ACRYL replaces the earlier React Ink direction with the working Node-based
`dsh-pi-tui` implementation. The terminal renderer remains a peer surface: it
projects durable Harness records and sends commands through `acryl-control`.
It must start or attach to the one profile runtime rather than create a second
Cordis root. This keeps the same agent controllable from pi-tui, Electron, and
Web.

Primary document: `docs/ACRYL-ROADMAP.md`.

## 2026-08-26 - First human-testable ACRYL vertical slice approved

Commit: `befa8cdfda3a51e8d0a0f9220d77bb1651591ea3`

The next work is constrained to one complete standalone feature: an
already-authenticated native Harness profile accepts an ACRYL terminal prompt,
returns a real provider response, and retains the exchange as durable Harness
session state. Provider switching, third-party agent adapters, multi-surface
attachment, and Desktop work are explicitly deferred until this human-testable
slice is finished.

## 2026-08-26 - Shared Harness runtime delivery ledger generated

Commit: `786a13ed1baf47c9863fa8eebb637217b0176050`

The 019 ledger now has 21 dependency-ordered, acceptance-driven tasks. The
first MVP slice is a Terminal-only one-root runtime that creates a fresh
durable Harness session without Electron. Multi-surface authenticated attach
and exclusive active control follow as a separate verified increment.

## 2026-08-26 - Shared Harness runtime design completed

Commit: `522c964853d74ed0fb1425e30b248f8c1a121530`

The 019 Spec Kit design now defines a host-neutral runtime as the sole owner of
pinned Harness profile boot, durable sessions, native agents, local attachment,
and ordered shutdown. It records the profile-generation, attachment, and
active-control lease model, a local control contract, dependency-closure
strategy, and headless walking-skeleton acceptance procedure.

## 2026-08-26 - Shared runtime control and authentication model clarified

Commit: `9c0c36bbcd2cffa2fd44d4d586107f38a2aad85c`

The ACRYL shared Harness runtime specification now requires compatible surfaces
to attach to one healthy profile owner rather than start competing writable
runtimes. Attachment uses an owner-issued local capability credential and
operating-system local endpoint permissions. Provider authentication remains
owned by provider-managed Harness profiles or CLIs, with no ACRYL secret
extraction or storage. Concurrent surfaces observe live state, while one
explicit active-control lease serializes agent actions and is automatically
released on disconnect, process death, or channel expiry.

## 2026-08-26 - Reusable agent engineering methodology established

Commit: `8d08cf7057c500cd562e2784d04280dafed72cb2`

A standalone methodology now records the repository-independent workflow for
GitHub Spec Kit, spec-driven tasks, Superpowers TDD/debugging/verification,
Cordis-style ownership, Ponytail minimalism, vertical slices, focused commits,
and durable evidence. It defines the roadmap and specification ledger as the
project's durable navigation and delivery records.

Primary document:
`docs/workmethodology/acryl-hybrid-engineering-methodology.md`.

## 2026-08-26 - Durable Harness message dispatch has an explicit boundary

Commit: `25a6228cfc5107366d32b90269650ed1ff043a11`

`acryl-harness-runtime` now exports the typed durable-session message port and
receipt contract. React Ink can receive this port and submit identified
composer text through it, without creating an agent or persisting alternate
history in the presentation layer. A runtime implementation of the port is the
next slice.

Primary sources: `acryl-harness-runtime/src/durable-message.ts` and
`acryl-tui/src/render/ink-app.tsx`. Verification: runtime and TUI workspace
checks, including 22 TUI tests.

## 2026-08-26 - Ink terminal composer has an interactive state loop

Commit: `53c518126fadf89875ac22272de2923c24ed3d0f`

The Ink terminal now accepts typed text, supports deletion, and records an
explicit dispatch-pending message when Enter is pressed. This is intentionally
local presentation state only; the following slice replaces the pending marker
with a durable Harness session dispatch.

Primary source: `acryl-tui/src/render/ink-app.tsx`. Verification: 21 TUI tests,
typecheck, and build.

## 2026-08-26 - Ink terminal projects live Harness readiness

Commit: `02b2687157e8d029ba71c6e5930cf50435eb5ca6`

A direct host now reports whether both native Harness session and agent services
are present. The CLI passes that fact to React Ink, replacing the previous
hard-coded unavailable state with a real runtime-readiness projection.

Primary sources: `acryl-tui/src/host/direct.ts` and
`acryl-tui/src/cli/run.ts`. Verification: 20 TUI tests, typecheck, and build.

## 2026-08-26 - ACRYL CLI launches with Cordis HMR support

Commit: `a1281f2f6d29daa35abdde079b883018a04638f8`

The Node `acryl` entrypoint now re-executes itself with
`--expose-internals` before it boots an HMR-enabled Cordis profile. The launch
contract is covered by a pure invocation test, and an isolated real CLI JSON
smoke successfully acquired and released a runtime profile.

Primary sources: `acryl-tui/src/bin.ts` and
`acryl-tui/src/cli/node-launcher.ts`. Verification: 20 TUI tests, typecheck,
build, and isolated CLI smoke.

## 2026-08-26 - ACRYL terminal renderer now uses React Ink

Commit: `2ff2cb96c47f33966edb606167308b7607f8866e`

The terminal renderer no longer depends on OpenTUI or Bun. `acryl-tui` now
mounts and disposes a React Ink renderer under Node, while its durable agent
workspace remains a renderer-neutral projection. The obsolete Bun/OpenTUI test
path was removed.

Primary source: `acryl-tui/src/render/app.tsx`. Verification: 18 Vitest tests,
TypeScript typecheck, and package build.

## 2026-08-26 - React Ink terminal foundation

Commit: `1f6ed2f081f1b4065eca008d2bfe16623a2bfb1a`

`acryl-tui` now has a minimal, tested React Ink terminal component that projects
profile, ownership mode, and runtime state. This starts the staged replacement
of OpenTUI/Bun with Node-compatible Ink without changing the GUI or Web
surfaces.

Primary source: `acryl-tui/src/render/ink-app.tsx`. Verification: the Ink
component test and TypeScript check.

## 2026-08-26 - Harness HMR is preserved by profile composition

Commit: `ffc597cd86a1e37f86a6d41099da69581b673434`

`acryl-harness-runtime` no longer overrides the Cordis HMR Loader row. An
HMR-enabled profile now fails early with an actionable requirement to launch
Node using `--expose-internals`; a profile that explicitly disables HMR still
boots normally. The isolated smoke confirms that an exposed Node owner mounts
HMR alongside durable sessions and agents.

Primary source: `acryl-harness-runtime/src/index.ts`. Verification: the runtime
workspace test suite and an isolated `node --expose-internals` profile boot.

## 2026-08-26 - Direct TUI hosts boot through the pinned Harness profile

Commit: `41af5c897cf835d53cbee79d126c932adbe5570b`

`acryl-harness-runtime` now owns normal profile initialization and boot, while
`acryl-tui` installs its ownership, architecture, agent, and control services
into that single returned Cordis root. The runtime explicitly disables the
base development HMR row because regular Node CLI launches do not expose
Cordis internals. This makes profile boot work without `--expose-internals`
and ensures the real durable `sessions` and `agents` services are present.

Primary sources: `acryl-harness-runtime/src/index.ts` and
`acryl-tui/src/host/direct.ts`. Verified by each workspace's `check` command
and an isolated normal-Node profile boot smoke. Closure research is recorded
in `specs/019-acryl-harness-runtime/issues/01-audit-profile-runtime-closure.md`.

## 2026-08-26 - ACRYL terminal composer is interactive

**Commit:** [`29a2882d01f4724649ef604a0c4dcbb88c561d64`](https://github.com/acryldev/acryl/commit/29a2882d01f4724649ef604a0c4dcbb88c561d64)

The initial direct TUI was static because it mounted only a `TextRenderable`.
It now mounts and focuses OpenTUI's `InputRenderable`, so typing and a visible
cursor work immediately. Input's actual submission seam is its `enter` event,
not the inherited textarea `onSubmit` option. Until durable Harness sessions
are composed, Enter empties the composer and states that the message was not
sent instead of fabricating agent activity.

Verification covers typing and Enter submission with the OpenTUI test renderer:

- `acryl-tui/tests-bun/renderer.test.ts`
- `corepack yarn workspace acryl-tui check`

---

## 2026-08-26 - ACRYL direct TUI CLI is executable

**Commit:** [`4b373693a76190837a43d4bfd609fd74ff2f2470`](https://github.com/acryldev/acryl/commit/4b373693a76190837a43d4bfd609fd74ff2f2470)

`acryl-tui/lib/bin.js` is now a real Bun executable rather than an inert
module export. `acryl` and `acryl tui` acquire the direct profile lease, start
the direct control host, open OpenTUI, and release the host when the renderer
closes. `acryl --json` is a short-lived scriptable ownership/status probe. The
current interactive surface explicitly reports that the Harness session runtime
is not yet connected, rather than fabricating a session or replaying terminal
scrollback.

Primary implementation and verification:

- `acryl-tui/src/bin.ts`
- `acryl-tui/src/cli/run.ts`
- `acryl-tui/tests/cli-run.spec.ts`
- `corepack yarn workspace acryl-tui check`
- `./acryl-tui/lib/bin.js --json`

---

## 2026-08-26 - Durable ACRYL agent-workspace screen added

**Commit:** [`fb6a74232089ce8c22b0f501620f366904362f06`](https://github.com/acryldev/acryl/commit/fb6a74232089ce8c22b0f501620f366904362f06)

The terminal workspace now has a real screen projection for the canonical
agent-session experience: durable session selection with new/resume controls,
composer state, transcript blocks, tool-call cards, approval prompts, and job
cards. The screen accepts only a read-only durable projection boundary and
explicitly excludes raw PTY bytes and scrollback. Harness wiring is deferred to
the later agent-integration task, where `ctx.sessions` and trajectory services
become the source for this projection rather than a second in-memory history.

Primary implementation and verification:

- `acryl-tui/src/render/screens/agent-workspace.ts`
- `acryl-tui/tests/agent-workspace.spec.ts`
- `corepack yarn workspace acryl-tui check`

---

## 2026-08-26 - ACRYL TUI status region added

**Commit:** [`0d967f8910cb4741c2e12a8c8b1f3e731a2fc671`](https://github.com/acryldev/acryl/commit/0d967f8910cb4741c2e12a8c8b1f3e731a2fc671)

The OpenTUI header now uses one stable, copyable status projection with the
active mode, owning host kind, profile, generation, selected model, and host
health. The renderer defaults the not-yet-composed model to `unavailable` and
health to `healthy`, so it never invents a model identity while the Harness
agent composition is still pending.

Primary implementation and verification:

- `acryl-tui/src/render/status.ts`
- `acryl-tui/src/render/app.ts`
- `acryl-tui/tests/status.spec.ts`
- `corepack yarn workspace acryl-tui check`

---

## 2026-08-26 - Direct ACRYL control-host boot established

**Commit:** [`e878d065795a147bef11a9a388435e82f3b6623d`](https://github.com/acryldev/acryl/commit/e878d065795a147bef11a9a388435e82f3b6623d)

The terminal host now has a direct-mode composition boundary in
`acryl-tui/src/host/direct.ts`. It creates a single Cordis context, acquires
an exclusive profile lease before starting a writable runtime, and fails closed
with `DirectHostAlreadyOwnedError` when another host owns that profile. The
composition exposes profile ownership, native runtime architecture inspection,
agent control, and a generation-scoped local control endpoint. Disposal runs
in reverse activation order, closing the endpoint and releasing the lease.

`acryl-control` now re-exports the shared Cordis runtime types used by this
consumer composition. This prevents the workspace-local Yarn dependency copies
from splitting the TypeScript Cordis identities of the host context and the
control-service classes.

Primary implementation and verification:

- `acryl-tui/src/host/direct.ts`
- `acryl-tui/tests/direct.spec.ts`
- `corepack yarn workspace acryl-control check`
- `corepack yarn workspace acryl-tui check`

---

## 2026-08-26 - ACRYL control-plane foundation services completed

**Commit:** [`f3e4567efeb9a4e230eae431e1e8f1a3ccf7772b`](https://github.com/acryldev/acryl/commit/f3e4567efeb9a4e230eae431e1e8f1a3ccf7772b)

The `acryl-control` workspace now provides the full host-neutral control plane
that the terminal, GUI, and Web peer hosts will consume. Each service is a
replaceable Cordis capability with its own contract, provider, and
lifecycle-owned resources, verified through failing-then-passing tests and
20-cycle leak checks.

Delivered in this slice (oldest to newest):

- control contracts (`cace1a2`): generation-scoped `ControlEndpoint`,
  `ControlCapability`, canonical JSON envelope with runtime validation, and
  typed `ownership`/`operations` records.
- runtime architecture projection (`d61a3ce`): a bounded
  `RuntimeArchitectureSnapshot` that reads native Cordis Fiber/service/effect
  state directly - no parallel registry - with Fiber, service, effect-depth,
  and label limits.
- plugin lifecycle control (`26e3727`): a host-neutral controller over
  `ctx.loader` with an injectable mutation policy and persistence adapter;
  enable/disable/reload receipts, protected-row rejection, settlement, and
  persistence rollback on failure.
- agent control service (`97d0e72`): a provider-neutral `acrAgentControl`
  definition with capability rejection, identity separation (worker/runtime/
  provider-session), cancellation, structured results, and truthful
  dsh-native/codex/claude/acp capability profiles whose transports are the
  Phase 8 vendor seam.
- local control protocol endpoint (`f3e4567`): a Unix-socket/loopback-HTTP
  endpoint created inside one effect, with generation negotiation, capability
  negotiation, bounded bodies, and connection/server disposal.

Primary implementation and verification:

- `acryl-control/src/{contracts,ownership,architecture,lifecycle,agent,protocol}/`
- `acryl-control/tests/*.spec.ts` (34 tests)
- `corepack yarn workspace acryl-control check`
- `corepack yarn check:layout`

---

## 2026-08-26 - Canonical `acryl` command workspace established

**Commit:** [`e12a4172ff21a36be94a29bc53b2016ba8c3f636`](https://github.com/acryldev/acryl/commit/e12a4172ff21a36be94a29bc53b2016ba8c3f636)

The `acryl-tui` workspace now owns the canonical `acryl` executable boundary.
Its strict parser defaults to the TUI, supports the approved `tui`, `gui`, and
`web` peer-host commands, accepts explicit profile selection and machine-output
mode, and rejects ambiguous aliases, duplicate options, and missing values.

OpenTUI `0.5.8` and its required tree-sitter peer are pinned in the outer Yarn
workspace. The package records the upstream runtime floor (Bun 1.3.0+ or Node
26.4.0+) without changing the Node 22/24 line used by the DSH control plane and
Electron product. Build, typecheck, test, and repository layout gates now
include both new ACRYL workspaces.

Primary implementation and verification:

- `acryl-tui/src/cli/grammar.ts`
- `acryl-tui/tests/grammar.spec.ts`
- `corepack yarn workspace acryl-tui check`
- `corepack yarn check:layout`

---

## 2026-08-26 - ACRYL profile-ownership foundation added

**Commit:** [`0b70845da4ed4ae721b2d23c20e25485fdc62eb5`](https://github.com/acryldev/acryl/commit/0b70845da4ed4ae721b2d23c20e25485fdc62eb5)

The first implementation slice of the standalone-agent milestone adds the
host-neutral `acryl-control` workspace and an atomic profile lease store. One
terminal, GUI, or Web generation can acquire a profile; simultaneous contenders
observe the complete winning lease and become attach candidates instead of
starting competing writable runtimes. Release validates the owner generation
and unpredictable nonce before withdrawing the lease.

The lock is published by atomically renaming a fully written private candidate
directory, so readers never observe a half-written record. Profile names are
hashed for state-directory isolation, records and directories use private file
modes, and the package remains on the existing DSH Node runtime line. A
100-contender race test proves exactly one winner, and focused build,
typecheck, test, and repository layout gates pass.

Primary implementation and verification:

- `acryl-control/src/ownership/lease-store.ts`
- `acryl-control/tests/ownership.spec.ts`
- `corepack yarn workspace acryl-control check`
- `corepack yarn check:layout`

---

## 2026-08-26 - Standalone ACRYL agent and peer-host architecture approved

**Commit:** [`8f9908786f1cd20c2b8df72b3c40e9fa97c14af4`](https://github.com/acryldev/acryl/commit/8f9908786f1cd20c2b8df72b3c40e9fa97c14af4)

ACRYL now has an approved product milestone for three peer host compositions:
`acryl` as the canonical command and default terminal agent, `acryl-gui` as
the Electron convenience launcher, and `acryl-web` as the Web convenience
launcher. The terminal product is a full interactive agent and operational
control surface rather than a wrapper around the existing one-shot headless
runner or an external Terminal.app shell.

The approved architecture reuses the pinned DeepSeek Harness agent spine,
durable sessions, trajectory, tools, jobs, workflows, compaction, subagents,
permissions, and existing Codex and Claude Code provider seams. ACRYL-owned
plugins supply terminal presentation, host-neutral lifecycle and architecture
control, installation, recovery, and additional interchangeable providers for
Gemini, OpenCode, and local runtimes. The upstream `deepseek-harness/`
submodule remains unmodified.

When no process owns the selected profile, `acryl` runs the Cordis composition
in-process. When the GUI or Web host already owns it, `acryl` attaches through
an authenticated local control boundary instead of starting a competing
writable runtime. A minimal bootstrap retains profile selection, ownership,
Loader startup, and recovery; independently reversible Cordis plugins own the
higher-level terminal experience.

This checkpoint records approved architecture and scope, not completed product
implementation. The milestone specification and validation are in
`specs/018-acryl-control-hosts/`.

---

## 2026-08-26 - Lean CI and release-candidate automation established

**Commit:** [`2b8636be77d0cbf649b6100adb6c3549e64881a8`](https://github.com/acryldev/acryl/commit/2b8636be77d0cbf649b6100adb6c3549e64881a8)

GitHub Actions now runs one fast Ubuntu verification job for pushes and pull
requests targeting `main`. It installs the immutable Yarn workspace, validates
repository layout and documentation invariants, typechecks, runs the complete
unit suite, and builds all shipped workspaces. Concurrency cancellation keeps
superseded branch runs from wasting time.

Expensive native packaging no longer runs on every product change. A separate
Release Candidate workflow runs only for `v*` tags or explicit manual dispatch,
verifies native packaging, and retains Windows installer/portable and unsigned
macOS smoke artifacts for seven days. It intentionally does not publish a
GitHub Release or require signing credentials during rapid development.

Primary implementation and verification:

- `.github/workflows/ci.yml`
- `.github/workflows/release-candidate.yml`
- `acryl-desktop/tests/package.spec.ts`
- `go run github.com/rhysd/actionlint/cmd/actionlint@latest .github/workflows/*.yml`
- `corepack yarn check:layout`
- `corepack yarn typecheck`
- `corepack yarn test`
- `corepack yarn build`

---

## 2026-08-26 - Product identity migrated from ACR to ACRYL

**Commit:** [`c8082fb2284b9f66aa86820b6f644948f3247676`](https://github.com/acryldev/acryl/commit/c8082fb2284b9f66aa86820b6f644948f3247676)

The independent product is now consistently named **ACRYL** across application
chrome, native menus, recovery surfaces, settings, terminal guidance, update
artifacts, package metadata, repository documentation, and specifications. The
application identity is `dev.acryl.desktop`, development state is isolated under
`.dsh-acryl` and `ACRYL Development`, and release artifact names use ACRYL.
Technical `@deepseek-ai/*`, DSH protocol, and pinned upstream identities remain
unchanged where they are dependency contracts rather than product branding.

The supplied transparent black and white ACRYL marks now drive light/dark
sidebar branding. Deterministic generation produces the application, macOS, and
tray assets from those sources, with integrity and packaging assertions in the
Desktop test suite. Repository paths and internal ACRYL-owned examples were
renamed alongside their references.

Primary implementation and verification:

- `acryl-logo.png`, `acryl-logo-white.png`
- `acryl-desktop/scripts/generate-acryl-brand.mjs`
- `acryl-desktop/src/client/acryl-brand.tsx`
- `acryl-desktop/tests/client-acryl-brand.spec.ts`
- `acryl-desktop/tests/package.spec.ts`
- `corepack yarn check`

---

## 2026-08-25 - Native Cordis Architecture explorer added

**Commit:** [`fda026aceae1fff630e6cec160ac8ffaac2bae26`](https://github.com/AgentContextRelay/acr/commit/fda026aceae1fff630e6cec160ac8ffaac2bae26)

Settings -> Plugins now includes an **Architecture** tab before Lifecycle. It
projects the two actual Cordis 4.0 contexts independently and shows every live
Fiber instance, native UID and parentage, lifecycle phase, Loader ownership,
`inject` resolution, provided services, and labeled `ctx.effect()` ownership.
Repeated mounts remain distinct, and Host and Client instances are never
merged by display name.

The explorer introduces no parallel plugin descriptor, lifecycle registry, or
cached graph. Host state is projected through a bounded same-origin route;
Client state is projected directly from the renderer Context. Service values,
plugin configuration, callbacks, private failures, and paths never cross the
boundary. Lifecycle mutation remains Loader-oriented and protected, with
Development Canvas as the first reviewed mutable dual-face plugin.

Primary implementation: `acryl-desktop/src/plugin-architecture-*` and
`acryl-desktop/src/client/PluginArchitectureSettingsTab.tsx`. Specification:
`specs/017-cordis-architecture-explorer/`. Verification passed through the full
`corepack yarn check` gate, including 796 Desktop tests, 274 Market tests, 18
Canvas tests, build, typecheck, Loader/profile boot, runtime closure, bilingual
document checks, and license validation.

## 2026-08-25 - Cross-plane plugin lifecycle control added

**Commit:** [`1de0e0d425ff798035bb1515a58ab8caeb054cce`](https://github.com/AgentContextRelay/acr/commit/1de0e0d425ff798035bb1515a58ab8caeb054cce)

Settings -> Plugins now has a Desktop-owned **Lifecycle** tab alongside the
upstream read-only inventory. Every Host Loader row reports configuration,
Host root Fiber phase, Client-face capability, current Client root Fiber phase,
and whether the row is mutable or protected.

`PluginLifecycleController` keeps Loader and Fiber state authoritative. For an
admitted entry it persists the desired enablement in Desktop-private,
profile-scoped state, applies the live Host Entry update without Loader
write-back, awaits cleanup or activation, and rolls persistence back if the
runtime transition fails. The renderer then reloads against the recomposed Web
boot graph so Client Fibers, styles, and slots match the Host generation.

Development Canvas is the first mutable entry and exposes Enable, Disable, and
Reload. Internal, nested, generated, and control-plane rows remain visible but
protected until they have stable persistence identities and verified recovery
paths. The Desktop Host also registers `/reload [loader-entry-id]`; without an
argument it reloads every mounted managed ACRYL plugin and requests an orderly
Desktop restart.

Primary implementation and verification:

- `acryl-desktop/src/plugin-lifecycle-{state,controller,route,contract}.ts`
- `acryl-desktop/src/client/plugin-lifecycle-*`
- `acryl-desktop/src/client/PluginLifecycleSettingsTab.tsx`
- `specs/016-plugin-lifecycle-control/`
- `docs/architecture.en.md`
- focused persistence, profile, Host lifecycle, route-security, and Client
  boundary tests
- complete `corepack yarn check` with 1,075 tests passing and 4 skipped

## 2026-08-25 - Canvas preserves DSH session navigation

**Commit:** [`51ecf33d6a78bdd63b4140fb3e6596ef924deb94`](https://github.com/AgentContextRelay/acr/commit/51ecf33d6a78bdd63b4140fb3e6596ef924deb94)

Canvas now follows the root Session projection supplied by the standard Client
slot contract. Selecting another Session focuses the Chat tab, and reselecting
the current blank Session through New Session restores Chat even when the user
previously closed it. Ordinary updates to a non-blank current Session do not
steal focus from terminal, file, or browser tabs.

The exact headed Electron regression was reproduced and verified: close Chat,
click New Session, and confirm that a Chat tab and the upstream composer return.
The fix uses the existing reactive Session projection and adds no polling,
module-global state, or dependency on Desktop implementation.

## 2026-08-24 - Desktop launch now builds and verifies standalone Canvas

**Commit:** [`49d790fc9bc19373dd32e94946166e7a5caa04e8`](https://github.com/AgentContextRelay/acr/commit/49d790fc9bc19373dd32e94946166e7a5caa04e8)

The initial standalone Canvas extraction left `yarn dev` building Desktop but
not Canvas. A clean launch therefore reached the Cordis Loader without
`acryl-development-canvas/lib/index.js` and Electron aborted before the
window became usable.

Desktop development, direct checks, and directory packaging now build Canvas
first. Development launch also runs the headless Loader verification before
starting Electron. That verification resolves the Canvas package from the
installed-launcher boundary and imports its public Host entry, so missing or
stale Canvas output fails before a graphical process is started.

The exact root `yarn dev` path was exercised from the missing-artifact state and
successfully kept Electron alive without a Loader or module-resolution error.

## 2026-08-24 - Development Canvas extracted as a standalone Cordis plugin

**Commit:** [`2e5b4d1009f0c1c64dd0a2f1f6d470ed0b55b573`](https://github.com/AgentContextRelay/acr/commit/2e5b4d1009f0c1c64dd0a2f1f6d470ed0b55b573)

Development Canvas no longer lives as a Host subpath and Client child inside
`acryl-desktop`. It now owns the independent
`acryl-development-canvas` workspace, package, bundle patch, Host entry,
Client entry, native PTY dependency, styles, and tests.

Desktop exposes one small `desktop.main` slot and contributes the upstream
conversation as a priority-100 fallback. Canvas contributes at priority 0
through `ctx.slots.inject`. Removing or disabling the Canvas Loader row now
removes its Host and Client Fibers and restores conversation without a status
route, polling timer, module-global presence store, or Desktop import of Canvas
implementation.

Host activation rolls back earlier routes when later registration fails. Host
disposal removes routes and awaits every PTY. The Client declaration effect
owns its slot, styles, and tracked PTY sessions, including asynchronous starts
that settle during disposal.

Primary implementation and verification:

- `acryl-development-canvas/`
- `acryl-desktop/src/client/contracts.ts`
- `acryl-desktop/src/client/advanced-shell.ts`
- `specs/015-development-canvas/cordis-plugin-extraction.md`
- `docs/cordisplugins/development-canvas-plugin.md`

## 2026-08-23 - Agent control surface constrained to Cordis architecture

**Commit:** [`634ae192793652f327625025f43fcdb0c990ced9`](https://github.com/AgentContextRelay/acr/commit/634ae192793652f327625025f43fcdb0c990ced9)

The planned programmatic control surface for Development Canvas agents now has
an explicit Cordis architecture contract. The design was checked against the
pinned Cordis Context, Registry, Fiber, Primer, complete tutorial, service
dependency guide, and three-role capability guide.

The control surface must use a stable Cordis Service Definition, reversible
provider registrations, and consumers connected through `inject`. ACP, vendor
SDK/API, structured CLI, and PTY integrations become replaceable Service
Providers. Canvas and orchestration are Consumers and must not import concrete
providers. Composition uses stable Loader rows and service dependencies rather
than YAML order.

The contract also separates Canvas tab, ACRYL worker, runtime, PTY, and opaque
provider-session identities; requires truthful capability negotiation; keeps
raw terminal text out of semantic conversation history; and compiles handoffs
from canonical ACRYL room state. All process, connection, route, listener, timer,
and adapter resources must be owned by Cordis effects and reach quiescence on
fiber disposal or replacement.

Primary design:

- `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`
- `AGENTS.md`

## 2026-08-14 - Development Canvas becomes an independent Cordis capability

**Commit:** [`84ab0768745b6773d3408b4df1b0fa229ad469c4`](https://github.com/AgentContextRelay/acr/commit/84ab0768745b6773d3408b4df1b0fa229ad469c4)

### What was added

Advanced mode gained an Orca-inspired Development Canvas that replaces the
main content area with one active tab and a `+` launcher. It can open:

- native PTY shell tabs;
- interactive coding-agent tabs for Claude, Codex, OpenCode, Gemini, Pi, Grok,
  Aider, Goose, Amp, Kimi, Cursor, Hermes, and Qwen Code;
- in-memory file editor tabs;
- embedded browser tabs;
- the canonical conversation as a Chat tab.

Terminal and coding-agent tabs use `node-pty` and xterm.js. This gives agent
CLIs a real TTY, byte-level input, ANSI and alternate-screen rendering, resize
propagation, and process cleanup when a tab closes.

### Plugin architecture clarification

Development Canvas is a Cordis plugin, but it is not mounted as a child of the
Desktop plugin at runtime. The composition is flat:

```yaml
- id: desktop-shell
  name: acryl-desktop

- id: desktop-development-canvas
  name: acryl-desktop/development-canvas
```

These rows create independent sibling fibers. Removing or disabling the Canvas
row removes its Host routes, terminates its PTYs, removes its Client presence,
and restores the ordinary advanced conversation surface.

The source is colocated in the `acryl-desktop` package because it consumes
desktop-owned Host and Client capabilities. The package therefore contains
multiple independently loadable Cordis entry points. This is not a runtime
"plugin inside a plugin" relationship.

Cordis itself also supports real child plugins through `ctx.plugin()`. The
upstream lifecycle tutorial demonstrates a plugin calling
`ctx.plugin(heartbeat)` and documents recursive child cleanup. That supported
mechanism is distinct from the flat composition used by Development Canvas.

### Primary implementation

- Host plugin: `acryl-desktop/src/development-canvas.ts`
- Client plugin: `acryl-desktop/src/client/development-canvas/plugin.ts`
- Canvas UI: `acryl-desktop/src/client/development-canvas/DevelopmentCanvas.tsx`
- Canvas state: `acryl-desktop/src/client/development-canvas/state.ts`
- PTY provider: `acryl-desktop/src/canvas-pty.ts`
- PTY routes: `acryl-desktop/src/canvas-pty-route.ts`
- Composition: `acryl-desktop/cordis.patch.yml`
- Feature specification: `specs/015-development-canvas/`
- Plugin documentation: `docs/cordisplugins/development-canvas-plugin.md`

### Verification and current limits

Tests cover plugin activation and disposal, PTY TTY allocation, input, resize,
cleanup, and Canvas tab state. Host and Client typechecks and production
bundles passed. A real Claude CLI smoke confirmed interactive output without
falling into noninteractive print mode.

File tabs are still in-memory buffers and need the DSH filesystem capability
for durable load/save. Browser tabs use iframes, so sites that prohibit
embedding cannot render there.

---

## 2026-08-13 - DeepSeek Harness and Cordis adopted as the ACRYL substrate

**Commit:** [`9a3ce7eb0793ffad8755db76071d6e4a291fe742`](https://github.com/AgentContextRelay/acr/commit/9a3ce7eb0793ffad8755db76071d6e4a291fe742)

ACRYL adopted an unmodified, pinned DeepSeek Harness checkout as its runtime
substrate and chose Cordis as the composition and lifecycle kernel. The outer
repository became an isolated Yarn workspace containing the Desktop package,
community interoperability work, community market work, specifications, and
agent workflows. The upstream `deepseek-harness/` checkout remains a read-only
Git submodule with its own pnpm workspace.

The architectural direction established here is that ACRYL owns persistent
project continuity while agent sessions are replaceable workers. Capabilities
should be expressed as independently composable plugins and providers with
explicit dependencies and reversible effects.

Primary locations:

- Desktop product: `acryl-desktop/`
- Pinned upstream: `deepseek-harness/`
- Capability specifications: `specs/`
- Architecture and onboarding: `docs/`
- Runtime composition: `acryl-desktop/cordis.patch.yml`

---

## 2026-08-05 - Cordis and persistent ADE architecture researched

**Commit:** [`55e27d150f016848d0594798c19963b3e819c3df`](https://github.com/AgentContextRelay/acr/commit/55e27d150f016848d0594798c19963b3e819c3df)

The project evaluated Cordis spatiotemporal composability and DeepSeek Harness
as foundations for an agent-agnostic Agentic Development Environment. The work
captured the lifecycle model, service injection, reversible effects, event
composition, capability replacement, and the boundary between persistent ACRYL
state and disposable coding-agent sessions.

This research produced the initial ACRYL orientation, Cordis specification,
architecture study, composability-paper notes, and ACRYL versus DSH gap analysis.
It established the evidence used by the later substrate-adoption decision.

Primary locations:

- `docs/onboarding/orientation_spec_acryl.md`
- `docs/cordis/cordis_spec.md`
- `docs/cordis/`
- `docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md`
