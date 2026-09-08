# Tasks: ACRYL Technical Debt, Refactoring & Stability

**Feature**: `specs/001-acryl-refactor-improvements-and-tech-debt/` | **Type**: standing debt ledger
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [proof/architecture-guardrails.mjs](./proof/architecture-guardrails.mjs), [acceptance/README.md](./acceptance/README.md)

**Conventions**
- `[P]` = parallelizable (disjoint files, no incomplete-task dependency).
- `[G#]` = the guardrail in `proof/architecture-guardrails.mjs` this task turns green.
- Work directly on `main`, focused green commits, `corepack pnpm` only, explicit `git add` paths. After each implementation commit add a `docs/DEVELOPMENT-LOG.md` checkpoint in a separate docs commit.
- **The acceptance criterion of every task is the test it points to.** Look up the exact test file + run command in [acceptance/README.md](./acceptance/README.md). Run it; when it passes, the task is done. Every architecture task is also covered by:
  `node specs/001-acryl-refactor-improvements-and-tech-debt/proof/architecture-guardrails.mjs`

---

## Phase 0 — Hygiene & stability (Track A) [blocks every architecture move]

**Purpose:** the workspace and gate must be trustworthy before logic moves.

- [ ] T001 Run a workspace install so the plain headless gate works without `CI=true`.
  - Why: `corepack pnpm --filter acryl-cli run typecheck` currently exits 1 at a pnpm deps-status pre-check (`pnpm install --production`); it only passes with `CI=true` (R11).
  - Depends on: none.
  - RED/GREEN proof: `corepack pnpm --filter acryl-cli run typecheck` (no `CI=true`) → RED now (exit 1) → GREEN after install (exit 0).
  - Acceptance test: `corepack pnpm run verify` → `Acceptance/README.md` T001. Green when the plain (no `CI=true`) gate passes.

