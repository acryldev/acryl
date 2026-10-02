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
