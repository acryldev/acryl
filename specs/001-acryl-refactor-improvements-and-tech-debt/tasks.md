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

- [x] T001 Run a workspace install so the plain headless gate works without `CI=true`.
  - Why: `corepack pnpm --filter acryl-cli run typecheck` currently exits 1 at a pnpm deps-status pre-check (`pnpm install --production`); it only passes with `CI=true` (R11).
  - Depends on: none.
  - RED/GREEN proof: `corepack pnpm --filter acryl-cli run typecheck` (no `CI=true`) → RED now (exit 1) → GREEN after install (exit 0).
  - Acceptance test: `corepack pnpm run verify` → `Acceptance/README.md` T001. Green when the plain (no `CI=true`) gate passes.

- [x] T002 [P] Commit the uncommitted test with the behavior it covers.
  - Why: `acryl-cli/tests/tui/login-preview.spec.ts` is untracked (never committed) (R12).
  - Depends on: none.
  - RED/GREEN proof: `git status --short acryl-cli/tests/tui/login-preview.spec.ts` → shows `??` (RED) → then tracked (GREEN).
  - Acceptance test: `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T002. Green when the test is tracked and passes.

- [x] T003 Reconcile the DeepSeek Harness submodule pointer so `gitlink == upstream.json == checkout`.
  - Why: `git submodule status` shows `+b4c7f9a…` differing from the recorded gitlink (`cd5ef81`) and `upstream.json.commit` (`c389f96`) (R13a).
  - Depends on: none.
  - RED/GREEN proof: `node specs/001-.../proof/architecture-guardrails.mjs` → G10 FAIL (RED) → G10 PASS (GREEN).
  - Acceptance test: guardrail `G10` + `corepack pnpm run check:layout` → `Acceptance/README.md` T003. Green when `G10 PASS` and layout gate passes.

- [x] T004 [P] Extend the `runtimePackageVersion` family check to every manifest declaring `dsh-*` deps.
  - Why: the family check covers only `acryl-desktop` today; `acryl-cli`/`acryl-web`/`acryl-harness-runtime` are convention-only (R14a).
  - Depends on: none. Touches `scripts/verify-layout.mjs`.
  - RED/GREEN proof: `corepack pnpm run check:layout` passes; a deliberately off-family `acryl-cli` `dsh-*` pin fails the gate.
  - Acceptance test: `corepack pnpm run check:layout` → `Acceptance/README.md` T004. Green when every manifest `dsh-*` dep is gate-enforced.

- [x] T005 [P] Make the shipped-presets submodule read a loud, gate-checked dependency.
  - Why: `deepseek-harness/packages/preset/agent-presets/presets` is a soft `existsSync` read; a missing submodule silently shrinks `/presets` (R14b).
  - Depends on: none. Touches `scripts/verify-layout.mjs` + CI config.
  - RED/GREEN proof: `corepack pnpm run check:layout` passes with the submodule initialized; surfaces a loud warning/failure when the preset dir is absent.
  - Acceptance test: `corepack pnpm run check:layout` → `Acceptance/README.md` T005. Green when a missing preset source cannot silently degrade `/presets`.

- [x] T006 [P] Move `scripts/web-run.mjs` → `acryl-web/bin/dev-run.mjs` for launcher symmetry.
  - Why: each surface owns its launcher (the TUI moved to `acryl-cli/bin/dev-run.mjs`) (R14c).
  - Depends on: none. Touches `acryl-web/` + root `package.json`.
  - RED/GREEN proof: `corepack pnpm run web` boots through the new launcher; `acryl-web` typecheck/build pass.
  - Acceptance test: `corepack pnpm --filter acryl-web run build` + `corepack pnpm run web` → `Acceptance/README.md` T006. Green when web boots via `acryl-web/bin/dev-run.mjs`.

- [x] T007 Reconcile the `specs/024-acryl-cli-login` ledger with the shipped two-step design.
  - Why: the spec still describes the single-list `/login [provider]` model; the shipped product is a two-step auth-type chooser + fuzzy search + `ctrl+p` custom-provider jump (R10).
  - Depends on: none. Touches `specs/024-acryl-cli-login/{spec,plan,tasks}.md`.
  - RED/GREEN proof: `node specs/001-.../proof/architecture-guardrails.mjs` → G9 FAIL (RED) → G9 PASS (GREEN).
  - Acceptance test: guardrail `G9` → `Acceptance/README.md` T007. Green when `G9 PASS`.

- [x] T008 Close Phase 0: run the full gate, update this ledger's checklists, add a dev-log checkpoint.
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

- [x] T009 [P] Define `AuthMethod` (`'oauth' | 'api-key'`) and the typed `CredentialProjection` read-model type in `acryl-control`.
  - Why: the concept is duplicated 4× and the seam uses `string` (R5); the projection needs a shared shape (R3).
  - Depends on: none. Touches `acryl-control/src/contracts/session.ts` (or a new `credentials.ts`).
  - RED/GREEN proof: `corepack pnpm --filter acryl-control run typecheck` passes.
  - Acceptance test: `corepack pnpm --filter acryl-control run test -- credential-projection` → `Acceptance/README.md` T009. Green when `AuthMethod` is exported and `CredentialProjection` has one field set (`hasCredential`, `hasSettingsProfile`, `isLive`, `authMethod`).

- [x] T010 Implement the `CredentialProjection` service (read-model) in `acryl-control`.
  - Why: `/login` and `/model` each re-join `ctx.llm` + `ctx.settings` + `ctx.credentials` independently today (R1/R3).
  - Depends on: T009.
  - RED/GREEN proof: `corepack pnpm --filter acryl-control run test -- credential-projection` (stub llm/settings/credentials; assert the joined row).
  - Acceptance test: `corepack pnpm --filter acryl-control run test -- credential-projection` → `Acceptance/README.md` T010. Green when the projection returns the joined row with `authMethod`/`isLive` and `configured` appears once per row.

- [x] T011 Implement `AuthorizationService.begin()` in `acryl-control`.
  - Why: the surface currently runs the whole interaction and persists display names (R1/R2).
  - Depends on: T009.
  - RED/GREEN proof: `corepack pnpm --filter acryl-control run test -- authorization-service` (stub `authorization`; assert forwards + event).
  - Acceptance test: `corepack pnpm --filter acryl-control run test -- authorization-service` → `Acceptance/README.md` T011. Green when `begin` forwards `{key, method, interaction}` and emits `credential.changed`.

- [x] T012 Emit and subscribe to `credential.changed` instead of `refreshCredentialState()`.
  - Why: the shotgun re-fetch of both overlays (R4).
  - Depends on: T010/T011.
  - RED/GREEN proof: guardrail `G8` green; add a test that a `credential.changed` event invalidates only the affected consumer.
  - Acceptance test: guardrail `G8` + `corepack pnpm --filter acryl-control run test -- credential-projection` → `Acceptance/README.md` T012. Green when `G8 PASS` and no dual reload loop.

- [x] T013 Migrate `/login` and `/model` read paths to consume `CredentialProjection` (delete the surface's own join logic).
  - Why: remove `computeProviderRows`/`loadAuthorizationFlows` duplicate joins from `session.ts` (R1).
  - Depends on: T010.
  - RED/GREEN proof: `corepack pnpm --filter acryl-cli run typecheck` + guardrail `G1` (FAIL while `session.ts` defines the functions → PASS after removal).
  - Acceptance test: guardrail `G1` + `corepack pnpm --filter acryl-cli run typecheck` → `Acceptance/README.md` T013. Green when `G1 PASS` (session.ts no longer defines the joins).

- [x] T014 Route `beginAuthorization` through `AuthorizationService`; delete the `-oauth` display-name rewrite and the retroactive repair loop; render `authMethod` as a badge.
  - Why: the suffix encodes internal state into the visible name and drives a repair loop (R2).
  - Depends on: T011.
  - RED/GREEN proof: guardrail `G2` FAIL (7 `-oauth`) → PASS (0); `corepack pnpm --filter acryl-cli run typecheck` green.
  - Acceptance test: guardrail `G2` + `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T014. Green when `G2 PASS` (0 `-oauth`) and `authMethod` renders as a badge.

