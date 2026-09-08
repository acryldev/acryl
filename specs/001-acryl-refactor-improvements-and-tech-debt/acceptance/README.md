# Acceptance Tests — how to prove each task is done

The acceptance criteria for every task in [`tasks.md`](../tasks.md) is **a test
you actually run** — not a prose wish. This file is the implementer's lookup:
find the task, run the listed command, and when it passes the task is done.

Two kinds of evidence:

1. **Architecture guardrails** — `proof/architecture-guardrails.mjs` (static,
   runnable now). Each guardrail (G1–G10) maps to the task that turns it green.
   Run it to see the whole move at once: `node specs/001-acryl-refactor-improvements-and-tech-debt/proof/architecture-guardrails.mjs`.
2. **Behavior/unit tests** — live in the owning package (`acryl-control`,
   `acryl-cli`) under `tests/`. The following contract says exactly what to
   assert; the implementer writes them as RED then lands GREEN (RED→GREEN-REFACTOR).

> Run every package command with `corepack pnpm` from the repo root.

---

## Phase 0 — hygiene & stability

| Task | Test to run | Green when |
|---|---|---|
| T001 | `corepack pnpm run verify` (no `CI=true`) | plain gate passes |
| T002 | `corepack pnpm --filter acryl-cli run test` | `login-preview.spec.ts` runs and passes |
| T003 | guardrail `G10` + `corepack pnpm run check:layout` | `G10 PASS`; layout gate passes |
| T004 | `corepack pnpm run check:layout` | layout gate passes; off-family `dsh-*` pin fails |
| T005 | `corepack pnpm run check:layout` | gate passes; missing preset dir is loud |
| T006 | `corepack pnpm --filter acryl-web run build` + `corepack pnpm run web` | web builds & boots via `acryl-web/bin/dev-run.mjs` |
| T007 | guardrail `G9` | `G9 PASS` (spec describes shipped two-step) |
| T008 | `corepack pnpm run check` + guardrail script | only Track B items left RED |

## Phase 1 — the boundary move

**Target test files (write these in `acryl-control/tests/`):**

- **`credential-projection.spec.ts`** (T009/T010/T012)
  - T009: `AuthMethod` is exported from `acryl-control`; `CredentialProjection`
    has one field set (`hasCredential`, `hasSettingsProfile`, `isLive`,
    `authMethod`) that is asserted once.
  - T010: given stub `llm.listConfigurableProviders/listModels`,
    `settings.describe`, `credentials.describe/readRecord`, the projection
    returns a joined row with `authMethod` derived and `configured` appearing
    **once** per row.
  - T012: emitting `credential.changed` invalidates/notifies the subscribed
    consumer instead of a dual reload.
  - Run: `corepack pnpm --filter acryl-control run test -- credential-projection`
- **`authorization-service.spec.ts`** (T011)
  - given a stub `authorization` service, `AuthorizationService.begin({key,
    method, interaction})` forwards `{key, method, interaction}` to
    `ctx.authorization.begin`, returns the outcome, and emits `credential.changed`.
  - Run: `corepack pnpm --filter acryl-control run test -- authorization-service`

| Task | Test to run | Green when |
|---|---|---|
| T009 | `corepack pnpm --filter acryl-control run test -- credential-projection` | export + type shape asserted |
| T010 | same (projection behavior assertions) | joined row, one `configured` |
| T011 | `corepack pnpm --filter acryl-control run test -- authorization-service` | `begin` forwards + emits event |
| T012 | guardrail `G8` + above | `G8 PASS`; no dual reload |
| T013 | guardrail `G1` + `corepack pnpm --filter acryl-cli run typecheck` | `G1 PASS` (session.ts no longer defines the joins) |
| T014 | guardrail `G2` + `corepack pnpm --filter acryl-cli run test` | `G2 PASS` (0 `-oauth`) |
| T015 | guardrail `G1` + `corepack pnpm --filter acryl-cli run test` | `G1 PASS`; one activation path |

## Phase 2 — type the concepts

| Task | Test to run | Green when |
|---|---|---|
| T016 | guardrail `G4` + `corepack pnpm --filter acryl-cli run typecheck` | `G4 PASS` (one `AuthMethod`, typed seam) |
| T017 | guardrail `G3` + `corepack pnpm --filter acryl-cli run typecheck` | `G3 PASS` (0 `: any`) |

## Phase 3 — UI/state hygiene

| Task | Test to run | Green when |
|---|---|---|
| T018 | guardrail `G6` + `corepack pnpm --filter acryl-cli run test` | `G6 PASS` (render pure) |
| T019 | guardrail `G5` + `corepack pnpm --filter acryl-cli run typecheck` | `G5 PASS` (one helper each) |
| T020 | guardrail `G7` + `corepack pnpm --filter acryl-cli run test` | `G7 PASS` (discriminated-union view state) |

## Phase 4 — cross-surface / optional

| Task | Test to run | Green when |
|---|---|---|
| T021 | `corepack pnpm run check:layout` | versions equal, gate passes |
| T022 | — | NOT startable in this ledger; PENDING on M3 ledger (recorded) |

## Phase 5 — proof & close

| Task | Test to run | Green when |
|---|---|---|
| T023 | guardrail script wired into CI | guardrails stay green on every run |
| T024 | guardrail script (exit 0) + `corepack pnpm run check` | all `SC-001..SC-012` met, evidence linked |

---

## The one-command overall proof

At any point the whole architectural move's state is:

```sh
node specs/001-acryl-refactor-improvements-and-tech-debt/proof/architecture-guardrails.mjs
```

Exit `0` = every guardrail green (the move is architecturally done). Exit `1`
= still RED; the printed `closes: T…` line under each FAIL names the task to
land next.

> **Note:** counts/evidence in this ledger (e.g. `: any` = 19, `-oauth` = 7)
> were measured at `HEAD` `42c4177`. Re-run the guardrail script before trusting
> a count — the tree may have moved.