- [ ] T002 [P] Commit the uncommitted test with the behavior it covers.
  - Why: `acryl-cli/tests/tui/login-preview.spec.ts` is untracked (never committed) (R12).
  - Depends on: none.
  - RED/GREEN proof: `git status --short acryl-cli/tests/tui/login-preview.spec.ts` → shows `??` (RED) → then tracked (GREEN).
  - Acceptance test: `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T002. Green when the test is tracked and passes.

- [ ] T003 Reconcile the DeepSeek Harness submodule pointer so `gitlink == upstream.json == checkout`.
  - Why: `git submodule status` shows `+b4c7f9a…` differing from the recorded gitlink (`cd5ef81`) and `upstream.json.commit` (`c389f96`) (R13a).
  - Depends on: none.
  - RED/GREEN proof: `node specs/001-.../proof/architecture-guardrails.mjs` → G10 FAIL (RED) → G10 PASS (GREEN).
  - Acceptance test: guardrail `G10` + `corepack pnpm run check:layout` → `Acceptance/README.md` T003. Green when `G10 PASS` and layout gate passes.

- [ ] T004 [P] Extend the `runtimePackageVersion` family check to every manifest declaring `dsh-*` deps.
  - Why: the family check covers only `acryl-desktop` today; `acryl-cli`/`acryl-web`/`acryl-harness-runtime` are convention-only (R14a).
  - Depends on: none. Touches `scripts/verify-layout.mjs`.
  - RED/GREEN proof: `corepack pnpm run check:layout` passes; a deliberately off-family `acryl-cli` `dsh-*` pin fails the gate.
  - Acceptance test: `corepack pnpm run check:layout` → `Acceptance/README.md` T004. Green when every manifest `dsh-*` dep is gate-enforced.

- [ ] T005 [P] Make the shipped-presets submodule read a loud, gate-checked dependency.
  - Why: `deepseek-harness/packages/preset/agent-presets/presets` is a soft `existsSync` read; a missing submodule silently shrinks `/presets` (R14b).
  - Depends on: none. Touches `scripts/verify-layout.mjs` + CI config.
  - RED/GREEN proof: `corepack pnpm run check:layout` passes with the submodule initialized; surfaces a loud warning/failure when the preset dir is absent.
  - Acceptance test: `corepack pnpm run check:layout` → `Acceptance/README.md` T005. Green when a missing preset source cannot silently degrade `/presets`.

- [ ] T006 [P] Move `scripts/web-run.mjs` → `acryl-web/bin/dev-run.mjs` for launcher symmetry.
  - Why: each surface owns its launcher (the TUI moved to `acryl-cli/bin/dev-run.mjs`) (R14c).
  - Depends on: none. Touches `acryl-web/` + root `package.json`.
  - RED/GREEN proof: `corepack pnpm run web` boots through the new launcher; `acryl-web` typecheck/build pass.
  - Acceptance test: `corepack pnpm --filter acryl-web run build` + `corepack pnpm run web` → `Acceptance/README.md` T006. Green when web boots via `acryl-web/bin/dev-run.mjs`.

- [ ] T007 Reconcile the `specs/024-acryl-cli-login` ledger with the shipped two-step design.
  - Why: the spec still describes the single-list `/login [provider]` model; the shipped product is a two-step auth-type chooser + fuzzy search + `ctrl+p` custom-provider jump (R10).
  - Depends on: none. Touches `specs/024-acryl-cli-login/{spec,plan,tasks}.md`.
  - RED/GREEN proof: `node specs/001-.../proof/architecture-guardrails.mjs` → G9 FAIL (RED) → G9 PASS (GREEN).
  - Acceptance test: guardrail `G9` → `Acceptance/README.md` T007. Green when `G9 PASS`.

- [ ] T008 Close Phase 0: run the full gate, update this ledger's checklists, add a dev-log checkpoint.
  - Why: confirms the workspace is trustworthy before Track B.
  - Depends on: T001–T007.
  - RED/GREEN proof: `corepack pnpm run check` and `corepack pnpm run check:layout` pass; guardrail script shows only Track B items RED.
  - Acceptance test: `corepack pnpm run check` + guardrail script → `Acceptance/README.md` T008. Green when Track A fully green and only Track B items are RED.

**Checkpoint:** workspace install clean, gate green, submodule consistent, spec reconciled, no uncommitted test.

---

## Phase 1 — The boundary move (R1/R2/R3/R4)

**Purpose:** move the credential/authorization domain logic out of the terminal surface. **Default `dsh`/`acryl` behavior must not change** (regression gate: existing `acryl-cli` and `acryl-web` tests stay green).

**Target acceptance tests (write these in `acryl-control/tests/`; see [`acceptance/README.md`](./acceptance/README.md) for the exact assertions):**
- `credential-projection.spec.ts` (T009/T010/T012)
- `authorization-service.spec.ts` (T011)

- [ ] T009 [P] Define `AuthMethod` (`'oauth' | 'api-key'`) and the typed `CredentialProjection` read-model type in `acryl-control`.
  - Why: the concept is duplicated 4× and the seam uses `string` (R5); the projection needs a shared shape (R3).
  - Depends on: none. Touches `acryl-control/src/contracts/session.ts` (or a new `credentials.ts`).
  - RED/GREEN proof: `corepack pnpm --filter acryl-control run typecheck` passes.
  - Acceptance test: `corepack pnpm --filter acryl-control run test -- credential-projection` → `Acceptance/README.md` T009. Green when `AuthMethod` is exported and `CredentialProjection` has one field set (`hasCredential`, `hasSettingsProfile`, `isLive`, `authMethod`).

- [ ] T010 Implement the `CredentialProjection` service (read-model) in `acryl-control`.
  - Why: `/login` and `/model` each re-join `ctx.llm` + `ctx.settings` + `ctx.credentials` independently today (R1/R3).
  - Depends on: T009.
  - RED/GREEN proof: `corepack pnpm --filter acryl-control run test -- credential-projection` (stub llm/settings/credentials; assert the joined row).
  - Acceptance test: `corepack pnpm --filter acryl-control run test -- credential-projection` → `Acceptance/README.md` T010. Green when the projection returns the joined row with `authMethod`/`isLive` and `configured` appears once per row.

- [ ] T011 Implement `AuthorizationService.begin()` in `acryl-control`.
  - Why: the surface currently runs the whole interaction and persists display names (R1/R2).
  - Depends on: T009.
  - RED/GREEN proof: `corepack pnpm --filter acryl-control run test -- authorization-service` (stub `authorization`; assert forwards + event).
  - Acceptance test: `corepack pnpm --filter acryl-control run test -- authorization-service` → `Acceptance/README.md` T011. Green when `begin` forwards `{key, method, interaction}` and emits `credential.changed`.

- [ ] T012 Emit and subscribe to `credential.changed` instead of `refreshCredentialState()`.
  - Why: the shotgun re-fetch of both overlays (R4).
  - Depends on: T010/T011.
  - RED/GREEN proof: guardrail `G8` green; add a test that a `credential.changed` event invalidates only the affected consumer.
  - Acceptance test: guardrail `G8` + `corepack pnpm --filter acryl-control run test -- credential-projection` → `Acceptance/README.md` T012. Green when `G8 PASS` and no dual reload loop.

- [ ] T013 Migrate `/login` and `/model` read paths to consume `CredentialProjection` (delete the surface's own join logic).
  - Why: remove `computeProviderRows`/`loadAuthorizationFlows` duplicate joins from `session.ts` (R1).
  - Depends on: T010.
  - RED/GREEN proof: `corepack pnpm --filter acryl-cli run typecheck` + guardrail `G1` (FAIL while `session.ts` defines the functions → PASS after removal).
  - Acceptance test: guardrail `G1` + `corepack pnpm --filter acryl-cli run typecheck` → `Acceptance/README.md` T013. Green when `G1 PASS` (session.ts no longer defines the joins).

- [ ] T014 Route `beginAuthorization` through `AuthorizationService`; delete the `-oauth` display-name rewrite and the retroactive repair loop; render `authMethod` as a badge.
  - Why: the suffix encodes internal state into the visible name and drives a repair loop (R2).
  - Depends on: T011.
  - RED/GREEN proof: guardrail `G2` FAIL (7 `-oauth`) → PASS (0); `corepack pnpm --filter acryl-cli run typecheck` green.
  - Acceptance test: guardrail `G2` + `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T014. Green when `G2 PASS` (0 `-oauth`) and `authMethod` renders as a badge.