- [x] T015 Remove the surface's duplicated `ensureProviderActivated` copy once the service owns activation.
  - Why: it is a second implementation of provider activation in the surface (R1).
  - Depends on: T014.
  - RED/GREEN proof: guardrail `G1` stays GREEN; `corepack pnpm --filter acryl-cli run test` green.
  - Acceptance test: guardrail `G1` + `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T015. Green when one activation path exists.

**Checkpoint:** guardrails G1, G2, G8 green; surface is a pure presenter of credential/auth state.

---

## Phase 2 — Type the domain concepts (R5/R9)

- [x] T016 [P] Use the exported `AuthMethod` at the action seam and delete the local `AuthType` + duplicated unions.
  - Why: 4 `'oauth' | 'api-key'` declarations + `method?: string` (R5).
  - Depends on: T009.
  - RED/GREEN proof: guardrail `G4` FAIL → PASS (`authMethod` declarations ≤ 1, seam typed).
  - Acceptance test: guardrail `G4` + `corepack pnpm --filter acryl-cli run typecheck` → `Acceptance/README.md` T016. Green when `G4 PASS` and `beginAuthorization(key, method: AuthMethod)`.

- [x] T017 [P] Remove `: any` on every runtime service handle in `acryl-cli/src`; use typed `ctx.get(...)` or a typed port.
  - Why: 19 `: any` defeat the typed contract (R9).
  - Depends on: Phase 1.
  - RED/GREEN proof: `corepack pnpm --filter acryl-cli run typecheck` green + `grep -c ': any' acryl-cli/src/tui-app/session.ts` → 19 (RED) → 0 (GREEN).
  - Acceptance test: guardrail `G3` + `corepack pnpm --filter acryl-cli run typecheck` → `Acceptance/README.md` T017. Green when `G3 PASS` (0 `: any`).

**Checkpoint:** guardrails G3, G4 green.

---

## Phase 3 — UI/state hygiene (R6/R7/R8)

- [x] T018 Make `render()` pure: compute the step/auto-skip decision during the data transition, not inside `render`.
  - Why: `render()` mutates component state; the `autoSkipChecked` latch prevents re-evaluation (R6).
  - Depends on: Phase 1.
  - RED/GREEN proof: guardrail `G6` FAIL → PASS; `corepack pnpm --filter acryl-cli run test` green.
  - Acceptance test: guardrail `G6` + `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T018. Green when `G6 PASS` (render is pure).

