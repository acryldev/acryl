# Cordis mini-design: slice 1 (tab-type registry, `acryl-git`, real diff tab)

**Spec**: [../spec.md](../spec.md) | **Decisions**: [../parity-plan.md](../parity-plan.md) (2026-09-24) | **Prototype**: [ux-2-where-we-go.html](./ux-2-where-we-go.html)
**Status**: draft for review, no code written. Follows the six-point protocol in the root `CLAUDE.md`.

## Scope of this slice

In: a Client registry that tab types plug into, a read-only git Host service with a Client API, and the first externalized tab type (the real diff tab), then line comments sent to the agent, then the optional split.
Out (later slices): the worktree rail, the side panel, the attention queue, per-worktree tab groups, fan-out compare, the HTML prototype tab, staging and committing.

## Package granularity (applying guide sections 42 and 64)

The 2026-09-24 prototype proposed one package per tab type. The Cordis guide warns that "everything is a plugin" does not mean "everything is a separate package", and a Loader row needs a package. So the rule for this slice:

| Unit | Own package? | Why |
|---|---|---|
| `acryl-workspace` (existing) | keep | Shell, tab strip, registry. Already wired in `apps/acryl-desktop/src/profile.ts`. |
| `acryl-git` | **new** | A real capability with its own lifecycle (child processes), config and a plausible second provider (remote, libgit2). Consumers must not depend on how it shells out. |
| `acryl-tab-diff` | **new** | First externalized tab type. Proves the seam and gives the user a real on/off switch for it. |
| The other six tab kinds | stay inside `acryl-workspace` for now | Extract one at a time only when it gains its own dependency or the user wants it toggled independently. Each becomes a registry client with no behavior change, so extraction later is mechanical. |

## 1. Capability and plugin boundary

| Plugin | Capability | Why independent |
|---|---|---|
| `acryl-workspace` (Client) | `workspaceTabs`: registry of tab types | Lifecycle: tab types come and go as plugins load. Replacement: a different shell could host the same tab types. |
| `acryl-git` (Host + Client) | Read git worktrees, status and diff | Owns child processes and repo access policy. |
| `acryl-tab-diff` (Client) | Tab type `diff` | Optional feature the user can disable. |

Definition, provider and consumer are **not** split into three packages (guide section 42): there is one provider for each capability today. The service interface is still kept narrow and typed so a second provider can be added without touching consumers.

## 2. Provides and consumes

| Plugin | Provides | Hard `inject` | Optional (`ctx.get`) |
|---|---|---|---|
| `acryl-workspace` Client | `workspaceTabs` via `ctx.provide` (same shape as `ctx.shortcuts` in `acryl-shortcuts`) | `slots` | none |
| `acryl-git` Host | Loopback routes for worktrees, status, diff | `webServer` | none |
| `acryl-git` Client | `acrylGit` (typed fetch wrapper over the routes) via `ctx.provide` | none | none |
| `acryl-tab-diff` Client | Registers tab type `diff` into `workspaceTabs` | `workspaceTabs`, `acrylGit` | none |

`workspaceTabs` contract (sketch, to be finalized in T010):

```ts
interface WorkspaceTabType<State> {
  readonly kind: string                 // stable id, e.g. 'diff'
  readonly label: string                // shown in the + menu
  readonly glyph: string
  readonly create: (options?: unknown) => State
  readonly component: ComponentType<{ tab: WorkspaceTab<State>; update(patch: Partial<State>): void }>
}
interface WorkspaceTabs {
  register(type: WorkspaceTabType<any>): () => void   // returns disposer
  list(): readonly WorkspaceTabType<any>[]
  subscribe(listener: () => void): () => void
}
```

Client Cordis plugins cannot inject Host services, so the git Host service and the Client `acrylGit` are two halves of one package joined by same-origin routes, exactly as `acryl-workspace` already does for the PTY.

## 3. Effects and disposal

| Owner | Resource | Acquired in | Disposer | Order |
|---|---|---|---|---|
| `acryl-git` Host | Route registrations on `webServer` | one `ctx.effect` | release each route, reverse order | routes first |
| `acryl-git` Host | In-flight `git` child processes | same effect, tracked in a set | abort each via `AbortSignal`, then await exit | after routes, so no new work starts |
| `acryl-git` Client | none (stateless fetch) | n/a | n/a | n/a |
| `acryl-workspace` Client | Registry table | plain object owned by the plugin | cleared on dispose | n/a |
| `acryl-tab-diff` Client | Registry entry for `diff` | one `ctx.effect` around `register` | the returned disposer | n/a |