- [ ] T015 Remove the surface's duplicated `ensureProviderActivated` copy once the service owns activation.
  - Why: it is a second implementation of provider activation in the surface (R1).
  - Depends on: T014.
  - RED/GREEN proof: guardrail `G1` stays GREEN; `corepack pnpm --filter acryl-cli run test` green.
  - Acceptance test: guardrail `G1` + `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T015. Green when one activation path exists.

**Checkpoint:** guardrails G1, G2, G8 green; surface is a pure presenter of credential/auth state.

---

## Phase 2 — Type the domain concepts (R5/R9)

- [ ] T016 [P] Use the exported `AuthMethod` at the action seam and delete the local `AuthType` + duplicated unions.
  - Why: 4 `'oauth' | 'api-key'` declarations + `method?: string` (R5).
  - Depends on: T009.
  - RED/GREEN proof: guardrail `G4` FAIL → PASS (`authMethod` declarations ≤ 1, seam typed).
  - Acceptance test: guardrail `G4` + `corepack pnpm --filter acryl-cli run typecheck` → `Acceptance/README.md` T016. Green when `G4 PASS` and `beginAuthorization(key, method: AuthMethod)`.

- [ ] T017 [P] Remove `: any` on every runtime service handle in `acryl-cli/src`; use typed `ctx.get(...)` or a typed port.
  - Why: 19 `: any` defeat the typed contract (R9).
  - Depends on: Phase 1.
  - RED/GREEN proof: `corepack pnpm --filter acryl-cli run typecheck` green + `grep -c ': any' acryl-cli/src/tui-app/session.ts` → 19 (RED) → 0 (GREEN).
  - Acceptance test: guardrail `G3` + `corepack pnpm --filter acryl-cli run typecheck` → `Acceptance/README.md` T017. Green when `G3 PASS` (0 `: any`).

**Checkpoint:** guardrails G3, G4 green.

---

## Phase 3 — UI/state hygiene (R6/R7/R8)

- [ ] T018 Make `render()` pure: compute the step/auto-skip decision during the data transition, not inside `render`.
  - Why: `render()` mutates component state; the `autoSkipChecked` latch prevents re-evaluation (R6).
  - Depends on: Phase 1.
  - RED/GREEN proof: guardrail `G6` FAIL → PASS; `corepack pnpm --filter acryl-cli run test` green.
  - Acceptance test: guardrail `G6` + `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T018. Green when `G6 PASS` (render is pure).

- [ ] T019 Extract `listWindow`/`visibleRange` into one narrow, owned helper used by both overlays.
  - Why: duplicated container-slicing algorithm (R7).
  - Depends on: none (parallel with T018).
  - RED/GREEN proof: guardrail `G5` FAIL (2+2 defs) → PASS (≤1 each).
  - Acceptance test: guardrail `G5` + `corepack pnpm --filter acryl-cli run typecheck` → `Acceptance/README.md` T019. Green when `G5 PASS` (one definition of each).