- [x] T019 Extract `listWindow`/`visibleRange` into one narrow, owned helper used by both overlays.
  - Why: duplicated container-slicing algorithm (R7).
  - Depends on: none (parallel with T018).
  - RED/GREEN proof: guardrail `G5` FAIL (2+2 defs) → PASS (≤1 each).
  - Acceptance test: guardrail `G5` + `corepack pnpm --filter acryl-cli run typecheck` → `Acceptance/README.md` T019. Green when `G5 PASS` (one definition of each).

- [x] T020 Refactor `LoginOverlay` view state into a discriminated union (`{kind:'authType'} | {kind:'list'} | {kind:'prompt'}`).
  - Why: the 9-field loose cluster can drift inconsistent (R8).
  - Depends on: T018.
  - RED/GREEN proof: guardrail `G7` FAIL → PASS; overlay tests green.
  - Acceptance test: guardrail `G7` + `corepack pnpm --filter acryl-cli run test` → `Acceptance/README.md` T020. Green when `G7 PASS` (discriminated-union view state).

**Checkpoint:** guardrails G5, G6, G7 green.

---

## Phase 4 — Cross-surface / optional maintenance

- [x] T021 [P] Align `runtimePackageVersion === sourceVersion` at each `upstream:update`.
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

- [x] T023 Wire the guardrail script into the test gate so the architectural move can't regress.
  - Why: proofs must be durable, not one-off (Laws: mechanism carries the guarantee).
  - Depends on: Phase 1–3 green.
  - RED/GREEN proof: add `node .../proof/architecture-guardrails.mjs` to `scripts/`/CI; guardrails stay GREEN on every run.
  - Acceptance test: guardrail script wired to CI → `Acceptance/README.md` T023. Green when guardrails run green on every CI run.

- [x] T024 Close the ledger: run all guardrails to green, record evidence, mark tasks done, add the dev-log checkpoint.
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

---

## Phase 6 — Upstream-latest migrations (DSH + pi-tui) [PENDING user decision]

**Purpose:** advance ACRYL onto the latest published harness/TUI family. Both are
feasible but **both break version-pinned local patches**, so each is a controlled
migration, not a bump. **Blocked on the user's call**: patch strategy
(upstream / keep-as-pnpm-patch / maintain-fork) and sequencing (now vs after M9).
See `research.md` finding R15.

- [ ] T025 [P] Resolve the patch strategy for the four failing DSH patches
  (`dsh-llm-deepseek`, `dsh-client-ui-directory-picker-browse`,
  `dsh-client-ui-trajectory`, `dsh-sandbox-windows-acl`) — upstream vs re-gen vs fork.
  - Why: every future bump re-hits them (R15).
  - Depends on: none (decision).
  - RED/GREEN proof: patch-strategy recorded; the `patch --dry-run` probe per package.
  - Acceptance: a recorded decision that makes future bumps deterministic.

- [ ] T026 [P] Bump the runtime family `@deepseek-ai/dsh-*` → `0.1.5-alpha.1` and re-port
  the failing patches; update `upstream.json.runtimePackageVersion` + manifests + lockfile.
  - Why: make the surfaces run the latest harness (R15). Do NOT change the submodule pin alone.
  - Depends on: T025 (patch strategy) + M9 sequencing decision.
  - RED/GREEN proof: `corepack pnpm install` + `corepack pnpm run check` (full gate) + `pnpm run debt:check` stays green.
  - Acceptance: every `dsh-*` dep == `0.1.5-alpha.1`, all patches apply, gate green.

- [ ] T027 [P] Bump `@earendil-works/pi-tui` → `0.85.1` and re-port the `tui-alt-screen` patch;
  keep it an npm dependency (add a read-only reference submodule only if visibility is wanted).
  - Why: latest TUI renderer (R15). Do NOT wire submodule source into the build.
  - Depends on: T025 (patch strategy).
  - RED/GREEN proof: `corepack pnpm --filter acryl-cli run typecheck` + TUI PTY smoke.
  - Acceptance: pi-tui == `0.85.1`, patch applies, TUI boots and passes PTY smoke.

