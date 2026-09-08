# Code Review: ACRYL CLI `/login` two-step sign-in redesign

- **Date:** 2026-09-08
- **Reviewer:** Codewhale (agent)
- **Scope:** latest ACRYL CLI changes — the uncommitted working-tree diff on `acryl-cli` (`LoginOverlay.ts`, `actions.ts`, `store.ts`, `TuiApp.ts`, `login/types.ts`, `tests/tui/commands.spec.ts`) plus the committed half it depends on (`session.ts` `loadAuthorizationFlows` / `ensureProviderActivated` / `beginAuthorization(key, method)` / `addCustomProvider` / `computeProviderRows`, landed in `0205a3d`).
- **Framework:** Clean Architecture (Robert C. Martin) + Implementing Domain-Driven Design (Vaughn Vernon) + Fowler code smells.
- **Verification:** `corepack pnpm --filter acryl-cli run typecheck` passes at the working tree (exit 0). The `HEAD`-state claim below is from file inspection, not a stash + typecheck run (deliberate, to avoid disturbing the in-flight tree).

---

## Critical: `HEAD` is a non-reversible checkpoint

The feature is split across a commit boundary mid-refactor. At `HEAD`:

- `session.ts` already implements `addCustomProvider`, `clearApiKey`, `beginAuthorization(key, method)` and **has no** `selectLoginFlow`.
- `actions.ts` still declares `selectLoginFlow` and has **no** `addCustomProvider`/`clearApiKey`; `session.ts` assigns `const actions: TuiActions = {...}` (line 469).
- `TuiApp.ts` still constructs `new ModelProfileOverlay(store, actions)` (2 args) while `ModelProfileOverlay`'s constructor already takes `(tui, store, actions)`.

So `HEAD` cannot typecheck (missing `selectLoginFlow` + excess `addCustomProvider`/`clearApiKey` on the object literal; arity mismatch on the overlay). The working tree is the completing half. This violates `AGENTS.md`: *"Commit every important coherent change promptly so regressions can be reverted to a precise checkpoint … Prefer several focused commits."*

- **Severity:** High (repo health / reversibility).
- **Fix:** land the working tree as its own focused commit so `HEAD` is buildable, then add the dev-log checkpoint separately.

---

## Architecture & design findings

### A1 (High) — Authorization/credential domain logic lives in the presentation surface

`session.ts` (the TUI) owns behavior that is not presentation: it joins `ctx.llm.listConfigurableProviders()` with `ctx.settings.describe()` and `ctx.credentials.describe()/readRecord()` to decide `configured`/`authMethod`; it **writes durable settings** (`ensureProviderActivated` → `settingsSvc.update(...)`) with `-oauth` display-name suffixing and revision/conflict handling; it drives the whole `beginAuthorization` interaction plus a retroactive repair loop.

- **Clean Architecture:** Controller-Centric Logic / Layer Bypass — business rules (provider credential state, authorization flow, the "signed in / ready" model) implemented inside the interface adapter, reaching directly into framework service handles and persisting state.
- **DDD:** the authorization context's invariants belong in a domain/application layer, not the terminal renderer.
- The correct seam already exists in the architecture map — `acryl-control` is the engine-neutral capability layer — but this logic bypasses it.
- **Fix of record:** move the provider/credential read-model and authorization use-cases behind an `acryl-control` service; overlays consume a typed projection.

### A2 (High) — Internal state encoded into the user-visible provider name (`-oauth` suffix)