Quiescence: after `acryl-git` disposal no `git` process remains and no route answers. After `acryl-tab-diff` disposal the `diff` type is absent from `list()` and from the `+` menu; open diff tabs render a "plugin off" placeholder and keep their state, so re-enabling restores them.

Security notes for the Host routes (loopback is not a sandbox):
- Same-origin check against the renderer origin, mirroring `handleWorkspacePty*` in `acryl-workspace`.
- Every request names a worktree by a path that must appear in `git worktree list` for an allowlisted repo root; anything else is rejected. No arbitrary path arguments reach `git`.
- `git` is spawned with `execFile` and an argument array (no shell), with a timeout and an output byte cap.
- Read-only: no route mutates the repository in this slice.

## 4. Configuration and composition

`acryl-git` config, validated by a runtime schema before any activation (fail before partial activation, guide section 50):

| Key | Default | Meaning |
|---|---|---|
| `roots` | the desktop's current project directory | Repo roots the routes may inspect |
| `maxDiffBytes` | `1048576` | Larger diffs return a truncated marker, never an unbounded body |
| `gitPath` | `git` | Executable to run |

Loader rows: `id` equals package name for both new packages (`acryl-git`, `acryl-tab-diff`), per the repo rule. Neither is a deliberately shared multi-provider slot, so no exception applies. Both rows are added in advanced mode only, next to the existing `acryl-workspace` row in `apps/acryl-desktop/src/profile.ts`.

User-facing toggling: reuse the existing Plugin Lifecycle mechanism (`desktop.pluginLifecycle` slot and `pluginLifecyclePatches`) rather than building a second enable/disable system. A "Workspace > Tab types" settings page is a thin `settings.section` (same slot `acryl-shortcuts` uses) that lists registered tab types and links each to its lifecycle row. T003 verifies this is workable before any UI is built.

## 5. Events and durability

- No new Cordis events in this slice. State flows through the registry's `subscribe` and through fetches.
- Line comments (slice 1b) are a durable, model-visible fact, so per guide section 48 they must not live only in a live event or component state. Design: a comment is delivered to the agent as an ordinary user message in the session, carrying a structured header (file, side, line range, base ref). The session log is then the durable record, and no second store is introduced. How a Client plugin appends a message to the current session is unconfirmed (T002); until then this section is a hypothesis.
- Diff tab view state (selected file, scroll) is ephemeral UI state and may be lost on reload. Tab groups persistence belongs to the per-worktree slice, not this one.

## 6. Verification

Real Loader activation, not mocks of Cordis, for each of:

| Case | Expected |
|---|---|
| Activate `acryl-workspace` + `acryl-tab-diff` + `acryl-git` | `diff` appears in the `+` menu; opening it lists real changes from a fixture repo |
| Activate `acryl-tab-diff` without `acryl-git` | Fiber is PENDING, not failed; no `diff` type offered |
| Then activate `acryl-git` | `acryl-tab-diff` reactivates with no manual step |
| Disable `acryl-tab-diff` | `diff` gone from `list()`; open diff tabs show the placeholder; no leaked registry entry |
| Re-enable | Type returns; existing tab restores |
| Replace `acryl-git` (reload) | No duplicate route registrations, no stale client calls |
| Dispose `acryl-git` mid-diff | The `git` child process is aborted and reaped; process table shows none |
| Repeated mount and reload (10x) | Registry size and route count stay constant |
| Path traversal, unlisted worktree, oversized diff | Rejected, rejected, truncated with marker |
| `+` menu and tab rendering for the six untouched kinds | Identical behavior to today (existing tests stay green) |

The git Host tests use a real temporary repository with two worktrees, created in the test, never the user's repos.

## Risks and unknowns

1. **Client-to-Client service seam**: `acryl-shortcuts` proves `ctx.provide` plus `inject` on the Client, but PENDING and reactivation across two Client plugins is not yet demonstrated for this repo (T001).
2. **Session write seam** for line comments is unconfirmed (T002). If a Client plugin cannot append a session message, comments need a Host route through `acryl-control`, which changes the design of slice 1b.
3. **Web surface**: `acryl-web` has no advanced shell, so the tab layout is Desktop-only for now; `acryl-git` itself has no such limit.
4. **Copied logic**: the comment anchor and range math candidate (Orca `diff-comment-line-range.ts`) must be read before adoption, kept under an upstream provenance header, and covered by `THIRD_PARTY_NOTICES.md` (already in place).
