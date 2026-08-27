# ACRYL Development Log

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

## 2026-08-26 - Ink terminal projects live Harness readiness

Commit: `02b2687157e8d029ba71c6e5930cf50435eb5ca6`

A direct host now reports whether both native Harness session and agent services
are present. The CLI passes that fact to React Ink, replacing the previous
hard-coded unavailable state with a real runtime-readiness projection.

Primary sources: `acryl-tui/src/host/direct.ts` and
`acryl-tui/src/cli/run.ts`. Verification: 20 TUI tests, typecheck, and build.

## 2026-08-26 - ACRYL CLI launches with Cordis HMR support

Commit: `a1281f2f6d29daa35abdde079b883018a04638f8`

The Node `acryl` entrypoint now re-executes itself with
`--expose-internals` before it boots an HMR-enabled Cordis profile. The launch
contract is covered by a pure invocation test, and an isolated real CLI JSON
smoke successfully acquired and released a runtime profile.

Primary sources: `acryl-tui/src/bin.ts` and
`acryl-tui/src/cli/node-launcher.ts`. Verification: 20 TUI tests, typecheck,
build, and isolated CLI smoke.

## 2026-08-26 - ACRYL terminal renderer now uses React Ink

Commit: `2ff2cb96c47f33966edb606167308b7607f8866e`

The terminal renderer no longer depends on OpenTUI or Bun. `acryl-tui` now
mounts and disposes a React Ink renderer under Node, while its durable agent
workspace remains a renderer-neutral projection. The obsolete Bun/OpenTUI test
path was removed.

Primary source: `acryl-tui/src/render/app.tsx`. Verification: 18 Vitest tests,
TypeScript typecheck, and package build.

## 2026-08-26 - React Ink terminal foundation

Commit: `1f6ed2f081f1b4065eca008d2bfe16623a2bfb1a`

`acryl-tui` now has a minimal, tested React Ink terminal component that projects
profile, ownership mode, and runtime state. This starts the staged replacement
of OpenTUI/Bun with Node-compatible Ink without changing the GUI or Web
surfaces.

Primary source: `acryl-tui/src/render/ink-app.tsx`. Verification: the Ink
component test and TypeScript check.

## 2026-08-26 - Harness HMR is preserved by profile composition

Commit: `ffc597cd86a1e37f86a6d41099da69581b673434`

`acryl-harness-runtime` no longer overrides the Cordis HMR Loader row. An
HMR-enabled profile now fails early with an actionable requirement to launch
Node using `--expose-internals`; a profile that explicitly disables HMR still
boots normally. The isolated smoke confirms that an exposed Node owner mounts
HMR alongside durable sessions and agents.

Primary source: `acryl-harness-runtime/src/index.ts`. Verification: the runtime
workspace test suite and an isolated `node --expose-internals` profile boot.

## 2026-08-26 - Direct TUI hosts boot through the pinned Harness profile

Commit: `41af5c897cf835d53cbee79d126c932adbe5570b`

`acryl-harness-runtime` now owns normal profile initialization and boot, while
`acryl-tui` installs its ownership, architecture, agent, and control services
into that single returned Cordis root. The runtime explicitly disables the
base development HMR row because regular Node CLI launches do not expose
Cordis internals. This makes profile boot work without `--expose-internals`
and ensures the real durable `sessions` and `agents` services are present.

Primary sources: `acryl-harness-runtime/src/index.ts` and
`acryl-tui/src/host/direct.ts`. Verified by each workspace's `check` command
and an isolated normal-Node profile boot smoke. Closure research is recorded
in `specs/019-acryl-harness-runtime/issues/01-audit-profile-runtime-closure.md`.

## 2026-08-26 - ACRYL terminal composer is interactive

