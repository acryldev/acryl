# Feature Specification: ACRYL Technical Debt, Refactoring & Stability

**Feature Directory**: `specs/001-acryl-refactor-improvements-and-tech-debt/`
**Status**: Active (standing ledger — ongoing, cyclic)
**Consolidates**: the former `specs/001-acryl-0-gap-analysis/` stub (renamed).
The original gap-analysis research itself is preserved at
`docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md`; this ledger is the live, executable home
for all ACRYL technical debt, refactoring, and stability work.
**Authority**: `.specify/memory/constitution.md`, `docs/ACRYL-ROADMAP.md`, the Cordis coding-agent guide, and `AGENTS.md` "Architecture and clean-code discipline"
**Input**: Findings from the ACRYL CLI `/login` code review (2026-09-08), the agent-work review (2026-09-08), and the harness-inheritance investigation. All evidence is in `research.md`.

## Objective

ACRYL needs one **canonical, named home for every technical debt, refactoring
idea, and stability improvement** owed on the codebase. Today these items are
found only in ad-hoc review threads, private conversation, or scattered file
comments — so the same debt gets re-identified, never scheduled, and never
closed. This ledger is that home.

It is a **cyclic ledger**: maintainers and agents keep adding new items to
`tasks.md` as debt is discovered, complete them, and close them here — so there
is always a predefined place to return to when ACRYL needs refactoring,
hardening, or stabilization. It is not a one-shot feature; it is a persistent
program in Spec Kit form.

**The governing premise:** each item here must be *an actionable, testable task*,
not a wish. A task is done only when its acceptance proof passes, and the major
"move the logic / fix the model" items ship with a proof test that goes
RED → GREEN.

## Who benefits and why

- **Maintainers/agents** get one predictable place to find and schedule debt.
- **Reviewers** get a durable record of known issues instead of re-finding them.
- **The product** gets harder, more maintainable, and more stable over time —
  the boundary rules in `AGENTS.md` (surfaces never own domain logic, typed
  services, no `any`, pure render, one term one meaning) stop being aspirational
  and become enforced.

## User Scenarios

### User Story 1 — Close the surface/domain boundary violations (P1)

A maintainer opens this ledger, reads the "boundary" phase, and completes the
tasks that move the authorization/credential logic out of the terminal surface
into the engine-neutral layer. After the work, the terminal is a pure presenter
of runtime semantics, not a second owner of credential state.

**Why P1:** the biggest correctness and maintainability risk in the CLI today —
the surface writes durable settings, owns a credential state machine, and
mixes business rules with rendering.

**Acceptance Scenarios:**
1. Given the CLI is running a `/login` flow, when the authorization state
   changes, then the terminal only *renders* the result — it no longer runs the
   `beginAuthorization` use-case or repairs display names itself.
2. Given the credential read-model, when either `/login` or `/model` opens,
   then both surfaces read the *same* typed projection, and no field means two
   different things across them.

### User Story 2 — Remove internal-state-as-presentation hacks (P1)

A maintainer removes the `-oauth` display-name suffix and similar encodings,
replacing them with a typed `authMethod` badge rendered at presentation time.

**Acceptance Scenarios:**
1. Given a provider signed in via OAuth, when it is listed, then its display
   name is unchanged and its method is shown as a badge — the name is never
   rewritten to carry state.
2. Given the provider list, when it refreshes, then no repair/re-suffix loop is
   needed and no history-corruption bug can recur.

### User Story 3 — Model domain concepts with real types (P2)

A maintainer replaces the bare `string`/`'a' | 'b'` unions with one exported
`AuthMethod` value object, used across the seam and the rows.

**Acceptance Scenarios:**
1. Given a compile, then there is exactly one declaration of the auth-method
   concept and the action contract references it (not `string`).
2. Given a refactor of the method set, then only one file changes and the
   typechecker covers the call sites.

### User Story 4 — Make the headless gate and repo state trustworthy (P1)

A maintainer lands the hygiene tasks so `typecheck`/`verify`/`check` pass
without workarounds, the submodule and gate checks are consistent, and no test
sits uncommitted.

**Acceptance Scenarios:**
1. Given a clean checkout, then `corepack pnpm run check` passes without
   setting `CI=true`.
2. Given the submodule, then `pnpm run check:layout` passes (committed gitlink,
   `upstream.json`, and checkout agree).
3. Given a new test, then it is committed with the behavior it covers.

### User Story 5 — Cyclically maintain the ledger (ongoing)