`ensureProviderActivated` rewrites `settings.displayName` to `"<base>-oauth"` so the method is "unambiguously distinct everywhere a name is shown." This bakes an internal state bit into a presentation field (the provider's *name*), and is now **double-bookkeeping**: the same row carries a typed `authMethod` field that `LoginOverlay` renders as `[oauth]`/`[api]`. The retroactive repair loop that strips and re-appends `-oauth` exists precisely to clean up the divergence this design created.

- **DDD** Identity Across Contexts / Ubiquitous Language: one fact, two representations.
- **Clean Architecture** Separate translation from policy: the badge translation belongs at render time, not in durable domain state.
- **Fix:** drop the display-name suffix; render the method badge from `authMethod`.

### A3 (Medium) — `configured` means two different things across the product

`/login` `configured = credential record exists`; `/model` `configured = settings section exists` (`userValue !== undefined`). Same term, two semantics — a Ubiquitous-Language violation that is the root of the staleness the code documents and patches in `refreshCredentialState()`.

- **Fix:** one credential-state projection with explicit fields (`hasCredential`, `hasSettingsProfile`, `isLive`) — don't overload one boolean.

### A4 (Medium) — `refreshCredentialState()` is a shotgun repair

It re-runs `loadProviders()` + `loadAuthorizationFlows()` and relies on each overlay's update being a no-op unless open. Fowler *Shotgun Surgery*: one logical change (a credential mutation) scatters to two refresh functions; the comment itself admits the overlays never invalidate each other.

- **Fix:** a single shared credential/authorization projection service that overlays subscribe to, or an event that triggers targeted invalidation.

### A5 (Medium) — `method` and auth-type concepts modeled as primitives / duplicated

`TuiActions.beginAuthorization(key: string, method?: string)` widens the concept to a bare `string`, while the domain type `'oauth' | 'api-key'` already exists as `AuthType` (`LoginOverlay`) and the `authMethod` union (`login/types.ts`) — **three definitions of one concept, one downgraded to `string` at the seam**. Fowler *Primitive Obsession* + DDD *Value Objects*. Minor: `activeModel: { provider: string; model: string }` is the same smell.

- **Fix:** one exported `type AuthMethod = 'oauth' | 'api-key'` used across the action contract and the row.

### A6 (Medium) — `render()` mutates component state (render-phase side effect)

`render()` calls `maybeAutoSkipChooser(login)`, which sets `this.step` / `this.authType` / `this.chooserSkipped` / `this.autoSkipChecked`. Mutating state during render is an anti-pattern; the `autoSkipChecked` latch means a late/refreshed flow list (method set) won't re-evaluate the skip.

- **Fix:** compute step/auto-skip during the data transition (when `flows` arrive), not inside `render`.

### A7 (Low-Medium) — `listWindow`/`visibleRange` are a copy-paste

The comment literally says "See `ModelProfileOverlay.listWindow` — same overflow bug, same fix." Identical container-slicing algorithm in two overlays = Fowler *Duplicated Code*.

- **Fix:** extract one small, narrow helper (or an overlay base) — deliberately not a generic "ui utils" dumping ground.

### A8 (Low-Medium) — loose, interrelated overlay-local fields

`LoginOverlay` carries `step/authType/authTypeCursor/chooserSkipped/autoSkipChecked/listCursor/searchQuery/promptField/promptCursor`, which can drift transiently (e.g. `chooserSkipped=true` while still `step==='authType'`). Data-clump wanting a type.

- **Fix:** a small discriminated-union view state (`{kind:'authType'} | {kind:'list'} | {kind:'prompt'}`) carrying its own cursor/query.

### A9 (Medium) — pervasive `any` on leaked framework service handles

`const settingsSvc: any = host.ctx.get('settings')`, same for credentials/llm/authorization. The repo's Cordis guide specifies *typed* `ctx.get(...)`; every `any` defeats the typed-contract guarantee ("surfaces talk to engine-neutral typed `acryl-control` API"), and the new code compounds the existing pattern.

- **Fix:** type the service handles (or route through a typed `acryl-control` port) instead of `any`.

---

## What's done well

- The two-step flow is better than the old single list: auto-skip when only one method is on offer, fuzzy search, `configured`/`authMethod` per-row indicators, `ctrl+p → add custom provider` jump, and the `AUTH_TYPE_LABELS` map are readable and well-commented.
- The overflow fix (`listWindow`/`visibleRange`) is a real improvement over the documented bug.
- `beginAuthorization(key, method?)` keeping `method` optional with "defaults to the flow's first" is a sensible backward-compatible shape.
- Guarding against undefined (`if (flow !== undefined)` on `enter`) and the sequential (not `Promise.all`) repair loop (documented `SettingsConflictError` revision race) show real care.

---

## Standards vs Spec axes

**Standards:** ~7 findings (A1–A3, A5–A9). Worst single issue: **A1** — domain/credential logic hosted inside the terminal surface (boundary violation). Much of it is documented and justified in-file, but justification does not remove it from the presentation layer.

**Spec:** **One** finding, material. `specs/024-acryl-cli-login` Stage 2 / L012 specifies *"extend the `/model` overlay with an OAuth-vs-API-key selector (`o` key, `[oauth]` row status)"*. The working tree instead builds a **separate `/login` overlay with a two-step method chooser + fuzzy-searchable provider list + custom-provider jump** — a meaningfully different interaction, **not reflected in the spec, plan, or tasks**, and L012 is checked "done". Unlabelled scope drift against the live ledger.

- **Fix:** update `specs/024-acryl-cli-login` (spec/plan/tasks) to describe the shipped two-step design, or open a Wayfinder/spec ledger ticket for the redesign.

---

## Recommended order of attack

1. **Commit the working tree as one focused commit** (restores a green, reversible `HEAD`), then a separate dev-log checkpoint.
2. **Reconcile the spec** (`specs/024-acryl-cli-login` or a new ledger ticket) with the two-step design actually shipped.
3. **Move the authorization/credential domain logic out of `session.ts`** into an `acryl-control`-owned projection/use-case (A1), and **delete the `-oauth` display-name encoding** in favour of the `authMethod` badge (A2) — together they eliminate the repair loop and the type staleness.
4. Fold the smaller items (A3–A9) into the same move: one typed `AuthMethod`, one shared `listWindow`/`visibleRange` helper, a single credential-state projection, no `any` at `ctx.get()`, and a `render()` free of state mutation.
