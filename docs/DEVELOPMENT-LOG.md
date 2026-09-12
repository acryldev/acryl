## 2026-09-11 - Release v0.1.37 prepared for all ACRYL surfaces

Commit: `55c80d810884ab4249d61a5866aaed7abf70acea`

Synchronized the root, control plane, Harness runtime, CLI, Web, Desktop, and
npm launcher package versions to `0.1.37`. This release contains the DSH
`0.1.5-alpha.1` upgrade, the first swappable DSH engine extraction, the ACRYL
Package Catalog and managed Desktop installation path, universal profile-bundle
hot reload, and the Desktop root-slot boot-order recovery fix. The release tags
`v0.1.37` and `desktop-v0.1.37` promote the CLI/Web/npm and Desktop matrices.

## 2026-09-09 - DSH bumped to v0.1.5-alpha.1

Commits: `712b957181ce2e371fffdf35c465ee027c8b6d54`,
`9d182f503cb3a96a8187efb4206a5dd37261a31d`,
`a36d49ab83f305a68fe9ca521c5a8ecea4cb2253`,
`8d6e8bc7ea1590cff68b82f9b80431240b0f59b8`,
`779c91b37a8af89532adadd357cd899f078c160d`

Bumped the pinned `deepseek-harness` submodule and every
`@deepseek-ai/dsh-*`/`cordis-plugin-*` dependency from `0.1.1-rc.2` to
`0.1.5-alpha.1` (upstream commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`,
430 commits of pre-stable-API upstream work), regenerated all 6 patches this
repo carries, and worked through every resulting compile/test break across
`acryl-cli`, `acryl-harness-runtime`, `acryl-desktop`, `acryl-development-canvas`,
and `dsh-community-market`. All ten `debt:check` architecture guardrails,
the full workspace typecheck, and the full test suite are green.

The single largest behavioral change: session format v2 no longer persists a
per-token `assistant/chunk` event in the durable log — live in-progress typing
now arrives via the process-local, non-durable `agent/assistant-stream` Cordis
event instead, with the durable settlement carrying the same stream (embedded
`AssistantStreamRecord[]`) only once an attempt commits. `acryl-harness-runtime`
gained `AcrylSessionBridge.subscribeAssistantStream`; `acryl-cli`'s `TuiStore`
gained `appendAssistantStreamFrame`, keyed by `attemptId` so a stale frame
from a superseded attempt cannot corrupt the current one.

Also migrated three packages off the removed `dsh-client-runtime` (split into
`Context` from `@deepseek-ai/cordis`, `dsh-api-workspace-controller/client`,
`dsh-client-ui-settings/client`, and the new `dsh-client-store`); re-ported
the hand-patched native directory-picker feature onto the new minified
`dsh-client-ui-directory-picker-browse` bundle (`ctx.workspaces.*` renamed to
`ctx.uiWorkspace.*`); retargeted the Windows restricted-shell
console-visibility patch from `dsh-sandbox-windows-acl` onto the new
`dsh-win32-process` package that now owns that spawn code; and dropped the
`dsh-client-ui-trajectory` localization patch as obsolete (upstream now ships
its own Simplified Chinese toolbar labels).

Follow-up for the user: manually click through the Desktop settings' native
directory-picker dialog to visually confirm the re-ported patch still works —
a minified UI patch could not be visually tested in this environment.

Primary locations:

- Submodule pin: `deepseek-harness/`, `upstream.json`
- Patches: `patches/`, `pnpm-workspace.yaml`
- Live-typing migration: `acryl-harness-runtime/src/session-bridge.ts`,
  `acryl-cli/src/tui/store.ts`
- `dsh-client-runtime` migration: `acryl-desktop/src/client/`,
  `acryl-development-canvas/src/client/`, `dsh-community-market/src/client/`
- Layout gate: `scripts/verify-layout.mjs`

## 2026-09-08 - Public README names the three actual ACRYL surfaces

Commit: `cd39729b1da9d58d89312e34ddbcf1f3442f1141`

Corrected the public surface diagram and installation language in `README.md`:
ACRYL has a Desktop GUI, one CLI terminal surface, and a local Web surface.
The TUI is the CLI's renderer, not an independent fourth product surface.

## 2026-09-08 - AGENTS.md: clean-architecture / DDD discipline rules

Commit: `f250b6a`

Added a `## Architecture and clean-code discipline (engineering books)` section
to `AGENTS.md` (mirrored by `CLAUDE.md` via symlink), encoding the
ACRYL-specific interpretation of Clean Architecture (Robert C. Martin) and
Implementing DDD (Vaughn Vernon) — the same references the repo's own
`AGENTS.md` precedence rules point to, and the discipline the
`specs/001-acryl-refactor-improvements-and-tech-debt` ledger's guardrails
enforce. It covers (a) boundaries — surfaces never own domain/credential/auth
logic, typed services only (no `any`), no state encoded into user-visible
names, one projection per state; (b) models/language — small immutable value
objects, one exported type per concept, one term one meaning; (c) functions
and state — pure `render()`, discriminated-union view state, no generic
`utils/` dumping grounds, depend inward; (d) checkpoints/honesty — green
reversible commits, keep the spec ledger current. Precedence is explicit: the
constitution, Cordis guide, and ACRYL control-surface design win; this section
is coding-style and boundary discipline, not a second architecture.

## 2026-09-08 - pnpm devEngines declaration makes the version contract explicit

Commit: `65938ce`

Declared the pinned `pnpm@11.8.0` in `package.json` `devEngines.packageManager`
with `onFail: warn`. The root scripts call bare `pnpm`, so when the active
pnpm on `PATH` differs from the pinned (e.g. a global install shadowing
corepack), pnpm's version guard hard-failed with a cryptic corepack message
and blocked the whole headless gate. Declaring `devEngines.packageManager`
makes the contract explicit and downgrades the guard to a `[WARN]`, so
`corepack pnpm run check` proceeds and still surfaces a mismatch. Verified:
`corepack pnpm run typecheck` now exits 0 instead of dying at the guard.

## 2026-09-08 - 001 tech-debt ledger: Phases 1-5 closed, all 10 architecture guardrails green

Commits: `401eb7a`, `10ba1b6`, `c1d0a09`, `8ba5ac4`, `ee90704`, `6ae507e`,
`a7a7f57`, `6acd9c7`.

Closes the credential/authorization boundary move that Phase 0 (previous
entry) staged for: `acryl-cli/src/tui-app/session.ts` no longer owns
authorization/credential domain logic.

**Phase 1 — the boundary move.** New `acryl-control` seam:
`credential/{types,projection}.ts` exports one `AuthMethod` and
`computeCredentialProjection()` — the single join of `ctx.llm` +
`ctx.settings` + `ctx.credentials` that `/login` and `/model` both now
read, replacing session.ts's independent `computeProviderRows`/
`loadAuthorizationFlows` duplicates (finding R1/R3). `authorization/service.ts`
exports `AuthorizationService.begin()`: forwards to the underlying
authorization port, activates the route on success via an injected
`RouteActivationPort`, and notifies a `credential.changed` listener instead
of the surface re-running both loaders (R4). Critically, the `-oauth`
display-name suffix and the retroactive repair loop it needed — the exact
mechanism that corrupted three provider names into 400-560KB strings,
per the Phase-0-adjacent incident already logged — are **deleted, not
moved**: route activation now only ensures a settings profile exists so the
route registers live; `authMethod` renders as data (a `[oauth]`/`[api]`
badge), never encoded into the visible name (R2). 9 new unit tests in
`acryl-control/tests/`.

**Phase 2 — type the domain concepts.** The 4 duplicated
`'oauth' | 'api-key'` literal unions (`login/types.ts`,
`modelProfile/types.ts` x2, `LoginOverlay.ts`'s private `AuthType`) and the
bare `method?: string` at `actions.ts`'s `beginAuthorization` seam are gone,
replaced by `acryl-control`'s exported `AuthMethod` (R5). All 19 `: any`
service handles in `session.ts` replaced by typed local ports
(`SettingsServicePort`/`CredentialsServicePort`/`LlmServicePort`/
`AuthorizationListPort`/`AgentPresetsServicePort`, extending
`acryl-control`'s narrower credential/authorization ports where they
overlap) (R9).

**Phase 3 — UI/state hygiene.** New `acryl-cli/src/tui/listWindow.ts`
extracts the `listWindow`/`visibleRange` algorithm duplicated verbatim in
`LoginOverlay.ts` and `ModelProfileOverlay.ts` into one tested helper (R7).
`LoginOverlay`'s 6-field loose cluster (`step`/`authType`/`authTypeCursor`/
`chooserSkipped`/`autoSkipChecked`/`listCursor`/`searchQuery`) is now one
discriminated-union `view: LoginViewState`
(`{kind:'authType',cursor}|{kind:'list',authType,chooserSkipped,cursor,
searchQuery}`) (R8); `render()` is pure — the auto-skip decision
(`autoSkipAuthType`/`effectiveView`) is a fresh computation every call, no
longer a mutation inside `render()`, which also fixes a real staleness bug
(a refreshed flow set couldn't previously re-trigger the skip once
`autoSkipChecked` latched) (R6). Verified with an interactive node-pty
smoke test driving the actual chooser -> list -> back navigation, not just
a typecheck.

**Phase 4 (optional).** `scripts/update-upstream.mjs` now records
`runtimePackageVersion` alongside `sourceVersion` at every sync, so future
upstream syncs stop the two drifting; today's pre-existing divergence
(`sourceVersion` 0.1.3-alpha.2 vs `runtimePackageVersion` 0.1.1-rc.2) is
deliberately left unforced — reconciling it means bumping ~100 `dsh-*`
dependency ranges to an unpublished npm family, its own reviewed step.
`T022` (draining `acryl-desktop`'s own harness composition into
`acryl-harness-runtime`) stays PENDING, blocked on the M3 ledger.

**Phase 5 — proof & close.** `debt:check` (the guardrail script) wired
into `.github/workflows/ci.yml` and local `pnpm run check`, so a future
regression on any closed finding fails the gate. All 10 guardrails
(G1-G10) report PASS; `corepack pnpm run check` passes plainly end to end.
The ledger stays **Active** — it is a standing, cyclic home for ACRYL debt,
not a one-shot feature; this batch is closed, `tasks.md` reflects it, and
T022 is already queued as the next item once its dependency lands.

## 2026-09-08 - acryl-tui renamed to acryl-cli; 001 tech-debt ledger opened, Phase 0 closed

Commits: `42c4177`, `79fc28c`, `8d73826`, `7c460f8`, `f03586c`, `f03b28a`,
`7926b4d`, `1818f50`, `cd2f269`, `3758809`.

**Surface rename.** `acryl-tui` renamed to `acryl-cli` across the folder,
package name, `pnpm-workspace.yaml`, CI workflows, release/build scripts,
the user-facing CLI string + its test, and current docs/specs (`docs/DEVELOPMENT-LOG.md`
and `docs/handoff/*.md` deliberately left as historical record). A pending,
previously-uncommitted scripts reorg (CLI-owned scripts/launchers/tests moved
into `acryl-tui/` proper) was landed first so the rename started from a clean
tree. Verified end to end: workspace typecheck/test across all packages,
`verify-layout.mjs`, and a real `darwin-arm64` CLI archive built and
smoke-tested (`--version`, `tui --json`, the TTY-guard message).

**001 technical-debt ledger opened.** `specs/001-acryl-refactor-improvements-and-tech-debt/`
is now the standing, cyclic home for ACRYL refactoring/tech-debt/stability
work (spec, plan, research R1-R14, tasks T001-T024, and
`proof/architecture-guardrails.mjs` — 10 static guardrails G1-G10, one per
major architecture finding). Phase 0 (hygiene, T001-T008) closed:
- Workspace install reconciled so the headless gate passes without `CI=true`.
- `acryl-cli/tests/tui/login-preview.spec.ts` committed (was untracked).
- `deepseek-harness` submodule pointer reconciled: gitlink, `upstream.json`,
  and the checkout now all agree at `b4c7f9a2c5` (a local fork fix moving
  `dsh-attachment`/`dsh-invariants` to dependencies) — pinned there per
  explicit direction rather than rolling back to the older recorded commit.
  Also fixed a truncation-length bug in the G10 guardrail's own SHA
  comparison (fixed 7-char slice vs `git rev-parse --short`'s variable
  length) that made it possible to FAIL even when the three values agreed.
- `verify-layout.mjs`'s `runtimePackageVersion` family check extended from
  `acryl-desktop`-only to every manifest declaring `dsh-*` deps; the shipped
  agent-presets submodule read made loud (fails instead of silently
  shrinking `/presets` when the source directory is missing).
- `scripts/web-run.mjs` moved to `acryl-web/bin/dev-run.mjs` for launcher
  symmetry with `acryl-cli/bin/dev-run.mjs`.
- `specs/024-acryl-cli-login` reconciled with the shipped two-step `/login`
  design (auth-type chooser + fuzzy-searchable provider list), superseding
  the stale single-list description without erasing the original tasks.
- A stale bilingual-doc hash record (`.agents/notes/.../2026-08-15-*.i18n.yaml`)
  refreshed after the rename touched both language sides identically.

`corepack pnpm run check` and `check:layout` both pass plainly (no
`CI=true`). The guardrail script now reports 8/10 RED — every remaining
failure is a Track B (Phase 1-3) architecture-move item, not a hygiene gap.
Track B (the credential/authorization boundary move) is next.

## 2026-09-08 - ACRYL owns its own home; /model and /login gain real edit/auth flows; v0.1.32 released

Commits: `6c5e700`, `7fcd219`, `fa9f973`, `0205a3d`, `84a9606`, `8a25457`,
`008921d`, `4460e15`, `c9a898a`, `d4368c8`, `8b0c902`, `d4c4f23`, `76dbe41`,
`466371c`, `95f1ab4`, `2f4d379`, `eb98cb0`, `c0f80da` (tag `v0.1.32`).

**Home separation.** Every ACRYL surface (CLI/TUI, web, desktop) previously
defaulted to plain `~/.dsh` — the same home a stock DSH Desktop install
(dshdesktop.com) uses, so the two products silently shared credentials,
settings, and sessions on one machine. Added `resolveAcrylDshHome()`
(`acryl-harness-runtime/src/acryl-home.ts`), defaulting to `~/.acryl/.dsh`
instead (`~/.acryl/.pi` reserved for a future pi.dev engine; an explicit
`$DSH_HOME` still wins). The isolated local-dev launcher moved to its own
sibling root, `~/.acryl-dev/.dsh`, so an isolated dev run can never collide
with a real install's home either.

**A real, reproducible infinite-loop bug.** The `-oauth` display-name suffix
added for OAuth-signed-in routes was not actually idempotent:
`loadAuthorizationFlows`'s retroactive-repair pass set `repaired = true` on
every completed call regardless of whether anything was written, then
unconditionally called `refreshCredentialState()` → `loadAuthorizationFlows()`
→ the same repair pass, forever. Every iteration reset `/model`'s list
selection to 0 and re-suffixed an already-suffixed name; three provider
display names grew to 400–560KB each of repeated `-oauth-oauth-oauth…`
before the loop was caught, corrupting `~/.dsh/settings.yaml` to 1.5MB —
and, because ACRYL and the stock DeepSeek Desktop app were still sharing
that file at the time, corrupting the stock app's own settings too. Fixed by
making `ensureProviderActivated` return whether it actually wrote (not mere
completion), so the repair loop terminates once every provider is caught up;
both files were repaired directly. A related, separately-diagnosed bug fed a
plain API key into an OAuth-only request path (`apiKeyEnv` always wins over
OAuth by design, and a stray leftover `apiKeyEnv` sat alongside two OAuth
grants) — root-caused via a live diagnostic patch on the vendored
`@earendil-works/pi-ai` package after an earlier attempt silently failed
(`require()` inside an ES module).

**`/model` and `/login` UX.** Bare-letter shortcuts (`a`/`d`/`m`/`s`) on the
provider list replaced with Ctrl-combos (`ctrl+n`/`ctrl+x`/`ctrl+e`/`ctrl+a`;
never `ctrl+m`, byte-identical to Enter in virtually every terminal). Fuzzy
search added to the providers list (previously arrow-key-only, unlike the
model picker). An already-configured provider now gets the same full edit
form as a new one — display name, base URL, protocol, and models are all
editable, not just the API key — with the API-key field hidden entirely for
an OAuth route rather than exposing the stray-`apiKeyEnv` footgun again.
Masked fields (both `/login`'s secret prompt and `/model`'s key field) now
reveal the first/last few characters instead of fully hiding the value, so a
field with something typed isn't indistinguishable from an empty one.
Selecting an already-configured provider in `/login` (Enter or `ctrl+e`) now
opens that edit form directly instead of a blind re-authentication screen.
`/logout` no longer silently guesses a provider from `/model`'s possibly-empty
overlay cache and deletes its credential with no confirmation — it opens the
provider list instead. `cancel()`'s failure path no longer swallows errors
silently.

**Branding.** The header's plain `'ACRYL'` text and the OAuth success/error
page's pi.dev logo (vendored inside `@earendil-works/pi-ai`, patched via
`pnpm patch` — the same mechanism already used for `pi-tui` in this
workspace) both now render the real pixelized ACRYL wordmark
(`assets/pixelized/`), via the SVG's own rect grid rendered natively as
half-block characters in the TUI and as an SVG in the web page — one shared
source of truth for the mark's shape, not two independent recreations.