**Checkpoint (Phase 6):** DSH family and pi-tui both on latest, patches re-ported, gate green.

## Phase 7 - Prompt and tool-definition size [REMINDER, not scheduled]

Recorded 2026-09-26 from the owner's first real chat on ACRYL Web (screenshots of the turn-usage and context-usage popovers).
Fine for now; review later and see whether it can be trimmed.

**What was measured** (same model, `deepseek-flash`, 1M context):

| | System prompt | Tool definitions | Notes |
|---|---|---|---|
| Stock DSH Desktop (default DeepSeek Harness) | about 2.6K tok | about 7.3K tok | reference |
| ACRYL Web (first turn) | about 4.6K tok | about 8.7K tok | about 2.0K more system prompt, about 1.4K more tool definitions |

The very first turn of "what model are you and what tools do you have" reported 41,873 tok of usage (18,693 uncached input, 22,400 cached
input, 780 output of which 200 reasoning; cache hit 54.5%). The context popover on the same session showed about 18.9K of 1M in use
(system prompt 4.6K, tools 8.7K, messages 6.7K). The cost is paid on every turn until the provider cache warms, so it matters most on
short sessions and on cheaper or smaller-context models.

**Suspected sources (from the composition, to be confirmed by measuring):**
- ACRYL's own system prompt shaping (`acryl-system-prompt`: the tagged, pi.dev-style layout and identity) on top of the harness sections.
- The extension router section (`acryl:extension-router`) that points the agent at ACRYL's routed docs and examples.
- The self-extension tool definitions: `acryl_extension_lookup`, `acryl_verify_plugin`, `acryl_install_plugin`, `acryl_list_plugins`,
  `acryl_remove_plugin`, `acryl_prepare_publish`, and `acryl_workspace_status`.

- [x] T028 Measure, do not guess: dump per-section token counts of the system prompt and per-tool definition token counts for the Web, **Done 2026-09-26: `docs/system-prompt/budget.md` (per section, per tool, Web and CLI; Desktop shares the Web engine), regenerated by the existing dump command.**
  Desktop and CLI compositions (the existing `dump:system-prompt` script and `captureSystemPrompt` already produce the raw text under
  `docs/system-prompt/current`), and record the table next to the stock DSH numbers above.
  - Acceptance: a checked-in table of tokens per section and per tool, for each surface, reproducible by one command.
- [x] T029 Decide what can shrink, keeping behavior: candidates are shorter router text, tighter tool descriptions and parameter docs, **Done 2026-09-26 as a proposal, not applied: `prompt-size-proposal.md` (five changes with savings and risk; the first four save about 1,250 tokens).**
  merging `acryl_workspace_status` into the prompt or dropping it, and exposing the self-extension tools only when the user is
  extending ACRYL (a lazy or on-demand tool set) instead of on every turn.
  - Acceptance: a reviewed proposal with the expected savings per change and the behavior risk of each.
- [x] T030 Add a budget guard once trimmed: extend the existing prompt-shape drift test with a token ceiling for the system prompt and the **Done 2026-09-26: ceilings in `plugins/acryl-system-prompt/drift/budget.json`, enforced by `system-prompt-shape.spec.ts`; unit tests prove it fails when either total grows.**
  tool definitions, so growth is a deliberate decision, not an accident.
  - Acceptance: the test fails when either total grows past the agreed ceiling without updating it.

## Phase 8 — Marketing and documentation presentation [cosmetic, requested 2026-09-28]

**Purpose:** the public-facing surfaces undersell the product as it actually stands today; no code changes, copy and
presentation only.

- [x] T031 Rewrite the four public-facing surfaces to reflect ACRYL's current, actual best ideas with catchy, simple,
      marketing-effective explanations that make someone want to try the product on first read:
  - `README.md` at the root of `github.com/acryldev/acryl`
  - the `acryldev.github.io` marketing site
  - the `acrylblends.github.io` marketing site (Blends)
  - the `cordisplugins.github.io` marketing site (the plugin ecosystem)
  - Why: owner request — these are cosmetic/copy only, not new functionality, but they are the first thing a
    prospective user or contributor sees, and currently undersell what the product already does.
  - Depends on: none. Purely additive copy/presentation work; touches no application code.
  - Acceptance: each of the four surfaces reviewed and approved by the owner (no automated test — this is editorial,
    not behavioral).
  - Delivered 2026-09-29, all four pushed: README rewrite (acryl@a176d18, agent-continuity hero, canvas tiles,
    33-agent roster, Agent Control, Blends; README.en.md synced, bilingual gate green), acryldev.github.io@0d411e9
    (hero flip, Agent Control section, diff/kanban tiles; typecheck + 42 tests pass), acrylblends.github.io@f216d16
    (hero ecosystem hook; build passes), cordisplugins.github.io@2f3f205 (hero lede names what plugins become;
    build passes). Owner approval recorded by the push request itself.


