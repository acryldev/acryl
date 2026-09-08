# Acceptance Checklist: ACRYL Technical Debt, Refactoring & Stability

Each row: **Finding** → **Task(s)** → **Proof to be green**. Run the guardrail script
(`node specs/001-acryl-refactor-improvements-and-tech-debt/proof/architecture-guardrails.mjs`)
to see the current state; a row is done only when its proof passes.

| Finding | Task(s) | Proof (must pass) |
|---|---|---|
| R1 auth/credential logic in surface | T009–T015 | Guardrail G1; `acryl-cli` typecheck |
| R2 `-oauth` display-name encoding | T014, T015 | Guardrail G2 (0 `-oauth`) |
| R3 `configured` two meanings | T009, T010, T012 | Guardrail G8 (≤1 derivation) |
| R4 `refreshCredentialState` shotgun | T012 | Guardrail G8; no dual-reload loop |
| R5 `AuthMethod` primitive/dup | T009, T016 | Guardrail G4 (≤1 decl, typed seam) |
| R6 `render()` mutates state | T018 | Guardrail G6 |
| R7 `listWindow`/`visibleRange` dup | T019 | Guardrail G5 (≤1 each) |
| R8 loose overlay state | T020 | Guardrail G7 |
| R9 `any` service handles | T017 | Guardrail G3 (0 `: any`) |
| R10 spec drift (024) | T007 | Guardrail G9 |
| R11 gate needs `CI=true` | T001 | plain `pnpm run check`/`verify` green |
| R12 uncommitted test | T002 | test tracked + passing |
| R13 submodule/version drift | T003 (align), T021 (version) | Guardrail G10; `check:layout` |
| R14a family gate only desktop | T004 | `check:layout` enforces all manifests |
| R14b presets soft read | T005 | `check:layout` warns/fails on missing preset dir |
| R14c launcher symmetry | T006 | `pnpm run web` boots via `acryl-web/bin/dev-run.mjs` |
| R14d Desktop composition drain (M3) | T022 | not startable; dependency recorded (PENDING) |

## Phase gates

- ✅ **Phase 0 done** (T001–T008): plain gate + `check:layout` green; no uncommitted test.
- ✅ **Phase 1 done** (T009–T015): G1, G2, G8 green; surface is a pure presenter of credential/auth state.
- ✅ **Phase 2 done** (T016–T017): G3, G4 green.
- ✅ **Phase 3 done** (T018–T020): G5, G6, G7 green.
- ✅ **Phase 4** (T021, optional): `runtimePackageVersion` now kept aligned with
  `sourceVersion` at every future `upstream:update`; today's pre-existing
  divergence deliberately left unforced (would require bumping ~100 `dsh-*`
  dependency ranges to an unpublished npm family — its own reviewed step).
  T022 stays **PENDING**, blocked on the M3 `acryl-desktop` composition-drain
  ledger; not startable here.
- ✅ **Phase 5 done** (T023–T024): guardrail script wired into CI
  (`.github/workflows/ci.yml`) and local `pnpm run check`; all 10 guardrails
  green (script exit 0); `corepack pnpm run check` passes plainly (no
  `CI=true`); `spec.md` SC-001..SC-011 met by the guardrail results above;
  SC-012 met — every landed item is ticked in `tasks.md` with its commit as
  evidence (see the dev-log entry this closing commit adds).

**This ledger stays Active.** Per its own premise it is a standing, cyclic
home for ACRYL debt — closing Phase 0–3/5 does not mean the ledger is done;
it means this batch of already-known debt is closed and the ledger is ready
for the next discovery (T022 already queued as the next Phase 4 item once
its M3 dependency lands).

## Re-measure before relying

Counts (e.g. `: any` = 19, `-oauth` = 7) were measured at `HEAD` `42c4177`.
All ten guardrails are GREEN as of `HEAD` after the T001–T024 commits (see
`docs/DEVELOPMENT-LOG.md`); the working tree may drift as new debt is added
to this cyclic ledger — re-run the guardrail script before trusting a count.