**Build/dev tooling.** Every build now stamps its own commit + time
(`acryl-tui/scripts/generate-build-info.mjs`, wired as `prebuild`/
`pretypecheck`) into the TUI header — this session lost real time to stale
terminal tabs (including a week-old zombie `acryl` global-install process
still actively corrupting `~/.dsh` live) being tested against instead of a
freshly relaunched one, with no way to tell from a screenshot alone.
`pnpm run tui:rebuild` (`scripts/rebuild-tui-clean.mjs`) forces a clean
`acryl-tui` rebuild; `pnpm run tui:fresh` chains that into an immediate
launch. Also added `installSessionLogExporter` (a Cordis `ctx.logger`
exporter writing JSONL to `$DSH_HOME/logs/`) for CLI/TUI and web, and
restored `AcrylSessionBridge.selectModel` (dropped in an earlier revert),
which is what makes `/model`'s "set active model" actually change an
already-running session rather than only future ones.

Primary locations:

- `acryl-harness-runtime/src/acryl-home.ts`, `src/session-log-exporter.ts`
- `acryl-tui/src/tui-app/session.ts`, `src/tui/modelProfile/ModelProfileOverlay.ts`, `src/tui/login/LoginOverlay.ts`, `src/tui/miniTextField.ts`, `src/tui/acrylMark.ts`, `src/tui/TuiApp.ts`
- `acryl-tui/scripts/generate-build-info.mjs`, `scripts/rebuild-tui-clean.mjs`
- `patches/@earendil-works__pi-ai@0.82.1.patch`

## 2026-09-07 - mental model: factory / car / driver

Commit: `b4fb36aeb91665d96e9b96c5e22c43c095e269e1`

Added `docs/acryl/MENTAL-MODEL-factory-car-driver.md`, a canonical non-normative
framing for the engine-swap work. The factory (ACRYL) never changes and owns
continuity - room, context relay, task artifacts, worker identity, the canonical
durable session record, the capability-package format. The car (the harness
engine / `AcrylEngine`) is what M9 makes swappable (`dsh` <-> `pi`). The car's
subsystems (steering, dashboard, tools, memory) are Cordis plugins, swappable
independently by Loader row. The driver / brain is the LLM model, a separate
per-turn concern - "engine swap" never means the model. Records the DSH/Cordis
(modular) and pi.dev (minimal efficient core) philosophies, the caveat that the
car runs on rails *inside* the factory for its whole life (continuity is
retained by the building, not handed between cars), and the terminology clash
with the source diagram's "model" label. Linked from
`docs/onboarding/orientation_spec_acryl.md` §3 and `docs/ACRYL-ROADMAP.md` M9.

## 2026-09-07 - analyze + wayfinder follow-ups for the engine swap

Commits: `cac8f33` (028 `/speckit-analyze` fixes), `620a19c` + `80c3f25`
(`specs/000-wayfinding/issues/06-zero-harness-driver.md`).

Ran `/speckit-analyze` on `specs/028-harness-engine-swap`: 0 critical, 0 high;
applied 8 doc-consistency fixes (resolver name, `ctx.runtime.engine` shape, pi
pin now cites `research-pi-spike.md`, Cordis Law 7 row, `engine-collision`
assertion, an automated room/artifact-invariance task T028b, `AcrylEngineName`
package-ownership resolved before coding). Added Wayfinder ticket 06: the
Zero-Harness composable driver as a post-M9 candidate (a minimal engine that
composes pi-ai + Cordis + DSH prompt discipline and provisions task-scoped
Cordis tool-plugins in a freeze-then-run phase), with 6 open questions. The
same ticket records the settled decision to consume `pi` as pinned npm packages
(`optionalDependencies`, exact `0.85.x`), not a git submodule: updates happen
only on deliberate ACRYL-dev sync either way, but npm means adopting a published
release with a changelog rather than a raw, often mid-refactor commit range.

## 2026-09-07 - specify M9 hybrid DSH + Pi engine follow-on

Commit: `e6cad5254ab89a3dc1254ec4e83bb4e4c44a566f`

Added `specs/029-acryl-hybrid-engine/` as the separately scoped follow-on to
the DSH/Pi engine-swap ledger. It defines a real hybrid engine—not two
independent agent sessions—with one canonical ACRYL session, turn, cancellation,
and durable-record owner. The first composition has a declared, finite
capability matrix: DSH contributes established trajectory, goal, plan, approval,
and governed-tool behavior while Pi contributes its agent-loop behavior. Every
advertised capability has exactly one owner and durable DSH/Pi/hybrid
provenance. The ledger prohibits a second lifecycle authority, competing
durable writers, automatic arbitrary feature mixing, and unverified fallback.
Implementation remains dependent on `specs/028-harness-engine-swap/` providing
the engine-neutral single-engine contract.

## 2026-09-07 - roadmap M9: interchangeable harness engine (DSH and pi)

Commit: `4a703fe`

Added a new roadmap milestone. Until now ACRYL has one hard-wired engine:
DeepSeek Harness run in CLI mode, composed in-process as the single Cordis root
by `acryl-harness-runtime` via `startDirectHost()` (pi-tui is only a rendering
library, not the engine). M9 makes the engine - the owner of the agent loop,
durable sessions, tools, models, and approvals - a replaceable provider behind
`acryl-harness-runtime`. DSH-in-CLI-mode is engine #1; `pi` (`pi.dev` /
prime-agent) is engine #2; a declared DSH+pi composition is a later candidate.
Surfaces call only the engine-neutral `acryl-control` API, so M9 depends on M2.
The ACRYL room, context relay, task artifacts, and worker identity stay constant
across an engine swap; engine-native session stores become projections into
ACRYL durable state.

This is a decision-pending milestone: the grilling ticket *Lock the
interchangeable harness-engine destination (DSH <-> pi)*
(`specs/000-wayfinding/issues/04-lock-harness-engine-swap.md`) must resolve
before `specs/028-acryl-harness-engine-swap/` is created with `/speckit-specify`.

## 2026-09-02 - align exact PNPM pins to the 11.8.0 root release

Commit: `ea62ec13ced9268c2c9afc70b26dd12432469ef5`

The root `packageManager` was bumped to `pnpm@11.8.0` (dfaece1) but
`acryl-desktop` and `acryl-harness-runtime` kept an exact-pinned `pnpm: 11.7.0`
dependency and the release workflows pinned `pnpm/action-setup` at 11.7.0. The
typecheck job failed because lifecycle scripts inside those packages resolve
bare `pnpm` from `node_modules/.bin` (11.7.0), and that binary's version guard
rejects the root `packageManager` (11.8.0). Aligned the dependency pins, the
action-setup versions, and the package-surface test assertions; regenerated the
lockfile and third-party notices under 11.8.0 (the lockfile carries 11.8.0 peer
resolution IDs and the notices also refresh `acryl-control`/
`acryl-harness-runtime` to 0.1.26); updated the documented root PNPM release in
AGENTS.md, README*.md, the constitution, and the orientation spec. Verified with
a frozen-lockfile install and the root typecheck/test gate (806 passed, 0 failed,
plus 274 passed in dsh-community-market).

## 2026-09-01 - run the CLI on the host's Node

Commit: `15f28ef`

The CLI archive no longer bundles a Node runtime; it runs on the host's Node
(>=22.19.0) via a thin launcher. This halves the package (80MB -> 40MB archive,
~350MB -> ~219MB clean install) and clears the release clean-install size gate,
making `npm i -g acryl` fast. The release CLI smoke now uses the runner's Node
instead of a bundled runtime.

## 2026-09-01 - allow node-pty Windows ConPTY binaries in Web archives

Commit: `d56351d`

A first `v0.1.21` release run passed every surface except `web-windows-x64`:
the artifact verifier rejected `node-pty`'s embedded Windows ConPTY runtime
(`build/Release/conpty/*.exe`/`*.dll` and `third_party/conpty/*/win10-x64/*`)
as foreign native payload. The native allowlist now also accepts those
`node-pty` Windows binaries and the `win10-<arch>` vendor naming, extracted into
the testable `webNativeAllowlist`, with a regression test proving the opposite
architecture's vendored ConPTY is still rejected.

## 2026-09-01 - make Web target archives portable

Commit: `4a2b5ccdcea807a59200f882ed8106bf42e0a519`

Corrected the first target-Web CI attempt: release pruning now removes vendored
dependency test fixtures as well as source maps, native pruning recognizes
`node-pty`'s Windows ConPTY payload naming, target validation accepts native
files directly beneath a qualified path, Windows fetches the correct Node ZIP,
and Windows npm smoke uses command shims. A local darwin-arm64 Web archive now
builds and passes receipt/payload inspection.

## 2026-09-01 - build standalone Web package before coordinated publication

Commit: `11633261c1d4f911533c21eca0640fc05a5dc406`

Made the npm publication job install the pinned workspace and rebuild, typecheck,
and test `acryl-web` before publishing it. Target CLI packages still publish
before the selector, while the standalone Web package can no longer be assembled
from a clean checkout that lacks its generated `lib/` runtime files.

## 2026-09-01 - prepare v0.1.20 coordinated target distributions

Commit: `1623d2bed5c4077546c64ed21d8acc0ab75a9459`

Synchronized the public selector, TUI, Web, Desktop, control, and shared runtime
at version 0.1.20. This is the first release candidate for the selector-only
`acryl` npm package, target-specific prepared CLI runtimes, lazy verified Web
runtime acquisition, and complete multi-surface release manifest gates.

## 2026-09-01 - reconcile PNPM license verification with isolated linking

Commit: `790dc6326c3b2552520a6b6c6bd34c7adc47068a`

Made PNPM 11 isolated linking explicit and taught the Desktop license verifier
to traverse dependency manifests from their canonical virtual-store paths.
This removed 183 false missing-manifest reports without forcing a hoisted graph
that duplicates React types. Added missing MIT metadata, canonicalized the
patched-runtime assertion, regenerated third-party notices, and verified 558
installed production packages with redistribution-safe licenses.

## 2026-09-01 - validate prepared CLI runtime payload receipts

Commit: `951ea26faa304ca981d84103f6164f95ba59bd26`

Hardened the target npm runtime receipt boundary: the selector now recomputes
and validates the stable receipt-excluding SHA-256 for the installed prepared
runtime before delegating to its native TUI launcher. Archive assembly and
selector validation share one canonical hashing implementation, with regression
coverage for a payload altered after receipt issuance.

## 2026-09-01 - verified on-demand Web runtime distribution

Commit: `f1406d6a2e4e300723336edf0adeca3268359469`

Added per-target portable Web archive construction with target-aware receipts,
checksums, release-payload pruning, and Desktop exclusion inspection. The npm
selector now implements `acryl web`: it validates the installed matching CLI
runtime, reads the exact-version release manifest, confirms a required download
(or accepts `--yes`), verifies the artifact checksum, extracts into a managed
version/target cache atomically, and reuses only a verified ready runtime.
Failures retain the existing TUI and any prior verified cache; the cache stores
only the runtime and integrity receipt, never session, credential, or context
state.

## 2026-09-01 - resolve managed Web artifact locations

Commit: `4f4646c8550b218894a2d66759f5db8e726b0ccb`

Made managed Web acquisition resolve a relative artifact location against the
versioned release-manifest URL before downloading. This keeps the release
manifest portable while retaining exact artifact/receipt location matching and
checksum validation.

## 2026-09-01 - target-specific npm CLI runtime distribution

Commit: `dc5e978fa384efe52e8b669a8b6a91a1fad86c0d`

Defined a versioned CLI target and receipt contract for the five supported npm
OS/CPU targets. The public `acryl` package is now assembled as a selector-only
package with exact optional target dependencies. Each `acryl-cli-<target>`
package carries the prepared native TUI runtime, target receipt, and OS/CPU
constraints. The selector validates installed package metadata and receipts
before launching, with reinstall guidance for unsupported, missing, or mismatched
runtimes. Artifact inspection now validates receipt metadata.

## 2026-09-01 - gate complete multi-surface releases with a verifiable manifest

Commit: `50a798659b9f307ee3c2d80bd338a8f62c8e5113`

Added `scripts/release-manifest.mjs` and a complete release workflow gate. Every
CLI and Web target plus all five Desktop installer targets now emits a receipt
with release version, capability baseline, location, and SHA-256 integrity. The
manifest gate verifies exact coverage, uniqueness, receipt/version/baseline and
checksum agreement, artifact presence, and CLI clean-install size/time budgets
before npm publication or GitHub-release promotion. Immutable
`acryl-cli-{target}` packages publish before the `acryl` selector.

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
## 2026-09-09 - establish the Loader-managed engine host

Commit: `af47a4b5224bfef95fb840f347e1f7370a2f3988`

Added `createAcrylEngineHost` to `acryl-harness-runtime`. It owns one Cordis
root and a stable `acryl-engine` Loader entry, registers engine packages as
Loader builtins, and replaces the active provider through the Loader's
transactional module replacement path. Tests prove initial provider activation,
dependent-consumer teardown and reactivation during a DSH-to-Pi-style swap, and
rejection of an unknown engine without disturbing the active provider.

M9's plan and task ledger now state the same architecture: `dsh-cordis` and
the future `pi-cordis` are provider entries beneath the persistent ACRYL host;
they do not each create a separate Cordis root.

## 2026-09-10 - ACRYL Marketplace: catalog source + built-in registration

Commits: `59f40ab` (spec), `06a2185` (built-in source)

Filed `specs/030-acryl-marketplace`: a first-party plugin marketplace any DSH
Desktop user can connect to, not only ACRYL Desktop. Two halves - a
provider-neutral catalog service at `acryl.dev` conforming to the
`dsh-community-market` `catalog-source` contract, and npm distribution of the
ACRYL market client for stock DSH Desktop.