- [ ] T020 Refactor `LoginOverlay` view state into a discriminated union (`{kind:'authType'} | {kind:'list'} | {kind:'prompt'}`).
  - Why: the 9-field loose cluster can drift inconsistent (R8).
  - Depends on: T018.
  - RED/GREEN proof: guardrail `G7` FAIL → PASS; overlay tests green.
  - Acceptance test: guardrail `G7` + `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T020. Green when `G7 PASS` (discriminated-union view state).

**Checkpoint:** guardrails G5, G6, G7 green.

---

## Phase 4 — Cross-surface / optional maintenance

- [ ] T021 [P] Align `runtimePackageVersion === sourceVersion` at each `upstream:update`.
  - Why: presets read from a newer source than the runtime consumes (R13b). Optional consistency upgrade.
  - Depends on: T003/T004.
  - RED/GREEN proof: `corepack pnpm run check:layout` passes; `upstream.json` versions equal.
  - Acceptance test: `corepack pnpm run check:layout` → `Acceptance/README.md` T021. Green when versions equal and gate passes.

- [ ] T022 [P] Start the `acryl-desktop` → `acryl-harness-runtime` composition drain (M3 scoped note).
  - Why: Desktop composes the harness itself (own boot, 131 direct `dsh-*` deps) instead of through the shared factory (R14d/M3).
  - Depends on: `specs/028-harness-engine-swap` M2-slice-alpha + a scoped M3 ledger. **Not started in this ledger**; record scope and dependency here.
  - RED/GREEN proof: n/a (blocked) — mark PENDING with dependency note.
  - Acceptance test: none (PENDING) — `Acceptance/README.md` T022 records the M3 dependency; no parallel runtime introduced.

---

## Phase 5 — Proof & ledger close

- [ ] T023 Wire the guardrail script into the test gate so the architectural move can't regress.
  - Why: proofs must be durable, not one-off (Laws: mechanism carries the guarantee).
  - Depends on: Phase 1–3 green.
  - RED/GREEN proof: add `node .../proof/architecture-guardrails.mjs` to `scripts/`/CI; guardrails stay GREEN on every run.
  - Acceptance test: guardrail script wired to CI → `Acceptance/README.md` T023. Green when guardrails run green on every CI run.

- [ ] T024 Close the ledger: run all guardrails to green, record evidence, mark tasks done, add the dev-log checkpoint.
  - Why: the ledger is the source of truth and must not appear active when closed.
  - Depends on: all.
  - RED/GREEN proof: guardrail script exits 0; `corepack pnpm run check` green; `git status` clean for the moved code.
  - Acceptance test: guardrail script (exit 0) + `corepack pnpm run check` → `Acceptance/README.md` T024. Green when `SC-001..SC-012` met and evidence linked.

---

## Dependencies

```text
Phase 0 (T001-T008)                          [BLOCKS all architecture moves]
   └─> Phase 1 / boundary (T009-T015)        [G1,G2,G8]
          ├─> Phase 2 / typing (T016-T017)   [G3,G4]
          └─> Phase 3 / state (T018-T020)    [G5,G6,G7]
   └─> Phase 4 / optional (T021-T022)        (T021 after T003/T004; T022 blocked by M3 ledger)
Phase 5 (T023-T024)                          (after the phases it evidences)
```

- Within Phase 0: T002/T004/T005/T006 parallel; T003/T007 independent; T001 first.
- Within Phase 1: T009 → T010 → T011 → T012; T013, T014, T015 after T010/T011.
- Phase 2 and Phase 3 are independent of each other once Phase 1 lands.

## Parallel opportunities

- Phase 0: T002, T004, T005, T006 in parallel.
- Phase 1: T009 first; then T010/T011 partly parallel.
- Phase 2 vs Phase 3: independent.

## Implementation strategy

**MVP = Phase 0 + Phase 1.** That removes the highest-risk boundary violations
(the surface owning credential state and the `-oauth` hack) with zero behavior
regression. Phase 2/3 (typing + UI hygiene) harden it; Phase 4/5 are optional /
close-out. Each phase is its own checkpoint commit, and each commit keeps the
headless gate green. The acceptance criterion for every task is the test it
points to in [`acceptance/README.md`](./acceptance/README.md).