## Phase 9 - Upstream Desktop adoption assessment and harness update [requested 2026-10-02]

**Purpose:** decide what to adapt from upstream DeepSeek Harness's own Desktop (research R16) and move ACRYL to the latest harness in an isolated branch, without touching `main`'s running state.

**Standing invariants for every Phase 9/10 task (owner direction, R20/R22, 2026-10-02):**
- **One shared runtime, three surfaces.** There is exactly one DSH-based agent runtime (`runtime/acryl-harness-runtime`), reused by all three surfaces (CLI/TUI, Desktop, Web) through the `createAcrylEngineHost` seam. Re-attachment must not fork engine, composition, or profile logic per surface; surface code stays a thin presenter over the shared runtime (the T022 composition drain is the same rule for Desktop).
- **No new direct `@deepseek-ai/dsh-*` reference outside the engine seam** (`runtime/acryl-harness-runtime`). Every re-attach task reports the direct-reference count before/after; a rise needs a recorded reason in `research.md` (T039 turns this into a CI guard).
- **Prefer an ACRYL plugin/row over patching an upstream package** (R22 rule 3); prefer adopting an upstream package over rebuilding a capability ACRYL already has, after a recorded decision (T042).
- **DSH chat is one agent, not the app.** Nothing re-attached may make the DSH engine load-bearing for the other agents or surfaces (T043 proves it).

- [x] T032 Create a separate worktree and branch for the harness update (not `main`), with its own isolated ACRYL home.
  - Delivered 2026-10-02: branch `harness-latest-2026-10`, worktree `../acryl.worktrees/harness-latest-2026-10`, created from `main` at `9813939`. No ACRYL process has been run from it, so no home is touched yet.
  - Why: the update touches the submodule pin, lockfile and patches; `main` has another session working and a running dev app.
  - Depends on: none.
  - Acceptance: a branch and worktree exist; no file under `main`'s checkout or `~/.acryl*` homes is changed by running it.
- [ ] T033 On that branch, advance the `deepseek-harness` submodule to the latest upstream and record what no longer applies: per-package `patch --dry-run` result, typecheck result, and the list of API changes ACRYL touches.
  - Why: R15 found about half of ACRYL's version-pinned patches fail across a bump; the pin is now 4,381 commits behind upstream `master`.
  - Depends on: T032, T025 (patch strategy decision; a dry-run report can be produced before it).
  - Acceptance: a written report in this spec's `research.md`; no merge to `main`.
  - Partly delivered 2026-10-02 (report in `research.md` R17): submodule checked out at upstream `dsh-v0.2.0-rc.2` in the worktree (uncommitted), patch dry-run done, npm availability of all 213 pinned packages checked. Typecheck and API-change list not done: six pinned packages no longer exist upstream (R17), which needs a decision first.
- [ ] T034 Decide the patch strategy (T025) using the T033 report.
  - Depends on: T033. Acceptance: decision recorded.
- [ ] T035a Rename the four likely-renamed packages (R18: sidebar-textpreview, workflow-worker-thread, code-runtime and code-runtime-worker-thread, agent-presets), re-port the one failing patch, bump the runtime family on the branch (completes T026 for the new target), then run the full gate.
  - Depends on: T034. Acceptance: `corepack pnpm run check` green on the branch.
- [x] T035b (delivered 2026-10-02, R21 and R25: `plugins/acryl-settings`) Decide and implement ACRYL's non-secret settings home now that upstream removed `dsh-settings-file` (R18): adopt profile-owned live configuration, or keep a local file-backed provider. Covers `apps/acryl-desktop/src/profile.ts`, the market settings tests and existing `~/.acryl*/.dsh/settings.yaml` files (migration).
  - Depends on: T033. Decide before T035a bumps manifests. Acceptance: a recorded decision, then a boot on the branch that reads and writes settings with an existing home copy.
- [x] T036 Stage A (delivered 2026-10-02, evidence in research.md R20): run stock, unmodified DSH `0.2.0-rc.2` (published `@deepseek-ai/dsh`, web and its own Desktop) in an isolated home and port, and record that it boots, shows its own default sidebar, and starts a chat (R19).
  - Why: the owner direction is to take the 0.2 runtime first and re-attach ACRYL's results afterwards.
  - Depends on: none. Acceptance: boot evidence recorded in `research.md`; process stopped and port confirmed free.
- [ ] T036b Stage B, first step: on the branch, add a DSH `0.2.0-rc.2` engine definition behind the existing `createAcrylEngineHost` seam, then re-attach one ACRYL surface piece (the workspace shell with the Tab Stripe) and one WebSocket route (the terminal stream) to it in an isolated home, and list what breaks (R20).
  - Depends on: T035b (settings home), R18 package mappings. Acceptance: pass, or a recorded list of blockers (row names, slots, origin checks); `main` unchanged.
