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