A maintainer adds a newly-discovered debt item as a task and closes it here,
keeping the ledger the source of truth for refactoring/improvement/stability
work.

**Acceptance Scenarios:**
1. Given a new debt discovery, then an entry exists in `tasks.md` with an
   acceptance proof, a dependency note, and a RED/GREEN command.
2. Given a completed task, then its acceptance evidence is recorded and the
   task is marked done; the ledger is never left stale-appearing.

## Functional Requirements

- **FR-001** The ledger MUST be the single, canonical home for ACRYL technical
  debt, refactoring ideas, and stability improvements; no parallel ad-hoc list.
- **FR-002** Every listed item MUST be an actionable, testable task with a
  defined acceptance condition and a RED/GREEN proof command.
- **FR-003** Surface packages MUST NOT own domain/business logic (credential
  state, authorization flows, durable-state writes, business invariants).
- **FR-004** Cross-boundary state MUST flow through one typed projection with a
  single meaning per field; no field carries two semantics across surfaces.
- **FR-005** Internal state MUST NOT be encoded into user-visible names or
  fields; presentation badges are derived at render time from typed data.
- **FR-006** Domain concepts MUST be modeled as small, immutable, explicit
  types (value objects / discriminated unions), not bare primitives or
  duplicated union literals.
- **FR-007** UI projection functions MUST be pure (no state mutation during
  render); view state is a small discriminated union.
- **FR-008** Service handles from the runtime MUST be typed, never `any`.
- **FR-009** The repository MUST keep a green, reversible checkpoint at `HEAD`
  and a passing headless gate without environment workarounds.
- **FR-010** The submodule/gate/version invariants MUST be consistent and
  gate-checked so all surfaces inherit the same pinned harness family.
- **FR-011** The ledger MUST be kept in sync with the code: closing a debt item
  updates the corresponding spec (or opens a superseding ticket) rather than
  leaving it apparently active.

## Success Criteria

- **SC-001** The `/login` and `/model` credential read-model and authorization
  use-case are owned by `acryl-control`/`acryl-harness-runtime`; the CLI surface
  renders them. (Acceptance: proof test guardrail 1 green.)
- **SC-002** No `-oauth` (or equivalent) display-name encoding remains; the
  auth method is a typed badge. (Proof guardrail 2 green.)
- **SC-003** Zero `: any` service handles in `acryl-cli/src`. (Proof guardrail 3 green.)
- **SC-004** Exactly one `AuthMethod` type exists and is used at the action seam. (Proof guardrail 4 green.)
- **SC-005** `listWindow`/`visibleRange` are defined once, not duplicated across overlays. (Proof guardrail 5 green.)
- **SC-006** No `render()` mutates component state. (Proof guardrail 6 green.)
- **SC-007** Overlay view state is a discriminated union, not a loose field cluster. (Proof guardrail 7 green.)
- **SC-008** The `configured` field has one meaning across surfaces. (Proof guardrail 8 green.)
- **SC-009** `specs/024-acryl-cli-login` describes the shipped interaction (or a superseding ledger references it). (Proof guardrail 9 green.)
- **SC-010** `upstream.json.commit`, the committed gitlink, and the submodule checkout agree; `check:layout` passes. (Proof guardrail 10 green.)
- **SC-011** `corepack pnpm run check` passes from a clean checkout without `CI=true`.
- **SC-012** The ledger's `tasks.md` is the working truth: every discovered item has a task, and each completed task has evidence.

## Non-goals

- Not a place to specify new product features (those go to their own `specs/NNN-*` ledger).
- Not a rewrite of the full product or of `deepseek-harness/`.
- Not a mandate to copy the whole codebase into the ledger; only real, actionable debt.

## Edge Cases

- A debt item is discovered mid-feature: it is added here as a task, not silently deferred to a private thread.
- A task depends on another feature (e.g. M9 engine seam): its `Depends on` field names that ledger explicitly, and it stays PENDING until the dependency lands.
- A task is invalidated by new evidence: mark it invalidated in `tasks.md` (or `invalidated.md`) with the reason and successor, never leave it apparently active.

## Assumptions

- ACRYL is plugins on DSH + Cordis; the constitution and Cordis guide win over this ledger's phrasing.
- `deepseek-harness/` stays unmodified on all feature branches.
- Work proceeds on `main` in focused, green commits per repo policy; each implementation commit gets a `docs/DEVELOPMENT-LOG.md` checkpoint.
- The current surface package is `acryl-cli` (renamed from `acryl-tui`); all task paths use `acryl-cli/`.
