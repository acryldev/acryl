# Research: ACRYL Technical Debt, Refactoring & Stability

**Status**: Active | **Verified against**: `HEAD` = `42c4177`, surface package `acryl-cli@0.1.35`, 2026-09-08.

This file is the evidence catalog. Every finding is a verified fact (path +
measured count or command), a decision, and an alternative — so each entry in
`tasks.md` has proof it is real and a reason it is owed. Facts below were
measured on the current tree; re-measure before relying on a count.

## Sources

- ACRYL CLI `/login` two-step sign-in review (2026-09-08):
  `specs/024-acryl-cli-login/evidence/2026-09-08-cli-login-two-step-review.md`
- Agent-work review (2026-09-08): the other agent committed the surface and
  shipped a release (`0.1.31` → `0.1.35`) but closed none of the architectural
  findings.
- Harness-inheritance investigation:
  `docs/how-acryl-works/07-harness-inheritance.md` and the per-surface manifests.
- Engineering references: `~/.agents/rules/agent-rules-books/clean-architecture/clean-architecture.md`,
  `.../implementing-domain-driven-design/implementing-domain-driven-design.md`
  (encoded in `AGENTS.md` "Architecture and clean-code discipline").

## Finding R1 — Surface owns authorization/credential domain logic

In `acryl-cli/src/tui-app/session.ts` the terminal surface owns a credential /
authorization state machine and durable writes:

```text
computeProviderRows        -> 3 occurrences  (joins ctx.llm + settings + credentials)
loadAuthorizationFlows     -> 6 occurrences  (fetches ctx.authorization, maps records)
ensureProviderActivated    -> 5 occurrences  (WRITES settings via settingsSvc.update)
refreshCredentialState     -> 8 occurrences  (re-runs both loaders)
```

- **Clean Architecture:** Controller-Centric Logic / Layer Bypass — business
  rules inside the interface adapter, reaching into framework service handles
  and persisting state.
- **DDD:** the authorization context's invariants belong in a domain/application
  layer, not the terminal renderer. `acryl-control` is the engine-neutral layer
  but currently owns no credential/authorization projection (`acryl-control/src`
  has agent-control, providers, architecture/projection, lifecycle, protocol,
  contracts — no `/login` service).
- **Decision:** extract the provider/credential read-model and the
  `beginAuthorization` use-case behind an `acryl-control` (or
  `acryl-harness-runtime`) service; overlays render a typed projection.
- **Alternative rejected:** keep it in the surface but type the handles — does
  not fix the boundary; still a second owner of durable state.

## Finding R2 — Internal state encoded into the user-visible provider name

`session.ts` rewrites `settings.displayName` to `<base>-oauth`:

```text
grep -Fc -- "-oauth" acryl-cli/src/tui-app/session.ts  -> 7 hits
  line 359: const baseName = entry.displayName.replace(/(?:-oauth)+$/, '')
  line 360: const oauthName = `${baseName}-oauth`
```

- The retroactive repair loop (`loadAuthorizationFlows` re-suffixing every
  already-OAuth route on launch) exists to clean up the divergence this design
  creates; the in-file comment documents a prior bug where repeated suffixing
  produced multi-hundred-KB display names.
- **Decision:** drop the suffix; render the method badge from a typed
  `authMethod`, never re-author the user-visible name.
- **Alternative rejected:** keep suffixing but make it idempotent — still
  double-bookkeeping of `authMethod` into a presentation field.

## Finding R3 — `configured` means two different things

```text
session.ts:246  configured: userValue !== undefined   (model-profile read)
session.ts:393  configured: record !== undefined      (login-flow read)
```

- One term, two semantics across `/model` and `/login` (Ubiquitous-Language
  violation); the root of the staleness `refreshCredentialState()` tries to patch.
- **Decision:** one credential-state projection with explicit fields
  (`hasCredential`, `hasSettingsProfile`, `isLive`); don't overload one boolean.

## Finding R4 — `refreshCredentialState()` is a shotgun repair

```ts
function refreshCredentialState(): void {
  void loadProviders()
  void loadAuthorizationFlows()
}
```

- Fowler *Shotgun Surgery*: one logical change (a credential mutation) scatters
  to two refresh functions, each a no-op unless its overlay is open.
- **Decision:** a single shared credential/authorization projection the overlays
  subscribe to, or a targeted invalidation event.

## Finding R5 — `AuthMethod` modeled as a primitive / duplicated

```text
actions.ts:49                     beginAuthorization(key: string, method?: string)
login/LoginOverlay.ts:38          type AuthType = 'oauth' | 'api-key'
modelProfile/types.ts:77,95       readonly authMethod: 'oauth' | 'api-key' | undefined
login/types.ts:26                 readonly authMethod: 'oauth' | 'api-key' | undefined
session.ts:227                    const authMethod: 'oauth' | 'api-key' | undefined
```

- Five declarations of one concept, one of them downgraded to bare `string` at
  the seam (Fowler *Primitive Obsession*, DDD *Value Objects*).
- **Decision:** one exported `type AuthMethod = 'oauth' | 'api-key'` used across
  the action contract and the row types.

## Finding R6 — `render()` mutates component state

```text
LoginOverlay.ts:181  render(_width): string[] {
LoginOverlay.ts:186    this.maybeAutoSkipChooser(login)   // sets step/authType/chooserSkipped/autoSkipChecked
```

- Render-phase side effect; the `autoSkipChecked` latch means a late/refreshed
  flow set won't re-evaluate the skip.
- **Decision:** compute step/auto-skip during the data transition (when `flows`
  arrive), not inside `render`.

## Finding R7 — `listWindow`/`visibleRange` duplicated across overlays

```text
login/LoginOverlay.ts:75,80       private listWindow / private visibleRange
modelProfile/ModelProfileOverlay.ts:102,107
```

- Identical container-slicing algorithm in two overlays (the LoginOverlay
  comment literally says "See `ModelProfileOverlay.listWindow` — same bug, same fix").
- **Decision:** extract one narrow, owned helper (deliberately not a generic
  `utils/` dumping ground).

## Finding R8 — Overlay view state is a loose field cluster

```text
private step / authType / authTypeCursor / chooserSkipped / autoSkipChecked /
        listCursor / searchQuery / promptField / promptCursor
```

- Data-clump wanting a type; fields can drift transiently (e.g. `chooserSkipped`
  true while still on the chooser step).
- **Decision:** a small discriminated-union view state
  (`{kind:'authType'} | {kind:'list'} | {kind:'prompt'}`) carrying its own
  cursor/query.

## Finding R9 — pervasive `any` on runtime service handles

```text
grep -c ": any" acryl-cli/src/tui-app/session.ts   -> 19
```

- `const settingsSvc: any = host.ctx.get('settings')` etc. Every `any` defeats
  the typed `ctx.get(...)` contract and the "surfaces talk to a typed
  `acryl-control` API" guarantee. Regressed (up) since the review.
- **Decision:** type the service handles (or route through a typed `acryl-control` port).

## Finding R10 — Spec drift: `specs/024-acryl-cli-login`

- `specs/024-acryl-cli-login/spec.md` still describes the single-list
  `/login [provider]` model (Stage 1/2). The shipped CLISurface is a two-step
  auth-type chooser + fuzzy-searchable provider list + `ctrl+p` custom-provider
  jump — not reflected in spec/plan/tasks. `git status specs/024-...` shows only
  the review evidence doc (untracked); `spec.md` is unchanged.
- **Decision:** update the spec/plan/tasks to the shipped design, or open a
  superseding ledger/ticket; never leave the ledger describing an un-shipped design.

## Finding R11 — Headless gate fails without `CI=true`

```text
corepack pnpm --filter acryl-cli run typecheck  -> exit 1
   (pnpm deps-status pre-check: "pnpm install --production")
CI=true corepack pnpm --filter acryl-cli run typecheck -> exit 0
```

- The documented `typecheck`/`verify`/`check` loop is blocked until the
  workspace is installed; a fresh `pnpm install` (or `CI=true`) is required.
- **Decision:** run `pnpm install` so the plain gate is green; reconcile the
  install/lockfile state. Re-measure before assuming it is fixed.

## Finding R12 — New test committed separately / uncommitted

- `acryl-cli/tests/tui/login-preview.spec.ts` is untracked (never committed) —
  a test with no commit, contradicting the repo rule that a test lands with the
  behavior it covers.
- **Decision:** commit it with (or before) the behavior, or remove it.

## Finding R13 — Submodule version/gate drift

- `git submodule status` shows `+b4c7f9a… deepseek-harness (dsh-v0.1.3-alpha.2-134)`:
  the `+` means the checkout differs from the recorded gitlink (`cd5ef81`),
  and `upstream.json.commit` is `c389f96`. Three disagreeing values →
  `pnpm run check:layout` fails submodule consistency.
- Deliberate split: `sourceVersion` `0.1.3-alpha.2` ≠ `runtimePackageVersion`
  `0.1.1-rc.2` (source ahead of the published family); presets read from the
  newer source than the runtime consumes.
- **Decision (R13a):** reconcile via `pnpm run upstream:update`, commit pointer +
  `upstream.json` together. **Decision (R13b, optional):** align
  `runtimePackageVersion === sourceVersion` at each upstream:update so presets
  and code never drift.

## Finding R14 — Harness-inheritance gate gaps and Desktop duplication

- `scripts/verify-layout.mjs` submodule-bypass check previously omitted
  `acryl-web` + `acryl-harness-runtime` (now fixed by commit `31b6108`), but the
  `runtimePackageVersion` "family" check still covers **only** `acryl-desktop`;
  `acryl-cli`/`acryl-web`/`acryl-harness-runtime` are not gate-enforced to the
  family. (Convention, not enforcement.)
- `acryl-desktop` composes the harness itself (`src/main.ts` uses
  `@deepseek-ai/dsh-app-boot` primitives with its own `~/.dsh-acryl` home, 131
  direct `dsh-*` deps) rather than through `acryl-harness-runtime` — the M3
  "drain reusable profile/runtime from Electron" migration.
- **Decision (R14a):** extend the `runtimePackageVersion` family check to every
  manifest declaring `dsh-*` deps. **Decision (R14b):** make the presets
  submodule read a loud (CI/layout assertion that
  `deepseek-harness/packages/preset/agent-presets/presets` exists when the
  submodule is initialized), so a missing submodule can't silently shrink
  `/presets`. **Decision (R14c):** move `scripts/web-run.mjs` →
  `acryl-web/bin/dev-run.mjs` so every surface owns its launcher (symmetry with
  `acryl-cli/bin/dev-run.mjs`).

## Cross-cutting decisions (encoded in `AGENTS.md`)

- Surfaces never own domain/business logic; logic belongs behind
  `acryl-control` / `acryl-harness-runtime`.
- Typed service interfaces only (`inject`, typed `ctx.get(...)`); a
  `const svc: any = ctx.get('x')` is a review failure.
- One term one meaning; prefer IDs across boundaries; small aggregates.
- `render()`/projection functions are pure; view state is a discriminated union.
- Land coherent, buildable commits; keep the spec ledger honest.

## Finding R15 — "update everything to latest" (DSH + pi-tui) — verified feasible, both patch-blocked

**Question:** can we update the `deepseek-harness` submodule / npm family and make all
surfaces depend on the latest upstream?

**Verified facts (2026-09-08):**
- **DSH:** submodule is **430 commits behind** `origin/master` (pin at `0.1.3-alpha.2`,
  `b4c7f9a`; upstream tip `dsh-v0.1.5-alpha.1`). The runtime npm family everywhere is
  `@deepseek-ai/dsh-*@0.1.1-rc.2` (gate-enforced). `0.1.5-alpha.1` **is published** on npm.
- **pi-tui:** current pin `0.84.2`; latest is **`0.85.1`** (`@earendil-works/pi-tui`, public npm).
- **Both bumps break version-pinned local patches** (probe: `patch --dry-run` against the new tarball):
  - DSH: `dsh-llm-deepseek`, `dsh-client-ui-directory-picker-browse`, `dsh-client-ui-trajectory`
    FAIL (and `dsh-sandbox-windows-acl` unconfirmed) — ~4 of 8 need re-porting; the other
    four (`dsh-app-boot`, `dsh-web-app`, `dsh-client-ui-settings-models`, `dsh-client-ui-workspace`)
    apply cleanly.
  - pi-tui: the `@earendil-works__pi-tui@0.84.2.patch` (touches `dist/tui-alt-screen.js`, NOT
    OAuth branding — that patch is `__pi-ai@0.82.1.patch`) FAILS at `0.85.1`.

**Decision:** neither is a clean bump; each requires a **patch re-port + full gate**.
Do them as separate, controlled migrations. The submodule is read-only reference + the npm
family is what runs (existing architecture); for pi-tui, a read-only reference submodule is
fine for sync/visibility but keep consuming the published package — importing submodule source
into `acryl-cli`'s tsdown/build-cli-archive pipeline is a real release-surface cost.

**Open decision (user):** patch strategy — (1) upstream ACRYL-specific patches, (2) keep as
pnpm patches regenerated per bump, (3) maintain a fork; and sequencing — now vs after M9
(engine swap) settles. Until chosen, execution is blocked.

**Consequences for tasks:** T025–T027 record this; T022/M9 sequencing cannot overlap a bump.

## Finding R16 - upstream DeepSeek Harness now ships its own Desktop (`apps/desktop`, `apps/desktop-host`)

**Date:** 2026-10-02. **Source:** the pinned submodule at `0.1.5-alpha.1` (`5dda764`), read directly; upstream `master` is 4,381 commits ahead of that pin and was not read. Nothing here was run. Rationale of record is upstream's Agent Note `deepseek-harness/.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.md`.

**What upstream Desktop is** (packages `@deepseek-ai/dsh-desktop` and private `@deepseek-ai/dsh-desktop-host`, about 3,350 lines of source):

