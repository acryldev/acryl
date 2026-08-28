# DSH Desktop repository rules

This repository owns the desktop product around an unmodified DeepSeek Harness checkout.

## Prerequisites and setup

- Use Node.js `^22.19.0` or `>=24.0.0` and the root PNPM `11.7.0` release through Corepack.
- Initialize the pinned upstream checkout with `git submodule update --init --recursive`.
- Install root dependencies with `corepack pnpm install --frozen-lockfile`.

## Build, run, and verify

- Start the isolated local Desktop (own `~/.dsh-acryl` home, advanced mode, Development Canvas) with `corepack pnpm run dev` or `corepack pnpm run local`.
- Use `corepack pnpm run dev:shared` only when you intentionally want the installed app's `~/.dsh` home.
- Fast headless loop: `corepack pnpm run typecheck`, `corepack pnpm run test`, or both via `corepack pnpm run verify`.
- Typecheck, test, then isolated GUI: `corepack pnpm run lifecycle`.
- Build the desktop package with `corepack pnpm run build`.
- Run the complete headless gate with `corepack pnpm run check`.
- Run upstream operations through the root scripts, such as `corepack pnpm run upstream:build`.

- `deepseek-harness/` is a pinned upstream Git submodule. Never edit files inside it from a desktop feature branch.
- `dsh-plugin-desktop/` owns the Cordis Host and Client faces, Electron bootstrap, packaging, and release tests.
- `dsh-community-fabric/` owns the community interoperability RFC. Until schemas and a reviewed reference adapter exist, it remains a private documentation scaffold and must not declare loadable DSH or package entry points.
- `dsh-community-market/` is an implemented private Host/Client package. It is an optional Desktop Market provider, disabled by default, and must continue to use ordinary DSH/Cordis, profile, and Desktop service contracts rather than a parallel plugin runtime.
- The outer repository and all owned packages use the root PNPM release with `node-linker=isolated`.
- The upstream submodule keeps its own PNPM workspace. Run upstream commands through the root `upstream:*` scripts, which enter the submodule before invoking its pinned Corepack release.
- Compatibility mode must run the upstream default client without overrides. Advanced presentation belongs to desktop-owned client plugins and may replace documented slots or services through profile composition.
- Keep graphical application launch explicit. Builds, typechecks, unit tests, and Loader smokes must remain headless-safe.
- During the current small-team rapid-development phase, work directly on `main` unless the user explicitly requests a branch or pull request. Do not create routine PRs.
- Commit every important coherent change promptly so regressions can be reverted to a precise checkpoint. Prefer several focused commits over rare large snapshots.
- Record every important product, architecture, workflow, or operational evolution in [`docs/DEVELOPMENT-LOG.md`](docs/DEVELOPMENT-LOG.md). Commit the implementation first, then add its full canonical commit hash and human-readable explanation to the log in a separate documentation checkpoint. Update logged hashes after any history rewrite or squash.
- Commit before major changes of direction and keep the submodule pin update separate from desktop behavior changes.
- Keep the repository topology and package-manager split consistent with the [owning Agent Note](.agents/notes/implemented/process/2026-08-15-pinned-upstream-and-isolated-yarn-workspace.md).

## Cordis development protocol

Before changing a plugin, service, tool, provider, event hook, Host route,
Client contribution, or Loader composition, read
[`docs/cordis/cordis_system_guide_for_coding_agents.md`](docs/cordis/cordis_system_guide_for_coding_agents.md).
Then inspect the owning pinned Harness subsystem documentation and package
types/source. The local vendored Harness behavior is authoritative over generic
Cordis examples.

Before implementation, write the Cordis mini-design in the active plan or
research note:

1. **Capability and plugin boundary** — what domain owns it and why it needs
   independent lifecycle/configuration/replacement.
2. **Provides and consumes** — services, tools, events, durable facts, hard
   `inject` requirements, and intentionally optional `ctx.get()` dependencies.
3. **Effects and disposal** — every activation-owned resource, its disposer,
   required cleanup order, cancellation, and quiescence behavior.
4. **Configuration and composition** — validated runtime schema, stable Loader
   row ids, scopes/isolation, and provider replacement behavior.
5. **Events and durability** — dispatch mode, explicit waterfall `next()`
   semantics, and which replay-critical facts belong in durable session state.
6. **Verification** — real Loader activation plus PENDING/reactivation,
   provider replacement, disposal, repeated mount/reload, and leak checks.

Use function plugins by default and `Service` classes for direct named
capabilities. Consumers depend on stable service interfaces through `inject`,
not concrete providers or YAML row order. Cordis/Harness registrations are
lifecycle-owned; raw timers, watchers, sockets, PTYs, subprocesses, routes, and
subscriptions are acquired inside one owning `ctx.effect()` and fully released
by its disposer.

A Harness Tool is a consumer of `ctx.tools`, not a Cordis primitive. Tool
plugins inject `tools`, register with `defineTool(...)`, return canonical typed
values separately from model/UI rendering, honor `exec.signal`, traverse the
normal policy pipeline, and disappear when their owning Fiber unloads.

Treat PENDING as valid missing-dependency state. Current Fiber states are
PENDING, LOADING, ACTIVE, FAILED, UNLOADING, and DISPOSED. A provider change
must unload and reactivate consumers without stale references or duplicate
registrations. Cordis service isolation scopes resolution; it is not an OS
sandbox.

## Agent skills

### Issue tracker

Decisions and feature specs live as markdown under `specs/` (Spec Kit + Wayfinder). See `docs/agents/issue-tracker.md`.

### Triage labels

Default Matt Pocock roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. Constitution, orientation, Cordis spec, and `docs/acryl/` are required reading; `CONTEXT.md` / ADRs are created lazily. See `docs/agents/domain.md`.

Agent-runtime, Development Canvas, context-relay, and third-party adapter work must follow [`docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`](docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md) and [the current alignment audit](docs/cordis/acryl_cordis_alignment_audit.md). Build on Cordis services, injection, effects, events, Fibers, Loader composition, and existing DSH capability seams; do not introduce a parallel lifecycle, dependency-injection, event, tool, or provider framework.


<claude-mem-context>
# Memory Context

# [acryl] recent context, 2026-08-24 7:08pm GMT+2

No previous sessions found.
</claude-mem-context>
