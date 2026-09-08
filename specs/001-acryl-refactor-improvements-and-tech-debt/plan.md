# Implementation Plan: ACRYL Technical Debt, Refactoring & Stability

**Directory**: `specs/001-acryl-refactor-improvements-and-tech-debt/` | **Spec**: [spec.md](./spec.md)
**Status**: Active | **Date**: 2026-09-08 | **Surface package**: `acryl-cli`

## Summary

Two tracks, deliberately split. **Track A — hygiene & stability** (quick,
low-risk, must land first because the headless gate and repo state are currently
untrustworthy). **Track B — architecture moves** (the boundary violations:
extract the auth/credential domain logic, remove the `-oauth` encoding, model
concepts with real types, pure render, no `any`). Track B is the high-value
work and is phased behind a small seam so the default `dsh`/`acryl` behavior
never regresses.

Every Track B item has a matching guardrail in
`proof/architecture-guardrails.mjs`. The guardrails are RED today; landing the
task flips its guardrail GREEN. The ledger phase is closed when all guardrails
report PASS (script exit 0).

## Target boundary: the credential/authorization seam

Today the terminal surface (`acryl-cli/src/tui-app/session.ts`) is a second
owner of credential state. Target end-state:

```text
acryl-control  (engine-neutral layer)
  ├─ CredentialProjection   : typed read-model { hasCredential, hasSettingsProfile,
  │                           isLive, authMethod: AuthMethod | undefined }
  ├─ AuthorizationService   : begin({ key, method, interaction }) -> outcome
  └─ events                 : credential.changed  (targeted invalidation)
        ▲ surface overlays render these; they never persist or own the model
acryl-cli/src/tui/**         : pure presenters (render typed projection)
```

- The read-model that joins `ctx.llm` + `ctx.settings` + `ctx.credentials` moves
  into `acryl-control` (or `acryl-harness-runtime`) as one source of truth;
  `/login` and `/model` consume the **same** projection (fixes R3 one-meaning + R4 shotgun).
- `beginAuthorization` run by the service; the overlay only forwards user input.
- The `-oauth` display-name rewrite is removed; the auth method is a typed
  `AuthMethod` badge rendered at presentation time (fixes R2 double-bookkeeping).
- `AuthMethod` is one exported value object (fixes R5).

## Per-item design / boundaries

| Item | Finding | Boundary (what owns it) | Target |
|---|---|---|---|
| Auth/credential read-model + use-case | R1 | `acryl-control`/`acryl-harness-runtime` | typed `CredentialProjection` + `AuthorizationService` |
| `-oauth` display-name encoding | R2 | presentation | remove; render `authMethod` badge |
| `configured` two meanings | R3 | projection | one field set, one meaning |
| `refreshCredentialState` shotgun | R4 | projection + event | subscribe to `credential.changed` |
| `AuthMethod` primitive/dup | R5 | shared types | one exported `AuthMethod` |
| `render()` mutates state | R6 | component | compute during data transition |
| `listWindow`/`visibleRange` dup | R7 | shared narrow helper | one helper |
| loose overlay state | R8 | component | discriminated-union view state |
| `any` service handles | R9 | surface | typed `ctx.get(...)` / typed port |
| spec drift (024) | R10 | specs ledger | update spec/plan/tasks |
| headless gate needs `CI=true` | R11 | workspace | `pnpm install` so plain gate is green |
| uncommitted test | R12 | git | commit with behavior |
| submodule drift | R13 | upstream | reconcile + commit pointer+json |
| inheritance gate gaps / Desktop dup | R14 | scripts + desktop | family check all, loud presets, launcher symmetry |

## Phasing and ordering

**No Track B work begins until Track A lands** — the repo must be in a trusted
(green, committed, consistent) state before moving logic.

- **Phase 0 — Hygiene & stability (Track A).** Derisk the workspace: install,
  commit the test, reconcile the submodule, close the gate gaps, reconcile the
  024 spec. *Exit:* `check` and `check:layout` pass plainly; no uncommitted test.
- **Phase 1 — The boundary move (R1/R2/R3/R4).** Intro-duce the
  `CredentialProjection` + `AuthorizationService` seam in `acryl-control`; migrate
  `session.ts` to consume it; overlays render only. *Exit:* guardrails G1, G2, G8 green.
- **Phase 2 — Type the domain concepts (R5/R9).** Exported `AuthMethod`; type
  every service handle (no `any`). *Exit:* G4, G3 green.
- **Phase 3 — UI/state hygiene (R6/R7/R8).** Pure render; shared list-window
  helper; discriminated-union view state. *Exit:* G6, G5, G7 green.
- **Phase 4 — Cross-surface / maintenance (R14).** Extend the family gate,
  loud presets, launcher symmetry; optional `runtimePackageVersion === sourceVersion`.
- **Phase 5 — Proof & ledger close.** Run
  `proof/architecture-guardrails.mjs` to green; record evidence; update the
  ledger (mark tasks done, link evidence, mark `specs/024` reconciled).

## Constitution check

- I (everything is a plugin): the auth/credential logic is expressed as a
  service behind `acryl-control`, not a privileged kernel path. ✓
- II (agents disposable, room persistent): surfaces remain presenters; no new
  durable owner. ✓
- III (compose DSH, don't fork): no `deepseek-harness/` edits. ✓
- IV (canonical durable state): the projection is a read-model over existing
  DSH services, not a competing store. ✓
- Cordis laws: depend on service keys (`inject` / typed `ctx.get`), one
  lifecycle owner, typed config, no hidden globals. ✓

## Verification

- Per task: the RED/GREEN proof command in `tasks.md` (TypeScript typecheck +
  the guardrail script for Track B; `check`/`check:layout` for Track A).
- End of each phase: `CI=true corepack pnpm run check` (or plain once Track A
  lands) plus `node .../proof/architecture-guardrails.mjs` for the phase's
  guardrails.
- Before handoff: full headless gate green, ledger updated, evidence recorded.

## Technical context

- **Language/Version:** TypeScript (strict) on Node `^22.19.0` or `>=24`; root
  pnpm `11.8.0`.
- **Surface package:** `acryl-cli` (renamed from `acryl-tui`) — the `acryl` bin.
- **Engine-neutral layer:** `acryl-control` (contracts) and
  `acryl-harness-runtime` (runtime factory + session bridge).
- **Runtime:** published `@deepseek-ai/dsh-*@0.1.1-rc.2` family via
  `acryl-harness-runtime`; submodule `deepseek-harness/` read-only.
- **Testing:** `corepack pnpm run typecheck` / `test` / `verify` / `check`;
  `corepack pnpm run check:layout`; guardrail script.
- **Constraints:** no `deepseek-harness/` edits; typed services; no parallel
  lifecycle/event/DI system; green, reversible commits.
