# Research: slice 1 spikes (T001-T003)

**Date**: 2026-09-24 | **Feeds**: [design/cordis-mini-design.md](./design/cordis-mini-design.md), [tasks.md](./tasks.md)
**Method**: read the shipped code and package types in this checkout, and run one real Cordis script. Nothing here changes product code.

## Verdicts

| Spike | Question | Verdict |
|---|---|---|
| T001 | Does provide/inject give PENDING and reactivation between two plugins? | **Yes**, demonstrated with real Cordis 4.0.2 |
| T002 | Can a Client plugin send a message to the agent? | **Yes**, through `ctx.sessions`; no Host route needed |
| T003 | Can tab plugins be user-toggleable through the existing Lifecycle tab? | **Yes, with one required change**: new rows must be added to the managed allowlist |

## T001: provide/inject, PENDING and reactivation

Ran a throwaway script against the repo's own `@deepseek-ai/cordis@4.0.2` (a plain `Context`, a consumer with `inject: ['workspaceTabs']` that registers a tab type in a `ctx.effect`, and a provider that calls `ctx.provide('workspaceTabs', registry)`, the same shape `acryl-shortcuts` uses for `ctx.shortcuts`).

```text
1. no provider   -> PENDING
2. provider up   -> ACTIVE   table = [diff]
3. provider gone -> PENDING  table = []          (registration disposed)
4. provider back -> ACTIVE   table = [diff]      (reactivated, no manual step)
5. consumer off  ->          table = []
log: registered diff | disposed diff | registered diff | disposed diff
```

Conclusions:
- A missing provider is PENDING, not an error, and the consumer's effect is not run.
- Removing the provider unwinds the consumer's effect (no stale registry entry) and re-adding it reactivates the consumer.
- One registration per activation: no duplicates across the cycle.

Limits of this evidence: it is core Cordis, not the DSH Client Loader. The pattern is already used in production on the Client (`acryl-mount-anchors` injects `shortcuts` provided by `acryl-shortcuts`), so the Loader path is exercised, but T032 must still assert this with the real Loader.

Note for implementers: `FiberState` is a const enum in the shipped build (not exported at runtime). Compare against numeric states as `plugin-lifecycle-api.ts` does (`ACTIVE = 2`), or use the type only.

## T002: sending a message to the agent from a Client plugin

**Yes.** `@deepseek-ai/dsh-api-session-controller/client` merges `sessions: ISessions` into the Client `Context`. So a Client plugin declares `inject = ['sessions']` and:

1. Reads the current session id from `ctx.sessions.list` (an `ObservableSnapshot<SessionListState>`; the workspace already reads the same state through `useSessions`, whose `current` field is the selected id).
2. Resolves the session's Agent-scoped context with `ctx.sessions.scope(id)`, then the session face with `ctx.sessions.sessionOf(agentCtx)`.
3. Calls `session.prompt(content, mode, signal?, requestId?)` where `content` is `PromptContentPart[]` (`{ type: 'text', text }` parts) and `mode` is `'queue'` (append after the current turn) or `'steer'` (interrupt).

`session.beginSubmission(...)` optionally registers a local echo first, so the message paints in the conversation immediately and a failed prompt retires the echo. Failures land in the snapshot's `promptError`.

Consequences for the design:
- Line comments (T041) can be delivered as an ordinary user turn, so the **session log is the durable record** with no second store, exactly as the mini-design hypothesized.
- No Host route through `acryl-control` is needed. Mini-design risk 2 is resolved.
- Two things to confirm during T041: the exact `ObservableSnapshot` accessor name for the current selection outside React (the types were read, not executed), and whether `queue` or `steer` is the better default for a review comment (`queue` is the safer default, since it does not interrupt work in flight).

## T003: user-toggleable tab plugins via the Lifecycle tab

What exists (Desktop, `apps/acryl-desktop`):
- The Plugins settings page has a Lifecycle tab with per-Loader-entry **enable, disable and reload**, showing Host phase and Client Fiber phase, and dependents.
- Toggles persist in one profile-scoped override file shared by every surface (`runtime/acryl-harness-runtime/src/plugin-lifecycle-state.ts`), so a CLI `acryl plugin disable` and the Desktop panel agree.
- Live application is tested: `plugin-lifecycle-controller.spec.ts` covers "disables and enables Canvas with persistence and settled Fiber cleanup" and "reloads through Fiber restart", so a toggle applies to the running tree, not only at next boot.

The constraint: the controller only allows toggling entries in an allowlist. `MANAGED_PLUGIN_LIFECYCLE_ENTRIES` in `apps/acryl-desktop/src/plugin-lifecycle-state.ts` currently has three (`include:acryl-development-canvas`, `include:ui-brand-official`, `include:ui-acryl`), plus blend rows and profile-bundle or market plugins. Everything else is reported as protected ("core capability ... not user-toggleable"). `acryl-workspace` is inserted by `profile.ts` and is **not** on the allowlist, so it is protected today.

Decisions that follow:
1. `acryl-workspace` stays protected. It is the shell; disabling it would strand the user.
2. `acryl-git` and `acryl-tab-diff` must be **added to `MANAGED_PLUGIN_LIFECYCLE_ENTRIES`** (entry id `include:<row id>`, with `patchId`, `moduleName`, `clientPackage`), otherwise they will be listed but locked. This is a small change in T033.
3. No separate "Workspace > Tab types" toggle system is needed for slice 1: the Lifecycle tab already is the on/off switch. A friendlier "Tab types" page can later be a thin view over the same controller, and is out of scope for this slice.
4. Enabling `acryl-tab-diff` while `acryl-git` is disabled is safe: the tab plugin goes PENDING (T001) and the Lifecycle tab already reports dependents.

## What the spikes changed in the plan

- Mini-design risk 1 and 2 are resolved; risk 3 (Web has no advanced shell) stands.
- T041 no longer needs a Host route; it uses `ctx.sessions`.
- T033 gains the allowlist change, and the earlier idea of building a Tab types settings page is dropped from slice 1.
