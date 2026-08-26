# ACR Development Log

This human-readable log records important project evolution. It explains what
changed, why it matters, where the implementation lives, and which Git commit
is the exact recovery point. It complements Git history, specifications, and
architecture notes rather than replacing them.

## Recording rules

- Add the newest evolution first.
- Record the full canonical commit hash after the implementation is committed.
- Explain the user-visible result and the architectural decision, not only the
  files changed.
- Name the primary source, specification, and verification locations.
- If Git history is rewritten or commits are squashed, update affected hashes
  so this document continues to point at canonical `main` history.
- A log-maintenance-only commit does not need to describe itself. Product,
  architecture, workflow, or operational changes do need entries.

Recommended workflow:

1. Implement and verify one coherent change.
2. Commit that change on `main`.
3. Add its canonical commit hash and explanation here.
4. Commit the log update as a separate documentation checkpoint.

---

## 2026-08-25 - Native Cordis Architecture explorer added

**Commit:** [`fda026aceae1fff630e6cec160ac8ffaac2bae26`](https://github.com/AgentContextRelay/acr/commit/fda026aceae1fff630e6cec160ac8ffaac2bae26)

Settings -> Plugins now includes an **Architecture** tab before Lifecycle. It
projects the two actual Cordis 4.0 contexts independently and shows every live
Fiber instance, native UID and parentage, lifecycle phase, Loader ownership,
`inject` resolution, provided services, and labeled `ctx.effect()` ownership.
Repeated mounts remain distinct, and Host and Client instances are never
merged by display name.

The explorer introduces no parallel plugin descriptor, lifecycle registry, or
cached graph. Host state is projected through a bounded same-origin route;
Client state is projected directly from the renderer Context. Service values,
plugin configuration, callbacks, private failures, and paths never cross the
boundary. Lifecycle mutation remains Loader-oriented and protected, with
Development Canvas as the first reviewed mutable dual-face plugin.

Primary implementation: `dsh-plugin-desktop/src/plugin-architecture-*` and
`dsh-plugin-desktop/src/client/PluginArchitectureSettingsTab.tsx`. Specification:
`specs/017-cordis-architecture-explorer/`. Verification passed through the full
`corepack yarn check` gate, including 796 Desktop tests, 274 Market tests, 18
Canvas tests, build, typecheck, Loader/profile boot, runtime closure, bilingual
document checks, and license validation.

## 2026-08-25 - Cross-plane plugin lifecycle control added

**Commit:** [`1de0e0d425ff798035bb1515a58ab8caeb054cce`](https://github.com/AgentContextRelay/acr/commit/1de0e0d425ff798035bb1515a58ab8caeb054cce)

Settings -> Plugins now has a Desktop-owned **Lifecycle** tab alongside the
upstream read-only inventory. Every Host Loader row reports configuration,
Host root Fiber phase, Client-face capability, current Client root Fiber phase,
and whether the row is mutable or protected.

`PluginLifecycleController` keeps Loader and Fiber state authoritative. For an
admitted entry it persists the desired enablement in Desktop-private,
profile-scoped state, applies the live Host Entry update without Loader
write-back, awaits cleanup or activation, and rolls persistence back if the
runtime transition fails. The renderer then reloads against the recomposed Web
boot graph so Client Fibers, styles, and slots match the Host generation.

Development Canvas is the first mutable entry and exposes Enable, Disable, and
Reload. Internal, nested, generated, and control-plane rows remain visible but
protected until they have stable persistence identities and verified recovery
paths. The Desktop Host also registers `/reload [loader-entry-id]`; without an
argument it reloads every mounted managed ACR plugin and requests an orderly
Desktop restart.

Primary implementation and verification:

- `dsh-plugin-desktop/src/plugin-lifecycle-{state,controller,route,contract}.ts`
- `dsh-plugin-desktop/src/client/plugin-lifecycle-*`
- `dsh-plugin-desktop/src/client/PluginLifecycleSettingsTab.tsx`
- `specs/016-plugin-lifecycle-control/`
- `docs/architecture.en.md`
- focused persistence, profile, Host lifecycle, route-security, and Client
  boundary tests
- complete `corepack yarn check` with 1,075 tests passing and 4 skipped

## 2026-08-25 - Canvas preserves DSH session navigation

**Commit:** [`51ecf33d6a78bdd63b4140fb3e6596ef924deb94`](https://github.com/AgentContextRelay/acr/commit/51ecf33d6a78bdd63b4140fb3e6596ef924deb94)

Canvas now follows the root Session projection supplied by the standard Client
slot contract. Selecting another Session focuses the Chat tab, and reselecting
the current blank Session through New Session restores Chat even when the user
previously closed it. Ordinary updates to a non-blank current Session do not
steal focus from terminal, file, or browser tabs.

The exact headed Electron regression was reproduced and verified: close Chat,
click New Session, and confirm that a Chat tab and the upstream composer return.
The fix uses the existing reactive Session projection and adds no polling,
module-global state, or dependency on Desktop implementation.

## 2026-08-24 - Desktop launch now builds and verifies standalone Canvas

**Commit:** [`49d790fc9bc19373dd32e94946166e7a5caa04e8`](https://github.com/AgentContextRelay/acr/commit/49d790fc9bc19373dd32e94946166e7a5caa04e8)

The initial standalone Canvas extraction left `yarn dev` building Desktop but
not Canvas. A clean launch therefore reached the Cordis Loader without
`dsh-plugin-development-canvas/lib/index.js` and Electron aborted before the
window became usable.

Desktop development, direct checks, and directory packaging now build Canvas
first. Development launch also runs the headless Loader verification before
starting Electron. That verification resolves the Canvas package from the
installed-launcher boundary and imports its public Host entry, so missing or
stale Canvas output fails before a graphical process is started.

The exact root `yarn dev` path was exercised from the missing-artifact state and
successfully kept Electron alive without a Loader or module-resolution error.

## 2026-08-24 - Development Canvas extracted as a standalone Cordis plugin

**Commit:** [`2e5b4d1009f0c1c64dd0a2f1f6d470ed0b55b573`](https://github.com/AgentContextRelay/acr/commit/2e5b4d1009f0c1c64dd0a2f1f6d470ed0b55b573)

Development Canvas no longer lives as a Host subpath and Client child inside
`dsh-plugin-desktop`. It now owns the independent
`dsh-plugin-development-canvas` workspace, package, bundle patch, Host entry,
Client entry, native PTY dependency, styles, and tests.

Desktop exposes one small `desktop.main` slot and contributes the upstream
conversation as a priority-100 fallback. Canvas contributes at priority 0
through `ctx.slots.inject`. Removing or disabling the Canvas Loader row now
removes its Host and Client Fibers and restores conversation without a status
route, polling timer, module-global presence store, or Desktop import of Canvas
implementation.

Host activation rolls back earlier routes when later registration fails. Host
disposal removes routes and awaits every PTY. The Client declaration effect
owns its slot, styles, and tracked PTY sessions, including asynchronous starts
that settle during disposal.

Primary implementation and verification:

- `dsh-plugin-development-canvas/`
- `dsh-plugin-desktop/src/client/contracts.ts`
- `dsh-plugin-desktop/src/client/advanced-shell.ts`
- `specs/015-development-canvas/cordis-plugin-extraction.md`
- `docs/cordisplugins/development-canvas-plugin.md`

## 2026-08-23 - Agent control surface constrained to Cordis architecture

**Commit:** [`634ae192793652f327625025f43fcdb0c990ced9`](https://github.com/AgentContextRelay/acr/commit/634ae192793652f327625025f43fcdb0c990ced9)

The planned programmatic control surface for Development Canvas agents now has
an explicit Cordis architecture contract. The design was checked against the
pinned Cordis Context, Registry, Fiber, Primer, complete tutorial, service
dependency guide, and three-role capability guide.

The control surface must use a stable Cordis Service Definition, reversible
provider registrations, and consumers connected through `inject`. ACP, vendor
SDK/API, structured CLI, and PTY integrations become replaceable Service
Providers. Canvas and orchestration are Consumers and must not import concrete
providers. Composition uses stable Loader rows and service dependencies rather
than YAML order.

The contract also separates Canvas tab, ACR worker, runtime, PTY, and opaque
provider-session identities; requires truthful capability negotiation; keeps
raw terminal text out of semantic conversation history; and compiles handoffs
from canonical ACR room state. All process, connection, route, listener, timer,
and adapter resources must be owned by Cordis effects and reach quiescence on
fiber disposal or replacement.

Primary design:

- `docs/acr/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`
- `AGENTS.md`

## 2026-08-14 - Development Canvas becomes an independent Cordis capability

**Commit:** [`84ab0768745b6773d3408b4df1b0fa229ad469c4`](https://github.com/AgentContextRelay/acr/commit/84ab0768745b6773d3408b4df1b0fa229ad469c4)

### What was added

Advanced mode gained an Orca-inspired Development Canvas that replaces the
main content area with one active tab and a `+` launcher. It can open:

- native PTY shell tabs;
- interactive coding-agent tabs for Claude, Codex, OpenCode, Gemini, Pi, Grok,
  Aider, Goose, Amp, Kimi, Cursor, Hermes, and Qwen Code;
- in-memory file editor tabs;
- embedded browser tabs;
- the canonical conversation as a Chat tab.

Terminal and coding-agent tabs use `node-pty` and xterm.js. This gives agent
CLIs a real TTY, byte-level input, ANSI and alternate-screen rendering, resize
propagation, and process cleanup when a tab closes.

### Plugin architecture clarification

Development Canvas is a Cordis plugin, but it is not mounted as a child of the
Desktop plugin at runtime. The composition is flat:

```yaml
- id: desktop-shell
  name: dsh-plugin-desktop

- id: desktop-development-canvas
  name: dsh-plugin-desktop/development-canvas
```

These rows create independent sibling fibers. Removing or disabling the Canvas
row removes its Host routes, terminates its PTYs, removes its Client presence,
and restores the ordinary advanced conversation surface.

The source is colocated in the `dsh-plugin-desktop` package because it consumes
desktop-owned Host and Client capabilities. The package therefore contains
multiple independently loadable Cordis entry points. This is not a runtime
"plugin inside a plugin" relationship.

Cordis itself also supports real child plugins through `ctx.plugin()`. The
upstream lifecycle tutorial demonstrates a plugin calling
`ctx.plugin(heartbeat)` and documents recursive child cleanup. That supported
mechanism is distinct from the flat composition used by Development Canvas.

### Primary implementation

- Host plugin: `dsh-plugin-desktop/src/development-canvas.ts`
- Client plugin: `dsh-plugin-desktop/src/client/development-canvas/plugin.ts`
- Canvas UI: `dsh-plugin-desktop/src/client/development-canvas/DevelopmentCanvas.tsx`
- Canvas state: `dsh-plugin-desktop/src/client/development-canvas/state.ts`
- PTY provider: `dsh-plugin-desktop/src/canvas-pty.ts`
- PTY routes: `dsh-plugin-desktop/src/canvas-pty-route.ts`
- Composition: `dsh-plugin-desktop/cordis.patch.yml`
- Feature specification: `specs/015-development-canvas/`
- Plugin documentation: `docs/cordisplugins/development-canvas-plugin.md`

### Verification and current limits

Tests cover plugin activation and disposal, PTY TTY allocation, input, resize,
cleanup, and Canvas tab state. Host and Client typechecks and production
bundles passed. A real Claude CLI smoke confirmed interactive output without
falling into noninteractive print mode.

File tabs are still in-memory buffers and need the DSH filesystem capability
for durable load/save. Browser tabs use iframes, so sites that prohibit
embedding cannot render there.

---

## 2026-08-13 - DeepSeek Harness and Cordis adopted as the ACR substrate

**Commit:** [`9a3ce7eb0793ffad8755db76071d6e4a291fe742`](https://github.com/AgentContextRelay/acr/commit/9a3ce7eb0793ffad8755db76071d6e4a291fe742)

ACR adopted an unmodified, pinned DeepSeek Harness checkout as its runtime
substrate and chose Cordis as the composition and lifecycle kernel. The outer
repository became an isolated Yarn workspace containing the Desktop package,
community interoperability work, community market work, specifications, and
agent workflows. The upstream `deepseek-harness/` checkout remains a read-only
Git submodule with its own pnpm workspace.

The architectural direction established here is that ACR owns persistent
project continuity while agent sessions are replaceable workers. Capabilities
should be expressed as independently composable plugins and providers with
explicit dependencies and reversible effects.

Primary locations:

- Desktop product: `dsh-plugin-desktop/`
- Pinned upstream: `deepseek-harness/`
- Capability specifications: `specs/`
- Architecture and onboarding: `docs/`
- Runtime composition: `dsh-plugin-desktop/cordis.patch.yml`

---

## 2026-08-05 - Cordis and persistent ADE architecture researched

**Commit:** [`55e27d150f016848d0594798c19963b3e819c3df`](https://github.com/AgentContextRelay/acr/commit/55e27d150f016848d0594798c19963b3e819c3df)

The project evaluated Cordis spatiotemporal composability and DeepSeek Harness
as foundations for an agent-agnostic Agentic Development Environment. The work
captured the lifecycle model, service injection, reversible effects, event
composition, capability replacement, and the boundary between persistent ACR
state and disposable coding-agent sessions.

This research produced the initial ACR orientation, Cordis specification,
architecture study, composability-paper notes, and ACR versus DSH gap analysis.
It established the evidence used by the later substrate-adoption decision.

Primary locations:

- `docs/onboarding/orientation_spec_acr.md`
- `docs/cordis/cordis_spec.md`
- `docs/cordis/`
- `docs/acr/ACR_DSH_GAP_ANALYSIS.md`
