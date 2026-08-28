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
          acryl-tui (pi-tui)      acryl-gui (Electron)   acryl-web
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
lifecycle operations, and provider-neutral agent-control contracts. One active
CLI, GUI, or Web controller may delegate scoped work to generic terminal or ACP
coding agents. Those workers use durable project artifacts and capability commands;
they do not receive a Cordis context, root credential, or authority to create a
competing runtime. Actual agent process, protocol, or Harness-handle ownership
belongs to the runtime owner.

`acryl-tui` is the terminal presentation. It adopts the working pi-tui-based
`dsh-pi-tui` implementation on Node, replacing the earlier OpenTUI/Bun and
React Ink direction. Its renderer projects typed control/runtime snapshots and
durable Harness records. It must not own a Cordis root, directly become the
profile runtime, or become a second source of truth. The integration extracts
surface-neutral agent, session, tool, approval, and lifecycle operations behind
`acryl-control`, allowing the same agent to be operated from pi-tui, Electron,
and Web.

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

The ledger follows GitHub Spec Kit. Use `specify` only to create a new bounded
feature folder; for an existing active folder use the sequence
`clarify -> plan -> tasks -> analyze -> implement -> converge`. The Spec Kit
artifacts remain the authoritative task and acceptance record, while Ponytail
(full) constrains each implementation task to the smallest root-cause change
that satisfies its acceptance criteria.

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

### M1 - Adopt pi-tui as the terminal surface

- Replace `@opentui/core`, Bun-only scripts, `tests-bun/`, and the superseded
  React Ink direction with the full terminal feature set in the pinned MIT
  upstream baseline [`tomowang/dsh-tui`](https://github.com/tomowang/dsh-tui)
  commit `f7663341f604c3ad96e9b2b838a7ca2de8e84fd1`
  (`@tomowang/dsh-tui` 0.7.0, pi-tui 0.84.2).
- Treat that exact snapshot as the complete behavior and component reference:
  durable replay/resume, streaming, trajectory, tools, context, plugin
  inspection, approvals, questions, model and preset controls, plan and goal
  modes, compaction, terminal input, and status/statistics projections.
- Keep a provenance record with the upstream URL, commit, license notice,
  component inventory, and every local divergence. Do not add a submodule or
  ship the upstream bundle unchanged.
- Refactor the upstream bundle's direct DSH/Cordis bindings into an
  `acryl-tui` client of `acryl-control`. ACRYL owns the root, active-control
  lease, sessions, and lifecycle; the TUI owns only terminal rendering and
  ephemeral local interaction state.
- Use the pinned normal `@earendil-works/pi-tui` 0.84.2 dependency. Do not
  copy the Pi monorepo or retain React Ink alongside it.

**Exit criterion:** `acryl-tui` provides the pinned baseline's terminal
experience through ACRYL control projections, without Bun, React Ink, a second
Cordis root, or a terminal-owned durable state.

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
  and reload operations only through global permission policy, settlement,
  verification, health, rollback, and HOT/WARM/COLD restart classification.
- Checkpoint every plugin mutation; automatically quarantine an unhealthy
  candidate and restore the last healthy composition.
- Maintain a narrow recovery interface when optional presentation plugins fail.

**Exit criterion:** operators can safely diagnose and repair an ACRYL profile
without manual file edits or Electron-only tooling.

### M7 - Build continuity, relay, and delegated coding work

- Add project rooms, context relay, structured handoffs, shared decisions,
  durable task artifacts, agent status, and plugin proposals as portable
  `.acryl/` project state.
- Normalize generic terminal and ACP coding agents into durable delegated jobs.
  Offline source/build/test work may continue after controller loss; runtime
  mutation, integration testing, and approval-gated publication wait for the
  active controller.
- Support agent replacement, rate-limit recovery, review, and optional
  worktree-based delegation without losing canonical project context.

**Exit criterion:** an agent, runtime, or surface can be replaced without losing
project continuity or relying on hidden private conversation state.

### M8 - Build the ACRYL Registry and Blend catalog

- Provide an ACRYL-owned Registry for ACRYL packages while keeping official and
  community DSH stores as separate connectable catalogs with explicit adapters.
- Distribute signed editable-source and sealed-artifact packages with provenance,
  compatibility, permissions, and lifecycle-adapter identity.
- Introduce ACRYL Blends: versioned, declarative application compositions that
  create isolated projects or generate explicit conflict-resolution plans for
  existing projects. Blends may request, but never loosen, global policy.
- Defer remote registry hosting, commercial transactions, licensing backend,
  seller portal, and SaaS `webblends` deployment until local workflows are
  proven.

**Exit criterion:** users can safely create, apply, recover, and extend an ACRYL
Blend without confusing ACRYL-native packages with external DSH packages.

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
