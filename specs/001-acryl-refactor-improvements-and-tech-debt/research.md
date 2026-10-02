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