Deliverable A was already live from earlier catalog work: `acryl.dev` serves a
`CatalogProviderPage` at `/v1/plugins` and a `CatalogSourceManifest` at
`/.well-known/acryl-catalog-source.json`, regenerated every 15 minutes by
`scripts/build-market-catalog.mjs` from npm `acryl-package` keyword discovery.

Deliverable B: "ACRYL Package Catalog" is now a one-click built-in source in
`dsh-community-market`, next to DSH 1024Store and dshfind. Unlike the
custom-adapter built-ins it resolves through the generic
`market.standard-http-v1` adapter, so `BuiltInProviderDefinition` gained an
optional `manifestUrl` and `add-builtin` validates a standard-http built-in
exactly like a user-added standard source (fetch manifest, assert trust root,
confirm `providerId`). The `LocalSourceRecord` contract was relaxed so a
built-in may carry `builtInProviderKey` together with `manifestUrl` + `manifest`;
user-added records still may not carry `builtInProviderKey`.

Motivation: the `dsh-market` provider (third-party `dshmarket@1.17.1`) bricks
the plugin host on DSH `0.1.5-alpha.1` because it hard-imports
`installSettingsSection`/`settingsNamespace`, both removed from
`@deepseek-ai/dsh-settings`. `dsh-community-market` is clean, so it is the home
for the ACRYL catalog. Import-guard + pre-restart-confirm for the `dsh-market`
footgun remains a separate open ticket.

Remaining on 030: publish the client to npm for non-ACRYL DSH Desktop (C),
docs (D), and endpoint query support (deferred).

## 2026-09-10 - Desktop plugin install: own pnpm + bundle reconciliation

Commits: `4b7bb3a`, `410473a` (+ spec `7efa434`)

The `dsh plugin add` silent no-op - and the Market "plugin bundle was invalid,
rolled back" - had two stacked causes, both from the DSH
`0.1.1-rc.2` -> `0.1.5-alpha.1` bump:

1. `acryl-desktop/src/desktop-cli.ts` loaded `@deepseek-ai/dsh/lib/bin.js` with
   a bare `import()` and relied on the CLI running as an import side effect.
   `dsh@0.1.5` guards its dispatch with `if (import.meta.main)` and exports
   `runCli`, so every packaged `dsh` command from the desktop became a silent
   success no-op. `4b7bb3a` adds `enterPackagedDshCli`, which calls the export.

2. With the CLI actually running, `dsh@0.1.5`'s `plugin` command hard-rejects
   `--profile desktop` ("managed exclusively by the Electron application").
   `410473a` stops forwarding to `dsh plugin`: `acryl-desktop/src/pnpm.ts` now
   runs packaged pnpm directly in the active profile
   (`installPlugin` / `runPlugin` non-add / `runExternalMarketPluginInstall`),
   and `acryl-desktop/src/desktop-plugin-reconcile.ts` reproduces the upstream
   `reconcilePlugins` rule on `@deepseek-ai/dsh-app-boot` primitives - a
   profile dependency whose package declares `dsh.bundle.patch` joins
   `dsh.profile.bundles`; a former dependency that no longer does is dropped;
   in-box template bundles are untouched. `start`/`settle` run the reconcile
   after a zero-exit pnpm and demote the exit code on failure so the install
   recovery WAL rolls back rather than seals.

This restores the `dsh-community-market` `assertInstalledBundle` contract
(exact dependency version + `dsh.profile.bundles` membership + lockfile
integrity), which had been rolling every Market install back.

Pre-existing and untouched: `verify:closure` (undeclared transitive
first-party peers) and `verify:profile` (renderer-URL check vs fragment
markers) both fail from the earlier DSH bump and need their own checkpoints.

## 2026-09-10 - Out-of-tree plugin load: connection row must declare webServer

Commits: `68c81d9`

Installing ACRYL Code Editor (`acryl-dsh-editor-plugin`) stopped the whole
Desktop profile: `plugin tree failed to load: failed to apply loader entry
dsh-editor (acryl-dsh-editor-plugin): cannot get property "webServer" without
inject`, thrown from the plugin's `apply`.

The plugin was not the cause, and neither was its version. `HostConnectionService`
mounts each per-caller RPC channel through the Context its own Loader row was
constructed with, and resolves `webServer` while registering the route. Cordis
resolves an undeclared name only along the provider's fiber chain, and every
insert-only bundle composition appends rows as root-level siblings - so the
Desktop's `desktop-webserver` row was never on that chain and
`connection.rpc.handle(channel, handler)`, the documented entry point for
third-party plugins, could not work at all. Upstream never trips over it because
in-tree code registers routes through `ctx.webServer.register(...)` or
`connection.fetch.register`, never through the resolving `get rpc()`.

`prepareDesktopProfile` now emits one further patch declaring `webServer` on the
`connection` row, guarded by the upstream row id and package name and preserving
the row's own `webRuntime` declaration. A declared dependency resolves by
isolate key globally, so the name is found at the first walk step. Verified
headlessly against the unmodified published package: the profile boots, the
`/editor` channel answers the connection fence (401), and an unregistered path
never reaches it (405).

`verify:profile` is green again: its renderer-URL assertion was rewritten for
the token-in-query plus markers-in-fragment contract, and the boot smoke now
replays Connection's launch-token exchange (303 plus session cookie, then the
index) instead of a single fetch that could only ever observe 401.

Second, independent defect found on the way - the plugin's browser bundle
registered itself as `dsh-editor` while the client module loader keys rows by
package name, so the renderer failed with `loaded without registering
"acryl-dsh-editor-plugin"`. Fixed in the plugin repository
(`acryl-dsh-editor-plugin@0.2.6`); the Host half is byte-identical between
0.2.5 and 0.2.6, so this checkpoint is what makes the plugin load on any
published version.

## 2026-09-10 - Universal plugin hot-reload, slice 1 (spec 032 T1)

Commit: `4270f25` (+ spec/plan `f48a7ab`)

The Settings -> Plugins -> Lifecycle tab could enable/disable/reload only three
hard-coded entries (`MANAGED_PLUGIN_LIFECYCLE_ENTRIES`: Development Canvas and
the two brand-slot packages). Every market-installed plugin showed a dead
toggle behind "not admitted to safe user lifecycle control", even though the
underlying machinery - `entry.update({disabled})` for the Host Fiber,
`fiber.restart()` for reload, no process restart - was already generic.

- `plugin-lifecycle-state.ts`: `disabledEntries` now accepts any structurally
  valid Loader entry id. `pluginLifecyclePatches` emits `{id, disabled:true}`
  with no `name`, so a disable matches its row by id alone (a row whose id and
  package differ - `dsh-editor` / `acryl-dsh-editor-plugin` - still disables)
  and a stale id is a Loader warning, not a skipped patch.
  `readUserMutableBundleNames(profileDir)` reads `dsh.profile.bundles` minus
  the base template (`dsh-base`, `dsh-web-app`).
- `plugin-lifecycle-controller.ts`: `isMutable(entry)` is the legacy seed
  (Canvas + brands) OR "the entry's package is in the profile's user bundle
  list". Because spec 031's install writes the package into
  `dsh.profile.bundles`, every market install is lifecycle-managed
  automatically - no per-plugin allowlist edit. `reload()` with no argument now
  restarts every mutable enabled entry.
- The controller bootstrap carries `profileDir`; `main.ts` provides it.

Verified end to end: `acryl-dsh-editor-plugin` installed from the ACRYL Package
Catalog appears in the Lifecycle tab with a working Disable/Reload and renders
its Files tab in the conversation view.

Remaining on 032: T2 (live install with no restart prompt), T3 (soft renderer
reconcile in place of `location.reload()`), T4 (dependency-aware cascade), T5
(local dev file-watch auto-reload), T6 (docs).

## 2026-09-10 - Live plugin install, no restart (spec 032 T2)

Commits: `d74b505` (desktop), `bd5adcb` (market)

Installing a plugin from the market still needed a restart: profile ->
loader-entry composition only runs at boot, so a fresh `dsh.profile.bundles`
entry appeared only on the next launch.

- `acryl-desktop`: `PluginLifecycleController.activate(packageName)` /
  `deactivate(packageName)` read the just-installed bundle's own
  `cordis.patch.yml` insert row and mount / unmount it in the running Loader
  tree through the include group - the same live-mutation path `setEnabled`
  uses. The entry keeps the bundle's real row id, so the reboot patch (by id)
  and the Lifecycle toggle target the same entry. `LivePluginActivationService`
  publishes this as `ctx.livePluginActivation` for the market plugin to call.
- `dsh-community-market`: after a verified install / uninstall,
  `MarketInstallService` calls the optional `liveActivate` / `liveDeactivate`
  callbacks (wired to `ctx.livePluginActivation`). The operation result carries
  `restartRequired: false` when the live mount succeeds; the success modal then
  offers "Reload" (renderer reload, app stays open) instead of "Restart now",
  and falls back to the restart prompt where the capability is absent or the
  mount throws.

Result: install `cordis-plugin-graph` -> click Reload -> its Settings tab
appears, no app relaunch. Uninstall is the reverse. T3 (no renderer reload at
all), T4 (dependency cascade), T5 (dev file-watch), T6 (docs) still pending.

## 2026-09-10 - Universal plugin hot-reload T3-T6

Commits: `663fc25` (T3 soft reconcile + T4 cascade), `c717495` (T5 dev watch)

- **T3 - soft client reconcile.** After a lifecycle mutation the client API
  (`acryl-desktop/src/client/plugin-lifecycle-api.ts`) reconciles its own
  Loader tree to the Host receipt - `entry.update({disabled})` for
  enable/disable, `fiber.restart()` for reload - instead of
  `globalThis.location.reload()`. Renderer-local state (an open editor file,
  scroll) survives a toggle. Falls back to a full reload when a fresh
  enable/install's browser bundle is not yet in the boot graph, or the Loader
  mutation cannot be driven.
- **T4 - dependency cascade.** `snapshot()` reports `dependents` per entry -
  mutable mounted entries that hard-`inject` a service the entry provides,
  transitive, from `ctx.root.reflect.store` + `fiber.inject` + `fiber.store`.
  `setEnabled(disable)` disables them in the same transaction (dependents
  first), the receipt lists every changed id, and a mid-cascade failure rolls
  the whole set back. The confirm dialog shows the list.
- **T5 - local dev auto-reload.** `ACRYL_PLUGIN_WATCH=<pkg>=<abs dir>[,...]`
  (`acryl-desktop/src/desktop-plugin-watch.ts`) watches a checkout and
  `PluginLifecycleController.reloadByPackage`s it on a debounced file event.
  Off by default.
- **T6 - docs.** `docs/acryl/plugin-hot-reload.md`.

Spec 032 T1-T6 are all landed. The one remaining limit is that a fresh
install / enable of a plugin whose browser bundle was not in the page-load
boot graph still triggers one renderer reload - the client module loader has
the `invalidate` / `arrive` primitives but the Host-served boot graph does not
yet stream additions. Noted in the doc.

## 2026-09-11 - BLEND consumption: lock as a profile layer (spec 003 / M3)

Commits: `383abbb` (closure fix), `e836028` (BLEND feature)

BLENDs (the `blends.acryl.dev/v1alpha1` package format, developed in the
standalone `blends` repo, M1 format/compiler and M2 hub/CLI/lock) now compose
into the Desktop. The desktop consumes the **lock artifact**, not the BLEND
language: `.acryl/blend.lock.json` already holds the complete resolved Cordis
rows plus origin identity, so no `@acryl/blends-core` dependency enters this
repo and the D12 host-vocabulary separation stays intact.

- **Selection surface** `dsh-desktop.blend` in the settings file: a path to an
  owned Blend directory (its `.acryl/blend.lock.json`) or a lock file
  directly. Parsed with the same fail-loud style as `mode`/`port`
  (`parseDesktopBlend` in `profile.ts`).
- **New `acryl-desktop/src/desktop-blend.ts`**: strict lock guards (exact
  keys, `formatVersion` 1, `sha256:` digest shape, row config/disabled
  shapes, size caps), the `{ insert: [...rows] }` projection, and a
  blend-attributed collision guard (`BLEND 'x' row 'y' collides...`) that
  replaces the generic unique-id throw for the base composition.
- **Layer position**: the insert is pushed after the `settings` patch and
  before the brand / advanced-presentation invariant pushes, so precedence
  reads base composition < BLEND rows < desktop invariants.
- **Lifecycle**: BLEND rows are user-mutable entries; `PluginLifecycleSnapshot`
  carries a blend identity view (origin id/kind/version/digest, lock path, row
  count) rendered as a banner in the Plugin Lifecycle settings tab. Persisted
  row disables reuse the existing lifecycle state file and win over the BLEND
  insert next generation.
- **No new plugin/Fiber/service**: consumption is pre-boot composition (D27);
  PENDING/reactivation, provider replacement, and disposal remain the Loader's
  own semantics. Deviation from the M3 plan skeleton recorded in the blends
  ledger: identity surfaces through the lifecycle tab, not a Development
  Canvas tile (Canvas fog for M4).

`383abbb` precedes the feature because `corepack pnpm run check` failed on
`verify:closure`: the dsh-v0.1.5-alpha.1 pin left 12 first-party packages
reachable without being declared (same recurring closure gap as 3f2e695 /
b23b53b); declaring them restores the closed 244-node graph.

Verification: `corepack pnpm run check` green (typecheck, 835+ vitest, node
tests, closure, CLI, loader boot, profile boot, licenses). New specs:
`desktop-blend.spec.ts`, `profile-blend.spec.ts`, plus blend cases in the
lifecycle controller/route/client specs. Fixture lock generated by the real
`blends index`/`blends init` CLI against the golden acryl.crm Blueprint.
GUI boot with the fixture BLEND selected (`dsh-desktop.blend` pointing at
`acryl-desktop/tests/fixtures/blend/acryl-crm`) is the remaining manual step.

## 2026-09-11 - Bootable BLEND demo package and fixture regeneration

Commits: `f39e57f` (desktop), `c4e8a6f` (blends example blueprint)

The first M3 fixture lock (acryl.crm) named placeholder packages
(`@acryl/contacts` etc.) that no runtime could resolve. A headless probe
proved the Loader hard-fails such a boot (`plugin tree failed to load ...
Cannot find package '@acryl/contacts'`), so the pending GUI verification
would have aborted. Fixed properly instead of weakening the demo:

- New inert workspace package `acryl-blend-demo`: a function plugin with no
  services, tools, or client surface; it logs its row's locked config on
  activation. It exists so BLEND rows name a package that actually resolves.
- The demo blueprint moved to the blends repo (`examples/acryl.demo.yaml`),
  mirroring acryl.crm's row shape but naming `acryl-blend-demo`; acryl.crm
  stays golden for its placeholder product packages.
- Fixture regenerated through the real CLI pipeline (`blends index` +
  `blends init acryl.demo`) and committed as
  `acryl-desktop/tests/fixtures/blend/acryl-demo` (origin acryl.demo, 4 rows,
  invoicing locked disabled). verify-layout's owned-workspace policy was
  extended to admit the new member.

Runtime wiring (not a repo change): the desktop profile
(`~/.acryl/.dsh/profiles/desktop`) installs the demo with
`corepack pnpm add file:<repo>/acryl-blend-demo`, the same mechanism
desktop-plugin-reconcile uses. If the repo moves, the loader fails loudly at
boot until the link is refreshed.

Verification: full `corepack pnpm run check` green (exit 0; closure 244
nodes, CLI, loader boot, profile boot smokes, licenses); `check:layout`
green; blend spec suites 13/13.

