# ACRYL Roadmap

## Product vision

ACRYL is a local-first, plugin-native, multi-surface agent workspace. A named
profile has exactly one writable Node-owned DeepSeek Harness and Cordis runtime
that owns durable sessions, agent state, profile configuration, plugins,
lifecycle authority, HMR, and orderly shutdown. Terminal, Electron GUI, and Web
are peer presentation surfaces: a surface becomes the runtime owner only when
no owner exists, otherwise it securely attaches through the same control
protocol. Durable Harness records, not terminal scrollback, browser state, or
Electron process state, are the authoritative account of agent work.

```text
                         Node runtime owner
             (pinned Harness + Cordis + HMR + durable state)
                                  |
                       acryl-harness-runtime
                                  |
            acryl-control: lease, protocol, inspection, lifecycle
                    /                 |                  \
          acryl-tui (React Ink)   acryl-gui (Electron)   acryl-web
```

## Architectural assessment and constraints

The current repository is in a staged migration from an Electron-heavy fork,
not yet in the target architecture. `dsh-plugin-desktop` contains most product
implementation, while `acryl-control`, `acryl-harness-runtime`, and
`acryl-tui` are newer, much smaller packages. The migration direction must be
explicit: logic that is reusable across presentation surfaces moves out of
`dsh-plugin-desktop`, while that package shrinks toward Electron-only concerns
(window chrome, tray, native menu, packaging, updater, and OS integration).

`acryl-harness-runtime` is the engine boundary. It starts and disposes the
pinned Harness profile and owns the one live Cordis root. It must preserve the
normal Harness composition, generated empty Loader root, bundle layers, and
user `cordis.patch.yml` behavior. HMR is a Cordis framework capability, not a
TUI feature: development owners must launch Node with `--expose-internals` when
the composed profile enables HMR; production profile composition decides whether
HMR is disabled. No shared runtime package may disable HMR unconditionally.

`acryl-control` is the control plane linked by every surface. It owns the
single-writer lease, authenticated attach protocol, architecture projection,
lifecycle operations, and provider-neutral agent-control contracts. Its current
Codex, Claude, ACP, and DSH-native provider modules are descriptors and
transport contracts, not process spawners. Actual agent process, protocol, or
Harness-handle ownership belongs to the runtime owner, so attached surfaces
cannot create competing agents or roots.

`acryl-tui` is the terminal presentation. OpenTUI/Bun is being replaced by
React Ink on Node. Ink gives the terminal surface React components, Yoga/Flexbox
layout, deterministic component testing, and a supported Node 22+ runtime that
can coexist with the Cordis owner process. Ink components project durable
runtime/control state; they do not become a second source of truth.

The community market is useful only after there are real capability packages to
discover and distribute. Freeze further marketplace expansion until the core
runtime, relay, provider, and capability-package milestones create that demand.

## Planning ledger

`docs/ACRYL-ROADMAP.md` is the global navigator: it records the intended
product direction, the active milestone sequence, and explicit architectural
invariants. It is not the task tracker.

`specs/<MILESTONE-ID>-<feature>/` is the central delivery ledger. Each folder
is one bounded block of work within a milestone and contains the feature
specification, research, implementation plan, dependency-ordered `tasks.md`,
acceptance criteria, and implementation evidence as appropriate. Tasks are
checked off only after their focused test/smoke loop and commit complete.

A feature folder may be exploratory, superseded, or discovered to deviate from
the roadmap. That is valid: mark it invalidated with the reason and successor
when known, then archive or remove it deliberately rather than letting it
silently direct future work. The roadmap changes only when the product
navigation itself changes.

## Milestones

### M0 - Lock the runtime boundary and migration rules

- Declare `dsh-plugin-desktop` legacy presentation scaffolding to be drained,
  not the default home for new cross-surface capability work.
- Keep the three package roles strict: engine in `acryl-harness-runtime`,
  host-neutral control in `acryl-control`, and presentation in surface packages.
- Preserve upstream Harness unchanged and compose ACRYL only through
  repository-owned packages, profile patches, and launchers.
- Define a development launcher that starts the Node owner with
  `--expose-internals`; define production HMR policy through profiles.
- Audit every direct-root creation path and eliminate any path that can create a
  second writable root for an owned profile.

**Exit criterion:** one written and tested ownership model governs every
surface; HMR is available to a development owner without globally changing
profile composition.

### M1 - Move the terminal to React Ink

- Replace `@opentui/core`, Bun-only scripts, and `tests-bun/` with React 19,
  Ink 7, and Node run-once tests.
- Retain the existing CLI grammar, JSON output conventions, direct/attach/
  recovery concepts, and renderer lifecycle guarantees.