- [ ] T037 Decide per idea in R16 ("worth adapting") which to take: staged install with rollback, single signed update unit and feed, state lock, no exposed port. Write each as a task or reject it with a reason.
  - Depends on: T035, T036. Acceptance: decision recorded in `research.md`.
- [ ] T038 Add the missing platform native packages (`@deepseek-ai/node-addon-system-darwin-arm64`, `-darwin-x64`, and the Linux ones) to `apps/acryl-desktop/package.json` and the lockfile; fix the stale `node-pty` path in `apps/acryl-desktop/scripts/mac-universal.ts`; add a packaged-app check that every `optionalDependencies` platform package of an unpacked native addon is present.
  - Why: found 2026-10-01; the packaged app could not resume sessions.
  - Depends on: none (can go to `main` independently). Acceptance: a built DMG resumes a session, and the new check fails when a platform package is dropped.

- [ ] T039 Decouple ACRYL from `@deepseek-ai/dsh-*` package names (R22): list every ACRYL source file and manifest that names a DSH package or row id outside the engine seam, move each behind the seam or a Cordis contract, and add a guard that fails when a new such reference appears outside the seam.
  - Why: upstream changes a lot (R17 to R19); the durable asset is the Cordis plugin system, and the DSH chat is one agent among others (R22).
  - Depends on: T036b (so the seam is exercised first). Acceptance: a count of direct references before and after, an allowlist in the guard, and the guard in the CI gate.

- [ ] T040 Fix the lockfile tooling (R23): pnpm 11.11.0 never finishes resolving `electron-builder`; either move the pinned `packageManager` (and the CI and docs that name 11.11.0) to a version that resolves it, or report the hang to pnpm, and document the relock workaround until then.
  - Repro (2026-10-03): `corepack pnpm install --no-frozen-lockfile` in the repo root stalls after `Progress: resolved 1367, reused 1258, downloaded 0, added 0` for 10+ minutes (killed at 580 s), exit 124, no error. Same tree relocks in about 10 s with `node ~/.cache/node/corepack/v1/pnpm/11.8.0/bin/pnpm.cjs install --lockfile-only --no-frozen-lockfile --ignore-scripts --config.manage-package-manager-versions=false`; the resulting lockfile has an unchanged header and a frozen install under 11.11.0 reads it (`b34dc54`). Also seen: a corrupt metadata cache entry (`ERR_PNPM_CACHE_MISSING_AFTER_304`) that `--cache-dir <scratch>` avoids. Risk until fixed: a developer running a plain install may hang; CI uses frozen installs and is unaffected.
  - Depends on: none. Acceptance: `pnpm install --lockfile-only --no-frozen-lockfile` finishes and writes the lockfile with the pinned version on a clean checkout.