## 2026-09-11 - fix: uninstall no longer leaves a stale plugin-management disable

Commit: `354eb9a` (updates specs/032-universal-hot-reload/issues/01)

Reproduced live: uninstalling `cordis-plugin-graph` through the market left it
in `plugin-management/state.json`'s `disabledBundles` (a separate store from
the Lifecycle tab's `plugin-lifecycle/state.json`, both described in the spec
032 T1-T6 checkpoint). The stale entry made the market treat the package as
"installed but disabled" and hid the managed Install button.

`desktop-plugins.ts` gains `removeDesktopDisabledBundle` - a narrow single-
package cleanup that, unlike `enableDesktopProfileBundle`, does not require
the package to still be a current profile bundle. `PluginLifecycleController
.deactivate` calls it best-effort through a new optional
`pluginManagementStatePath` on the lifecycle bootstrap (wired from `main.ts`
alongside the existing plugin-management state path).

Reassessed the "unify the two disable stores" framing from the earlier
follow-up ticket: they are not simply duplicative. `plugin-management`'s
bundle-layer disable is the only mechanism that works when a bundle's module
cannot even be imported (boot recovery's "skip a mutable plugin bundle");
`plugin-lifecycle`'s entry-level disable needs a working Fiber. Collapsing
them into one store would lose the recovery path. Updated
`specs/032-universal-hot-reload/issues/01-unify-disable-state.md` accordingly
- remaining work is routing the market Installed tab's enable/disable through
the same `PluginLifecycleController` path the Lifecycle tab uses, not a data
model merge.

`pnpm --filter acryl-desktop run check` green (839 tests, closure/layout/
loader/profile-boot/licenses all pass).

## 2026-09-11 - revert: spec 032 T3 soft client-Loader reconcile (live crash)

Commit: `dbd6e54` (also fixes the spec.md status table's revert-commit
placeholder in this checkpoint)

Live testing surfaced two independent crash reports on the same code path:
disabling `cordis-plugin-graph`, then separately disabling the editor plugin,
each closed the whole app on the "Reload"/disable action. Both traced in the
renderer console (`~/Library/Application Support/ACRYL/logs/dsh-2026-09-1{0,1}.log`)
to the same signature immediately before the process died:

```
Error: renderSlot('root') before any 'root' registration (boot order)
```

That signature recurred across many log timestamps, including some that may
predate the T3 reconcile code, so the interaction with the renderer's own
slot-registration lifecycle was not understood well enough to patch blind
without a live devtools session on the renderer at the moment of the crash.
Per the standing rule to reproduce before fixing, and given a second crash
through the same subsystem, reverted T3 rather than attempting a further
speculative fix: `client/plugin-lifecycle-api.ts`'s `mutate()` goes back to an
unconditional `globalThis.location.reload()` for every enable/disable/reload,
removing the in-place `clientEntryFor()`/`reconcileClient()` path entirely.

T1 (graph-derived mutability), T2 (live install), T4 (dependency cascade), and
T5 (`ACRYL_PLUGIN_WATCH` local dev auto-reload) are host-side and unaffected -
every mutation still hot-mounts/unmounts on the Host without a process
restart; only the renderer's post-mutation step is back to a full page
reload, which is the known-safe, field-tested behavior. `docs/acryl/plugin-hot-reload.md`'s
Limits section and `specs/032-universal-hot-reload/spec.md`'s status table
were updated to match.

Verified: `corepack pnpm run typecheck` clean; `client-plugin-lifecycle-api`
suite 7/7; full acryl-desktop suite 837 passed | 4 skipped; `pnpm run build`
succeeds; `pnpm run check` green (verify-runtime-closure 244 nodes,
verify-cli-runtime, verify-loader-boot, verify-profile-boot, verify-licenses
all pass).

## 2026-09-11 - fix: app.relaunch() crashed the dev build, not hot-reload

Commit: `95236ff` (test flake fix in the same session: `2100200`)

The T3 revert above turned out to fix the wrong subsystem. The user reported
the crash again immediately after that revert - now on **enable**, not just
disable - which is impossible for a renderer-only `location.reload()` to
cause. Root-caused via the real macOS crash reporter
(`~/Library/Logs/DiagnosticReports/ACRYL-*.ips`, not just the app's own
logs): every crash was a `DYLD` `Library not loaded: Electron Framework`
"terminated at launch" abort, three of them lining up exactly with three
full main-process restarts visible in the same-day log file.

`acryl-desktop/scripts/launch-dev.mjs` stages Electron into a fresh
`mkdtemp('acryl-electron-dev-...')` per `pnpm run dev` run and deletes it in
a `finally` block the instant the child process exits. `app.relaunch()`
(used by the plugin market's "Restart ACRYL" after an install/enable/disable
that still needs one - spec 032 issue-01's open item - and by the
startup-recovery window's restart button) asks the OS to spawn a new process
at that same `execPath`. In dev mode that path is already deleted by the
time the new process's dyld tries to load Electron Framework from it, so it
aborts before any JS ever runs - explaining why it looked identical
regardless of which lifecycle action asked for the restart, and why my T3
diagnosis was wrong: the crash was never in the renderer at all.

Fix: `shutdown.ts` gained `DESKTOP_DEV_RESTART_EXIT_CODE`; `main.ts` detects
the ephemeral dev bundle via `execPath` at both `app.relaunch()` call sites
and exits with that code instead (a packaged install is unaffected);
`launch-dev.mjs`'s `launchDevelopmentElectron` loops on that code, tearing
down the bundle it just used and staging a fresh one before spawning again.
Gained `importElectron`/`prepareBundle`/`spawnChild` injection seams so the
restart loop itself has real test coverage, not just the pure helpers.

Also fixed in the same pass (test flakiness hit while verifying this):
`tests/profile.spec.ts`'s `afterEach` `rmSync` of its temp home raced
`ENOTEMPTY` under a full parallel `pnpm run check`, though it passed every
time in isolation - added `maxRetries`/`retryDelay`, which only retries that
specific transient error class.

Verified: typecheck clean; `node --test scripts/launch-dev.spec.mjs` (3/3);
`pnpm --filter acryl-desktop run check` green (837 passed | 4 skipped,
closure/cli/loader/profile/licenses all pass).

## 2026-09-11 - feat: unify Installed-tab and Lifecycle-tab plugin disable

Commits: `f7704b6` (code), `60f9ddc` (docs)

Closed spec 032 issue-01's remaining item. The market's Installed tab
enable/disable always wrote `plugin-management/state.json` directly and
always required a restart, independent of the Lifecycle tab's live
`entry.update()` path against `plugin-lifecycle/state.json` - the two
surfaces could disagree on a plugin's enabled state, and the Installed tab
needed a restart even for a healthy, already-mounted plugin.

`LivePluginActivation` (the existing bridge the market already used for
live install/uninstall) gained `setEnabled(packageName, enabled)` and
`statusOf(packageName)`, backed by new
`PluginLifecycleController.setEnabledByPackageName`/`statusOfPackage`.
`DesktopPluginsService.list()` now overrides its file-based status with the
live entry's actual state when one exists; `persistDisable`/`persistEnable`
try the live path first and only fall back to the bundle-layer file for the
one case it uniquely serves: a package whose module cannot even be
imported.

Also reassessed the T3 revert's causal claim from the previous entry above:
a fourth crash report ("enable also closes the app," after T3 was already
reverted) proved the crashes were never a renderer bug - see the
`app.relaunch()` entry above. The `renderSlot('root')` errors T3's revert
cited were most likely leftover log-tail noise from a prior crashed run.
T3 stays reverted pending live-devtools verification, but `spec.md` no
longer overstates the case against it.

Verified: `pnpm --filter acryl-desktop run check` green (841 passed | 4
skipped, closure/cli/loader/profile/licenses all pass). Spec 032 is now
fully closed: T1/T2/T4/T5/T6 landed, T3 reverted with an accurate record,
issue-01 done.

## 2026-09-11 - docs: spec 033 - ACRYL-side runtime contract for BLENDS

New ticket, no code: `specs/033-acryl-blends-runtime-contract/{spec.md,
plan.md}`.

Reviewed the sibling `acryldev/blends` project
(`acryl_blends_project/blends`) in detail - M1 (BLEND format + `blends-core`),
M2 (local hub + CLI), and M3 (this repo's static, boot-time composition of a
compiled BLEND lock, `acryl-desktop/src/desktop-blend.ts`, spec 003 there)
are all done. What is not built anywhere yet is Blends' own "Differentiation
Engine" - an agent adding a capability to a running Blend live, captured as
versioned state with checkpoint/rollback. That is Blends product logic, but
every primitive it needs (live mount of a not-yet-published module, state
snapshot/restore, candidate workspace, checkpoint, a neutral agent tool
facade) is an ACRYL runtime capability, per Blends' own architecture
("Agent Runtime Adapter != Blend Runtime").

Mapped each capability Blends' spec (`ACRYL_BLENDS_SPEC.md` §4/§10/§26)
assumes against what this repo actually has today: spec 032's
`PluginLifecycleController` covers live mount/unmount/cascade/rollback for
already-resolvable packages; nothing exists yet for a freshly generated,
not-yet-published module, a state snapshot, a candidate git worktree, a
user-directed profile-generation checkpoint, or a durable evolution ledger.
Anchored the framing in the existing
`docs/acryl/MENTAL-MODEL-factory-car-driver.md` tiering (a BLEND is Tier-2
car-subsystem state, never a new tier) and flagged
`docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` as the document any
Blend agent-tool-facade work must compose with, not fork.

`plan.md` phases the work B0 (repo-mapping ADR, no code) through B3
(candidate-workspace/checkpoint design, deliberately not committed to an
implementation milestone yet - flagged as the highest-risk, least-proven
area). Explicit non-goal: no Blends product logic (catalog, Evolution Plan,
CLI, UI) in this repo - this repo owns primitives, Blends owns the product.

`Status: needs-triage` - this is a proposal for review, not yet scoped into
an active implementation milestone.

## 2026-09-11 - docs: spec 033 triage - three questions resolved, ready-for-agent

Went back into the code rather than ask a generic status question, per the
user's direction ("ask me specifying implementation questions on what
already contradicts to Acryl current implementation"):

- **B2 was overstated.** Verified directly: `PluginLifecycleController
  .activate()` (`plugin-lifecycle-controller.ts:331`) does require the
  package in `dsh.profile.bundles` + `node_modules`, but
  `desktop-plugin-reconcile.ts`'s existing `pnpm add file:` + reconcile
  path (spec 031) already produces exactly that shape, and `activate()`
  already mounts it live afterward - no restart. Triaged: reuse
  reconcile+activate for a generated module rather than build new Loader
  mechanism; a generated module becomes a real local npm package the
  moment it is tried live, by construction.
- **"Checkpoint" naming collision** with the still-unspecified
  `specs/011-acryl-10-checkpoints` (session/conversation branching, not
  plugin composition) - triaged as two separate concepts that happen to
  share a word; flagged in the doc, not unified.
- **Multi-engine coordination** with `specs/028-harness-engine-swap/` and
  `specs/029-acryl-hybrid-engine/` (both drafted, no committed TS interface
  yet as of this check) - triaged "coordinate now." Finding:
  `BlendRuntimeAdapter` (Cordis row composition) and 028/029's "Engine
  adapter" (which agent loop drives a session) are different axes;
  `BlendRuntimeAdapter` is not blocked on them. The real intersection is
  Blends' §10 tool facade, which must register through whatever uniform
  cross-engine tool-exposure mechanism 028/029 settle on - added as a B0
  research item (item 6) to re-check before B1 locks that shape.

`specs/033-acryl-blends-runtime-contract/spec.md` and `plan.md` updated in
place with these findings and a `## Triage` section. Status moved to
`ready-for-agent`.

## 2026-09-11 - session evolution: hot-reload crash chain, root cause, live-confirmed

Pushed to `origin/main` as `ab7b76c` (12 commits: `354eb9a` through
`ab7b76c`). Chronology of how this session's hot-reload work actually
unfolded, since the sequence of diagnoses matters more than any single
commit:

1. Live testing surfaced "the app closed" on plugin disable (twice, two
   different plugins). Grepped the renderer logs and found a recurring
   `Error: renderSlot('root') before any 'root' registration (boot order)`
   right before each crash - pointed at spec 032 T3 (the soft client-Loader
   reconcile that replaced `location.reload()`). Reverted T3 (`dbd6e54`)
   rather than patch blind, since I could not reproduce with real devtools.
2. A **fourth** crash report ("enable also closes the app," *after* T3 was
   already reverted) proved that diagnosis wrong: a plain
   `location.reload()` cannot restart the whole Electron process. Went to
   the actual macOS crash reporter
   (`~/Library/Logs/DiagnosticReports/ACRYL-*.ips`) instead of the app's
   own logs, and found the real cause: `app.relaunch()` racing
   `launch-dev.mjs`'s per-run temp Electron bundle cleanup - a dyld
   "Library not loaded" abort at process launch, unrelated to the renderer
   entirely. Fixed in `95236ff` (dev-mode restart now stages a fresh bundle
   instead of trusting the OS to respawn a path already deleted).
3. Went back and corrected the record rather than leave the wrong T3
   narrative standing (`60f9ddc`): the `renderSlot('root')` errors were
   most likely leftover log-tail noise from a prior crashed run, not the
   proximate cause. T3 stays reverted (still unverified, not proven unsafe)
   pending real devtools access.
4. Closed spec 032's one remaining open item (`f7704b6`): the market
   Installed tab and the Lifecycle tab wrote to two different disable
   stores and could disagree; unified them through the existing
   `ctx.livePluginActivation` bridge.
5. Reviewed the sibling `acryldev/blends` project in depth at the user's
   request and wrote `specs/033-acryl-blends-runtime-contract/` (`c990d3a`),
   then triaged it against actual code rather than leaving it as narrative
   claims (`ab7b76c`) - see the two entries directly above.
6. **User-confirmed live**: enable, disable, reload, install, and uninstall
   all work correctly with no crash, through both the Lifecycle tab and the
   market's Installed tab. Spec 032 is functionally closed and field-proven,
   not just test-suite-green.

Also cleaned up session-crash-loop fallout from step 1-2's live testing:
killed an orphaned `acryl-web` dev process tree holding port 3080, removed
920 stale `dsh-spill-*` temp directories.

Next: `specs/033-acryl-blends-runtime-contract/` is `ready-for-agent`, but
the user's immediate next focus is the swappable-runtime problem
(`dsh-cordis` <-> `pi-cordis`, i.e. `specs/028-harness-engine-swap/` and
`specs/029-acryl-hybrid-engine/`) - directly the same multi-engine question
spec 033's triage flagged as needing tracking before its own tool-facade
work can lock its registration shape.

## 2026-09-11 - docs: spec 028 assessment - pi-cordis already exists

No code, no push yet (research finding, staged for the next commit).
`specs/028-harness-engine-swap/` is fully speced (walking-skeleton user
stories, resolved research decisions, 50 tasks) but 0/50 tasks are done.

Read the sibling `acryldev/pi-cordis` repo in full at the user's request
(assess-before-implementing). Finding: it already implements almost exactly
what `tasks.md`'s own "Architecture correction, 2026-09-09" banner
describes as the target shape for a provider under the future persistent
engine host - `ctx.piEngine`, one Cordis tree, `inject: ['loader']`, no
second root, no Chord (confirmed by reading `src/index.mjs`: only
`@deepseek-ai/cordis` + the published `@earendil-works/pi-coding-agent`
SDK + `zod`). Its own test suite proves the Cordis-level half of
FR-010/FR-011 for real - mount/remove through a genuine
`ctx.loader.create()`, a dependent consumer starting/stopping exactly once
per cycle, `ctx.get('piEngine')` correctly `undefined` while absent.

Also found a real, independent inconsistency in the existing ledger: Decision
2 in `research.md` (written 2026-09-07) still says the pi engine "runs
inside its own Cordis root" - text the 2026-09-09 tasks.md correction already
reversed but never got back-ported into Decision 2 itself. `pi-cordis`,
built the same day as that correction, is the working proof of the
*corrected* architecture, not the original Decision 2 text.

What `pi-cordis` explicitly does not cover (verified by reading `docs/
PLAN.md` and the source, not assumed): the FR-002 engine-neutral contract
(exposes Pi's own shape, not yet adapted), FR-006/FR-007 cross-engine
durable-record projection (its own docs say so: "does not claim
cross-engine resume yet"), FR-012 sandbox/approval parity with DSH, and
FR-015's documented capability/fidelity contract.

Amended `research.md` Decision 2 with the full finding and added a pointer
banner at the top of `tasks.md`. Did not renumber or rewrite the 50-task
list - the adoption mechanism (git submodule matching `deepseek-harness/`'s
convention, a published npm dependency, or a pnpm workspace path) is an
open decision for the next session, not resolved here. Also noted: an
equivalent extracted `dsh-cordis` provider does not yet exist on the DSH
side (DSH is still directly wired via `startDirectHost()`), so the plan's
stated "dsh-cordis first, then pi-cordis" provider order may need to invert
for the Cordis-mounting half of the work specifically.

## 2026-09-11 - docs: spec 028 Decision 5 - the real DSH extension seam, and two engine-swap architectures

At the user's direction, went deeper than "is pi-cordis usable" into "which
parts of deepseek-harness actually make it the coding-agent engine, and can
one be swapped without losing what DSH already gives ACRYL." Read
`deepseek-harness/docs/architecture.md`, `docs/capability-seams.md` (the
generated service graph), `packages/core/agent-loop/README.md`, and
`packages/core/agent/src/index.ts` directly.

Finding: `ctx.agentLoop` itself has no alternative-provider seam (`bundle`
role, one concrete implementation, unlike `ctx.llm`'s three interchangeable
providers). But one level up, `ctx.agents` does - `AgentFactory`
(`packages/core/agent/src/index.ts:171-203`, registered via
`AgentRegistry.setFactory()` at `:355`) is a real, exported, documented
extension point. `dsh-agent-loop`'s own README says so directly: "Choose a
custom `Agent` implementation only when the standard lifecycle is
insufficient... every observable effect happens through session events and
the `agent/*` taxonomy." Everything downstream (compaction, session-query,
session-projection, telemetry, subagents, workflow, every tool, the UI)
depends on that session-event contract, not on `dsh-agent-loop` the package -
confirmed via `capability-seams.md`'s consumer edges and architecture.md's
own line: "extension packages depend on dsh-agent events and services, not
on this package."

This means a genuinely DSH-native "Pi engine" - one that writes/hot-reloads
Cordis plugins the way DSH does today, and uses DSH's existing
fs/shell/lsp/skill/subagent/workflow tool ecosystem instead of a separate
one - is architecturally sanctioned, not a hack. It is also **substantial**
work, not a thin adapter: it means reimplementing DSH's turn/step/
assistant-stream/tool session-event contract driven by Pi's own reasoning
instead of `dsh-agent-loop`'s, against APIs DSH's own CLAUDE.md calls
"pre-stable" - meaning ACRYL would carry an ongoing tracking burden with no
upstream help, since the pinned checkout stays unmodified.

Wrote this up as Decision 5 in `specs/028-harness-engine-swap/research.md`,
contrasting it plainly against the already-speced, cheaper path (`pi-cordis`
+ `research-pi-spike.md`'s `AcrylEngineAdapter('pi')` - a parallel engine,
session continuity reconciled after the fact, Pi's own skills ecosystem
runs on Pi's own terms). Recommendation carried to the user, not decided
unilaterally: stage them - ship the parallel-engine walking skeleton first
(cheaper, already speced, proves engine-swap + continuity work at all),
treat the `AgentFactory` deep-integration path as an explicit follow-on
ledger once there is real field experience with how much the two ecosystems
actually need to interoperate.

## 2026-09-11 - docs: spec 028 Decision 5 addendum - three engines, not a DSH fork

The user corrected a flaw in Decision 5's framing: "deep integration" read
as patching `dsh-agent-loop` itself, which really would be an unsyncable
fork. It isn't required - the capability-seams graph shows `ctx.tools`,
`ctx.fs`, `ctx.shell`, `ctx.lsp`, `ctx.skill`, `ctx.subagent`,
`ctx.workflow`, `ctx.session`, `ctx.systemPrompt` do not depend on
`dsh-agent-loop`; it is the other way around. They are already independently
mountable, published, upstream-syncable packages.

Reframed as three genuinely separate engines: `dsh` (as-is, extracted as a
provider, zero modification), `pi` (scenario A, `pi-cordis` as it stands,
zero modification), and a new, ACRYL-owned `acryl` engine that mounts DSH's
capability packages unmodified and supplies its own loop/driver on top,
free to pull tool/skill definitions from both ecosystems. This removes the
"fork deepseek-harness forever" risk. It does not remove the two costs that
were always real: DSH's prefix/KV-cache discipline lives in the loop itself,
not the seams around it, so an `acryl` loop has to earn that property fresh;
and a real translation layer is still needed between Pi's tool/skill shape
and `ctx.tools`'s.

Recorded as an addendum to Decision 5 in research.md. Recommendation
unchanged in substance, restated: sequence engines 1 and 2 first (cheap,
mostly speced/prototyped already, prove the swap mechanism), spin `acryl`
into its own dedicated spec ledger once there is real field signal - the
user's own framing already names it as a potential "new chapter," possibly
a coding-agent engine other projects consume, which is the right scale for
its own ledger rather than a subtask here.

## 2026-09-11 - spike: verified mountRootInclude nesting inside the engine host

`acryl-harness-runtime/tests/engine-host-mount-root-include.spec.ts` (3/3
passing, real Loader activation) - proved the primitive the `dsh` engine
plugin extraction (spec 028 Phase 2) depends on, before trusting it in the
real extraction.

Found and fixed a real bug the spike itself surfaced: `mountRootInclude`
creates its Include row at the Loader's own top level (no `parent`
parameter) - it is not automatically scoped to the calling plugin's own
fiber the way `ctx.effect()` resources are. Without an explicit fix,
swapping the `acryl-engine` row away would leave the entire nested DSH
Include tree mounted forever - a real resource leak on every engine swap,
not a hypothetical one; the first version of the spike demonstrated it
directly (`lines(dir)` staying `['mount']` after a swap that should have
unmounted it). Fix, now proven: capture `mountRootInclude`'s returned
`Entry` and explicitly own its removal via `ctx.effect(() => () => {
ctx.loader.remove(entry.options.id) })`. Also found and worked around: an
inner `ctx.get('loader')?.await()` call from inside the engine plugin's own
`apply()` deadlocks against `createAcrylEngineHost`'s own outer await on
the same loader - removed it; the host's own settle is sufficient.

Also confirmed the earlier "does re-selecting collide on
`ctx.loader.builtins.include`" risk from the previous reconciliation entry
is not real - the spike's third test (swap away, swap back) passes cleanly;
that registration is just harmlessly overwritten each call.

Both findings recorded in `specs/028-harness-engine-swap/tasks.md`'s
reconciliation banner.

Separately, incidentally discovered a pre-existing, unrelated test failure
while running the full `acryl-harness-runtime` suite:
`tests/session-bridge.spec.ts` fails end to end - `bootAcrylHarnessProfile`
cannot resolve DSH bundle packages (`@deepseek-ai/dsh-agent-loop`,
`dsh-fs-sandbox`, `dsh-llm-deepseek`, and others) from its fresh temp
`DSH_HOME` test fixture. Confirmed not caused by anything this session
touched (git history on that file predates this session; a clean
`corepack pnpm install --frozen-lockfile` reports already up to date, so
it is not a stale-install artifact). Root cause is in `initProfile`/
`healProfilesModuleFallback`'s package-linking behavior for a fresh
temp-dir profile, a different subsystem from the engine-extraction work -
flagged, not fixed, to avoid scope creep into an unrelated investigation.

## 2026-09-11 - fix: bootAcrylHarnessProfile/bootAcrylWebProfile raced the module-fallback link setup

Commit: `aebaac2`

Discovered while trying to verify the real dsh-cordis engine extraction
(spec 028): `acryl-harness-runtime/tests/profile.spec.ts` - the dedicated
test for `bootAcrylHarnessProfile` - failed on every real-profile-boot path,
every DSH bundle package unresolvable ("Cannot find package
'@deepseek-ai/dsh-agent-loop'" and dozens more). Root cause:
`healProfilesModuleFallback` is genuinely async (real symlink/proxy work
under a cross-process file lock) but both `bootAcrylHarnessProfile` and
`bootAcrylWebProfile` called it without `await`, racing `loadProfile()`/
`boot()` ahead of the fallback links actually existing.

Masked in normal desktop use because a long-lived `~/.dsh-acryl` home
already has the fallback established from a prior run - the race window is
empty once `moduleFallbackCurrent()` is already true. Not masked on a
genuinely fresh home: a real first-time user's very first launch would hit
this exact race, not just tests using a throwaway temp `DSH_HOME`. This is
a real, if narrow, production bug, not only a test-infrastructure gap.

Fixed by adding the missing `await` at both call sites. Verified: 2 of
`profile.spec.ts`'s 3 tests now pass with real DSH packages resolving (the
remaining failure is a pre-existing HMR-guard assertion, confirmed
unrelated - reverting this fix reproduces it identically); the broader
suite went from effectively every real-boot test failing to 20/24 passing,
with the remaining 3 (`session-bridge.spec.ts`) needing a real
`DEEPSEEK_API_KEY` this environment doesn't have and lacking the
self-skip guard DSH's own e2e tests use - flagged, not fixed, separate
concern from this bug. `acryl-cli`/`acryl-web` typecheck clean against the
fix (both consume these functions).

## 2026-09-11 - feat: dsh engine extracted as a full Cordis swappable plugin (spec 028 T010)

Commit: `39088ed`

The real deliverable of "concentrate on Engine 1 and 2" -
`acryl-harness-runtime/src/engine-dsh.ts`, `createDshEngineDefinition
(profileName)`. Mounts the pinned Harness `acryl` profile under
`createAcrylEngineHost`'s persistent root using the `mountRootInclude`
pattern the previous spike verified, instead of the second Cordis root
`bootAcrylHarnessProfile`'s `boot()` creates - `dsh` is now genuinely the
same kind of hot-swappable Loader row `pi-cordis` already proved itself to
be, not a special case.

Verifying against the real pinned profile (not a synthetic noop fixture,
matching `tests/profile.spec.ts`'s own working pattern) surfaced two more
real bugs beyond the spike's disposal-scoping one - both caught by tests
that failed first, not assumed correct:

- `boot()`'s `ctx.provide('dshHomePath', dshHomePath)` had to move to
  `ctx.root` - the profile's Include tree is a sibling of this plugin's own
  entry in the shared Loader, not a descendant, so a provide on this
  plugin's own forked `ctx` was invisible to it
  (`ReferenceError: dshHomePath is not defined` deep inside the composed
  session-persistence/storage patches). Guarded with a presence check
  since it is a static, engine-agnostic value meant to outlive any one
  engine's mount, unlike the profile tree itself.
- `installAcrylWorkspaceStatusTool`'s `ctx.tools.register()` disposer is
  never wrapped in `ctx.effect()` by any of its three callers - harmless
  for the other two (`bootAcrylHarnessProfile`, `bootAcrylWebProfile`),
  which each own a whole process-lifetime root and never unmount
  independently. This plugin captures and owns that disposer explicitly;
  without it, a dedicated swap-safety test (swap away from `dsh`, swap
  back) failed with a duplicate-registration error on the second mount.

Confirmed `installSessionLogExporter` needed no equivalent fix -
`ctx.logger` is an ambient Cordis primitive, not a topology-sensitive
injected service like `ctx.tools`, so this plugin's own `ctx` was already
correct for it.

`tests/engine-dsh.spec.ts`: 4/4 through real Loader activation - real
profile boot with real `sessions`/`agents`/`authorization` services
present in the shared host tree (not a second root), full teardown on host
disposal, empty-profile-name rejection before any activation, and the
swap-safety test. Full `acryl-harness-runtime` suite: 24/28 (same 4
pre-existing, unrelated failures as before this work - the confirmed-
unrelated HMR-guard assertion and three `DEEPSEEK_API_KEY`-dependent
`session-bridge.spec.ts` tests). typecheck clean across
`acryl-harness-runtime`, `acryl-cli`, `acryl-control`.

Recorded as T010 done in `specs/028-harness-engine-swap/tasks.md`'s
reconciliation banner. Remaining for the "Engine 1 and 2" goal: adopt
`pi-cordis` (already exists, Decision 2's amendment), and re-point
`acryl-cli`'s direct bootstrap onto `createAcrylEngineHost` (T013-T017,
still conceptually valid but need re-authoring against its actual shape).

## 2026-09-11 - fix: live-successful install no longer blocks every later install

Commit: `0be5988`

Found live, mid-session, while the user tested Desktop under a real
debugger (`--remote-debugging-port`) after the earlier `renderSlot('root')`
white-screen did not reproduce: uninstalling then reinstalling
`cordis-plugin-graph` failed with "The desktop package manager could not
start." on the first attempt and "The confirmation expired or was already
used" on the retry - a console trace showed the pattern repeating (502 then
410, twice).

Root cause: `DesktopInstallRecoveryStore.begin()` refuses to start any new
install transaction whenever a recovery WAL state file exists at all,
regardless of which package or phase it names. A live-successful install
(spec 032's T2 - no restart needed) reaches `awaiting-restart` and stays
there forever, because that phase's only clearing path is the
startup-recovery-controller's post-restart verify cycle, which a live
install by definition never triggers. Confirmed directly: found the actual
stuck `state.json` on disk (`~/Library/Application Support/ACRYL/
plugin-install-recovery/state.json`), phase `awaiting-restart`, for the
**editor plugin** - a completely different package, installed earlier in
the same session and never restarted since (because it worked live) -
silently blocking the graph plugin's reinstall.

Fix: `DesktopInstallRecoveryStore` gains `acknowledgeLiveSuccess()`, a new
transition straight from `awaiting-restart` to `verified` - not a shortcut
around the existing restart-based `verifying` cycle (which exists to prove
durability *across* a new generation) but a distinct, narrower path scoped
to `createdByGeneration === this.generationId`: a live-activated install
already has stronger same-generation evidence (the plugin genuinely
mounted and is running) that re-deriving proof from a future restart would
be redundant to require, not more correct. `DesktopPnpmService` gains
`acknowledgeLiveInstall(packageName)`, calling this then `clear()`. Wired
into `dsh-community-market`'s `liveActivate` callback (best-effort - a
failure here must never turn a successful live install into a reported
failure) right after live activation succeeds.

Tests: `install-recovery.spec.ts` covers the new transition directly,
including that a different generation is correctly rejected (the exact
invariant this path must not weaken); `pnpm.spec.ts` covers the full
service-level integration end to end - install, seal, acknowledge, and a
subsequent install of an unrelated package no longer blocked (proving the
actual reported bug is fixed, not just the state transition in isolation).
Full `acryl-desktop` suite 843/847 (4 pre-existing skips, no regressions);
`dsh-community-market` 280/280.

Immediate unblock given to the user before this fix landed: restart ACRYL
Desktop once - `startup-recovery-controller.ts`'s normal boot-time
verification clears a genuinely-succeeded pending transaction the same way
it always has, no code change needed for that path.

## 2026-09-11 - fix: auto-retry the renderSlot('root') boot-order race once

Commit: `70719f8`

Follow-up on the live-reported `SlotAssemblyError` white-screen crash
(`renderSlot('root') before any 'root' registration (boot order)`),
thrown by `RootOutlet` in the pinned `deepseek-harness` `ui-renderer`
package when React renders the shell before any plugin has registered the
'root' slot. The assertion is deliberate pinned upstream behavior and is
not touched; the user's own extended debugger-attached testing session
did not reproduce the crash, supporting the working hypothesis (logged
correlation with `desktop-web-server` ECONNRESET) that the race is
transient, not a systemic boot-order bug.

Mitigation lives entirely in ACRYL-owned code: a new
`desktopRootSlotRecoveryInjections()` row, wired through the existing
`webserver/index-inject` table (`desktop-boot-recovery.ts`'s sibling used
for the static "Failed to load plugins" recovery panel). Renders as a
`head`-placed classic `<script>` - ahead of every deferred module script,
so the listener is armed before the module graph that can throw this
error even starts evaluating. The script listens for the exact error
message on both `window.error` (the synchronous throw during the initial
render) and `unhandledrejection` (defensive, in case a future renderer
version defers it), and reloads the page exactly once per tab session via
a `sessionStorage` guard - a persistent, non-transient recurrence still
surfaces normally on the retried load instead of looping reloads.

Verified with a real `vm`-sandboxed evaluation of the injected script
text across two simulated page loads sharing one `sessionStorage`
instance, proving the single-retry bound holds across an actual reload,
not just within one script evaluation - plus a case for an unrelated
error being ignored and one for the `unhandledrejection` path.
`acryl-desktop` typecheck clean across all five tsconfig faces; full
suite 849/853 (4 pre-existing skips, no regressions).

## 2026-09-11 - feat: acryl-cli boots through the engine host (spec 028 T013-T017, M2-slice-alpha)

Commit: `9cb4f5c`

The extraction built in T010 (`engine-dsh.ts`, commit `39088ed`) had no
consumer. `acryl-cli/src/host/direct.ts` still called
`bootAcrylHarnessProfile`, whose `boot()` unconditionally does `new Context()`
- the second Cordis root the 2026-09-09 architecture correction forbids. This
lands the consumer, so the CLI's selected engine is now one Loader row
(`acryl-engine`) beneath `createAcrylEngineHost`'s single root and a later
`select()` can swap it in place.

`DirectHost` gains `engine` (the mounted row), exposed as an additive `engine`
field in `--json` so the selection is observable from the scriptable readiness
probe: `{"mode":"direct","profile":"acryl","engine":"dsh","generationId":...}`.
Behavior is otherwise unchanged (SC-004): the `dsh` engine composes the
identical pinned profile, so `runtimeState`, `sessions` and `agents` are what
they always were, and `--engine` selection plus help-text changes stay in
Phase 4 (US2).

The task text for T013-T017 was stale (it described an
`AcrylEngineAdapter`/`AcrylEngineHandle` registry the built host does not have).
It was re-authored and the reconciliation is recorded in `tasks.md`; T015 in
particular reduces to "call site unchanged", because the session bridge is
correctly built from the host's shared `ctx` and a single-consumer
`AcrylSessionClient` wrapper would be speculative indirection.

Evidence: RED first against the old `direct.ts` (2 failed / 3 passed), then
green - `acryl-cli` 292/292 tests, `acryl-cli` typecheck clean, root
`check:layout` clean (workspace + upstream `5dda764` consistent), and a real
cold start on a fresh isolated `ACRYL_HOME` boots the pinned profile, creates
its fallback links, and reports `engine` `"dsh"` with exit 0.

### Two findings worth keeping

**1. `ACRYL_HOME` alone does not isolate a cold start - `DSH_HOME` wins.**
The documented procedure from the previous session
(`ACRYL_HOME=.acryl-home-test corepack pnpm run tui`) silently does **not**
isolate when `DSH_HOME` is exported in the shell, which it is in this
environment (`DSH_HOME=~/.dsh`): `resolveAcrylDshHome()` gives an already-set
`DSH_HOME` deliberate highest precedence, so the run reused the real
`~/.dsh/profiles/acryl` and would have "passed" as a cold start without ever
being cold. Caught by checking the filesystem for the isolated tree instead of
trusting the green exit code. The working form removes the inherited override:

```sh
env -u DSH_HOME ACRYL_HOME="$PWD/.acryl-home-test" \
  node acryl-cli/bin/dev-run.mjs tui --json
```

This is not an ACRYL defect - the precedence is documented in
`acryl-harness-runtime/src/acryl-home.ts` - but the cold-start recipe written
into the docs and notes needs updating, or it is a test that cannot fail.

**2. The surfaces x engines matrix did not exist.** The ledger scoped this
feature to `acryl-cli` and deferred Electron/Web "to later slices" without
analysing whether they can run another engine at all. `research.md` Decision 7
now records it. The core finding: a surface can run an engine only if it has a
projection from that engine's native session model to what the surface renders,
and ACRYL's only projection (`AcrylSessionBridge` + `TuiStore`) is DSH-shaped
while Web and Desktop own none - they render DSH's own pinned client packages.
So the parallel `pi` engine (`ctx.piEngine` only: no `ctx.sessions`, no
`ctx.agents`, no `SessionEventMap`, no `ctx.tools`) can reach the CLI only, and
only after new projection work; Web and Desktop cannot reach it at all. The
route that does reach all three surfaces is Pi supplying a DSH `AgentFactory`
(Decision 5's priced work), because the whole UI/Web/Desktop surrounding
consumes session events rather than `dsh-agent-loop`. Engine 3
(`acryl-cordis`) is that route generalized.

### Residual risk / not covered

- Web and Desktop still boot their own DSH profile directly and were **not**
  changed. Copying the CLI change into them would not help before the
  projection question is answered (Decision 7).
- The full cross-package `corepack pnpm run verify` was not completed in this
  session: the `acryl-desktop` suite hung while a live Electron dev app was
  running against the same user-data/ports. The verification above is
  `acryl-cli` plus the root layout gate plus the real cold start. A clean
  `run verify` with no dev app running is still owed before this is called
  fully gated.
- `timeout(1)` is unavailable on this macOS box, and the failed verify run was
  piped through `tail`, which hides all progress until exit and made a hang
  indistinguishable from slow work. Gate runs should stream instead.

## 2026-09-11 - fix: ACRYL_HOME outranks an ambient DSH_HOME

Commit: `24c1532`

`resolveAcrylDshHome` let an ambient `DSH_HOME` outrank an explicitly set
`ACRYL_HOME`, so pinning ACRYL's product root silently kept using the real
`~/.dsh`. Ten-line precedence fix, four-line test
(`acryl-harness-runtime/tests/acryl-home.spec.ts`), RED then GREEN.

Recorded only because the same trap bit this session: `acryl-cli` bundles
`acryl-harness-runtime`'s built `lib/`, and its dev launcher only checks
`acryl-cli/src` for staleness, so a runtime change is invisible to the CLI
until `corepack pnpm --filter acryl-harness-runtime run build`. That made a
correct fix look broken for one run.

## 2026-09-11 - fix: Minimal/PTC/Creator mode session creation restored

Commit: `871675f`

Live-reported while re-testing after the earlier fixes: creating a new
session failed outright (`agent-preset/invalid: preset "minimal" failed to
mount ... cannot resolve package "@deepseek-ai/dsh-terminal-bash"`), and
Settings > Agent presets showed PTC mode and Creator mode both
"Failed to load" - only Standard mode (and Minimal mode's own listing,
misleadingly, since its badge check does not exercise deep tool
resolution) looked fine.

Root cause: `@deepseek-ai/dsh-agent-presets` composes its built-in presets
by naming plugin packages as bare specifiers in `agent.cordis.yml`, on the
assumption that the consuming app declares them as its own dependencies -
it does not depend on them itself. Under the isolated pnpm node-linker this
repo uses, a package the consumer never declared is not resolvable from the
consumer's own install anchor, which is exactly the check
`package-overlay.ts` performs for every real Desktop session.

Reproduced directly (not assumed): scanned every `@deepseek-ai/...` name
referenced across all four shipped presets (`standard`, `minimal`, `ptc`,
`cordis`) and ran the identical `findPackageJSON(name, installAnchor)`
`package-overlay.ts` uses, from `acryl-desktop`'s own package.json. 6 of 31
names failed - `dsh-terminal-bash`, `dsh-tool-bash-persistent`,
`dsh-tool-pwsh-persistent`, `dsh-tool-str-replace-editor` (all four used by
`minimal`), `dsh-tool-cordis` (the Creator-mode preset's own id), and
`dsh-agent-tool-presentation` (PTC) - an exact match for every symptom
observed, including why Standard mode alone was unaffected (it needs none
of the six).

Fix: declared all six as `acryl-desktop` dependencies pinned to the same
`0.1.5-alpha.1` already used throughout, then `pnpm install`. Re-running
the identical scan against all 31 names now finds zero missing.

Tests: new `preset-package-resolution.spec.ts` drives this exact
resolution against every name every shipped preset references, so a future
`dsh-agent-presets` bump that adds a required package fails this test
instead of only surfacing as a session-create crash in the running app.
Full `acryl-desktop` suite 850/854 (4 pre-existing skips, no regressions);
typecheck clean across all five tsconfig faces.

## 2026-09-12 - feat: Desktop and the engine-host prepare hook (spec 028)

Commits: `10d8c5b`, `2af6a4c`, `e2fae09`

User confirmed spec 028 Decision 7's open question (any engine, any
surface - Route 2/3, not CLI-only), which commits to "Engine 1 everywhere"
as the real prerequisite: Desktop, the only surface still calling DSH's
raw `boot()` directly (its own second Cordis root, no engine-host row),
needed to close the same gap `acryl-cli`'s existing re-point already
closed.

Two shared-infra gaps found and closed before Desktop's own re-point
could land:

1. `createAcrylEngineHost` had no hook for a surface's own pre-engine
   setup. Desktop's `boot()` `prepare` callback registers its own services
   (`DesktopActionsService`, `DesktopProfileService`, `DesktopPluginsService`,
   `desktopRuntime`/`desktopPnpmBootstrap` provides) *before* any DSH
   profile plugin mounts - load-bearing, since `dsh-community-market`'s own
   plugin does `ctx.inject(['desktopProfiles', 'desktopPnpm'])` against
   exactly those services. Added an optional `prepare(ctx)` parameter,
   invoked right after `ctx.plugin(Loader)` and before any engine mounts -
   mirrors `boot()`'s own timing exactly. Purely additive; `acryl-cli`'s
   existing usage (never passes it) verified unaffected (292/292).

2. `createDshEngineDefinition(profileName)` resolves its own profile
   internally (the CLI/TUI flavor: `acryl-harness-runtime`'s own
   `loadProfile`/`resolveProfileDir`). Desktop has its own separate
   pipeline (`prepareDesktopProfile()`) that already produces its own
   `rootConfig`/patches (market/editor/BLEND layering)/`bareModuleBaseUrl` -
   handing that to the existing function would have silently discarded it
   and resolved a different profile. Split `engine-dsh.ts`: the mounting
   logic (`mountDshEngine`) now takes an already-resolved
   `DshEngineComposition`; `createDshEngineDefinition` resolves a profile
   by name then calls it (unchanged behavior, same tests passing);
   `createDshEngineDefinitionFromComposition` is the new Desktop-facing
   entry point taking an externally-resolved composition directly.

Desktop's own re-point (`main.ts`) is a 25-line mechanical transplant -
the ~190-line `prepare` callback body moves verbatim into the new hook;
`prepared.rootConfig`/`patches`/`bareModuleBaseUrl` pass straight into
`createDshEngineDefinitionFromComposition`. Verified before landing that
`ctx.baseUrl` is never read directly in `main.ts` (only Cordis's own
Loader/Include internals consume it, already set correctly inside
`mountDshEngine`), that `lifecycleStartupFailureReason` never string-
matches `boot()`'s specific error format, and that no direct
`ctx.fiber.dispose()` call exists to route through `engineHost.dispose()`
instead.

Tests: RED confirmed first for both shared-infra changes (real failing
cases against the unfixed functions), then GREEN. `package.spec.ts`'s
source-ordering assertion updated to the new call-site literal (same
ordering invariant). Full `acryl-desktop` suite 850/854 (4 pre-existing
skips, no regressions); typecheck clean across all five tsconfig faces;
full `acryl-cli` suite 292/292 and a real cold-start (`--json`, throwaway
`ACRYL_HOME`) both unaffected.

Pre-existing, found and left unfixed (confirmed unrelated by stashing
each change out and reproducing identically): `acryl-harness-runtime`'s
`profile.spec.ts` has a stale HMR-guard test premise (fresh profiles now
ship `hmr.disabled: true` by default); 3 failures in `session-bridge.spec.ts`
look like `dsh-llm`/`dsh-token-meter` shape drift at the pinned
`0.1.5-alpha.1`. Neither touched - separate root causes, no overlap with
the engine-host mechanism.

Not verified: an actual Electron GUI launch of Desktop. Builds/typechecks/
tests stay headless-safe per this repo's own rule; a real `pnpm run dev`
boot is the user's own hands-on check next, same pattern as this
session's `acryl-cli` cold-start verification.

Web (`acryl-web`, still calling `bootAcrylWebProfile` directly) remains
the one surface not yet re-pointed.

## 2026-09-12 - fix: engine host's own Loader entries had no resolution base URL

Commit: `397537b`

Live-reported on the user's first real Desktop GUI launch after the
engine-host re-point (`e2fae09`): `failed to apply loader entry
acryl-engine (cordis:acryl-engine-dsh) ... client-modules: loader entry
cordis:acryl-engine-dsh has no resolution base URL` (and the same for
`cordis:include`) - a hard boot failure, confirming the exact gap
flagged as "not independently verified" in the prior checkpoint.

Root cause, found by reading `cordis-plugin-loader`'s compiled source
directly rather than guessing: `EntryTree`'s constructor snapshots
`ctx.baseUrl` once, as an own property, at the exact moment a tree is
constructed - not a live read. The host's own top-level tree is
constructed the instant `createAcrylEngineHost` calls `ctx.plugin(Loader)`.
Every entry created directly on that root (the "acryl-engine-<id>" row,
and `mountRootInclude`'s sibling "cordis:include" row) permanently
inherits whatever `ctx.baseUrl` was at that one line - setting it later,
from anywhere, cannot reach the already-taken snapshot. Verified
empirically with two failed attempts before finding this (`ctx.root.baseUrl
= ...` from inside the engine's own plugin, and setting it inside `prepare`)
- both left the two entries' resolved baseUrl at `undefined`, proving
the timing requirement precisely rather than by inference.

`dsh-client-modules` (Desktop's and Web's client-bundle composer, absent
from the CLI/TUI profile) reads exactly this property for every Loader
entry and throws unconditionally if it is undefined - which is exactly
why this gap survived every automated test and the CLI's own real
cold-start throughout this session's engine-host work: nothing in the
CLI/TUI composition ever exercises this code path.

Fix: `createAcrylEngineHost` sets `ctx.baseUrl` to its own package
directory before `ctx.plugin(Loader)` - never read for a real client
bundle (client-modules finds nothing there and skips, same as any other
non-client entry), so it needs no per-engine knowledge and engines can
still vary independently. Removed the first (ineffective) fix attempt's
dead `ctx.root.baseUrl` line from `engine-dsh.ts`.

Tests: RED confirmed first (stashed the fix, reproduced the exact
`undefined` baseUrl on the host-owned engine row), then GREEN across
`engine-host.spec.ts`/`engine-dsh.spec.ts`/`engine-host-mount-root-
include.spec.ts` (16/16). Full `acryl-harness-runtime` suite: same 4
pre-existing unrelated failures, unchanged. Full `acryl-cli` suite
292/292 and a real cold-start unaffected. Full `acryl-desktop` suite
850/854 (4 pre-existing skips, no regressions); typecheck clean across
all five tsconfig faces.

Not verified here: an actual Electron GUI launch - the user's own
re-test of the exact failure they reported.

## 2026-09-12 - fix: Desktop restart never came back after a Market card toggle

Commit: `06dfe76`

Live-reported, 100% reproducible: disabling (or enabling, on a second
report) a plugin from the Market's own card - which requires a restart,
unlike Lifecycle's always-live toggle - closed ACRYL Desktop with no
automatic restart, every single time.

Investigated in stages, each ruling something concrete out before
moving to the next real hypothesis (per house rule: reproduce like a
real user, never fix blind):

1. Confirmed via `docs/acryl/plugin-hot-reload.md` and `dsh-community-
   market/src/host/routes.ts` that the Market card's own disable/enable
   action is unconditionally restart-required by construction - it
   never attempts `liveActivate`/`liveDeactivate` at all, unlike the
   Market's own "Installed" tab (which does try the live path first per
   the doc) or Lifecycle (always live). Not itself a bug, but a real,
   worth-a-product-decision gap between the two market surfaces for the
   same action.
2. Ruled out the earlier `app.relaunch()`-under-ephemeral-dev-bundle
   crash class by tracing the restart callback end-to-end through
   source - it funnels through the one already-guarded `relaunch()`
   implementation, no uncovered call site.
3. Ruled out slow or failing disposal with a temporary timing
   diagnostic around `generation.release()`: completed cleanly in
   ~240ms, nowhere near the 5-second shutdown-coordinator timeout.
4. Instrumented every step of the actual shutdown sequence
   (`finish()`, `prepareToQuit()`, `relaunch()`, `exit()`) and got the
   real answer directly from the live logs: `relaunch()` correctly read
   `isEphemeralDevBundle=true` and called `app.exit(43)` - then
   `finish()` *unconditionally* called `native.exit(0)` right after.
   Electron's `app.exit()` is not a graceful no-op on a second call in
   quick succession; the second call's code wins. The process actually
   exited with code 0, so `launch-dev.mjs`'s loop
   (`if (code !== DEV_RESTART_EXIT_CODE) return code`) saw 0, concluded
   "not a restart," and returned instead of staging a fresh bundle and
   respawning.

This bug predates today's engine-host work entirely - `finish()`'s
shape hasn't changed - it simply had never been exercised for a
restart from a fully active session before now (every earlier
restart-guard test was a fresh-boot-failure recovery flow).

Fix: `relaunch()` now fully owns process termination in both branches
- the packaged branch gains its own `app.exit(0)` call (Electron's
`app.relaunch()` alone does not end the current process, so this was
always latently needed), matching the dev-mode branch's own
`app.exit(DESKTOP_DEV_RESTART_EXIT_CODE)`. `finish()` returns
immediately after calling `relaunch()` instead of also calling `exit()`
with a possibly-conflicting code.

Tests: RED confirmed first (a regression test built around the exact
`[43, 0]` sequence, reproduced by stashing the fix), then GREEN.
`shutdown.spec.ts` 8/8. Full `acryl-desktop` suite 851/855 (4
pre-existing skips, no regressions); typecheck clean across all five
tsconfig faces. All temporary diagnostic logging added during the
investigation was fully removed before this commit - none of it ships.

Still open, separate from this fix: whether the Market card's
disable/enable should try the live path first (matching the Installed
tab) instead of always requiring a restart - a product decision, not
addressed here.

## 2026-09-12 - feat: Web re-pointed onto the engine host - Engine 1 everywhere complete

Commit: `fd01485`

Closes the "Engine 1 everywhere" sequencing from spec 028 Decision 7:
Web was the last surface still calling `bootAcrylWebProfile` directly
(its own second Cordis root). Now boots through `createAcrylEngineHost`
+ a new `createWebEngineDefinition()`, the same treatment `acryl-cli`
and `acryl-desktop` already got this session.

Web's own re-point was simpler than Desktop's - no `prepareDesktopProfile()`-
style external pipeline to reconcile, just `provideCmdline`'s wiring
moving from `boot()`'s own `prepare` callback into `createAcrylEngineHost`'s
equivalent hook, at the identical point in the sequence.
`createWebEngineDefinition()` resolves the pinned `web` profile
(`dsh-base` + `dsh-web-app`) through this package's own profile system,
mirroring `createDshEngineDefinition`'s CLI/TUI flavor with a different
profile/capability-set/surface, reusing the identical shared
`mountDshEngine` primitive. `bootAcrylWebProfile` itself is untouched
and still exported.

`AcrylWebResult` gains an `engine` field, surfaced in `--json` output -
an observable proof this is really going through the engine host, not
silently falling back, matching `acryl-cli`'s own `DirectHost.engine`.
Declared `@deepseek-ai/dsh-cmdline` as an explicit `acryl-web`
dependency (it's now imported directly, not received transitively) -
the exact class of gap fixed earlier today in Desktop's preset
packages, caught proactively this time rather than live-reported.

Tests: RED confirmed first, then GREEN - a real Loader activation of
the web profile with shared authorization available. Full
`acryl-harness-runtime` suite: same 4 pre-existing unrelated failures,
unchanged. Real cold-start verified twice:
`{"url":"http://127.0.0.1:3080","engine":"dsh"}`. Full `acryl-cli`
(292/292) and `acryl-desktop` (851/855, 4 pre-existing skips) suites
both confirmed unaffected by the shared `pnpm-lock.yaml` churn.

All three surfaces (CLI, Desktop, Web) now mount `dsh` as one swappable
Loader row under a shared engine host. What remains open for spec 028:
adopting `pi-cordis` into this repo (mechanism still undecided) and the
`AgentFactory`-driven Pi-as-a-DSH-loop-driver program (Decision 5/the
user's "any engine, any surface" decision) - neither started.

## 2026-09-12 - fix: the DSH agent-preset payload never reached a packaged build

Commit: `23cab0cac77be1c83ce9a3cc0a47d31ed87ccf01`

First Linux packaging run on this repo (Ubuntu x64, `electron-builder
--linux deb --x64`) failed in `afterPack` on
`verify-packaged-runtime.ts`'s own `REQUIRED_UNPACKED_RUNTIME_ENTRIES`:
the three `@deepseek-ai/dsh/config/agent-presets/cordis/*` entries
(`agent.cordis.yml` plus both `SKILL.md` files) were absent from
`app.asar.unpacked`. The whole `config/` tree of the `dsh` package was
missing - all 4 presets (`cordis`, `minimal`, `ptc`, `standard`), not
just the 3 asserted files.

Root cause is a non-obvious electron-builder contract:
`computeNodeModuleFileSets` reuses `build.files` for every dependency via
`new FileMatcher(source, destination, macroExpander,
mainMatcher.patterns)`, so those patterns are re-rooted at each module's
own directory. Top-level dependency *files* survive regardless (which is
why `package.json`, `LICENSE`, and the READMEs were present and the
breakage looked selective), but a top-level dependency *directory* that
matches no pattern is pruned. `build.files` listed `lib/**`,
`package.json`, `cordis.patch.yml`, and `build/*` - nothing that could
match `config/`.

The fix is a one-line module-relative include, `config/agent-presets/**`.
An absolute-looking `node_modules/@deepseek-ai/dsh/config/**` does *not*
work - tried first, it resolves against the module directory too and
matches nothing. `acryl-desktop` owns no `config/` directory, so the
app-root side of the shared matcher is unchanged; `dsh` is the only
dependency carrying `config/agent-presets`.

This filter is platform-neutral, so the gap blocked *every* packaging
target since the verifier requirement landed in `933ee2e` (2026-08-30) -
`check:mac-package` and `check:win-package` were failing the same way on
their own hosts. The pre-existing `dist/linux-x64/linux-unpacked` tree in
this workspace shows the same missing `config/`.

Verification: `tests/package.spec.ts` pins `build.files` exactly, so its
expectation moved with the manifest and now documents the module-relative
semantics inline; packaging specs 42/43 green (1 pre-existing skip),
`verify:closure` green (244 first-party nodes). Then a real end-to-end
deb: `dist/acryl-desktop-linux-amd64.deb`, 122 MB, `Package:
acryl-desktop`, `Version: 0.1.37`, `Architecture: amd64`, 60
`agent-presets` entries packed, `afterPack` verifier passing, plus
`/usr/share/applications/acryl-desktop.desktop` and hicolor icons.

Still open, deliberately out of scope here: Linux has no owned packaging
path. `build.linux.target` is `["dir"]` and there is no `dist:linux`
script or `verify-linux-*` gate, so the `deb` target exists only as a CLI
override (`--linux deb --x64`) with no host gate and no installed-artifact
verification - unlike `dist:win`/`dist:mac`.

## 2026-09-12 - fix: the packaged-runtime gate now derives the closure it verifies

Commit: `2e0128a16c485a2df1d75177a0e2186e5671871d`

A `deb` built from source on the Ubuntu z370n box started its helper
processes and then died before any window appeared:

```
Uncaught Exception: Error [ERR_MODULE_NOT_FOUND]: Cannot find package
'@deepseek-ai/dsh-home-paths' imported from .../dsh-app-boot/lib/index.js
```

`@deepseek-ai/dsh-home-paths` was absent from that build's `app.asar`
entirely, and `verify-packaged-runtime.ts` had nothing to say about it,
because its `REQUIRED_PACKAGED_RUNTIME_ENTRIES` /
`REQUIRED_UNPACKED_RUNTIME_ENTRIES` lists are curated names.

What this checkout shows: `acryl-desktop/package.json` does declare
`@deepseek-ai/dsh-home-paths` (`0.1.5-alpha.1`, line 245 at `desktop-v0.1.36`
too), and a Linux x64 `--dir` package built here at HEAD *does* contain it
(7 ASAR entries, `node_modules/@deepseek-ai/dsh-home-paths/lib/index.js`
present in `app.asar.unpacked`, `afterPack` passing). So the collector is
not dropping the package from a correct tree; the blind spot is that a tree
which loses it ships silently.

The mechanism is a peer-only edge. `@deepseek-ai/dsh-app-boot` imports
`@deepseek-ai/dsh-home-paths` from `lib/index.js:12` but declares it only
under `peerDependencies`, and electron-builder collects the root manifest's
declared production closure, never peers. The package reaches an app only
because the application manifest declares it as well: a stale or partial
install, a tree without that declaration, or any collector regression
produces an app that looks complete and crashes on first launch.

`verify-packaged-runtime.ts` therefore stops relying on the curated list for
this question and derives the requirement from the artifact:
`verifyPackagedDependencyClosure` walks every package root physically present
in `app.asar.unpacked` plus the application manifest itself, and requires
each declared `dependencies` entry and each non-optional `peerDependencies`
entry to resolve exactly as Node would (scoped directories, nested
`node_modules` overrides, walk-up to the packaged root). Two classes stay
exempt on purpose: target-foreign native payload, through the same
`nativePathIsForeign` predicate the payload pruner uses, and the `electron`
peer, which is the application binary rather than a packaged module. A
missing declared peer is fatal when the application manifest ships that
package, since that is the closure the packager collects; a required peer the
root never declares cannot be collected at all, so it is reported as
`unshipablePeerEdges` in the packager log instead of failing an otherwise
consistent tree.

Cost is one directory walk and one manifest read per package: 628 packages
and 2818 declared edges in 60 ms on the HEAD Linux x64 package, with 48
legitimately absent optional entries. Deleting `@deepseek-ai/dsh-home-paths`
from that same tree fails the gate and names all twelve owners, including
`@deepseek-ai/dsh-app-boot` and `acryl-desktop` - the exact failure mode the
deb reported. Six new specs pin the behaviour (peer-only drop, complete
closure, reported-vs-fatal classification, optional absences, nested
override, foreign native payload, and the end-to-end gate through
`verifyPackagedRuntime`); the desktop suite is 42/42 in
`tests/verify-packaged-runtime.spec.ts`, 853 passed / 4 pre-existing skips
overall, `tsc` clean.

Still open, reported by the new check on the current tree and deliberately
not fixed here: `dsh-community-market -> @deepseek-ai/dsh-client-store`.
It is the only one of that package's 35 `@deepseek-ai/*` peers the desktop
root does not declare, so the packaged app cannot satisfy it even though dev
workspaces resolve it through pnpm's peer link. The remedy is one
declaration line in `acryl-desktop/package.json` plus the matching
`pnpm-lock.yaml` entry, which is held back because the lockfile currently
carries unrelated in-flight workspace edits (`dsh-client-ui-brand-acryl`,
`@types/semver`) that are not ready to commit - and pnpm rejects extra
lockfile entries against a manifest without them. The same gap applies to
`scripts/runtime-closure.mjs`: it only walks `@deepseek-ai/*` direct
dependencies, so a workspace package such as `dsh-community-market` is never
visited and its first-party peers are never required at the root.

## 2026-09-12 - fix: the preset gate pointed at the pre-0.1.5 payload location

Commit: `115068d98e23a04c3feb009528dcd2179b87d9c7`

Validating the derived closure check against a real Linux x64 package built at
`HEAD` exposed a second, older regression in the same gate: `afterPack`
required `node_modules/@deepseek-ai/dsh/config/agent-presets/cordis/**`, a path
that no longer exists in any install of the pinned DSH version. The pin move
to `0.1.5-alpha.1` relocated the Cordis preset payload out of `dsh` and into
`@deepseek-ai/dsh-agent-presets`, whose `presets/` directory carries the same
`cordis/agent.cordis.yml` and the two bundled `SKILL.md` files. The published
`@deepseek-ai/dsh@0.1.5-alpha.1` tarball is ten files and 49 kB - it cannot
contain them - and every copy of that version in the local store lacks
`config/`, while all five remaining `0.1.1-rc.2` copies still have it. The
required-entry list was written before the pin moved and was never updated, so
the gate could not pass on a correct artifact; the built tree already shipped
the payload at the new location.

The three entries and their mirrored expectations in
`tests/verify-packaged-runtime.spec.ts` now name
`@deepseek-ai/dsh-agent-presets/presets/cordis/**`. Verified on the same
artifact: the gate failed on the old paths before the change and passes end to
end after it - archive, physical entries, mirror, package exports, and the
derived closure - with the single remaining `console.warn` naming
`dsh-community-market -> @deepseek-ai/dsh-client-store`, which is already
recorded as open above. Desktop typecheck is clean across all five tsconfigs
and the suite is 853 passed / 4 skipped.

## 2026-09-12 - feat: ACRYL branding for Web - brand-package materialization and page-title fix

Commits: `2ec919c`, `6745ec4`

Web still showed DeepSeek Harness branding after the "Engine 1 everywhere"
re-point. The fix needed two layers, both found by direct instrumentation
rather than assumed from how Desktop's own brand swap works.

First: `acryl-desktop`'s `package-overlay.ts`/`module-resolution.ts`
(`installProfilePackageResolver`, a resolution-hook overlay between an
installation's own copy of a package and a profile's own copy) were
extracted into `acryl-harness-runtime` as shared, parameterized
infrastructure - Desktop's own two files became thin wrappers supplying its
Electron-specific anchors, verified unchanged by its full existing test
suite (the deep hook-logic tests moved to
`acryl-harness-runtime/tests/module-resolution.spec.ts`, where the logic now
lives). This looked like the mechanism Web's brand swap needed too, mirroring
Desktop's own approach.

It wasn't. Logging every `resolve()` call the composed Loader rows actually
make proved `HostResolvedRootInclude`'s rows (the composition style Web's
engine host uses) always resolve bare specifiers against the profile's own
`package.json` as `parentURL`, never against the Loader's own entry module -
the one condition `installProfilePackageResolver`'s hook checks for. Desktop's
real brand swap does not actually depend on that hook at all; it works
because Desktop's separate Market/plugin-lifecycle system does a real
`pnpm add`-style install into each profile's own `node_modules`. The
extraction itself was kept - it is genuinely useful, tested infrastructure
for Desktop's continued use and any future overlay need - but it does not
solve Web's problem.

The actual fix: `materializeProfilePackage`, a direct symlink from the web
profile's own `node_modules` to `dsh-client-ui-brand-acryl`'s resolved
location in the `acryl-web` installation, called before the brand-swap patch
(disable `ui-brand-official`, insert `ui-acryl`) is applied. The patch itself
is validated against the real composed Loader row first, so a future
`dsh-web-app` change that renames or removes that row fails loud instead of
silently keeping the DeepSeek brand. `createWebEngineDefinition` now takes
`acryl-web`'s own `package.json` URL directly (the anchors-object shape built
for the abandoned resolver-hook approach is gone).

A second gap surfaced only by fetching the served page directly: the `<title>`
stayed "DeepSeek Harness" even with the brand plugin correctly swapped,
because that string is baked into a pinned `@deepseek-ai/dsh-web-frontend`
build artifact - outside the Cordis Client slot system the brand plugin
covers. `dsh-host-webserver`'s `WebServer` service exposes `tapIndex()` as its
own designed escape hatch for exactly this ("no `IndexInjection` row exists
for this" markup rewrite); `mountDshEngine` now registers a title-rewriting
tap for the web surface only. Desktop does not need this - it already
suppresses `page-title-updated` on its own `BrowserWindow` and keeps a fixed
native title, so the vendored HTML's `<title>` never reaches anything visible
there. A matching ACRYL favicon needs a real static asset plus a route and is
tracked separately, not bundled into this markup-rewrite fix.

Verified end-to-end with a real profile boot (throwaway `ACRYL_HOME`) and a
real HTTP fetch of the served index: the boot manifest lists
`dsh-client-ui-brand-acryl` (not the official package) among its client
entries, and the returned HTML's `<title>` reads `ACRYL` with no remaining
"DeepSeek Harness" string anywhere in the page. `acryl-harness-runtime`'s
suite: same 4 pre-existing unrelated failures (confirmed via `git stash`
against a clean `main` checkout, unchanged by any of today's work),
`engine-dsh.spec.ts`'s web-engine test extended with real assertions for the
symlink, the composed row states, and `webServer.renderIndex()`'s actual
output - all green. `acryl-web` (2/2) and `acryl-desktop` (853/857, 4
pre-existing skips) both confirmed unaffected.

## 2026-09-12 - refactor: coding capabilities declare their surfaces (spec 034)

Commit: `3f7ceb2e37838194852a298a9158f614065252c8`

`docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md` says the runtime owns plugin
lifecycle and the surfaces only render it. For plugins the implementation is
the inverse: the whole plugin stack is `acryl-desktop`'s, and `acryl-cli` has
no plugin surface at all. The composition seam that should carry the
difference (`acryl-harness-runtime/src/coding-capabilities.ts`) held exactly
one capability and decided the rest with a branch -
`selectNonTuiCapabilityPatches` filtered non-TUI roots down to a hardcoded
`NON_TUI_SHARED_ROW_IDS` set - so a row could only be added to one surface by
editing filter logic.

Before touching it, the actual per-surface compositions were measured by
booting each real definition headlessly and dumping `ctx.loader.entries()`:
tui 88 rows, web 157, desktop 168 (`DEBUG_VERIFY_LOADER_BOOT=1` on the repo's
own desktop gate). That measurement corrected the report that started this
work. Web is not missing the plugin machinery - it already composes
`@deepseek-ai/dsh-host-plugin-inventory`, both settings plugin UIs and the
brand swap. The `Global plugins 0 plugins` in the report is a
post-search-filter count (`lib/client.js:245-262`) for the query `editor`, and
the row the user was looking for lives in the shipped `minimal` agent preset,
which is what the panel's own "1 more matches in other presets" line says. The
genuine asymmetries are: ACRYL's plugin *management* (market install,
enable/disable, architecture inspector) is Desktop-owned code, and
`@deepseek-ai/dsh-tool-str-replace-editor` - declared by `acryl-harness-runtime`,
not by `acryl-desktop` as the first draft of the spec claimed - is composed by
no surface's global rows. Both are recorded in `research.md` and corrected in
`spec.md`; the tasks were reordered so the shared lifecycle capability (T005)
lands before the CLI surface that calls it (T003).

This commit is the enabling move, with composition held identical: the table
splits into `persona`, `agent-roster`, `session-stats` and `authorization`
capabilities, each declaring its surfaces, and
`createAcrylCodingCapabilityPatches` now composes by declaration alone. TUI
keeps the persona/roster/session-stat rows dsh-base lacks; Web and Desktop
keep the authorization insert and the rows their `dsh-web-app` bundle already
composes.

One silent defect fell out of reading the same file. The agent-roster root
pointed at `deepseek-harness/packages/preset/agent-presets/presets`, a path
that exists only in a full source checkout - the CLI archive builder never
ships it. Since `scanRoot` treats ENOENT as an empty root, a packaged CLI
composed `roots: []` with `includeShippedRoot: false`: an `agent-presets` row
whose roster had no presets in it, failing nothing. It now resolves the
`presets/` directory of the pinned `@deepseek-ai/dsh-agent-presets` package,
which ships that directory in its own `files` list. Proven by booting the real
tui composition and asserting the service reads four presets off it
(`tests/engine-dsh.spec.ts`), not by asserting the row exists.

Evidence: `acryl-harness-runtime` typecheck clean, 11 new per-surface
assertions green, `engine-dsh.spec.ts` 7/7. The package's suite still reports
the same 4 pre-existing failures (the fresh-profile HMR expectation in
`tests/profile.spec.ts` and three synthetic-fixture tests in
`tests/session-bridge.spec.ts` that use `session.events`, an accessor the
0.1.5-alpha.1 pin replaced with `snapshotEvents()`; one of
them now trips inside `@deepseek-ai/dsh-llm`'s own projection when a synthetic
`assistant/chunk` is appended). Confirmed unchanged by this work: the same
four fail with this commit's files stashed.

## 2026-09-12 - refactor: one plugin lifecycle for every surface (spec 034, T005)

Commit `46cd4796307a070b5b0bc7fa398869a0cb132325`.

The user's report was "we still don't have plugins in WEB and in CLI", and the
reason was structural, not cosmetic: enable/disable/reload/activate existed only
as `acryl-desktop` code. `acryl-control` had a lifecycle *package* (`src/lifecycle/`)
that the Desktop did not use for this, and the state store - the override list
behind `plugin-lifecycle/state.json` - lived in the Desktop source too, so a
second surface could only ever have re-implemented it.

This is the enabling move for T003 (CLI) and T004 (Web panel). The split follows
the repo's existing domain seam:

- `acryl-control/src/plugin/**` (was `src/lifecycle/**`) owns the host-neutral
  mechanics: entry resolution, dependent cascade, transaction ordering, rollback,
  Fiber restart. What a surface may toggle is not a mechanic, so it is now an
  explicit `PluginLifecycleHost` seam (`isMutable`, `protectedReason`, `bundleRow`,
  `bundleGroup`, `setEnabled`, `reloadAllEntryIds`, `afterDeactivate`, `warn`)
  rather than a Desktop-shaped service.
- `acryl-harness-runtime` owns the part every ACRYL surface shares anyway: the DSH
  profile's user-mutable bundle list, the `plugin-lifecycle/state.json` store, and
  how a just-installed bundle inserts its row from its own `dsh.bundle.patch`.
  `createAcrylPluginLifecycle(ctx, options)` builds that authority;
  `mountAcrylPluginLifecycle(ctx, options)` publishes it as `ctx.acrPluginLifecycle`.
- `acryl-desktop/src/plugin-lifecycle-controller.ts` is now a caller (583 to 250
  lines). What stayed is only what a Desktop profile can answer: the always-mutable
  row seed (Canvas and the two brand packages), BLEND lock rows, the cross-plane
  Client projection the Lifecycle tab renders, and pruning the market's stale
  disable record. It publishes the shared service inside the Host plugin's existing
  `ctx.reflect` guard, next to `LivePluginActivationService`.

Two deliberate choices worth recording. Building the authority and publishing it as
a Cordis service are separate acts, because `Service`'s constructor registers with
`ctx.reflect` immediately - a focused route test that mounts `apply` against a bare
ctx stub has no registry, and the previous unconditional mount made 11 such tests
throw. And `activate()` now asks the host for the bundle row *before* the
already-mounted shortcut, so the host stays the single authority on what may be
activated at all; previously a package that was already live could be "activated"
even when no profile bundle declared it.

The Desktop reaches `acryl-control` through `acryl-harness-runtime` re-exports
rather than a new dependency, so no `package.json` or lockfile edit was needed -
which also keeps this commit off the files a concurrent writer is holding.

Evidence: `acryl-desktop` typecheck clean across all five tsconfigs, suite green at
95 files / 850 passed / 4 skipped plus the 3 native launcher tests. The new
assertion in `tests/plugin-lifecycle-controller.spec.ts` is the T005 evidence: it
publishes the service, drives a disable through the Desktop facade and expects the
shared controller to receive it, then drives a disable through the *registry-resolved*
service other surfaces use and expects the Desktop snapshot and the persisted
`state.json` overrides to show it - two surfaces, one lifecycle. `acryl-control`
16/16 in `tests/plugin-lifecycle.spec.ts` against a real Loader, typecheck clean.
`acryl-harness-runtime` typecheck clean; its suite still reports the same four
pre-existing failures recorded in the entry above, unchanged by this work.

## 2026-09-12 - feat: the CLI plugin surface, one store per engine home (spec 034, T003)

Commit `82f05cd2a24e9c1bd6de7b7b731464eda810db2f`.

T003 is the surface the user's report named directly: "we still don't have
plugins in ... CLI". `acryl plugin list|enable|disable|doctor` (and `--json`)
now exist. They own no lifecycle logic - each one boots the profile the way the
TUI does, mounts the same `acrPluginLifecycle` capability the Desktop panel
mounts, drives it, and disposes - so the CLI cannot describe a plugin state the
Desktop would disagree with.

**The store moved to the engine home.** T005 had left the override file under
`resolveAcrylHome()`, i.e. `~/.acryl/plugin-lifecycle/state.json`. That is wrong
for anything other than the default install, and the dev launcher is the case
that proves it: `scripts/dev-local.mjs` sets only `DSH_HOME=~/.acryl-dev/.dsh`,
and `resolveAcrylHome()` ignores `$DSH_HOME` - so an isolated or dev run would
have read and written overrides in the operator's real ACRYL install. The store
is now `<dshHome>/plugin-lifecycle/state.json`, resolved from the home the
process actually booted, which is the one value every surface already agrees on
(all three boot through `resolveAcrylDshHome()`). The Desktop passes its own
`homeDir`, and moves off Electron's `userData`: that directory is private to the
surface, so an override written by `acryl plugin disable` could never reach the
panel. This is a deliberate relocation of Desktop plugin state, and it is the
second time in this spec that a Desktop-private path had to become a shared one.

**Composition.** Both `resolveDshEngineComposition` (tui) and
`resolveWebEngineComposition` (web) now apply `pluginLifecyclePatches()` last, so
a disable is a row-disabling Loader patch on the next boot of any surface rather
than a surface-local view.

**Doctor.** `diagnosePluginLifecycle` is read-only, surface-neutral health in the
runtime: an unreadable override file, an override that outlived its row, an
override on a row the user does not control, a bundle that is installed but
composes nothing, and a bundle the profile lists that does not resolve. The CLI
renders it and exits non-zero only on an `error`. Rendering is the surface's job;
diagnosis is not.

**Resolution is user-facing.** `plugin enable|disable` accepts the entry id a row
shows (`include:ui-acryl`), the patch id the override file stores (`ui-acryl`),
or the package name the market shows, and refuses an ambiguous argument instead
of guessing. `add`/`remove` parse (so the surface matches `plan.md`) and are
refused with a pointer to install/reconcile, T006.

Evidence, cold `ACRYL_HOME=/tmp/acr-034-t003` with one local bundle installed to
give the profile a user-mutable row:

```txt
$ acryl plugin list --profile acryl | grep -v "(core)"
profile acryl (dsh) - 90 plugins
on  include:acryl-evidence-plugin  acryl-evidence-plugin
override file: /tmp/acr-034-t003/.dsh/plugin-lifecycle/state.json

$ acryl plugin doctor --profile acryl
profile acryl (dsh) - 90 plugins
no problems found

$ acryl plugin disable acryl-evidence-plugin
disabled `include:acryl-evidence-plugin` in profile acryl
off include:acryl-evidence-plugin  acryl-evidence-plugin

$ acryl plugin list --profile acryl        # next boot of the same profile
off include:acryl-evidence-plugin  acryl-evidence-plugin

$ cat $ACRYL_HOME/.dsh/plugin-lifecycle/state.json
{ "version": 1, "profiles": [ { "profileName": "acryl",
  "disabledEntries": [ "include:acryl-evidence-plugin" ] } ] }

$ acryl plugin enable acryl-evidence-plugin
enabled `include:acryl-evidence-plugin` in profile acryl
on  include:acryl-evidence-plugin  acryl-evidence-plugin

$ acryl plugin disable include:tools       # core row
acryl: Plugin include:tools is a core capability and cannot be toggled.   (exit 1)

$ acryl plugin disable nope                # unknown row
acryl: profile "acryl" has no plugin "nope"; run `acryl plugin list --profile acryl`  (exit 1)

$ ls ~/.acryl/.dsh/plugin-lifecycle ~/.acryl/plugin-lifecycle   # nothing outside the throwaway home
ls: No such file or directory (both)
```

Suites: `acryl-cli` 17 files / 310 passed, typecheck clean. `acryl-desktop` 95
files / 850 passed / 4 skipped, typecheck clean across all five tsconfigs.
`acryl-control` 41 passed. `acryl-harness-runtime` typecheck clean and its suite
reports the same four pre-existing failures recorded two entries above,
unchanged by this work.

**Found while gathering evidence, not fixed here:** the CLI composes the `tui`
surface, so booting a profile whose own bundles compose what that surface also
inserts fails with `duplicate loader entry id: agent-presets`
(`acryl plugin list --profile desktop`, and the same for the `tui` and `web`
profiles in the operator's real home). It is pre-existing - the `agent-presets`
insert in `coding-capabilities.ts` is committed behavior and untouched by this
commit - and it is the cross-surface half of FR-008, so it belongs with T008
rather than as a side effect of T003. Recorded in `tasks.md`.