**Commit:** [`29a2882d01f4724649ef604a0c4dcbb88c561d64`](https://github.com/acryldev/acryl/commit/29a2882d01f4724649ef604a0c4dcbb88c561d64)

The initial direct TUI was static because it mounted only a `TextRenderable`.
It now mounts and focuses OpenTUI's `InputRenderable`, so typing and a visible
cursor work immediately. Input's actual submission seam is its `enter` event,
not the inherited textarea `onSubmit` option. Until durable Harness sessions
are composed, Enter empties the composer and states that the message was not
sent instead of fabricating agent activity.

Verification covers typing and Enter submission with the OpenTUI test renderer:

- `acryl-tui/tests-bun/renderer.test.ts`
- `corepack yarn workspace acryl-tui check`

---

## 2026-08-26 - ACRYL direct TUI CLI is executable

**Commit:** [`4b373693a76190837a43d4bfd609fd74ff2f2470`](https://github.com/acryldev/acryl/commit/4b373693a76190837a43d4bfd609fd74ff2f2470)

`acryl-tui/lib/bin.js` is now a real Bun executable rather than an inert
module export. `acryl` and `acryl tui` acquire the direct profile lease, start
the direct control host, open OpenTUI, and release the host when the renderer
closes. `acryl --json` is a short-lived scriptable ownership/status probe. The
current interactive surface explicitly reports that the Harness session runtime
is not yet connected, rather than fabricating a session or replaying terminal
scrollback.

Primary implementation and verification:

- `acryl-tui/src/bin.ts`
- `acryl-tui/src/cli/run.ts`
- `acryl-tui/tests/cli-run.spec.ts`
- `corepack yarn workspace acryl-tui check`
- `./acryl-tui/lib/bin.js --json`

---

## 2026-08-26 - Durable ACRYL agent-workspace screen added

**Commit:** [`fb6a74232089ce8c22b0f501620f366904362f06`](https://github.com/acryldev/acryl/commit/fb6a74232089ce8c22b0f501620f366904362f06)

The terminal workspace now has a real screen projection for the canonical
agent-session experience: durable session selection with new/resume controls,
composer state, transcript blocks, tool-call cards, approval prompts, and job
cards. The screen accepts only a read-only durable projection boundary and
explicitly excludes raw PTY bytes and scrollback. Harness wiring is deferred to
the later agent-integration task, where `ctx.sessions` and trajectory services
become the source for this projection rather than a second in-memory history.

Primary implementation and verification:

- `acryl-tui/src/render/screens/agent-workspace.ts`
- `acryl-tui/tests/agent-workspace.spec.ts`
- `corepack yarn workspace acryl-tui check`

---

## 2026-08-26 - ACRYL TUI status region added

**Commit:** [`0d967f8910cb4741c2e12a8c8b1f3e731a2fc671`](https://github.com/acryldev/acryl/commit/0d967f8910cb4741c2e12a8c8b1f3e731a2fc671)

The OpenTUI header now uses one stable, copyable status projection with the
active mode, owning host kind, profile, generation, selected model, and host
health. The renderer defaults the not-yet-composed model to `unavailable` and
health to `healthy`, so it never invents a model identity while the Harness
agent composition is still pending.

Primary implementation and verification:

- `acryl-tui/src/render/status.ts`
- `acryl-tui/src/render/app.ts`
- `acryl-tui/tests/status.spec.ts`
- `corepack yarn workspace acryl-tui check`

---

## 2026-08-26 - Direct ACRYL control-host boot established

**Commit:** [`e878d065795a147bef11a9a388435e82f3b6623d`](https://github.com/acryldev/acryl/commit/e878d065795a147bef11a9a388435e82f3b6623d)

The terminal host now has a direct-mode composition boundary in
`acryl-tui/src/host/direct.ts`. It creates a single Cordis context, acquires
an exclusive profile lease before starting a writable runtime, and fails closed
with `DirectHostAlreadyOwnedError` when another host owns that profile. The
composition exposes profile ownership, native runtime architecture inspection,
agent control, and a generation-scoped local control endpoint. Disposal runs
in reverse activation order, closing the endpoint and releasing the lease.

`acryl-control` now re-exports the shared Cordis runtime types used by this
consumer composition. This prevents the workspace-local Yarn dependency copies
from splitting the TypeScript Cordis identities of the host context and the
control-service classes.

Primary implementation and verification:

- `acryl-tui/src/host/direct.ts`
- `acryl-tui/tests/direct.spec.ts`
- `corepack yarn workspace acryl-control check`
- `corepack yarn workspace acryl-tui check`

---

## 2026-08-26 - ACRYL control-plane foundation services completed

**Commit:** [`f3e4567efeb9a4e230eae431e1e8f1a3ccf7772b`](https://github.com/acryldev/acryl/commit/f3e4567efeb9a4e230eae431e1e8f1a3ccf7772b)

The `acryl-control` workspace now provides the full host-neutral control plane
that the terminal, GUI, and Web peer hosts will consume. Each service is a
replaceable Cordis capability with its own contract, provider, and
lifecycle-owned resources, verified through failing-then-passing tests and
20-cycle leak checks.

Delivered in this slice (oldest to newest):

- control contracts (`cace1a2`): generation-scoped `ControlEndpoint`,
  `ControlCapability`, canonical JSON envelope with runtime validation, and
  typed `ownership`/`operations` records.
- runtime architecture projection (`d61a3ce`): a bounded
  `RuntimeArchitectureSnapshot` that reads native Cordis Fiber/service/effect
  state directly - no parallel registry - with Fiber, service, effect-depth,
  and label limits.
- plugin lifecycle control (`26e3727`): a host-neutral controller over
  `ctx.loader` with an injectable mutation policy and persistence adapter;
  enable/disable/reload receipts, protected-row rejection, settlement, and
  persistence rollback on failure.
- agent control service (`97d0e72`): a provider-neutral `acrAgentControl`
  definition with capability rejection, identity separation (worker/runtime/
  provider-session), cancellation, structured results, and truthful
  dsh-native/codex/claude/acp capability profiles whose transports are the
  Phase 8 vendor seam.
- local control protocol endpoint (`f3e4567`): a Unix-socket/loopback-HTTP
  endpoint created inside one effect, with generation negotiation, capability
  negotiation, bounded bodies, and connection/server disposal.

Primary implementation and verification:

- `acryl-control/src/{contracts,ownership,architecture,lifecycle,agent,protocol}/`
- `acryl-control/tests/*.spec.ts` (34 tests)
- `corepack yarn workspace acryl-control check`
- `corepack yarn check:layout`

---

## 2026-08-26 - Canonical `acryl` command workspace established

**Commit:** [`e12a4172ff21a36be94a29bc53b2016ba8c3f636`](https://github.com/acryldev/acryl/commit/e12a4172ff21a36be94a29bc53b2016ba8c3f636)

The `acryl-tui` workspace now owns the canonical `acryl` executable boundary.
Its strict parser defaults to the TUI, supports the approved `tui`, `gui`, and
`web` peer-host commands, accepts explicit profile selection and machine-output
mode, and rejects ambiguous aliases, duplicate options, and missing values.

OpenTUI `0.5.8` and its required tree-sitter peer are pinned in the outer Yarn
workspace. The package records the upstream runtime floor (Bun 1.3.0+ or Node
26.4.0+) without changing the Node 22/24 line used by the DSH control plane and
Electron product. Build, typecheck, test, and repository layout gates now
include both new ACRYL workspaces.

Primary implementation and verification:

- `acryl-tui/src/cli/grammar.ts`
- `acryl-tui/tests/grammar.spec.ts`
- `corepack yarn workspace acryl-tui check`
- `corepack yarn check:layout`

---

## 2026-08-26 - ACRYL profile-ownership foundation added

**Commit:** [`0b70845da4ed4ae721b2d23c20e25485fdc62eb5`](https://github.com/acryldev/acryl/commit/0b70845da4ed4ae721b2d23c20e25485fdc62eb5)

The first implementation slice of the standalone-agent milestone adds the
host-neutral `acryl-control` workspace and an atomic profile lease store. One
terminal, GUI, or Web generation can acquire a profile; simultaneous contenders
observe the complete winning lease and become attach candidates instead of
starting competing writable runtimes. Release validates the owner generation
and unpredictable nonce before withdrawing the lease.

The lock is published by atomically renaming a fully written private candidate
directory, so readers never observe a half-written record. Profile names are
hashed for state-directory isolation, records and directories use private file
modes, and the package remains on the existing DSH Node runtime line. A
100-contender race test proves exactly one winner, and focused build,
typecheck, test, and repository layout gates pass.

Primary implementation and verification:

- `acryl-control/src/ownership/lease-store.ts`
- `acryl-control/tests/ownership.spec.ts`
- `corepack yarn workspace acryl-control check`
- `corepack yarn check:layout`

---

## 2026-08-26 - Standalone ACRYL agent and peer-host architecture approved

**Commit:** [`8f9908786f1cd20c2b8df72b3c40e9fa97c14af4`](https://github.com/acryldev/acryl/commit/8f9908786f1cd20c2b8df72b3c40e9fa97c14af4)

ACRYL now has an approved product milestone for three peer host compositions:
`acryl` as the canonical command and default terminal agent, `acryl-gui` as
the Electron convenience launcher, and `acryl-web` as the Web convenience
launcher. The terminal product is a full interactive agent and operational
control surface rather than a wrapper around the existing one-shot headless
runner or an external Terminal.app shell.

The approved architecture reuses the pinned DeepSeek Harness agent spine,
durable sessions, trajectory, tools, jobs, workflows, compaction, subagents,
permissions, and existing Codex and Claude Code provider seams. ACRYL-owned
plugins supply terminal presentation, host-neutral lifecycle and architecture
control, installation, recovery, and additional interchangeable providers for
Gemini, OpenCode, and local runtimes. The upstream `deepseek-harness/`
submodule remains unmodified.

When no process owns the selected profile, `acryl` runs the Cordis composition
in-process. When the GUI or Web host already owns it, `acryl` attaches through
an authenticated local control boundary instead of starting a competing
writable runtime. A minimal bootstrap retains profile selection, ownership,
Loader startup, and recovery; independently reversible Cordis plugins own the
higher-level terminal experience.

This checkpoint records approved architecture and scope, not completed product
implementation. The milestone specification and validation are in
`specs/018-acryl-control-hosts/`.

---

## 2026-08-26 - Lean CI and release-candidate automation established

**Commit:** [`2b8636be77d0cbf649b6100adb6c3549e64881a8`](https://github.com/acryldev/acryl/commit/2b8636be77d0cbf649b6100adb6c3549e64881a8)

GitHub Actions now runs one fast Ubuntu verification job for pushes and pull
requests targeting `main`. It installs the immutable Yarn workspace, validates
repository layout and documentation invariants, typechecks, runs the complete
unit suite, and builds all shipped workspaces. Concurrency cancellation keeps
superseded branch runs from wasting time.

Expensive native packaging no longer runs on every product change. A separate
Release Candidate workflow runs only for `v*` tags or explicit manual dispatch,
verifies native packaging, and retains Windows installer/portable and unsigned
macOS smoke artifacts for seven days. It intentionally does not publish a
GitHub Release or require signing credentials during rapid development.

Primary implementation and verification:

- `.github/workflows/ci.yml`
- `.github/workflows/release-candidate.yml`
- `dsh-plugin-desktop/tests/package.spec.ts`
- `go run github.com/rhysd/actionlint/cmd/actionlint@latest .github/workflows/*.yml`
- `corepack yarn check:layout`
- `corepack yarn typecheck`
- `corepack yarn test`
- `corepack yarn build`

---

## 2026-08-26 - Product identity migrated from ACR to ACRYL

**Commit:** [`c8082fb2284b9f66aa86820b6f644948f3247676`](https://github.com/acryldev/acryl/commit/c8082fb2284b9f66aa86820b6f644948f3247676)

The independent product is now consistently named **ACRYL** across application
chrome, native menus, recovery surfaces, settings, terminal guidance, update
artifacts, package metadata, repository documentation, and specifications. The
application identity is `dev.acryl.desktop`, development state is isolated under
`.dsh-acryl` and `ACRYL Development`, and release artifact names use ACRYL.
Technical `@deepseek-ai/*`, DSH protocol, and pinned upstream identities remain
unchanged where they are dependency contracts rather than product branding.

The supplied transparent black and white ACRYL marks now drive light/dark
sidebar branding. Deterministic generation produces the application, macOS, and
tray assets from those sources, with integrity and packaging assertions in the
Desktop test suite. Repository paths and internal ACRYL-owned examples were
renamed alongside their references.

Primary implementation and verification:

- `acryl-logo.png`, `acryl-logo-white.png`
- `dsh-plugin-desktop/scripts/generate-acryl-brand.mjs`
- `dsh-plugin-desktop/src/client/acryl-brand.tsx`
- `dsh-plugin-desktop/tests/client-acryl-brand.spec.ts`
- `dsh-plugin-desktop/tests/package.spec.ts`
- `corepack yarn check`

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
argument it reloads every mounted managed ACRYL plugin and requests an orderly
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

The contract also separates Canvas tab, ACRYL worker, runtime, PTY, and opaque
provider-session identities; requires truthful capability negotiation; keeps
raw terminal text out of semantic conversation history; and compiles handoffs
from canonical ACRYL room state. All process, connection, route, listener, timer,
and adapter resources must be owned by Cordis effects and reach quiescence on
fiber disposal or replacement.

Primary design:

- `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`
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

## 2026-08-13 - DeepSeek Harness and Cordis adopted as the ACRYL substrate

**Commit:** [`9a3ce7eb0793ffad8755db76071d6e4a291fe742`](https://github.com/AgentContextRelay/acr/commit/9a3ce7eb0793ffad8755db76071d6e4a291fe742)

ACRYL adopted an unmodified, pinned DeepSeek Harness checkout as its runtime
substrate and chose Cordis as the composition and lifecycle kernel. The outer
repository became an isolated Yarn workspace containing the Desktop package,
community interoperability work, community market work, specifications, and
agent workflows. The upstream `deepseek-harness/` checkout remains a read-only
Git submodule with its own pnpm workspace.

The architectural direction established here is that ACRYL owns persistent
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
composition, capability replacement, and the boundary between persistent ACRYL
state and disposable coding-agent sessions.

This research produced the initial ACRYL orientation, Cordis specification,
architecture study, composability-paper notes, and ACRYL versus DSH gap analysis.
It established the evidence used by the later substrate-adoption decision.

Primary locations:

- `docs/onboarding/orientation_spec_acryl.md`
- `docs/cordis/cordis_spec.md`
- `docs/cordis/`
- `docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md`
