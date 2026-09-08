# Quickstart: Interchangeable Harness Engine (M9)

Runnable validation scenarios. Details live in [contracts/engine-runtime.md](./contracts/engine-runtime.md)
and [data-model.md](./data-model.md).

## Prerequisites

- `git submodule update --init --recursive`
- `corepack pnpm install --frozen-lockfile`
- An authenticated ACRYL profile (`acryl` profile, e.g. via `specs/024-acryl-cli-login`)
- Phase B: pinned `pi` engine packages installed (see `research.md` `NEEDS PIN`)

## Phase A - engine seam + `dsh` adapter + TUI re-point

**Goal**: no behavior change; the surface now goes through the seam.

```sh
corepack pnpm run typecheck
corepack pnpm run test            # incl. new engine-registry / engine-dsh-adapter specs
corepack pnpm run verify
```

Manual:

```sh
corepack pnpm acryl tui --profile acryl        # default: dsh engine
```

Expected:

- Prompt / stream / cancel / exit behave exactly as before (SC-004).
- `acryl-cli/src/cli/run.ts`, `host/direct.ts`, `tui-app/session.ts` no longer
  import `bootAcrylHarnessProfile` / `startDirectHost` / `createAcrylSessionBridge`
  (grep clean) - they resolve the engine by name and use `handle.sessions` (G6).
- `ctx.runtime.engine === 'dsh'` (assert in an activation test).

## Phase B1 - run a prompt on the `pi` engine (US1, P1)

```sh
corepack pnpm acryl tui --profile acryl --engine pi
```

Expected:

1. Surface shows `ctx.runtime` = `pi`; a submitted prompt yields a pi-produced
   response with streamed transcript + tool events (SC-001).
2. Room / task artifacts from a prior `--engine dsh` session on this profile are
   visible and unchanged (SC-002).
3. `Ctrl+C` on a running turn aborts cleanly (no half-registered handler).
4. On exit: terminal restored; runtime resource report + `ps` show zero leaked
   engine processes/sockets/PTYs and exactly one runtime owner for the episode
   (SC-003).
5. Contract test: the `pi` adapter's `fidelity` asserts HMR + sandbox + approval
   parity; a stubbed adapter that does not is rejected with `fidelity-rejected`
   (SC-008).

## Phase B1 - cross-engine resume (US1 edge case, SC-006)

```sh
corepack pnpm acryl tui --profile acryl --engine dsh      # submit 1 prompt, note <sessionId>, exit
corepack pnpm acryl tui --profile acryl --engine pi --resume <sessionId>
```

Expected: prior DSH turn renders from the canonical `DurableSessionMessage`
stream; a new pi turn appends to the same `sessionId`. Any fidelity gap shows as
a one-line documented limitation, not silent loss (FR-007).

## Phase B2 - engine selection (US2, P2)

```sh
# set the acryl-engine Loader row to pi in the profile, then:
corepack pnpm acryl tui --profile acryl                   # uses pi (row)
corepack pnpm acryl tui --profile acryl --engine dsh      # uses dsh (override), row unchanged
corepack pnpm acryl tui --profile acryl --engine bogus    # loud failure BEFORE any runtime boot
```

Expected: override wins for one launch without rewriting the row; `bogus` fails
with a single message naming the invalid value and valid engines (SC-005), exit
class `usage`.

## Phase B3 - HOT-swap (US3, P3)

```sh
corepack pnpm acryl tui --profile acryl --engine dsh      # run a turn
# in-session: edit the acryl-engine row engine: dsh -> pi, then:
/reload
```

Expected:

- Surface now shows `ctx.runtime` = `pi` without a process restart.
- Loader/activation test (`engine-swap.spec.ts`): old `dsh` adapter disposed in
  order; `AcrylEngine` consumers went `PENDING` then reactivated against `pi`;
  no duplicate registrations; no leaked resources; in-flight turn (if any) was
  cancelled first (SC-007).
- Swap back `pi -> dsh` + `/reload` repeatedly - no leak growth.
- Force a `pi` activation failure - composition rolls back to the healthy `dsh`
  engine (`ControlOperation` state `RECOVERABLE`).

## Full gate before handoff

```sh
corepack pnpm run check
```
