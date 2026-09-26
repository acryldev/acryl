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

## T070: what is shared, what needs a seam, what is native (2026-09-26)

Method: read `apps/acryl-desktop/src/profile.ts`, its client (`src/client`), `runtime/acryl-harness-runtime/src/{coding-capabilities,engine-dsh}.ts` and `apps/acryl-web`, then verified by booting the real Web engine on a throwaway home (`apps/acryl-web/tests/workspace-shared.spec.ts`).

| Piece | Before | Now | Kind |
|---|---|---|---|
| Composition of the workspace row | hand-written Desktop row in `profile.ts` | `workspace` capability (`surfaces: ['desktop','web']`) in `coding-capabilities.ts`; Web links `acryl-workspace` into its profile through `requiresPackages` | shared |
| Rows that hand the frame to the ACRYL shell (`ui-layout` off, `ui-sidebar`, `ui-conversation` on) | inline in Desktop `profile.ts` | `advanced-shell` capability, `createAcrylShellCapabilityPatches(surfaces, mode)`; Desktop passes its mode, Web is always `advanced` | shared |
| Frame, layout state and service, slot declarations, theme presenter | `apps/acryl-desktop/src/client` | `plugins/acryl-workspace/src/client/shell` | shared |
| Workspace UI (canvas, Projects list, Changes, Review, Checks, Files, editor) | `acryl-workspace` (already package-neutral) | unchanged | shared |
| Host routes (git, files, pty, checks) | `acryl-workspace` Host half on the shared web server | unchanged; proven on Web: repo, tree, save and a real terminal answer | shared |
| Which shell and platform a page runs | Electron URL fragment only | `shell/environment.ts`: same fragment contract; a page without markers is `web` and runs the ACRYL shell | seam |
| Native window chrome (macOS traffic lights, Windows caption controls) | constants in Desktop `window-chrome.ts` | copy in `shell/chrome-metrics.ts`, reserved only for `darwin`/`win32`; a test compares the two files | seam (guarded) |
| Adding a project | Desktop window folder picker (Windows) or upstream Add workspace | same code; on Web the upstream Add workspace flow browses the server's folders | seam (already both) |
| Folder drag-drop, native directory-picker bridge, native menu, tray, notifications, updates | Desktop | stays in `apps/acryl-desktop` | Desktop-native |

Open on Web: compatibility mode does not exist (Web always renders the ACRYL shell, by decision, so the Host toggles and the client cannot disagree); the Desktop-only Settings tabs (plugin lifecycle, plugin architecture) are not part of this slice (spec 034); `acryl-web` now ships `node-pty` through `acryl-workspace`, which matters for its npm closure.