- [ ] T041 Re-attachment ledger (owner direction 2026-10-02: detach first, boot 0.2 minimal, re-attach one feature at a time): one row per ACRYL feature, each with an explicit **attach decision** (ACRYL-owned row | adopt upstream package, per T042 | DSH slot), a depends-on, and an acceptance (its pre-0.2 test green on the branch). Re-attach one row per commit, gate green per commit; the shared-runtime and no-new-dsh-reference invariants above apply to every row.
  - Why: without the per-feature decision recorded up front, re-attach silently re-couples to DSH internals (R22 rule 2).
  - Depends on: T036b (first re-attach proves the path), T042 (overlap decisions feed the decision column). Acceptance: every row has a recorded decision and its acceptance test passes on the branch.
  - **The ledger** (execution order; detached pieces named as in the branch's DETACHED notes; statuses from R25/R26, 2026-10-02):

    | # | Feature (detached piece) | Attach decision | Depends on | Acceptance on branch | Status (R26) |
    |---|---|---|---|---|---|
    | 1 | `acryl-shortcuts` + `acryl-mount-anchors` | **decide in T042 first**: 0.2 ships its own shortcuts service that collides with `acryl-shortcuts` - adopt upstream's service and keep ACRYL's only for its additions, or keep ACRYL's row and disable upstream's. Recorded in research.md before any code | T042 | `plugins/acryl-shortcuts` and `plugins/acryl-mount-anchors` tests green; only one shortcuts service active in the composed profile | DONE (R28): both plugins mount on upstream's `ctx.shortcuts` service (palette Cmd/Ctrl+Shift+P, mount-anchor inspector); only one shortcuts service active; suites green |
    | 2a | Session-store adapter for `acryl-workspace` (R24 break 2: `SessionListState.current`/`ISessions.open` removed; upstream's contract is view-owner `retain()` reference counting). ACRYL's tab strip already is a view owner: it tracks its own current tab and calls `retain` | ACRYL-owned row (adapter inside `acryl-workspace`, no new dsh-* refs outside the seam) | none after T036b | `acryl-workspace` builds with 0 TS errors; session navigation unit tests green | DONE (R26: `sessions/main-session.ts`, `retain(target, {source:'mainView'})`, current from `retainedBy`; 646/646) |
    | 2b | Tab Stripe + multi-chat "Chats of AcrylDSH" + workspace left panel | ACRYL-owned row (replaces upstream's default left panel per R20) | 2a | the workspace/projects/sessions client specs green; a booted surface shows the tab strip and chats panel driving real sessions | DONE (R26: full frame on Web - browser-verified - and Desktop; layout implements 0.2's whole `ILayout`, renders upstream's keyed `main` panels) |
    | 2c | Development Canvas | ACRYL-owned row | 2b | canvas specs green; canvas mounts live session tiles in a booted surface | DONE (R27 live, web): a chat tile mounts with upstream's composer |
    | 2d | PTYs / terminal tabs | ACRYL-owned row | 2b | terminal-tab specs green; a PTY opens and streams in a booted surface | DONE (R27 live, web): terminal tab opens and streams; `echo ACRYL-PTY-$((6*7))` returned `ACRYL-PTY-42` |
    | 3 | Desktop settings page + `acryl-workspace`'s own palette command for settings | ACRYL-owned UI on the already-working `acryl-settings` service (T035b revised decision); not upstream's settings UI | acryl-settings (done, T035b) | Desktop settings page renders and persists a preference across restart in an isolated home | DONE (R27): settings page over `acryl-settings`; palette command via the shortcuts service (R28) |
    | 4 | Windows ACL pwsh sandbox | ACRYL-owned row (Windows-only; independent) | none | sandbox specs green on Windows CI or recorded as untestable-here with a manual check | BLOCKED-EXTERNAL: helpers split into `windows-acl-adaptation.ts` (type-correct); the executor re-port needs a Windows machine |
    | 5 | TUI preset roster | map to upstream `agent-preset-registry` (renamed in R18); ACRYL keeps its roster composition, upstream owns the registry | none | `/presets` in the TUI lists the full roster again; preset specs green | DONE (R26 defect 4: TUI composition layers the four `presets/*.patch.yml` files from `dsh-web-app`) |
    | 6 | Agent Control (specs 040/041: in-page `ui_*` tools, `acryl control` CLI, agent toolset) | ACRYL-owned rows (it is the M3 surface, T044) | 2a (sessions), 3 (settings) | spec 041's acceptance commands pass against the 0.2 engine on web and CLI | TESTS GREEN (agent-control suite passes); spec 041 live acceptance pending |
    | 7 | Blends + market on the 0.2 engine | ACRYL-owned rows (Cordis-native by design, specs 033/036) | 2b | blend snapshot/apply round-trip and market install specs green on the branch | TESTS GREEN (market suite passes); blend round-trip live acceptance pending |

  - Rows 1, 4, 5 are independent of the 2a-2d chain and can go in parallel. Rows 6-7 close the surface; T044 then proves parity across agents.
  - Not re-attached without a recorded owner decision: nothing. Every detached piece lands in a row above or gets an explicit "dropped, reason" line in research.md.

- [ ] T042 Upstream overlap decisions (R24 tail): read upstream 0.2's new `shortcuts`/`ui-shortcuts`, `ui-dockkit`, `ui-sidebar-*`, `config-editor`, `plugin-manager` packages and record adopt-vs-keep per package against ACRYL's own (`acryl-shortcuts`, the workspace shell, the market) **before** re-building anything ACRYL already has.
  - Why: porting `acryl-shortcuts` while upstream ships an equivalent would be unrecorded duplication; the reverse (dropping an ACRYL differentiator by accident) is equally possible.
  - Depends on: none (reading only). Acceptance: a decision per package in `research.md`, each naming what ACRYL keeps as its own and why.

- [x] T045 Re-claim the two documented R26 skips: (a) the `acryl-ui` `fields.tsx` provenance check, skipped because upstream moved and renamed the file - re-extract it against 0.2's layout; (b) the DeepSeek tool-call delta guard, now an `it.todo` because 0.2 uses a Messages transport the old chat-completions mock cannot reach - re-point the guard at the Messages transport or record a live-key check.
  - Why: skips and todos are where coverage quietly dies; both guard real regressions ACRYL has shipped before.
  - Depends on: none. Acceptance: both checks active again (or a recorded reason each why the guard moved, in research.md).

**Checkpoint (Phase 9):** branch on the latest harness with a recorded patch report; adoption decisions written down.

---

## Phase 10 - Cordis-first target architecture (M2/M3) [owner direction 2026-10-02]

**Purpose:** land where R20/R22 point: ACRYL is a Cordis-based framework owning its surfaces; the DSH chat is one agent/driver among others; agents can extend ACRYL itself. Phase 9 gets the 0.2 engine running; this phase proves the engine is a guest, not the foundation.

- [x] T043 (chat scope done, platform seam open: see R29, T046-T049) DSH-is-optional proof (M2): boot the app on the branch with the DSH engine definition absent or disabled and a non-DSH agent (Claude Code, Codex, or Pi, via the 040/041 agent-control surface) driving a session; then re-attach the DSH chat as a tab type beside the other agents, not as load-bearing infrastructure.
  - Why: R22 - "AcrylDSH chat is one agent, one of the builders"; a user can rely entirely on their own agents and never open the DSH chat. If the app cannot boot or other agents cannot work without the DSH engine, the seam is not real yet.
  - Depends on: T041 (surfaces re-attached), spec 028 M-slices as needed. Acceptance: a recorded boot in `research.md`: engine off, other agent works, surfaces alive; then engine on as one tab type.

- [ ] T044 (no-key cells done, key cells listed in R30) Agent self-hosting parity (M3): on the 0.2 engine, an agent can install, author, and hot-reload an ACRYL plugin through the same surface that existed on 0.1.5alpha (`acryl-extension-context` + `livePluginActivation` + the plugin-lifecycle store + Agent Control), on all three surfaces sharing the one runtime.
  - Why: owner direction - every agent (not just the built-in chat) should eventually write and hot-reload its own ACRYL plugins and self-update ACRYL's own plugins; this parity was achieved on 0.1.5alpha and must survive the engine swap.
  - Depends on: T041 (Agent Control and Blends re-attached). Acceptance: a parity matrix in `research.md` (Claude Code, Codex, Pi x CLI, Desktop, Web) showing plugin install/author/hot-reload working through the agent surface on the 0.2 engine.

**Checkpoint (Phase 10):** the DSH engine demonstrably optional, the DSH chat one tab type, agents extending ACRYL on the 0.2 runtime at 0.1.5alpha parity.

- [ ] T046 Platform seam (R29; mini-design posted as R31, awaiting owner decisions 1-4 there before any code; proposed split T046a S1 host ports, T046b S2 projects owned by ACRYL, T046c S3 client facade, T046d S4 own host spec): the web server, session store, typert gateway and client frame still come from the DSH profile, so a boot with no DSH engine at all has no frame. Decide the ACRYL-owned host for the frame (the Blends framework host) and move it behind `createAcrylEngineHost`; the progress metric is the count of direct `@deepseek-ai/dsh*` import lines in non-test source (180 on 2026-10-03; T043 added none).
- [x] T047 With the chat off, hide the "AcrylDSH Chat" tab and its composer (R29 finding 1): the client keeps offering a composer whose backend is parked. Needs a capability signal the client can read, not a DOM workaround. Done in `f6c7ab9` (R30): the host reports `{ chat }` from the live composition (`/api/acryl-workspace/capabilities`, reading the `agents` service per request), the canvas starts on a terminal, the chat entries and new-chat buttons are hidden, and adding a project no longer tries to open a chat. Proven live both ways.
- [x] T048 (Claude Code stream-json transport done in `83c11e1`, R31; Codex and ACP not written; mounting and driving it from a surface is T052) Non-DSH agent transports (R29 finding 2): the `claude`, `codex` and `acp` providers in `acryl-control` register with no transport (`transport-unavailable`), so the only bring-your-own-agent path today is a terminal tab. Wire at least one real structured transport (Claude Code stream-json or ACP) and drive a session through agent-control.
- [x] T049 Agent Control against xterm (R29 finding 3): `ui_type` into the terminal's helper textarea set a value xterm never reads, so an outside agent could open a terminal tab but not type into it. Fixed in `0c11c24`: text is delivered as a paste, named keys carry their legacy `keyCode`. Proven live (outside agent typed `echo AGENT-TYPED-$((6*7)); claude --version` into a PTY tab with the chat off; both ran) and by a driver test.

- [ ] T050 A failed update should restore the version that was running (R30): `acryl_install_plugin` rolls a failed update back by removing the plugin, as on 0.1.5, so the agent's previously working version is gone. Keep the previous staged copy and reinstall it on failure.
- [ ] T051 Extension tools for non-DSH agents (R30): `acryl_verify_plugin`, `acryl_install_plugin`, `acryl_list_plugins` and `acryl_remove_plugin` are DSH tools, so Claude Code, Codex or Pi in a terminal tab cannot call them. Expose the same operations through the loopback online channel (or an MCP server) with the same policy, so the T044 matrix's non-DSH rows can run.

- [ ] T052 Mount and drive `acrAgentControl` (R31): the service and the Claude transport exist and are proven, but no engine mounts them and no route, tool, CLI or UI drives a worker. Mount the service and the `claude` provider in the shared runtime, expose attach, send, cancel and stop through the loopback online channel (so `acryl control` and an outside agent can use them) and show a worker as a tab beside terminals; Codex and ACP transports follow the Claude shape.