- Build an Ink app shell with profile/owner/health status, durable-session
  transcript projection, composer, structured tool/approval/job cards, and
  controlled unmount behavior.
- Keep renderer state ephemeral and derive it from typed control/runtime
  snapshots and durable Harness records.

**Exit criterion:** `acryl` runs on supported Node, has no Bun dependency, and
can render and test its terminal UI without creating a duplicate Harness root.

### M2 - Complete the single-owner runtime and attach protocol

- Make owner startup transactional: acquire lease, compose the profile, mount
  control services, expose an authenticated endpoint, and release everything
  on any failure.
- Make attachment generation-scoped and capability-negotiated, with explicit
  stale-owner recovery and no implicit takeover.
- Test ownership races, owner disposal, endpoint loss, process restart,
  repeated mount/unmount, and HMR/reload leak behavior.

**Exit criterion:** exactly one writable owner wins every supported ownership
race; all other surfaces attach or fail safely.

### M3 - Drain reusable profile and runtime management from Electron

- Extract profile materialization, profile state, checkpoint/recovery,
  lifecycle control, and architecture inspection from `dsh-plugin-desktop`
  behind `acryl-harness-runtime` and `acryl-control` contracts.
- Keep Electron-specific UI routes as clients of the extracted services until
  they can be simplified or removed.
- Ensure profile semantics remain identical whether initiated by terminal,
  Electron, or Web.

**Exit criterion:** no cross-surface profile or Cordis lifecycle authority is
Electron-only.

### M4 - Deliver the durable agent bridge and interchangeable providers

- Implement the DSH-native bridge using `ctx.agents`, sessions, trajectories,
  tools, approvals, jobs, compaction, and subagents.
- Project real durable records into every presentation surface and never infer
  canonical history from raw PTY output.
- Add runtime-owned Codex, Claude, ACP, OpenCode, Gemini, and local-provider
  adapters incrementally, each with explicit capability, cancellation,
  disposal, authentication, and fidelity contracts.

**Exit criterion:** users can start, resume, observe, and delegate durable agent
work from any attached surface without ambiguous identity or orphaned workers.

### M5 - Ship peer GUI and Web surfaces

- Make `acryl gui`, `acryl web`, `acryl-gui`, and `acryl-web` owner-or-attach
  clients of the same profile runtime.
- Share domain schemas, control clients, view models, and durable projections
  across Ink, Electron, and Web while retaining renderer-specific components.
- Preserve existing Desktop and Web behavior during staged migration.

**Exit criterion:** users can change presentation surfaces without changing
profile identity, session meaning, plugin state, or agent continuity.

### M6 - Provide safe plugin, architecture, and recovery operations

- Expose authoritative Loader, Fiber, service, dependency, effect, health,
  profile, agent, and job inspection through all surfaces.
- Support permitted install, update, remove, enable, disable, mount, unmount,
  and reload operations only through policy, settlement, verification, health,
  rollback, and HOT/WARM/COLD restart classification.
- Maintain a narrow recovery interface when optional presentation plugins fail.

**Exit criterion:** operators can safely diagnose and repair an ACRYL profile
without manual file edits or Electron-only tooling.

### M7 - Build continuity, relay, and persistent collaboration

- Add project rooms, context relay, structured handoffs, shared decisions,
  durable task artifacts, and agent status as portable project state.
- Compile bounded role/task context packets from durable records rather than
  dumping transcript history into every agent.
- Support agent replacement, rate-limit recovery, review, and worktree-based
  delegation without losing the canonical project context.

**Exit criterion:** an agent, runtime, or surface can be replaced without losing
project continuity or relying on hidden private conversation state.

### M8 - Revisit capability distribution and platform packaging

- Resume community market work only when real capability packages create a
  demonstrated need for discovery, catalog, install, and federation features.
- Continue native packaging, signing, updater, Windows policy, and macOS
  distribution work at the level justified by active releases.

**Exit criterion:** marketplace and platform complexity follow demonstrated
product demand rather than preceding the core runtime and collaboration model.

## Non-negotiable invariants

- One writable runtime owner per profile.
- One Cordis lifecycle and dependency-injection system, never a parallel one.
- Upstream `deepseek-harness/` remains unmodified.
- HMR is retained as a Cordis development capability, not globally disabled.
- Durable Harness/profile records are canonical; UI state and terminal bytes are
  projections only.
- Every process, socket, watcher, timer, PTY, subscription, route, and plugin
  registration has one lifecycle owner and an ordered disposer.
- Desktop, terminal, and Web remain peer surfaces, never sources of competing
  domain state.