- An Electron shell that runs the dsh backend in a **bundled upstream Node.js child process** (not Electron's Node), with a bundled pinned pnpm.
- **No listening port.** Fetch requests and streamed responses travel over two versioned framed byte pipes; Electron serves validated assets through a `dsh-app://` protocol. ACRYL Desktop instead serves the client over `http://127.0.0.1:<port>`.
- A reserved profile `$DSH_HOME/profiles/desktop` owned only by Electron; the CLI and Web cannot mutate it. One release number covers the Electron shell and its exact dsh and Desktop Host versions.
- Installs and updates are **staged, health-checked, then swapped**, with an activation journal for recovery. Update is one `electron-updater` stream with signed `electron-builder` artifacts (macOS dmg and zip, Windows nsis, a Linux target), notarization and Windows EV signing described in the note.

**How it differs from ACRYL Desktop** (`apps/acryl-desktop`):

| Topic | Upstream Desktop | ACRYL Desktop (today) |
|---|---|---|
| Host process | Separate Node child, shell is Electron only | Cordis Host runs inside Electron's main process (`main.ts:835`, `createAcrylEngineHost`) |
| Transport | `dsh-app://` plus framed pipes, no port | Localhost HTTP and WebSocket upgrade routes |
| Plugin changes | Staged install, health check, replace active project | Live: `dsh plugin add` then `livePluginActivation.activate`, no restart (`docs/acryl/plugin-hot-reload.md`) |
| Updates | One signed `electron-updater` unit | Poll, download a full installer, hand off to the OS (`apps/acryl-desktop/src/updates/`); endpoints point at `dshdesktop.cn` |
| State | Reserved `profiles/desktop`, single-instance lock, journal | `AppInstance` homes (`~/.acryl`, `~/.acryl-dev`), per-profile lifecycle files |
| Release | `electron-updater` feed | `publish` unset, no feed; no `.deb` or `.msi` target |

**Adoption risks specific to ACRYL** (each stated with how it was or was not verified):

1. **WebSocket routes.** ACRYL features depend on same-origin WebSocket upgrades: workspace terminals (`plugins/acryl-workspace/src/pty/stream.ts`) and Agent Control (`plugins/acryl-agent-control/src/host/stream.ts`). A search of `apps/desktop-host/src` and the host protocol in `apps/desktop/src` found no upgrade or WebSocket handling. Not confirmed absent in upstream `master`.
2. **Live plugin activation.** Upstream's staged-swap model has no equivalent of ACRYL's no-restart activation, which agent self-extension (spec 037) relies on. Not tested.
3. **Native modules and the loader.** ACRYL runs the Host in Electron's main process, where `--expose-internals` and its prebuilt addon work. Under a separate upstream Node child that flag and addon would have to be supplied by the child. Not tested.
4. **Patches.** ACRYL carries version-pinned patches against `@deepseek-ai/dsh-*` (see R15). Upstream Desktop packs first-party dsh packages from one source build, so ACRYL patches would not be carried unless reapplied in that pack step.
5. **Dependency gap already hit:** the packaged ACRYL app lacked `@deepseek-ai/node-addon-system-darwin-arm64`, a platform package the harness needs for session resume (found 2026-10-01 while building a test DMG). It is not listed in `apps/acryl-desktop/package.json`.

**What is worth adapting regardless of Electron** (candidate ideas, no code changed): staged install with health check and rollback, a single signed update unit, a real update feed, state ownership with a single-instance lock, and no exposed port. The port-less transport is the one with the largest ACRYL cost (risk 1).

**Consequences for tasks:** T032 to T038 below. These do not replace T025 to T027; the harness bump must land first or together.

## Finding R17 - dry run of moving to upstream `dsh-v0.2.0-rc.2` (T033, partial)

**Date:** 2026-10-02. **Where:** branch `harness-latest-2026-10`, worktree `../acryl.worktrees/harness-latest-2026-10`, submodule checked out at `639ed01` (tag `dsh-v0.2.0-rc.2`, 2026-09-29, version `0.2.0-rc.2`, npm dist-tag `latest`). Nothing was installed, built or committed on the branch; no ACRYL process was started.

**Size of the jump:** from `0.1.5-alpha.1` (pin `5dda764`, 2026-09-08), 6,269 files changed in `apps`, `packages` and `vendor`. ACRYL references the old version in 40 non-lockfile files and about 3,560 lockfile lines, and pins 213 distinct `@deepseek-ai/*` packages to it.

**Patches** (`patch --dry-run -p1` against the published `0.2.0-rc.2` tarballs). Five of six apply; this replaces the R15 picture, where `dsh-llm-deepseek`, `dsh-client-ui-trajectory` and `dsh-sandbox-windows-acl` no longer have patches.

| Patch | Result |
|---|---|
| `dsh-app-boot`, `dsh-client-ui-settings-models`, `dsh-client-ui-workspace`, `dsh-web-app`, `dsh-win32-process` | apply |
| `dsh-client-ui-directory-picker-browse` | **fails**: 1 of 11 hunks in `lib/client.js`; the other two files apply |
| `pi-ai`, `pi-tui`, `app-builder-lib`, `dshmarket`, `node-pty` | unrelated to the harness bump, not tested |

The dry run shows a patch applies textually, not that it still behaves correctly.

**Blocker: six pinned packages have no `0.2.0-rc.2` release and are gone from upstream's package tree.** Of 213 pinned names, 207 exist at the new version.

| Missing package | Where ACRYL uses it | Upstream replacement |
|---|---|---|
| `dsh-agent-presets` | `apps/acryl-desktop/src/profile.ts`, `src/windows/windows-agent-presets.ts`, `runtime/acryl-harness-runtime/src/coding-capabilities.ts`, runtime and web manifests, tests | Not confirmed. New tree has `dsh-agent-preset` and `dsh-agent-preset-registry` (separate packages) |
| `dsh-settings-file` | `apps/acryl-desktop/src/profile.ts`, runtime, cli, market tests | Not confirmed. New tree has `dsh-settings` |
| `dsh-code-runtime`, `dsh-code-runtime-worker-thread` | runtime, desktop and web manifests | Not found in the new tree |
| `dsh-workflow-worker-thread` | runtime, cli, desktop and web manifests | Not confirmed. New tree has `dsh-workflow`, `dsh-workflow-ptc`, `dsh-tool-workflow` |
| `dsh-client-ui-sidebar-textpreview` | desktop and web manifests | Not confirmed. New tree has `dsh-client-ui-sidebar-documentpreview` |

The "replacement" column is inferred from names only. These are Loader row names and package dependencies in ACRYL's profile composition, so each needs its upstream change read before any edit. No upstream rename note was found.

**Not checked:** typecheck against the new APIs, the Host-side API changes ACRYL touches, a boot of the web or desktop host on the new version, and the 4,381-commit history for breaking-change notes.

**Consequence:** T034 (patch strategy) is now a smaller decision (one patch to re-port), but T035 depends on first mapping the six removed packages. Suggested order: read the upstream package READMEs and Agent Notes for the six, write the mapping here, then bump manifests and the lockfile.

## Finding R18 - mapping the six removed packages (T033 continued)

**Date:** 2026-10-02. **Method:** `git diff -M40%` from the old pin (`5dda764`) to upstream `master` (`639ed01`, `dsh-v0.2.0-rc.2`) restricted to `packages/`, matching deleted files in each old directory to renamed files elsewhere; `npm view` for each candidate at `0.2.0-rc.2`; upstream commit messages and Agent Notes. Rename detection is by file similarity, so each row is evidence for a successor, not proof that the config schema and Loader row behavior are unchanged. No ACRYL file was edited.

| Removed package (old path) | Successor evidence | Confidence |
|---|---|---|
| `dsh-client-ui-sidebar-textpreview` (`packages/client/ui-sidebar-textpreview`) | `packages/client/ui-sidebar-documentpreview`: `src/client/definition.ts` R85, tests R100. Published `@deepseek-ai/dsh-client-ui-sidebar-documentpreview@0.2.0-rc.2` | Likely a rename |
| `dsh-workflow-worker-thread` (`packages/workflow/workflow-worker-thread`) | `packages/workflow/workflow-ptc`: `src/meta.ts` R94, realm and meta tests R100. Published `dsh-workflow-ptc@0.2.0-rc.2` | Likely, but the name suggests a different execution model (PTC), so behavior may differ |
| `dsh-code-runtime`, `dsh-code-runtime-worker-thread` (`packages/code-runtime/*`) | `packages/ptc-runtime/ptc-runtime` and `ptc-runtime-node` (`src/output-json.ts` R94, bootstrap test R92). Published `dsh-ptc-runtime` and `dsh-ptc-runtime-node` at `0.2.0-rc.2` | Likely a rename |
| `dsh-agent-presets` (`packages/preset/agent-presets`) | `packages/preset/agent-preset-registry` (tests R100) plus the existing `agent-preset`. Commits `d1e22a7e24` "declare Agent compositions in profile YAML" and `b13bbc027c` (2026-09-21) | Split into registry and profile-declared compositions; ACRYL's use needs reading |
| `dsh-settings-file` (`packages/settings/settings-file`) | **No successor.** Commit `601d6761e4` (2026-09-21) "project volatile Config through profile-backed forms" removed it; upstream's configuration note states the `settings.yaml` tier is "superseded by profile-owned live configuration" (`2026-09-19-profile-owned-live-configuration.md`). The new `dsh-settings` edits plugin `Config` fields declared `.volatile()` and persists through the profile, a different design | **Architectural change, not a rename** |

**Why `dsh-settings-file` matters most.** `apps/acryl-desktop/src/profile.ts` imports `FileSettingsProvider` and `resolveSpec` from it, requires the profile's settings row to be exactly that package (lines 86 and 788 to 795), and reads startup settings and shell mode from its `Config` (lines 173 and 198). Tests in `apps/acryl-desktop/tests/market-pnpm-integration.spec.ts`, `plugins/cordis-plugin-market/tests/market-install.spec.ts` and `market-settings-persistence.spec.ts` assume it. ACRYL homes also carry `settings.yaml` files (for example `~/.acryl/.dsh/settings.yaml`). Moving to the new harness means redesigning where ACRYL's non-secret settings live, not renaming an import.

**Other checks, not done:** the read of `2026-09-19-profile-owned-live-configuration.md` and the new `dsh-settings` README beyond the summary; the row config schemas of the renamed packages; the effect on ACRYL's Loader row ids in `coding-capabilities.ts`.

**Consequence for T035:** split it. T035a covers the four likely renames (package names, manifests, lockfile, row ids, tests). T035b is a design task for settings: adopt profile-owned live configuration, or keep a local file-backed provider. T035b should be decided before any manifest bump on the branch.

## Finding R19 - correction to R16, and the owner's direction (2026-10-02)

**Correction.** R16 described upstream Desktop from the old pin (`0.1.5-alpha.1`): no listening port, framed byte pipes, WebSocket support not found. Reading `dsh-v0.2.0-rc.2` (`deepseek-harness/apps/desktop` and `apps/desktop-host`) shows a different design:

- The UI is loaded from `dsh-app://app/`, but the shared profile runner (started as an Electron RunAsNode child) serves the Web application on **`127.0.0.1:19387`** (`desktop-host/src/index.ts` passes `--no-open --port 19387`; the README says the port is separate from Web's `3080` and a `webserver port` patch can override it).
- Electron handles WebSocket requests to `ws://127.0.0.1/*` from the main window: `desktop/src/main.ts:710` adds the host cookie and rejects any request whose `Origin` is not `dsh-app://app`.
- So R16 risk 1 (WebSocket routes) is **reduced**: a mechanism exists. It is not yet shown to work for ACRYL's routes. ACRYL's Agent Control channel and terminal stream check the page `Origin` strictly (`specs/041-agent-control/research.md`, T001), so under upstream Desktop the origin would be `dsh-app://app` rather than an `http://127.0.0.1` origin; whether those checks accept it is untested.
- R16's other facts (bundled Node child, bundled pnpm, staged install, one release number) were read from the pin and are not re-verified at rc.2, except that the README at rc.2 still states a RunAsNode child and bundled pnpm.

**Owner direction (clarified 2026-10-02, replaces the first wording).** The submodule was pinned at `0.1.5-alpha.1` when upstream had no Desktop, and ACRYL's Desktop is a fork of a third-party Electron wrapper around the harness core. Upstream now ships its own Electron Desktop and a much newer runtime (`0.2.0-rc.2`). The direction is **not to delete ACRYL's work**. It is:

1. **Keep everything ACRYL achieved** and make it ready to be re-attached to DSH 0.2: the Development Canvas, the Tab Stripe, the multi-chat "Chats of AcrylDSH" and workspace left panel, PTYs, agents, workspaces, Agent Control, Blends, the market, and the CLI and TUI. Expect them to break at first; they are re-attached, not rewritten from nothing.
2. **The most valuable part of upstream is its core runtime:** how the agent works, its bug fixes, chat and trajectory. That is what ACRYL takes from DSH 0.2.
3. **Stage A:** first make stock DSH 0.2 run on its own, with its own default sidebar, in an isolated home.
4. **Stage B:** re-attach ACRYL's left panel, tab strip and canvas to the 0.2 runtime. Upstream's default left panel with chats is eventually replaced by ACRYL's.

**What this settles and what it leaves open.** Nothing is dropped or deleted now. ACRYL's own Electron shell stays as it is until the re-attachment shows whether it can run on upstream's Desktop or must stay separate. Open:

1. **Which shell hosts the re-attached UI:** upstream's Desktop (`apps/desktop`), or ACRYL's existing Electron shell running the 0.2 runtime. Decided after Stage B shows what breaks.
2. **Whether upstream can host ACRYL's plugins and routes:** composing ACRYL's rows into upstream's `desktop` profile, live activation of agent-written plugins (upstream installs through a staged, health-checked install), the WebSocket origin checks above, and ACRYL's `settings.yaml` home (R18).
3. **Branding and release channel:** upstream's update endpoints, signing identity and product name are its own.

**Consequence for tasks:** T036 becomes Stage A (stock DSH 0.2 runs by itself in an isolated home) and T036b the first Stage B step (one ACRYL plugin and one WebSocket route on top). Spec 042's shell comparison is parked: it is not needed unless ACRYL later owns a shell again. Its findings on the Node host, `node-pty` and hot reload remain valid.

## Finding R20 - final direction: ACRYL owns its surfaces, DSH 0.2 is the engine and one agent type (2026-10-02)

**This supersedes the direction paragraphs of R19** (R19's facts about upstream Desktop at `rc.2` stand). R19 read the owner as wanting to adapt around upstream's Desktop; the owner clarified twice, and the direction is:

1. **ACRYL builds and owns its own Web and Desktop surfaces**, with an Orca-like IDE experience: the Tab Stripe, the workspace and chats left panel, the Development Canvas, PTYs and terminals, agents, workspaces.
2. **DSH is the runtime, deeply integrated, not the app.** "AcrylDSH chat" is the default agent type in the tabs, the one that drives the app; any other agent (Claude Code, Codex, OpenCode and so on) and any PTY or terminal sit beside it as other tab types.
3. **Nothing ACRYL built is deleted.** It is kept and re-attached to DSH 0.2, and will break at first.
4. **Upstream's Desktop and its default left panel are references**, not the base. Ideas worth borrowing from upstream Desktop (staged install with health check and rollback, one signed update unit, state ownership) are tracked separately in T037.

**This matches the existing architecture.** `docs/acryl/MENTAL-MODEL-factory-car-driver.md` already says ACRYL is the factory and never swapped, the harness engine is the swappable car (roadmap M9, `specs/028-harness-engine-swap`), and the model is the driver. The seam exists: surfaces call `createAcrylEngineHost({ engines, initialEngine, prepare })` and an engine is an `AcrylEngineDefinition` (`createDshEngineDefinition`, `createDshEngineDefinitionFromComposition`, `createWebEngineDefinition` in `runtime/acryl-harness-runtime`). Moving to DSH 0.2 is therefore an engine upgrade behind that seam, not a surface rewrite.

**Effect on spec 042 (shell).** The shell decision is open again and relevant: ACRYL owns a shell, so Electron versus a native-webview shell still matters. The findings in `specs/042-electrobun-optimization` (Option A, Node host as a sidecar; measured Bun gaps; Tauri as the best-documented candidate) remain valid. It is no longer parked.

**Stage A result: stock DSH 0.2 boots by itself (T036).** Measured 2026-10-02 with the published `@deepseek-ai/dsh@0.2.0-rc.2` installed with npm into a scratch folder (506 MB of `node_modules`), `DSH_HOME` pointing at an empty scratch directory, `dsh --profile web --no-open --port 38460`:

- Boots and prints a tokenized URL. `GET /` without the token is 401; with the token it sets a cookie and serves the index (200, about 34.8 KB, 11 script tags).
- The client boot graph names the default UI plugins: `dsh-client-ui-sidebar` (the default left panel), `-sidebar-files`, `-sidebar-terminal`, `-sidebar-right`, `-sidebar-documentpreview`, `-chat`, `-conversation`, `-session`.
- The process was stopped and the port confirmed free. No ACRYL home or main-checkout file was involved.
- Not tested: starting a chat (needs a model key), the rendered page in a browser, npm install scripts (npm skipped the native builds; `node-pty` ships prebuilt binaries).

**Consequence for tasks:** T036 evidence is recorded above. T036b becomes: add a DSH 0.2 engine definition behind the existing engine seam on the branch and re-attach one ACRYL surface piece (the workspace shell with the Tab Stripe) and one WebSocket route (the terminal stream) to it in an isolated home, listing what breaks. T035b (settings home) and the six package mappings (R18) are prerequisites for the engine definition.

## Finding R21 - execution log: moving the branch to `dsh-v0.2.0-rc.2` (2026-10-02, in progress)

Branch `harness-latest-2026-10`, worktree `../acryl.worktrees/harness-latest-2026-10`. Notes are written here on `main`; the code changes stay on the branch, uncommitted until the install and typecheck results are in. Only isolated homes are used; upstream imports `$DSH_HOME/settings.yaml` once into the active profile and renames it to `settings.yaml.imported` (upstream note `2026-09-19-profile-owned-live-configuration.md`), so running 0.2 against a real ACRYL home would rename the user's file.

**T035b decision (settings home): adopt upstream's profile-owned live configuration.** Reasons: upstream removed the file-backed provider and will not maintain it; keeping a second store is the alternative upstream rejected (two durable documents to reconcile); upstream already imports an existing `settings.yaml` once, which gives a migration path. Cost: ACRYL Desktop's startup settings (shell mode, port, blend) currently read from `settings.yaml` through `dsh-settings-file`'s `resolveSpec` in `apps/acryl-desktop/src/profile.ts` (lines 173 to 210 and 780 to 812); those must read from profile entry config instead. Persisted form values become profile-specific (no cross-profile preferences).

**Done on the branch so far**

| Step | Result |
|---|---|
| Submodule | Checked out at `639ed01` (`dsh-v0.2.0-rc.2`); `upstream.json` set to that commit, `sourceVersion` and `runtimePackageVersion` `0.2.0-rc.2` |
| Manifests | 20 `package.json` files: every `@deepseek-ai/*` pin `0.1.5-alpha.1` to `0.2.0-rc.2` (about 760 lines), plain text edits so formatting is unchanged. Renames from R18 applied: `sidebar-textpreview` to `sidebar-documentpreview`, `workflow-worker-thread` to `workflow-ptc`, `code-runtime` to `ptc-runtime`, `code-runtime-worker-thread` to `ptc-runtime-node`, `agent-presets` to `agent-preset-registry`. `dsh-settings-file` removed from 5 manifests (apps cli, desktop, web, market, runtime) |
| `pnpm-workspace.yaml` | Version and name updates in `patchedDependencies`, overrides and the 230-line `minimumReleaseAgeExclude` list; `dsh-settings-file` entry removed |
| Patches | Six harness patches renamed to `0.2.0-rc.2`. `dsh-client-ui-directory-picker-browse` re-ported: ACRYL's block of `.ZuhsRW_nativePickerButton` styles inserted at the same anchor in upstream's new CSS string, and the `textContent` line updated; regenerated as a `git diff` patch with the same 14 hunks and 3 files; verified to apply to the pristine published tarball and to still contain `pickNativeDirectory`, `validateDirectory` and `nativePickerButton`. A first re-port attempt was blocked by a safety check on a relative `rm` glob; it was redone in fresh temp directories without removals |
| `pi-ai` patch | The harness now requires `@earendil-works/pi-ai ^0.87.1` (ACRYL's OAuth-page patch targeted `0.85.1`). The patch applies to `0.87.0` and `0.87.1`; renamed to `@earendil-works__pi-ai@0.87.1.patch` |
| Lockfile resolution | `pnpm install --lockfile-only --no-frozen-lockfile --ignore-scripts` ran past the "resolved 1366" point where installs hung before; first run failed only on the unused `pi-ai@0.85.1` patch, fixed above, second run in progress |

**Not yet done:** lockfile write and frozen install, build, typecheck, source changes for removed packages (`profile.ts` settings, `windows-agent-presets.ts`, `coding-capabilities.ts`, `verify-packaged-runtime.ts`, tests), the closure gate (`verify-runtime-closure`) against 0.2's new dependency set, an isolated host boot, and the first re-attachment check.

## Finding R22 - protocol: what ACRYL takes from DeepSeek Harness, and why (owner direction, 2026-10-02)

**Premise.** The DeepSeek team will keep changing their harness a lot (observed: between `0.1.5-alpha.1` and `0.2.0-rc.2` six packages were removed or renamed, the settings design was replaced, and Desktop's transport changed). ACRYL must not be shaped by that churn.

**What ACRYL takes from upstream, and keeps:** the **Cordis plugin system and orchestration** (Loader, fibers, services, effects, composition). That is the durable asset, and it is what ACRYL extracts as a framework: **ACRYL Blends**, whose native units are Cordis plugins (specs `033-acryl-blends-runtime-contract`, `036-cordis-ecosystem-and-acryl-blends`).

**What ACRYL does not make central:** the DSH chat. **AcrylDSH chat is one agent, one of the "builders", inside the Cordis plugin ecosystem**, alongside any other agent a user brings (Claude Code, Codex, OpenCode, Gemini, their own). A user can rely entirely on their own agents and never use the DSH chat. This extends R20: ACRYL owns the surfaces, DSH is the engine and one agent type, and now also the DSH engine is optional, not load-bearing.

**Rules this implies for the DSH 0.2 work (R18 to R21):**

1. **Thin adapter, not deep coupling.** Everything that touches DSH internals (package names, row ids such as `agent-preset-registry`, settings shape) lives behind the engine seam (`createAcrylEngineHost` and an `AcrylEngineDefinition`) so an upstream change is absorbed in one place.
2. **ACRYL surfaces and plugins depend on Cordis and ACRYL contracts, never on `@deepseek-ai/dsh-*` package names.** Today they do in many places (`profile.ts`, `coding-capabilities.ts`, `windows-agent-presets.ts`, about 760 manifest pins). Each such reference is debt to be moved behind the seam, and no new one should be added.
3. **Keep local patches of upstream packages to a minimum.** Each patch is a cost on every upstream release (R15, R17: one of six failed this bump). Prefer an ACRYL plugin that replaces or wraps a slot over patching an upstream package.
4. **Pin and update on our schedule.** The submodule stays as the channel for reading and tracking upstream; ACRYL consumes published packages at a version it chooses, and moves only when there is a reason (a fix it needs), with a dry-run report like R17 before any bump.
5. **The engine is replaceable.** The same seam must let a non-DSH agent drive the app (spec 028, roadmap M9). Work on DSH 0.2 should not make that harder.
6. **Time-box DSH-specific adaptation.** The DSH 0.2 branch is worth the effort of getting the engine running behind the seam and re-attaching the surfaces. It is not worth deep rework of features that exist only to match upstream's current internals (for example, rebuilding ACRYL's settings around upstream's profile-owned config beyond what Desktop's startup needs).

**Consequence for tasks.** Add to the T035 and T036b acceptance: report how many ACRYL files reference `@deepseek-ai/dsh-*` names directly before and after, and treat a lower count as progress. New Phase 9 item T039 below.

## Finding R23 - pnpm 11.11.0 cannot resolve `electron-builder` from scratch; the hang explained (2026-10-02)

**Symptom.** On the harness-bump branch, `pnpm install` (with `--lockfile-only` or full) resolved 1375 packages and then either exited with code 0 without writing the lockfile or sat at 0 percent CPU forever. This is the same "stalls at resolved 1366" behavior recorded in project memory for earlier installs.

**What it is not** (each ruled out by a measured test): not the network or the shared store (a private store reproduced it; `ndjson` logging showed only skipped other-platform optional packages "pending"); not a `.pnpmfile.cjs` (none exists); not the release-age policy (`minimumReleaseAge=0` changed nothing); not the harness bump or the renamed packages (a project depending only on `@deepseek-ai/dsh@0.2.0-rc.2` resolves in 1.6 s; the unchanged `main` manifests re-lock fine because nothing needs fresh resolution).

**Cause.** A scratch project whose only dependency is `electron-builder@26.15.7` never reaches `resolution_done` under pnpm **11.11.0**, the version the repository pins (`packageManager`). Node exits cleanly with no `process.exit` call (`--trace-exit`), so an internal promise never settles. The same project resolves normally under pnpm 11.23.0, 11.8.0, 11.7.0 and 10.33.0 (all cached by corepack on this machine). A bisect over the 275 external dependencies of `apps/acryl-desktop` named `electron-builder` as the only trigger.

**Workaround used.** Run the relock with another corepack-cached pnpm and stop it from switching back to the pinned one: `node ~/.cache/node/corepack/v1/pnpm/11.8.0/bin/pnpm.cjs install --lockfile-only --no-frozen-lockfile --ignore-scripts --config.manage-package-manager-versions=false`. 11.8.0 was chosen as the closest to 11.11.0 (11.23.0 writes a differently sized lockfile). It finished in 13 s and wrote a lockfile with the same format (`lockfileVersion: '9.0'`, two documents). Installs from a finished lockfile (`--frozen-lockfile`) work under 11.11.0 because they do not re-resolve (the earlier DMG-build install did).

**Result of the relock.** 15,527 insertions and 6,332 deletions in `pnpm-lock.yaml`. Every `0.1.5-alpha.1` reference became `0.2.0-rc.2`. Patch hashes are unchanged except for the re-ported `dsh-client-ui-directory-picker-browse` patch. 61 non-harness packages resolved to a different version (AWS SDK credential providers, Babel plugins, `@anthropic-ai/sdk`, `@electron/get`, `@electron/notarize`, `@earendil-works/pi-ai` and pi-telemetry, among others); 75 non-harness packages were added and 118 removed. These transitive changes ride along with the bump and need the full gate.

**Follow-ups.** T040: move the repository's pinned pnpm to a version that resolves `electron-builder` (candidates 11.23.0 or the cached 11.8.0), or report the 11.11.0 hang upstream to pnpm; until then any relock needs the workaround above. The project memory note `acryl-pnpm-install-hang.md` should record the cause.

## Finding R24 - what breaks moving ACRYL to `dsh-v0.2.0-rc.2` (T033 and T035a execution, 2026-10-02)

Measured on branch `harness-latest-2026-10` after R21 to R23: lockfile regenerated with pnpm 11.8.0, frozen install, then package builds. Nothing here is committed to `main`; code changes are on the branch worktree.

**Fixes that were mechanical and worked**

| Break | Cause | Fix |
|---|---|---|
| `Volatile` not exported from `@deepseek-ai/cordis`; two copies of the loader types (TS2717, TS2322) | 0.2 packages require `@deepseek-ai/cordis ~4.0.4` and a newer plugin family; ACRYL pinned 4.0.2, loader 1.0.3, include 1.0.7, hmr 1.0.17, group 1.0.2, timer 1.1.4 | Bumped to the versions vendored in the 0.2.0-rc.2 submodule: cordis 4.0.4, loader 1.0.5, include 1.0.9, hmr 1.0.19, group 1.0.4, timer 1.1.6 (25 manifests). **Cordis itself moves with the harness** |
| Two copies of `cordis-plugin-loader` types | Loader 1.0.5 peers `node-addon-require-builtin ^0.1.6`; ACRYL pinned `^0.1.4` and platform packages 0.1.5, so 0.1.5 and 0.1.7 were both installed | Pinned `^0.1.6` and platform packages `0.1.7` (desktop, runtime) |
| `dsh-session` types import `@deepseek-ai/dsh-typert-protocol` (TS2307) | Upstream manifest does not declare it | `packageExtensions` entry in `pnpm-workspace.yaml` (ACRYL already uses this mechanism for React types) |
| Two copies of `@deepseek-ai/schemastery` (3.18.2 and 3.18.4, TS6200) | ACRYL ranges `^3.18.1`, `^3.18.2` | Pinned `~3.18.4` (10 manifests) |
| `healProfilesModuleFallback` not exported; `initProfile` takes 2 arguments; `ProfileTemplate.patchReload` removed | `dsh-app-boot` dropped the link backend; it now exports `removeLinkProjections(dir)` for leftovers of 0.1.5-era profiles | `runtime/acryl-harness-runtime/src/index.ts` and `engine-dsh.ts`: call `removeLinkProjections(profileDirectory)` instead of the heal call; drop the third `initProfile` argument. Behavior change to verify at boot: profile patch-file reload mode (`live` or `startup`) is no longer a template field |
| `SidebarRightGuideEntry` requires `id` (4 TS2741) | New required field | Added `id` (the tab's id constant) to the guide entries in `files-tab.ts`, `changes-tab.ts`, `checks-tab.ts`, `review-tab.ts` |
| Harness patches fail to install (`ERR_PNPM_PATCH_FAILED`) | pnpm's applier does not allow the large line offsets GNU `patch` tolerates; context moved by about 2,400 lines | Regenerated all as `git diff` patches against the new tarballs (changed lines identical to the old ones); `pi-ai` patch retargeted to 0.87.1. **Lesson:** a lenient `patch --dry-run` said "applies" for patches that pnpm rejects; test with pnpm itself |
| Patch for `dsh-win32-process` | Upstream 0.2.0-rc.2 already contains ACRYL's change (`dwFlags: 257`, `wShowWindow: 0`) | Patch dropped. First upstream fix ACRYL no longer carries |

Result: `acryl-control`, `blends-core` and `acryl-harness-runtime` build with zero TypeScript errors after these fixes.

**Breaks that need design work (not mechanical)**

1. **Settings registration API removed.** `ctx.settings.register(namespace, schema, options)`, `SettingsScope` and the namespace registry are gone (R18, R21). Direct users in ACRYL: `plugins/acryl-shortcuts/src/index.ts`, `plugins/cordis-plugin-market/src/host/routes.ts` and `src/catalog/source-store.ts` and `src/install/service.ts` (`SettingsScope`), `apps/acryl-desktop/src/index.ts` (Desktop namespace, plus reads of locale, theme and log level), `apps/acryl-desktop/src/shell/notifications.ts`, `apps/acryl-desktop/src/profile.ts` (startup settings from `settings.yaml`), `apps/acryl-desktop/scripts/verify-profile-boot.mjs`, and the example plugin `settings-section-basic`. Options: (a) rewrite each as plugin `Config` fields declared `.volatile()` (upstream's design, profile-specific, no cross-profile preferences); (b) an ACRYL-owned small settings service behind the same call shape, backed by ACRYL's home. Option (b) keeps these call sites unchanged and fits R22 (own surface preferences, not harness business config), but ACRYL would then need its own settings UI, because the upstream settings UI renders upstream's registrations. Decision needed.
2. **Client session store lost "current session" and `open()`.** `SessionListState.current` and `ISessions.open` no longer exist; upstream's contract says "navigation belongs to view owners" and consumers hold sessions with `retain(target, options)` reference counting. ACRYL sites in `plugins/acryl-workspace/src/client`: `canvas/WorkspaceCanvas.tsx`, `projects/ProjectsSidebar.tsx`, `projects/projects-control.ts`, `sessions/agent-bridge.ts`, `sessions/session-navigator.ts`. This is the core of re-attaching the Tab Stripe and chats list: ACRYL's tab strip already is a view owner; it needs to track its own current tab and call `retain`. This is the T036b work.
3. **Cascades that need a rebuild after the above:** `acryl-mount-anchors` (depends on `acryl-shortcuts` types), `acryl-plugin-admin` (missing runtime declaration files; the earlier parallel build raced with the runtime's clean step, so it must be rebuilt serially to know what remains).
4. **Not yet examined:** `apps/acryl-desktop` build and tests, `acryl-cli`, `acryl-web`, the packaged-runtime closure gate (`verify-runtime-closure`) against 0.2's dependency set, tests that assert old versions and patch paths (for example `apps/acryl-desktop/tests/package.spec.ts`), docs and census data that list package names, and an isolated host boot.

**New upstream packages that may overlap ACRYL's own work** (not evaluated): `packages/client/shortcuts` and `ui-shortcuts` (ACRYL has `acryl-shortcuts`), `ui-dockkit`, `ui-sidebar-*`, `config-editor`, `plugin-manager`. Worth reading before re-building anything ACRYL already has.

**Consequence for T035a/T036b/T035b:** the version, rename and patch part of T035a is done on the branch. T035b (settings) and T036b (sessions and tab strip re-attachment) are the two design tasks that remain, and now have concrete file lists.

## Finding R25 - ACRYL boots on `dsh-v0.2.0-rc.2` with parts detached (T035b, T036b first step, 2026-10-02)

Branch `harness-latest-2026-10`, checkpoints `7cec5bd` to `b5d48d5` (the branch is on `origin` up to `7cec5bd`; later checkpoints are local until pushed). Per the owner's instruction ("make sure it boots, detach what breaks, we will re-attach the features we developed"), everything that blocked a boot was either fixed or detached with a `DETACHED` comment naming how to re-attach it. All runs used isolated temporary homes and spare ports; the servers were stopped and the ports confirmed free.

**Evidence**

| Check | Result |
|---|---|
| `corepack pnpm -r run build` (all packages except the detached `acryl-workspace`) | passes, 0 TypeScript errors |
| `acryl-web` in a temp `ACRYL_HOME` on port 38460 | 401 without the token, 303 then 200 with it, client bundle and assets served; in a real browser the page renders the ACRYL brand, Plugin Market, default workspace and the model picker |
| Desktop composition, headless (real `prepareDesktopProfile` plus engine host, temp home, no Electron) | `sessions`, `agents`, `authorization`, `webServer`, `acrylSettings`, `appInstance` all present; the session log has no import failures; `acryl-desktop/hello-world` loaded |
| Control: stock `dsh web` 0.2.0-rc.2 | renders, so the earlier client failure came from ACRYL's composition, not upstream |
| Tests | runtime 24 failing of 206 (was 65), Desktop 25 failing of 803 (was 66). Causes are listed below; none is a boot failure |

**Real defects found by the move (all fixed on the branch)**

1. **Profiles have no link projections any more.** `healProfilesModuleFallback` is gone; stock `dsh` mounts `PluginPackages` with `createRuntimeResolution(...)` in its boot step. Without it a profile loads zero Loader rows (every `@deepseek-ai/*` import fails, the host still "starts"). ACRYL now mounts it in `mountDshEngine` (`DshEngineComposition.runtimeResolution`), in both legacy boots, and Desktop anchors the table at `acryl-desktop` so its ACRYL packages resolve.
2. **Engine swap was broken by the Cordis family bump.** Loader 1.0.5 applies a changed `config` on `Entry.update` but ignores a changed plugin `name`, and `remove` no longer awaits disposal. `host.select()` now removes the row, waits for the fiber, and creates it again; the nested profile include is disposed with an awaited disposer. `engine-host.spec` and `engine-host-mount-root-include.spec` pass on `main` (cordis 4.0.2, loader 1.0.3) and failed here before the fix. This matters for Continuous Mode: any engine swap test that does not use the real Loader would have missed it.
3. **HMR guard.** 0.2 gates the `hmr` row with `!!js "!ctx.get('profileContext')"`, not `disabled: true`; the guard in `mountDshEngine` now evaluates the expression (ACRYL never provides `profileContext`, so no `--expose-internals` is required).
4. **Multi-file bundle patches.** `dsh-web-app` declares `dsh.bundle.patch` as a list (presets); Desktop's own profile loader read a single string. It now uses `bundlePatchPaths`.
5. **Duplicate `authorization` row.** `dsh-base` composes it; Desktop passed an empty existing-row set to the capability composer. It now derives the set from the bundle layers, as Web and TUI already did.
6. **Shortcut services collide.** 0.2 ships a `shortcuts` client service that upstream UI plugins inject by package name; a second provider fails the client boot.

**Detached (each carries a `DETACHED` note and a re-attach path)**

| Detached | Why | Re-attach |
|---|---|---|
| `acryl-workspace` (Projects list, per-worktree canvas, Changes, Review, Checks, Files) and the advanced shell | client written on the removed session store (`current`, `open`); its shell contracts redeclare `ctx.layout`, which 0.2's layout now owns | Tab strip owns its current tab and holds sessions through `retain(...)`; decide slot or ACRYL-owned row (T036b) |
| `acryl-shortcuts` and `acryl-mount-anchors` | 0.2's own shortcuts service replaces them | Layer over the upstream service, persist rebinding through `acrylSettings`; upstream should own the generic part |
| Desktop settings page (`applyDesktopSettings`) | bound the removed client `settingsScope` | Rebuild over the `acryl-settings` route in the 0.2 `settings.section` slot |
| Windows ACL pwsh trampoline | overrides `runArgv`/`startArgv`, removed from `SandboxPwshExecutor` | Re-port to the new spawn seam (flag `WINDOWS_PWSH_SANDBOX_REATTACHED`) |
| TUI preset declarations | `dsh-agent-presets` became `dsh-agent-preset-registry`; the TUI roster is empty | Declare ACRYL's roots in the registry config |

**New, kept:** `plugins/acryl-settings` (ACRYL's own preferences in `<ACRYL home>/acryl-settings.yaml`, `ctx.acrylSettings.register(...)` with the same call shape as the removed upstream API; 14 tests). Consumers on it: market, Desktop shell mode and startup, notifications, shortcuts (host side). Also new: `packageExtensions` for two more undeclared type dependencies of `dsh-client-modules` and one (`lexical`) of `dsh-client-ui-conversation`; `cli` follows 0.2's `ToolResultMessage` and drops the removed `plugin` message source; Desktop notifications use `jobs.events.subscribe` (a `settled` event).

**Overlap with upstream 0.2 (evaluated)**

| Upstream | ACRYL | Recommendation |
|---|---|---|
| `shortcuts`, `ui-shortcuts` | `acryl-shortcuts` | Let upstream own the service and the editor; ACRYL keeps only what it adds (persisted rebinding, mount-anchor toggle) |
| `plugin-manager`, `config-editor` | `acryl-plugin-admin`, Market | Let upstream own the manager UI; ACRYL keeps Market and lifecycle policy |
| `ui-dockkit`, `ui-layout` | `acryl-app-shell`, `acryl-workspace` canvas | Differentiating (canvas, PTYs, agent control) stays ACRYL-owned; the shell frame is a slot-or-row decision per R22 |

**Remaining test failures (runtime 24, Desktop 25), by cause:** assertions about detached features (workspace, shell, shortcuts surfaces and rows) and the renamed roster row; 0.1.5 version pins and patch file names in `package.spec`; obsolete packages (`dsh-settings-file`, `dsh-agent-presets`) in two specs; the system-prompt baseline (the harness changed its prompt sections: review the drift, then refresh with `ACRYL_UPDATE_DRIFT=1`); `plugin-lifecycle-controller` (2) and the Desktop startup-port projection (reads `acryl-settings.yaml` now) need a closer look; `deepseek-streaming-tool-call` needs the network and the owner's key.

**Not done:** Electron GUI launch, the Desktop build as a DMG, `verify-runtime-closure` against 0.2, the platform native packages in the DMG (T038), and a real login and model call.

**Addendum to R25 (same day): the Desktop GUI boots.** Electron launched from the branch (isolated home, isolated Chromium user data) completes every startup stage (`electron-ready` through `health-commit`) and the renderer reports `healthy`. Two more real defects surfaced only in Electron, not in the headless probe:

1. **Electron 43.4.0 is rejected by `node-addon-require-builtin` 0.1.7** (`unsupported Electron runtime fingerprint`; it supports 43.0.0, 44.0.0, 45.0.0-alpha.6), and 0.2's `PluginPackages` needs that addon. The branch pins Electron `43.0.0` (same major and native ABI as before). Upstream's own Desktop pins `^44.0.0` (resolves 44.0.0); moving to 44 is the alignment follow-up, with node-pty and electron-builder to be checked first.
2. **The Desktop client still injected the removed `settingsScope`**, so the renderer waited forever and the Host reported "did not report boot health within 30000ms".

**Isolation lesson (my error, recorded so it is not repeated).** Launching `scripts/launch-dev.mjs` with only `ACRYL_HOME` (and then `ACRYL_LOCAL_PRODUCT_NAME`) still wrote logs, lifecycle events, diagnostics and Singleton lock files into the real `~/Library/Application Support/ACRYL`, shared with the installed app; nothing was deleted, and my first isolation check was wrong. Isolation that works: run the Electron binary directly with `--user-data-dir=<temp>`, and verify with `find ... -newer <marker>` that the real directory is untouched. Follow-up: make the dev launcher derive Electron's user data from the selected `AppInstance` (the only place allowed to read the environment).

## Finding R26 - the ACRYL shell is back on DSH 0.2 and the suites are green (2026-10-02)

Branch `harness-latest-2026-10` (pushed). Builds on R25; everything below was verified in isolated homes and Chromium user data.

**Re-attached**
- **Workspace** (`acryl-workspace`): the tab strip and Projects panel hold the main view through `sessions/main-session.ts` (`retain(target, { source: 'mainView' })`, current session read from `retainedBy`), replacing the removed `ISessions.open` and `list.current`. 646 of 646 tests.
- **Advanced shell** (`acryl-app-shell`): its layout state now implements 0.2's whole `ILayout` (`panelInfo`, `selectPanel`, `beginNavigation` plus the panel transitions), provides `panelInfo` as the page's root hook, renders upstream's keyed `main` panels while one is open, and uses upstream's slot names (`main`, root-scoped `rightbar`, `shell.leading`) instead of redeclaring them. Web and Desktop both run the full ACRYL frame (Tab Stripe, Projects/Workspaces pane, Settings, right-panel toggle).
- **Settings and Models**: DSH 0.2 enables `config-editor`, `settings` and the plugin manager only while a `profileContext` exists. ACRYL now provides one from every composition (`createProfileContext`; never named `desktop`, which would also switch on upstream's product telemetry) and switches `hmr` off itself. Without this the Models page, where credentials are entered, reported "settings service is absent".

**Real defects found while clearing the tests (all fixed)**
1. Loader 1.0.5 does not await a disabled entry's disposal, keeps the disposed Fiber, and logs a throwing `apply` as a FAILED Fiber instead of rejecting `create()`/`update()`. `acryl-control`'s lifecycle service now settles explicitly and surfaces the plugin's own activation error, so enable/disable receipts are honest and a failed live install rolls back.
2. The Settings button gained `aria-label="Settings"` in 0.2; ACRYL's DOM lookup skipped labelled buttons, so "Settings is not available in this window".
3. Blueprints did not list `acryl-settings`, but Desktop's own plugin depends on it, so a Blank app on Desktop would never activate. It is now an essential capability.
4. The terminal profile had an empty agent roster: 0.2 ships presets as `dsh-web-app` patch files (`presets/<name>.patch.yml`) and has no terminal bundle. The TUI composition layers the same four files in.
5. Desktop declares the 21 packages the 0.2 web bundle loads dynamically (needed by the packaged runtime), and Electron is pinned to 43.0.0 (`node-addon-require-builtin` 0.1.7 rejects 43.4.0).

**Tests**: every package passes. Documented skips and todos: the `acryl-ui` `fields.tsx` provenance check (upstream moved and renamed it; re-extract as its own task), one `it.todo` for the DeepSeek tool-call delta guard (0.2 uses a Messages transport, so the old chat-completions mock cannot reach that code). Root `typecheck` and `verify-layout` pass. `verify-layout`'s expected `packageExtensions` block and its preset check were updated with the repo.

**Still detached**: `acryl-shortcuts` and `acryl-mount-anchors` (upstream shortcuts own the service), the Desktop settings page (needs a rebuild over `acryl-settings`), the Windows ACL pwsh trampoline (type-correct helpers split into `windows-acl-adaptation.ts`; the executor subclass needs a re-port and a Windows machine), and `acryl-workspace`'s own palette command for settings.

**Isolation rule learned**: Electron's user data is not isolated by `ACRYL_HOME`. Run Electron directly with `--user-data-dir=<temp>` and verify with `find ... -newer <marker>` that the real directory is untouched.

## Finding R27 - live verification pass, row 3 done, adopt-vs-keep for config-editor and plugin manager (2026-10-03)

Branch `harness-latest-2026-10` (pushed to `bf31717`). Everything ran in isolated homes (`ACRYL_HOME` temp) and, for Electron, `--user-data-dir`; servers stopped, ports confirmed free.

**Lineage, so the shell decision stays legible.** `apps/acryl-desktop` descends from the owner's August fork of `anywhere-labs/dsh-desktop`, made when DeepSeek Harness was web-only. DSH 0.2 now ships its own `apps/desktop` and `desktop-host` in the submodule. The R20 decision stands: ACRYL owns its Desktop surface and takes only what is useful from upstream's; upstream's Desktop was run only as the stage A control (R20).

**Row 3 (Desktop settings page over `acryl-settings`): done and tested.** `acryl-settings` gained `update(namespace, patch)` (schema-validated, 15 tests); Desktop has a loopback `/api/desktop/preferences` route (allow-listed namespaces, flat scalar patches, same-origin only, 8 tests) and client `PreferenceScope`s (4 tests) feeding the existing section in 0.2's `settings.section` slot. The route answers on the running Electron host (401 without the app's launch credential, as intended). A click-through of the page itself in Electron was not done. `acryl-workspace`'s palette command for settings uses the same lookup that now matches the "Settings" label (covered by its tests, not clicked live).

**T042 record: adopt upstream's `config-editor`, `settings` (Models page) and plugin manager.** They run inside ACRYL's frame once the composition provides a `profileContext`: the Models page and Settings > General (with "Open configuration file") work, the first-run acknowledgement persists and onboarding advances to the API-key step, and ACRYL's own rows survive a configuration reload. Two things made that true, both in `mountDshEngine`: the profile include must be mounted on the root context (DSH's reload looks up "the root Include entry" there), and ACRYL's in-memory patches (capabilities, blueprint rows, terminal presets, plugin-lifecycle toggles) are handed over as `ProfileContext.overlays` so a reload re-applies them instead of rolling the edit back. `hmr` stays off: with it on, engine disposal after a swap-and-back hangs (its queued reload waits on a tree that is unloading), and in-app edits do not need it. Not exercised: the plugin manager UI beyond rendering, and a real API-key save (no key was entered).

**Per-row live results (web, isolated home)**

| Row | Result |
|---|---|
| Frame: Tab Stripe, Workspaces pane, Settings, right-panel dock | PASS |
| Canvas mounts a chat tile with upstream's conversation composer | PASS (a model-backed turn was not run) |
| PTY opens in a terminal tab, accepts input, streams output (`echo ACRYL-PTY-$((6*7))` returned `ACRYL-PTY-42`) | PASS |
| Right panel offers Code, Workspace files, Changes, Review, Checks, New terminal | PASS (tab contents not exercised) |
| Spec 041 acceptance commands against the 0.2 engine | NOT RUN: they drive a live agent and need a model key. Package tests pass (112, real Loader) |
| Blend snapshot/apply round trip | NOT RUN live; `blends-core` 89 and Desktop blend composition specs pass |
| Canvas mounting a live, model-backed session tile; Desktop in Electron with the workspace | NOT RUN beyond the earlier healthy startup |
| `acryl-shortcuts` / mount-anchors | HELD for the owner's decision. A port of mount-anchors onto upstream's `ctx.shortcuts.register` works (toggle shortcut enters crosshair mode, Escape leaves) but is uncommitted in the worktree |

## Finding R28 - the gate is green, T045 closed, settings disposal confirmed sound (2026-10-03)

Branch `harness-latest-2026-10` (pushed to `caf2556`). `corepack pnpm run check` now exits 0 on the branch, so results from here on are trustworthy (FR-009).

**What was failing, and why (three separate causes, none new on this branch except the first being masked):**

1. `acryl-web` npm-entrypoint check: `acryl-web` depends on about 15 workspace packages that are not on the npm registry (`acryl-control`, `acryl-harness-runtime`, `acryl-agent-control`, `acryl-settings`, `@acryl/ui`, and more). A standalone install of its packed tarball could never resolve them; this failed on `main` too. Publishing them is an owner decision and was not taken. `scripts/verify-npm-web-entrypoint.mjs` now packs the whole workspace closure and pins each package to its own tarball through `pnpm.overrides`, so the check proves the packed entry point installs and boots (`acryl-web --json` prints a ready URL) without any registry publish.
2. `acryl-desktop` runtime closure: eleven 0.2 first-party packages (`dsh-otel`, `dsh-deepseek-account`, `dsh-deepseek-account-platform`, `dsh-llm-deepseek-account`, `dsh-llm-deepseek-api-key`, `dsh-compaction-image-offload`, `dsh-client-store`, `dsh-mcp-resources`, and the three `dsh-experimental-*` agent-team and speech-to-text packages) were reachable only as transitive peers. Declared at `0.2.0-rc.2` in `apps/acryl-desktop`. The profile smoke had shown four of them as "failed to import" entries; all activate now.
3. Verifiers written for 0.1.5: `verify-licenses` rejected the SPDX expression `(MIT OR CC0-1.0)` (an OR is usable under any one alternative; now accepted), and `verify-profile-boot` lacked `host.loader.internal = undefined` (packaged Electron has no internal loader; the loader smoke already had it) and asserted a `/` redirect where 0.2 answers `./` (now checks where it lands).

**Relock note.** The pinned pnpm 11.11.0 still hangs resolving; the 11.8.0 relock workaround from R23 produced a clean 24-line lockfile diff, and a frozen install under 11.11.0 links it. A corrupt pnpm metadata cache entry also surfaced; a throwaway `--cache-dir` avoids it.

**T045 closed.** (a) `acryl-ui` fields re-extracted from 0.2's settings-form (`072693e`). (b) The DeepSeek tool-call guard is now a real test on the Messages transport (`bfd78f5`): a `tool_use` block keeps its id and name across `input_json_delta` events, the arguments join, and the finish reason is tool-calls. All remaining skips in the repo are platform or prerequisite conditions (`skipIf` win32, built bundle present, model key present).

**Settings disposal (service.ts register effect): sound as written.** The reported scoping defect did not reproduce. Cordis binds `this.ctx` to the calling consumer, so the namespace disposer belongs to the registrant. A reactivation test (register, unload the registrant, re-register) passes against the unchanged service and now guards it (`caf2556`).

**Shortcuts and mount-anchors (row 1) are done:** both run on upstream's `ctx.shortcuts` (`8521fcc`), the palette default moved to Cmd/Ctrl+Shift+P because Cmd+K belongs upstream.

**Still open for parity:** rows 6 and 7 live acceptance, the blend round trip and a real key-save need a model key (owner input); the "open workspace" error needs its exact text and click path (not reproduced: web chooser and Desktop add-project both work in isolated homes); T043 and T044 are next; the Windows ACL sandbox needs a Windows machine. The packed-closure check also now exercises every workspace package's `pack`, which is the first thing to look at if a package gains a build-only dependency.

## Finding R29 - T043: the DSH chat is optional, the DSH platform is not yet (2026-10-03)

Branch `harness-latest-2026-10` (pushed to `5b29bda`). Everything ran in isolated homes on spare ports; the server was stopped and the port confirmed free.

**What was proven.** `ACRYL_BLUEPRINT=acryl.agents` (new built-in, the IDE with `dshChat: false`) disables three DSH rows (`agent`, `llm`, `llm-pi-ai`). On the real Loader with the real DSH 0.2.0-rc.2 profile: the web server, session store (`session`, `session-persistence-jsonl`), `terminal-controller`, `workspace-controller`, `acryl-workspace`, `acryl-agent-control` and `tools` stay ACTIVE; 17 consumers of the chat (among them `session-controller`, the model providers, `goal`, `agent-loop`) go PENDING; nothing FAILED. Switching the three rows back on, on the same live host, returns every one of them to ACTIVE with no restart (`runtime/acryl-harness-runtime/tests/engine-optional.spec.ts`, 1 test, plus 2 Blueprint tests; the runtime gate is green at 209 tests).

**Live, Web, chat off.** The page rendered the Tab Stripe, Workspaces pane and Settings. An outside operator (this agent, over the `online` channel with the per-instance secret, not a DSH model) read the page with `snapshot` (25 controls) and `click`ed "New tab: Terminal", which opened a real PTY tab. In that PTY, typed with browser keys, `claude --version` printed `2.1.288 (Claude Code)` and `command -v` found `codex` (`/opt/homebrew/bin/codex`) and `pi`: the user's own agents run in the frame with the DSH chat off.

**What broke, and what is still coupled (the point of T043).**

1. The "AcrylDSH Chat" tab and its composer still render with the chat off; the composer cannot send (T047).
2. There is no structured non-DSH agent path. `acryl-control`'s `claude`, `codex` and `acp` providers have no transport wired (`transport-unavailable`); only a terminal tab works (T048). So "a non-DSH agent driven through the 040/041 surface" is proven for the surface and the terminal, not for a structured agent session.
3. Agent Control could not type into the terminal: `ui_type` set the helper textarea's value, which xterm.js never reads (it takes text from paste events and key handling from the legacy `keyCode`). Fixed and proven live in `0c11c24` (T049). A first note here blamed `ui_press` returning HTTP 400; that was my own invalid input (a space and a dash are not single-key names), not a defect.
4. The "engine" removed here is the chat, not the platform. The web server, session store, gateway, client frame and the `tools` and `webServer` services that `acryl-agent-control` injects are all DSH rows. With no DSH engine definition at all there is no frame, so the seam is real for the chat and not yet for the platform (T046). Deliberately not papered over: no stub engine was added to make a "no engine" boot pass.

**Invariants.** One shared runtime: the change is in `acryl-harness-runtime/blueprint` and applies to Web and Desktop alike (the terminal client is the chat itself, so `tui` ignores it, asserted in a test). Direct `@deepseek-ai/dsh*` import lines in non-test source under `runtime`, `apps` and `plugins`: 180 before, 180 after (the change names three row ids and adds no import). The count did not go down; T046 is where it should.

**Housekeeping from the review of R28.** The `(MIT OR CC0-1.0)` rule is needed today by `type-fest@4.41.0` (reached through `got` and `@deepseek-ai/dsh-otel`); the profile smoke is the packaged-boot smoke and now says so. Two old stashes (`main-dirty` 2026-09 with a `registerOpenSettingsShortcut` edit to the old shortcuts registry, which `8521fcc` deleted; `rebase-dirty` 2026-09-23 with README, `devbox.json`, `.github/workflows/nix.yml` and `.gitignore` edits) are older than this branch and were left in place for the owner to drop or restore.

## Finding R30 - T047 done, T044 headless cells done, key cells listed (2026-10-03)

Branch `harness-latest-2026-10` (pushed to `4a39f80`). Every run used isolated homes and spare ports; servers stopped and ports confirmed free.

**T047 (chat tab hidden when the chat is off).** Signal path: `acryl-workspace`'s host plugin answers `GET /api/acryl-workspace/capabilities` with `{ chat }`, read from the live composition on each request (`ctx.get('agents') !== undefined`), so it is the Loader's truth rather than a second flag copied from the Blueprint; the client loads it once before registering the canvas and the left pane (an unreachable or older Host means "everything", as before). `WorkspaceState` refuses chat tiles when the chat is off and starts on a terminal; the "+" menu, the remembered default tab, the per-project new-chat button, the empty-pane copy and `ProjectsControl` (adding a project no longer fails trying to open a chat) all follow. Live, `acryl.agents`: one Terminal tab, the "+" menu offers terminals, files, board, doc and the user's own agents (Claude, Codex, Grok, Copilot, OpenCode, Pi, Gemini and more) and no AcrylDSH Chat; with `acryl.ide` the chat tab is back. A first attempt still showed a chat tab because session navigation adds one whenever there is no current session; the rule now lives in `WorkspaceState.addTile`, so no caller can create one. `acryl-workspace` gate: 660 tests.

**T044, the cells that need no model, are done.** An agent's tool calls were run through the real tool registry (`tools.execute`, policy hooks included) with a plugin the test authored on disk:

| Cell | Web engine | Desktop-composed profile |
|---|---|---|
| `acryl_verify_plugin` on a package the agent wrote | PASS | PASS |
| `acryl_install_plugin` installs it live; the tool it adds is callable | PASS | PASS |
| edit the source, install again: updated live, new behaviour | PASS | PASS |
| `acryl_remove_plugin` unmounts it live; the tool is gone | PASS | PASS |
| `acryl_list_plugins` shows and then drops it | PASS | not asserted |
| a plugin that throws in `apply` is refused with its own error and the install is undone | PASS | not run |
| `/reload` discovery, host hot reload, blend capture and apply round trip | PASS (existing suites) | not run |

Web: `runtime/acryl-harness-runtime/tests/agent-self-hosting.spec.ts`. Desktop: the profile smoke (`verify:profile`) now runs the same sequence. Making that possible exposed that the smoke still booted through the 0.1.5 `boot()` path: without the 0.2 `runtimeResolution` a copied plugin dependency could not find `@deepseek-ai/cordis`, and the lifecycle bootstrap lacked the `profileDir` that `main.ts` passes. It now boots through `createAcrylEngineHost` with `createDshEngineDefinitionFromComposition`, exactly as `main.ts` does, so the smoke is a faithful Desktop composition.

**Cells that wait for your model key (or a logged-in agent), precisely:**
1. A model authors a plugin end to end (docs lookup, write, verify, install) on Web, live in the GUI.
2. The same on Desktop, live in the Electron window.
3. A model edits that plugin and updates it live (the hot-reload cell, model-driven).
4. `runtime/acryl-harness-runtime/tests/e2e-real-model.spec.ts` (skipped without a key): the agent builds, changes, extends and removes extensions for real.
5. Blend snapshot and apply round trip with real keys, and the real key-save check.
6. Rows 6 and 7 live acceptance (spec 041 acceptance commands against the 0.2 engine).
Not key-dependent but blocked by design: the matrix rows for Claude Code, Codex and Pi, because those agents cannot call the extension tools at all (T051).

**Findings.** (a) A failed update is rolled back by removing the plugin, as on 0.1.5, so the working version is lost (T050). (b) The extension tools are DSH tools, so bring-your-own agents cannot use them (T051). (c) Direct `@deepseek-ai/dsh*` import lines in non-test source: still 180, nothing added by T047 or T044.

## Finding R31 - T048 done (Claude Code transport); T046 platform seam: Cordis mini-design for review (2026-10-03)

Branch `harness-latest-2026-10` (pushed to `83c11e1`).

### T048: one real structured transport, done

`ClaudeStreamTransport` (`runtime/acryl-control/src/agent/transports/claude-stream.ts`) speaks Claude Code's own `stream-json` protocol: one long-lived `claude -p --input-format stream-json --output-format stream-json --verbose` process per worker. `AgentTransport` gained an optional `open` (bring up the runtime and name it) and `dispose`; the provider factory's `attach` calls `open`, so a bound worker now has a `runtimeId` and is dispatchable (before, every Claude, Codex and ACP attach left `runtimeId: null` and `dispatch` refused it), and the transport's processes end with the plugin that owns them. Commands: `send` returns the final text, `isError`, session id, stop reason and every assistant text block; `cancel` and an aborted signal send the protocol's interrupt control request; `stop` closes stdin and escalates to a kill after a grace period; `start` names what is running; resume is by attaching with the session id (`--resume`). A second `send` while one is being answered is refused (`worker-busy`); a crash mid-turn fails the turn, not the host; a missing executable is `transport-unavailable`. Protocol facts measured on Claude Code 2.1.288: it stays silent until the first user message (the session id arrives with the first turn), and hook and rate-limit events are interleaved. Proof: six scenarios against a fake that speaks the observed protocol (47 tests in the package gate), plus the real binary through the real `acrAgentControl` service with `ACRYL_LIVE_CLAUDE=1`: a `pong` turn and a real interrupt of a 2000-line answer followed by a successful next turn in the same process. Not done, by scope: `acrAgentControl` is not mounted in any engine yet and nothing in the UI or CLI drives it (T052); Codex and ACP transports are the same shape and are not written.

### T046: the platform seam. Measured starting point

Direct `@deepseek-ai/dsh*` import lines in non-test source under `runtime`, `apps`, `plugins`: **180** (121 type-only, 59 value).

| Where | Lines | What |
|---|---|---|
| `apps/acryl-desktop` | 46 | Electron host around the DSH profile (app-boot, cmdline, atomic-write, launch-environment) and the Desktop client |
| `apps/acryl-cli` | 27 | the terminal client (the DSH chat TUI) |
| `plugins/acryl-workspace` | 24 | the frame: client slots and the chat's `sessions`, `workspaces`, `sidebarRight` |
| `runtime/acryl-harness-runtime` | 20 | the engine seam itself (expected) |
| `plugins/cordis-plugin-market` | 17 | host route and client section |
| the rest | 46 | `acryl-plugin-admin` 9, `acryl-ui` 9, `acryl-agent-control` 8, `acryl-app-shell` 6, `acryl-support` 5, brand 5, others 4 |

By module, the weight is the client frame: `dsh-client-ui-slots` 17, `-primitives` 11, `-settings/client` 8, `-locale/client` 7, `-renderer/client` 7 and about ten more `dsh-client-*` (about 75 lines); host side: `app-boot` 12, `host-webserver` 10 (type augmentations), `atomic-write` 8, `tools` 7, `cmdline` 4, `home-paths` 3; chat: `session` 9, `llm` 6, `agent` 4, `goal` 3.

What ACRYL's own plugins actually consume from DSH is small. Host plugins inject `webServer` (HTTP and WebSocket routes), `tools` (Agent Control and workspace status, both chat-facing), and their own `appInstance` and `acrylSettings`; Desktop adds `webRuntime`, `appExit`, `loader`. Client plugins inject `slots`, `locale`, `theme`, `shortcuts`, and use `sessions`, `workspaces` and `sidebarRight` for the chat. One coupling is not about imports: `ProjectsControl` registers a project by calling DSH's `workspaces.create`, so ACRYL's project list is stored in the DSH workspace service (T047 showed this still works with the chat off only because that service stays up).

### Mini-design (repo protocol, six points)

**1. Capability and plugin boundary.** One capability, the *ACRYL platform*: "serve a loopback, token-authenticated page and its WebSocket routes, deliver the client plugin graph to the browser, and hold the project registry". It needs its own lifecycle and replacement because a DSH-backed provider and an ACRYL-owned provider must be swappable under the same consumers (that is the proof T046 owes). It is decomposed into four independently shippable seams, in this order, each of which moves the count:
- **S1 host ports** (`acryl-control`, no DSH imports): `acrylWeb` (`host`, `port`, `register`, `registerUpgrade`, `authenticatedUrl`), `acrylTools` (optional: register a model-callable tool when a chat exists), `acrylFiles` (atomic write and home paths, owned code instead of `dsh-atomic-write` and `dsh-home-paths`).
- **S2 projects owned by ACRYL**: the project registry becomes an `acryl-settings` namespace served by a Host route; DSH `workspaces` becomes a one-way projection for the chat, not the source of truth.
- **S3 client frame facade**: client plugins stop importing `dsh-client-*` directly and use `@acryl/ui` contracts (the generated `contracts/reexports.json` already exists for the primitives); the substrate behind the facade is swappable.
- **S4 own host** (the real "no DSH platform" boot): an ACRYL `acrylWeb` provider on `node:http` plus a client-graph server and an ACRYL client bootstrap (slots, locale, theme, shortcuts as ACRYL client services). Largest; designed here only to the level needed to keep S1 to S3 honest.

**2. Provides and consumes.**
- S1 provides services `acrylWeb`, `acrylTools`, `acrylFiles` (provider: a DSH adapter plugin inside the engine seam today; `acryl-web-host` after S4). Consumers `acryl-workspace`, `acryl-agent-control`, `acryl-plugin-admin`, `acryl-support`, `cordis-plugin-market`, the Desktop webserver row: hard `inject: ['acrylWeb', ...]`; `acrylTools` is intentionally optional, read with `ctx.get`, so a plugin that only adds tools to the chat is PENDING-free when there is no chat (today `acryl-agent-control` hard-injects `tools` and so cannot mount without one).
- Events: none new. Durable facts: the project registry (S2) in `<ACRYL home>/acryl-settings.yaml` under `projects`; nothing replay-critical.
- Rule kept: no plugin imports a provider; ports live in `acryl-control`, adapters live behind `createAcrylEngineHost`.

**3. Effects and disposal.** Every route, upgrade handler, listener, socket and timer is acquired in one `ctx.effect()` in the provider and released by its disposer, in order: stop accepting, close upgraded sockets, release routes, close the server. A consumer's registrations are tied to the consumer's Fiber (not the provider's): unloading a consumer removes only its routes. Replacing the provider unloads consumers (Cordis rebinding), the old listener closes, the new one binds, consumers re-register. Quiescence: no timer or socket survives `dispose()`; the port is free afterward (asserted).

**4. Configuration and composition.** Validated schema per provider (`port`, `host` loopback only, token policy). Row ids equal package names (`acryl-web-host`; the DSH adapter is named for its capability, `acryl-platform-dsh`, a deliberate swap-slot id like the brand pair, named as such here). Scopes: one platform per Context. Provider replacement is a blueprint property (`platform: dsh | acryl`), the same mechanism as `dshChat`.

**5. Events and durability.** Waterfall hooks are not involved. The only durable state is the project registry (S2): written through `acryl-settings` (atomic, schema-validated), read on mount, one writer.

**6. Verification (real Loader, not stubs).** For each seam: activation with a missing provider is PENDING and activates when the provider arrives; provider replacement (DSH-backed then node-backed, same consumers, no stale routes, no duplicate registrations); disposal and repeated mount/reload leave no open handle (port free, sockets closed, counted); Web and Desktop parity test unchanged; the engine-optional test (R29) stays green; the import-line count is part of the gate (`scripts/verify-layout.mjs` asserts a ceiling that only moves down).

### Decisions I need from you before any code

1. **What counts as "the seam" for the 180 metric.** Proposal: the seam is `runtime/acryl-harness-runtime/src/engine-*.ts`, the Desktop Electron entry, `@acryl/ui`'s contract adapters, and the chat-only plugins; everything else must reach zero. Today that leaves roughly 95 lines outside the seam.
2. **S3: facade or own client runtime.** Facade (S3) is cheap and keeps the DSH client substrate; S4's own client bootstrap is the real independence and is a spec of its own. Proposal: do S1, S2, S3 now, write the S4 spec after.
3. **Who owns projects.** Proposal: ACRYL (S2), DSH `workspaces` follows.
4. **Order.** S1 first (smallest, mechanical, about 30 lines down, unblocks `acryl-agent-control` mounting without a chat), then S2, then S3.

## Finding R32 - T048 decision: hand-rolled stream-json transport versus `@anthropic-ai/claude-agent-sdk` (2026-10-03)

**Honest record.** I wrote the transport (R31) without first evaluating the official SDK; the owner asked for the comparison. It was done afterwards from the registry metadata, the packed tarball (license, file sizes, `sdk.d.ts`) and `claude --help`; the SDK was **not run**.

**What the SDK is.** `@anthropic-ai/claude-agent-sdk` 0.3.288 (versioned in step with the CLI, 2.1.288). `query()` spawns the Claude Code CLI and speaks the same stream-json protocol; it adds typed messages, `interrupt()`, `resume`, hooks, `canUseTool` (approval callbacks), in-process MCP servers (`tool()`, `createSdkMcpServer()`) and session management.

**Measured costs.**
- **License:** `LICENSE.md` is "All rights reserved. Use is subject to the Legal Agreements" (Anthropic's legal and compliance page), not an open-source license. ACRYL is MIT and ships installers; bundling the SDK needs a legal read that nobody has done.
- **Weight:** 5.4 MB unpacked JS (`sdk.mjs` 1.2 MB, `bridge.mjs` 1.3 MB); eight optional platform packages that each embed a native Claude binary (the darwin-arm64 one is 229 MB unpacked; `pathToClaudeCodeExecutable` avoids using it but not installing it); peers `zod` ^4, `@anthropic-ai/sdk` >= 0.93, `@modelcontextprotocol/sdk` ^1.29. The packaged Desktop app is already 471 MB.
- **Coupling:** it puts a vendor SDK and its release cadence inside `acryl-control`, the stable core. R20 and R22 say the opposite (DSH churn is why), and Codex and ACP have no equivalent SDK for the same shape, so the transport seam would not generalise.

**What the hand-rolled transport costs and lacks.** About 220 lines, no dependencies, no license question, and the same shape (spawn, NDJSON or JSON-RPC lines, interrupt, close stdin) that `codex exec --json` and an ACP stdio agent need. It lacks permission prompts: a headless process cannot answer Claude Code's approval requests, so with the default arguments a Claude worker is effectively read-only. The protocol for answering them exists (`--permission-prompts`, `can_use_tool` control requests after an `initialize` handshake) and the SDK implements it.

**Decision: the hand-rolled transport stays, as the core's shape for all three vendors.** Reasons: license, weight, coupling, and one shape for Claude, Codex and ACP. **Revisit trigger:** if implementing `can_use_tool` approvals takes more than about 150 lines or proves unstable across CLI versions, adopt the SDK as an optional, separately installed transport plugin (never a dependency of `acryl-control`), after the license is read. Also noted for T051: the best vehicle for giving a Claude worker ACRYL's extension tools is an MCP server passed with `--mcp-config` (plus `--strict-mcp-config` when wanted), which needs neither the SDK nor changes to the transport.

## Finding R33 - T052 workers, T051 tool gateway, the first real-model results, and the TUI answer (2026-10-03)

Branch `harness-latest-2026-10` (pushed to `d484f20`). All runs used isolated homes and spare ports; servers stopped, ports confirmed free. The model key was read by the existing opt-in test from `~/.secure-storage/...` into the process environment only (`ACRYL_E2E_KEY_FILE`); it was never printed, logged or committed. Claude Code ran under the owner's own login, one short turn at a time.

### Ledger update for the R30 key cells

**Cell 4 closes.** `runtime/acryl-harness-runtime/tests/e2e-real-model.spec.ts` passed with the real model on the 0.2 web engine, three prompts (build, change, remove), 34 tool calls, and real tool-return verification from the event log: the agent looked up the docs (`acryl_extension_lookup`, `skill`), wrote the plugin with `write`, passed `acryl_verify_plugin`, `acryl_install_plugin`, called its new tool (`hello_ping` returned `pong`), edited it, `acryl_install_plugin` again (update), `hello_ping` returned `pong2`, `acryl_remove_plugin`, `acryl_list_plugins`, and the next `hello_ping` returned `unknown tool "hello_ping"`. That also covers the headless halves of cells 1 and 3 (a model authors, and a model edits and updates live) on the web engine. Still open: the same in the GUI on Web, and on Desktop (cells 1 to 3 as GUI cells), the blend round trip with real keys, the real key-save check, and rows 6 and 7.

### T052: workers, mounted and driven

`acryl-agent-control` (already on Web and Desktop, already owning the instance secret and route style) now mounts `acrAgentControl` and the `claude` provider with the stream-json transport as children of its Fiber, adds `POST /api/acryl-agent-control/workers` (attach, send, cancel, stop, list; authorized by the page's same origin, or by the instance secret when the online channel is on), `acryl control worker list|attach|send|cancel|stop` (a thin client of that route), and a "Claude worker" tab type registered through `workspaceTabs` (optional: no workspace, no tab). Proof: 6 + 4 integration tests and 7 client tests, and live with the real Claude Code: attach, send `pong` over the endpoint (3.5 s), 403 without the secret, then the same from the page (the tab in the "+" menu, a folder, a message, the answer, reload keeps the transcript, a restarted host is reported as "no longer running" with a fresh-start form). Process ownership: ending the plugin ends every `claude` process (asserted by pid). Lesson recorded: the first version of the tab was functional but unstyled; styles now use the theme tokens and the owner's note is accepted (UI starts from tokens).

### T051: the tool gateway

`acryl-agent-control` serves the allowlisted extension tools (default: `acryl_extension_lookup`, `acryl_verify_plugin`, `acryl_install_plugin`, `acryl_list_plugins`, `acryl_remove_plugin`, `acryl_prepare_publish`, `acryl_plugin_list`, `acryl_plugin_set_enabled`; never the shell or files) in two faces over **one gateway object**: plain JSON (`GET`/`POST /api/acryl-agent-control/online/tools`) and MCP over streamable HTTP (`POST /api/acryl-agent-control/mcp`, hand-written JSON-RPC: `initialize`, `ping`, `tools/list`, `tools/call`, notifications answered 202, no SSE offered). `acryl control tool list|call` is a thin client of the JSON route. Both faces require the instance secret and loopback, so they exist only when the online channel is on. No `dsh-*` MCP helper is used; the import-line count is still **180**.

**Constraint 1, one execution path.** `ToolsGateway.call` is the only place a tool is run; the JSON route and the MCP route both call it; the CLI calls the JSON route.

**Constraint 2, the secret does not bypass tool policy. How it was verified.** The gateway runs the tool through the registry's own `execute`, so every `tools/pre-execute` hook runs. `runtime/acryl-harness-runtime/tests/tool-gateway.spec.ts` boots the real web engine and registers a policy that denies `acryl_remove_plugin`: a gateway call over REST and over MCP both come back `isError` carrying the policy's reason, the policy saw both calls, the tool body never ran, and `acryl_list_plugins` through the same path still works. The allowlist is checked before the registry, so a name outside it (for example `bash`) is refused as `not-exposed` and never reaches any hook. Note what is *not* claimed: approval prompts that belong to a DSH session (`exec.agent`) do not exist for an outside caller; the gateway call has no agent, so only policies that decide without one apply.

**Live, a non-DSH agent through the gateway.** The Claude Code that the app runs as a worker is handed the gateway automatically: a `0600` MCP config file naming this host and carrying the secret (a file, so the secret never shows in a process listing), plus the docs folder as `--add-dir`. Three live runs, each exposing something the unit tests had not:
1. It connected and listed tools but every call failed with `unknown field "_meta"`: Claude sends the extra `_meta` MCP allows on `params` and my strict parser refused it. Fixed (MCP reads only `name` and `arguments`; regression test).
2. It listed plugins correctly (zero), then, asked to author one, passed `acryl_verify_plugin` but could not install it because it guessed the patch format: the docs `acryl_extension_lookup` points to were outside its folder and unreadable in headless mode. Fixed by learning the docs folder from the lookup's own answer and passing it as `--add-dir`.
3. With that, Claude Code looked up the docs, read the tool-plugin guide and the `tool-basic` example, wrote a three-file plugin (with `acceptEdits` enabled for the test host; file edits are off by default), verified it, installed it live and listed it, in 31 seconds; I confirmed the plugin in the registry over the REST route independently.

### T044 matrix, as far as it can be filled

| Agent | Web engine | Desktop-composed profile |
|---|---|---|
| DSH chat, real model | PASS (cell 4: author, update, remove) | tool sequence PASS (no model); GUI not run |
| Claude Code (as an app worker, through the gateway) | PASS live (authored and installed a plugin) | not run (same code path; the profile smoke runs the tool sequence only) |
| Codex | not run: needs the owner's Codex login. The MCP endpoint is the standard streamable-HTTP shape Codex's `mcp add --url` accepts; unverified | not run |
| Pi | not run. Pi has no MCP; the route for it (and any shell agent) is `acryl control tool`, unit-tested, not run with Pi | not run |

### The TUI answer (surface parity, verified, not assumed)

Measured by booting the terminal engine and listing its rows: **the TUI profile has no `webServer`, no `acrAgentControl`, and does not mount `acryl-agent-control`** (`coding-capabilities.ts` says so: "A TUI has no page, so it is not declared here"). So today a TUI user cannot attach a worker, watch its turns or send it input, and a shell agent cannot reach a tool gateway from a TUI-only app: **the assumption that the route already exists in the TUI profile is false**, because the route needs an HTTP listener the terminal engine does not have. Two explicit ledger rows instead of a silent gap: **T053** (TUI worker surface: mount the service and provider in the TUI profile and render workers in pi-tui from the same `acrAgentControl` contract, no second worker logic; it needs no HTTP) and **T054** (a page-less loopback listener for the gateway, built as the node:http provider of the T046 S1 `acrylWeb` port reusing `acryl-loopback-http`'s token auth, so no second HTTP stack). Note also the TUI has no PTY tabs; its agent runs shell commands through the chat's `bash` tool.

### Other findings
- A failed update still loses the working version (T050, unchanged, still open).
- The hand-rolled MCP server is about 90 lines; if Codex or another client needs SSE, resumable sessions or auth discovery, that is the point to revisit R32's SDK question for the MCP side too.

## Finding R34 - T050 done; T046 S1 started: the ratchet, the file primitives, the web port (2026-10-03)

Branch `harness-latest-2026-10` (pushed to `4f72b5e`).

### T050: a failed update keeps the working version

Done (see the T050 row): the install tool now remembers the staged copy that is installed before it takes the old version down, and on any later failure reinstalls it, reactivates it and discards the failed copy. It restores only from a copy under its own stage folder, never an arbitrary path (so a plugin that installs from its own folder, which is what the update just changed, is reported as not restored, honestly). Where it reaches: the same code serves the DSH chat's tools, the gateway and the workers. Not exercised on a real Desktop GUI.

### T046 S1: what landed, with the numbers

The ratchet is in `scripts/verify-layout.mjs` from the first commit: it counts `from '@deepseek-ai/dsh...'` lines in non-test source under `runtime`, `apps`, `plugins`, with the seam named as files (`engine-*.ts` in the runtime and in Desktop, the Desktop Electron entry, the `@acryl/ui` contract facade), and fails above a ceiling and also below it (so a ceiling is lowered in the commit that lowers the count).

| Step | Total | Outside the seam |
|---|---|---|
| Before (R31 measurement) | 180 | 168 |
| File primitives (`dsh-atomic-write`, 8 uses) behind `engine-files.ts` in the runtime and in Desktop | 174 | 160 |
| `acrylWeb` port: four private plugins stop importing `dsh-host-webserver` | 171 | 156 |

The web port: `acryl-control` declares `AcrylWeb` (`host`, `port`, `register`, `registerUpgrade`, plain `node:http` types); one adapter in the engine seam (`engine-web.ts`) provides it over DSH's `webServer` for Web and Desktop (the terminal has no page); `acryl-agent-control`, `acryl-plugin-admin`, `acryl-support` and `acryl-workspace` inject `acrylWeb`. Proof: every package gate, and the real-engine tests (the gateway, the workers, self-hosting) now run through the adapter; Web, Desktop (including the packed install and the profile smoke) and the runtime gates are green.

**Two lessons.** (1) The first attempt at the file facade imported the runtime from Desktop, and the Desktop gate caught that the light `dsh` command-line entries share those modules and must not load the whole shared runtime (flat install smoke: `acryl-harness-runtime` not found). Each package therefore has its own one-line seam file. (2) The design said `acrylFiles` would be a service; a plain function facade is simpler and right for stateless utilities, so no service was added (deviation from R31, recorded).

### Findings for the owner

1. **`cordis-plugin-market` (17 lines) is excluded on purpose.** It is a public npm package meant to run on stock DSH ("ordinary DSH/Cordis, profile and Desktop service contracts"); depending on the unpublished `acryl-control` would stop it being installable from npm. `dsh-client-ui-brand-acryl` (5 lines) is public for the same reason. Their DSH imports are by design, not coupling to shrink, but under your seam definition they count as "outside". Decision needed: add "published DSH-ecosystem plugins" to the seam definition, or accept that the outside-the-seam floor is about 22 lines. I did not widen the seam.
2. **Home paths belong to the bulkhead task** (T056), not the port work.
3. **Remaining S1 is T055 (tools port, 7 lines) and T056 (home paths, 2 lines).** After those, S1's host-side lines are done; what remains is mostly the client frame (S3, about 75 lines), Desktop's Electron-side imports and the chat.

## Finding R35 - main post-merge, the clean-checkout gate, T055, T046 S2 (2026-10-04)

Branch `harness-latest-2026-10` (pushed to `8d6d649`).

### What `bb139da` is, and the state of main

`bb139da` is a merge commit made by the owner (Oct 3, 14:45) of `origin/harness-latest-2026-10` into `main`; its second parent is my `7ebafbe`. So the branch up to that point is fully in `main`, and `main` carries the owner's CI commit `5bed19a` on top; my later commits (T055, the build fixes, S2) are ahead of `main`. The owner's uncommitted edits (`ci.yml`, a root `package.json` change adding `acryl-settings` to `build`) are in the main checkout and were left alone; the verification ran in separate worktrees (a detached `origin/main`, with the branch merged locally, throwaway, never pushed).

### The gate on main, as pushed, from a clean checkout: RED

`corepack pnpm run check` on `origin/main` failed from a clean checkout, and so did root `build`; the earlier "green" runs on the branch had been using old build outputs in the worktree. Four causes (T057 has the detail): the root `build` script misses `acryl-settings` and `acryl-agent-control`; `acryl-control` and the runtime formed a dependency cycle that made them build concurrently (a real race: one wiped `lib/types` while the other's `tsc` read it); `acryl-plugin-admin` and the runtime formed a second cycle; the runtime's real-engine tests need the plugin libraries that `check` built later.

### The gate on main with the branch merged, from a clean checkout: GREEN

Fixes (all on the branch): `7810bdf` removes both cycles at the root (the core no longer depends on the runtime it never imported; plugin-admin takes lifecycle types from `acryl-control` and the blueprint display name from the engine, published as `ACRYL_BLUEPRINT_NAME` next to `ACRYL_BLUEPRINT_ID`, which also gives custom blueprints a real name); `bc98eae` makes the runtime's `check` build its workspace dependencies first in dependency order; `0476581` fixes a load-sensitive flake (the session-bridge specs boot a real runtime each, under a 5 s default). Result: a fresh worktree of `origin/main` with the branch merged, nothing pre-built, `corepack pnpm run check` exits 0 (including the packed install of `acryl-web` and the Desktop smokes). The root `build` was tested separately: from a fully wiped tree, the topological recipe in T057 builds all 77 packages. **Main is not the working branch until the owner has merged these and root `build` is fixed**; the branch keeps being the working branch until then.

### T055: the tools port

Done (see T055 row): 169 -> 165 total, 154 -> 149 outside the seam.

### The known, justified remainder

Per the owner: the DSH import lines in the two public plugins are accepted as the justified remainder and the seam is not widened. They are exactly **22 lines**: `cordis-plugin-market` 17 (`src/index.ts`: `dsh-host-webserver`, `dsh-settings`; `src/client/index.ts`: `dsh-client-locale`, `-ui-conversation`, `-ui-layout`, `-ui-renderer`, `-ui-session`, `-ui-settings`, `-ui-sidebar`, `-ui-workspace`; `client/market-view-store.ts`: `dsh-client-store`; `MarketLauncher.tsx`, `MarketOverlay.tsx`, `MarketSettingsTab.tsx`: `-ui-primitives` and `-ui-slots` each) and `dsh-client-ui-brand-acryl` 5 (`Brand.tsx` and `client/index.ts`: `-ui-conversation`, `-ui-sidebar`, `-ui-renderer`).

### T046 S2: ACRYL owns the project list

The list is one `acryl-settings` section (`workspace`: `projects`, `adopted`) in the ACRYL home, kept by a `ProjectRegistry` in the workspace Host plugin and served at `/api/acryl-workspace/projects` (same-origin; add, remove, adopt). Adding validates an absolute existing folder and dedupes; removing an unlisted folder is not an error; `adopt` takes over folders that were chat workspaces before ACRYL owned the list, **once**, skipping folders that no longer exist. On the page, `ProjectsControl` reads and changes the list through a small registry state (the chat's workspaces are no longer consulted for it); adoption waits until both the registry and the chat's workspace list are ready (adopting from a list that was still loading would mark it done and lose the user's projects). The DSH chat's workspace is now created when a chat starts in a folder (one way: ACRYL to chat), and removed best-effort when the project is removed; adding a project no longer needs the chat at all. Proof: 7 host tests against the real `acryl-settings` service (persistence across a new service on the same home), 12 client and control tests, a real-engine test across a restart and across a chat-off and chat-on composition, and live in the browser: a project added through the route is listed with its git branch, and is still listed after a restart on the same home with the chat off. Not exercised live: the one-time adoption from real legacy workspaces (covered by tests only, including the still-loading case), and the Desktop window.

### R36 - T046 S3: the client frame types come through `@acryl/ui/frame`

Seven client plugins (`acryl-workspace`, `-app-shell`, `-plugin-admin`, `-agent-control`, `-support`, `-mount-anchors`, `-shortcuts`) named the DSH client packages in 43 import lines across 31 files. They now import those types from `@acryl/ui/frame` (commit `83cbbef`): a types-only facade (`plugins/acryl-ui/src/frame.ts`, a separate export of `@acryl/ui`) that also carries the Context and slot augmentations (`ctx.slots`, `ctx.locale`, settings, theme, right panel), so no plugin gets less typing than before. It adds no browser code. `frame.ts` joins the seam definition next to the contract adapters, and the ratchet moved from 165 total / 149 outside the seam to **134 / 106**. Gates run green: `@acryl/ui` (74), the seven plugins, runtime (214, 2 skipped), Desktop (811, 4 skipped), Web and CLI.

Findings from the pass:
- `@acryl/ui` had drifted from the 0.2 primitives: `ReferenceIcon`, `LinkIcon` and `DocumentFileIcon` no longer exist (now `ReferenceIconMedium/Regular`, `LinkIconMedium/Regular`, `FileTypeIcon` with `classifyFileType`, `fileExtension`), and `SelectPill` used a removed chevron. Only vitest ran in the package's root gate, so the typecheck errors were invisible; contract, stub and re-export inventory now follow.
- DSH's `sidebar-right` declarations import `@deepseek-ai/dsh-client-ui-dockkit`, which the upstream 0.2.0-rc.2 release does not ship. Desktop's `tsc` now reaches them through the facade, so Desktop's base `tsconfig.json` sets `skipLibCheck` (every ACRYL client config already did).
- A Desktop `dev` run and a gate run in the same worktree race: the runtime gate rebuilds `@acryl/ui` and its clean step removes `lib/` while the other build reads it (the owner saw `Cannot find module '@acryl/ui/frame'`). Do not run two builds in one tree.
- The seam is not widened. The 22-line remainder (R35) is unchanged.

### R37 - Live acceptance on all three surfaces, and two isolation defects it found

Run on the branch at `83cbbef` with the real model (key read from the secure store into the process environment, never typed, never logged), each surface in its own throwaway home.

| Surface | What ran live | Result |
|---|---|---|
| Web | DSH chat, real model: authored `acryl-hello-tool` from the docs, verified, installed live, listed (active); then changed it, updated the live install, called it (`hello again from acryl`, confirmed in the staged package). Agent Control: `ui_snapshot` returned refs, `ui_click` on Settings held at a per-call approval; **Reject** performed nothing and the agent reported it; **Allow once** opened Settings; Settings > Agent Control lists snapshot, click `button "Settings"`, snapshot, all `ok`. | PASS (rows 6 and 7 partly, below) |
| TUI | Booted in a pty (build `83cbbef`), real model turn answered. | PASS (boot and one turn; no worker surface, T053) |
| Desktop | Electron launched with its own home and user-data folder: healthy renderer, startup run completed. | PASS (boot only; the agent flows were not driven in the Desktop window) |

Still not live: the blend snapshot/apply round trip and market install (row 7), Agent Control on Desktop and in the TUI, Codex (needs the owner's login), Pi through `acryl control tool`, a real key-save through the settings UI (an API key is the owner's to type), the Windows sandbox, T053/T054 (TUI worker surface and gateway), S4.

Two defects found and fixed (both touched real state; nothing was deleted):
- **The packed-web smoke used the real home** (`3def3e1`). `verify-npm-web-entrypoint` ran `acryl-web --json` with the caller's environment, so a gate run took over the stopped `~/.acryl` web profile and re-linked its packages into its own temp install. The installed app's profile was left with dangling links (it re-links on the next normal launch of the app; no live app was serving from it). The smoke now pins its own home; verified that no file under `~/.acryl` or `~/.dsh` changes.
- **`userDataName` was documented but not applied** (`6cbd2b4`). A Desktop launch with `ACRYL_LOCAL_PRODUCT_NAME` still wrote logs, lifecycle events, crash evidence and locks into the installed app's `~/Library/Application Support/ACRYL` (second occurrence; the first was 2026-10-02). I removed the one crash-evidence marker my killed process left there; the append-only logs and events remain. The Electron bootstrap now derives the folder from the instance when its name differs from the product name; verified live that the real folder stays untouched.
- The model's default workspace is `~/Documents/deepseek-harness/default-workspace`, outside the instance home, so a Web chat with no project writes there; the two folders my test agent created there were removed. Not yet a defect with an owner: recorded for the S4 own-host design.

### R38 - Isolation guard, the restart defect, and the blend round trip live

**Guard (T058, `3f98766`).** Three incidents in one session (the packed-web smoke, a Desktop launch, the web agent's default workspace under `~/Documents`) had one cause: anything that boots an app defaulted to a real home and was isolated per incident afterwards. The guard is one idea at three layers: the selector refuses without an explicit isolated home when `ACRYL_REQUIRE_ISOLATED_HOME` is set; scripts build their environment with one helper that also moves `HOME`; `verify-layout` fails any new `verify-*` script that can boot an app without it. Two things the guard's own test taught: the web bundle includes the runtime (`noExternal`), so a runtime change reaches the web app only after the web bundle is rebuilt; and a refusal raised inside a plugin fiber failed only that plugin and the app exited 0 with a tokenless URL, so the host now selects its instance before anything mounts and the smoke requires the token. **A fourth breach happened while testing the guard**: two negative-test commands booted the web app against the real `~/.acryl` (the stale bundle had no guard yet), re-linking its web profile to this worktree. No live app was serving from it and the next normal launch of the owner's build takes the stopped holder over; the lesson is now a rule in the design doc: never test the guard, or anything that boots an app, with a command that can fall back to the real home.

**The restart defect (T059, `50b6189`).** First live restart of an app with an agent-built extension: every tool call failed after the second boot with `Cannot read properties of undefined (reading 'prepare')`. Bisected with a scripted real-engine run on a pinned app home: a plain app survives restarts; an app with the extension fails only from the second boot; with the extension's host package declared under `peerDependencies` instead of `dependencies` it passes. Cause: DSH's `TOOL_RUNTIME_SCHEDULER` is `Symbol(...)`, unique per loaded copy of the module, and the install put a second copy of `@deepseek-ai/dsh-tools` into the profile; from boot two the plugin imported that copy while the app ran on its own. This regressed silently in the 0.1.5alpha to 0.2 move (0.1.5 linked the installation's packages into the profile; 0.2 answers imports from a table), and the single-boot real-model test (cell 4) could not see it. The shipped verified examples all used `dependencies`, and models copy examples.

**Blend round trip, live.** The model authored `acryl-hello-tool` in app F (the app's `extensions/` folder, scope global); `acryl save` committed it (the evolution ledger travels with the commit); `acryl new G --from F` created a derived app (new identity, the source's plugins identical, lineage recorded); G booted cold and its tool returned the plugin's text. By design the model key does not travel with an app: the derived app asks for a key, and the owner's key was supplied through the process environment only. Also found: the derived `blend.yaml` header kept the source app's name (fixed, `5d4eded`).

**Merged.** `harness-latest-2026-10` is in `main` as `3d9f374` (a fast-forward push of a no-fast-forward merge made in a clean worktree, so the owner's uncommitted `ci.yml` and `package.json` edits were never involved). The first gate run on the merge result failed twice, both caused by this round's own changes and both caught by the gate, not by use: the isolation helper called `homedir()` outside the selector (the bulkhead test), and the derived-app header fix ran after the lock digested the manifest (a derived app failed lock verification). Fixed in `3445a5e`; the full `corepack pnpm run check` then passed (exit 0, every package) on the exact commit that was pushed, from a clean worktree after `upstream:sync` and a frozen install, so that run is both the tip gate and the post-merge gate.

**Merge readiness (as it stood).** What was merge-blocking: the round trip (done), a fresh green gate on the branch tip, the merge, and a green gate on main. Everything else (T060 to T063, the Windows CI, TUI worker surface T053/T054, S4) is post-merge; S4 is architecture, not migration.

### R39 - The Plugins page: adopted on paper, not reachable (found by the owner, 2026-10-05)

The owner showed DSH 0.2.0-rc's Plugins page (Official, Installed including plugins an agent builds on the fly, Add plugin, an Automation tasks entry) and asked whether the migration took it. **It had not, in the sense that matters.** R27 / T042 recorded "adopt upstream's plugin manager" and said it "runs inside ACRYL's frame", but what R27 verified was the Models page and Settings > General; the Plugins page itself was never opened, and T042 stayed open. The component was mounted (the `ui-plugin-manager` row comes with the stock web-app bundle) and the advanced frame already shows keyed main panels, but the entry point lives in DSH's sidebar, which ACRYL replaces with the workspace tree (DSH's sidebar is mounted only as an invisible host for Settings). So the page existed and could not be opened; Settings offered only the read-only "Built-in plugins" inventory. This is the same class as the earlier claims of full parity: "adopted" was recorded from the decision, not from opening the page. Earlier statements in this thread that all 0.1.5alpha features were back overstated it by this one.

Fixed in `db2c496`: the left pane reads `sidebar.panellist` through a narrow port and lists every page DSH's plugins contribute above Settings (so Automation tasks and any later page appear without ACRYL naming them); selecting one opens it through `layout.selectPanel`, selecting the open one again returns to the conversation. Verified live on Web in the ACRYL frame: the page opens with its Official list and Add plugin, and a plugin the model had just built appears under Installed with its toggle (peerDependencies declared by the model, per T059). Not verified live: the Desktop window (it shares the plugin and the frame, so the entry should appear there), an official plugin's toggle taking effect (with `hmr` off a toggled official plugin, such as Automation tasks, needs a restart before its own entry appears; the toggle persisted), and Add plugin installing from a registry. The official experimental plugins (Agent Teams, Auto Authorization Review, Automation tasks, Voice input) are off in ACRYL's composition and on in DSH's own app; whether ACRYL should default any of them on is the owner's call. Tests: 7 for the panel port, 2 for the pane render.

Found on the way and fixed (`25d0a71`): DSH creates the chat's first workspace in the OS Documents folder, which it asks the OS for, so `HOME` isolation did not cover it and a live run wrote an agent-built plugin into the real `~/Documents/deepseek-harness`; `live-run` detected it, I removed the one folder my test agent wrote, and the app instance now carries `documentsDirectory` (the default instance keeps the OS folder, every other keeps it inside its home). Also fixed: a PTY test with a fixed 300 ms wait that failed under load (`d10d54c`).

### Small items closed
- T056's commit hash fixed (`7ebafbe`). T053 and T054 are one pass: both need the page-less loopback listener and the TUI profile to mount `acrAgentControl`; plan them together after S3.
- Ledger cell 4 (R30/R33) stays closed; no GUI cell was re-run this round.

