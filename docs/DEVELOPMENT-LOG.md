## 2026-08-29 - M1 pi-tui terminal surface: runtime seam and Tomo port foundation

The M1 terminal milestone moved from the re-scoped runtime contract into code.
The ACRYL runtime now has a durable-session event seam and a coding-agent
profile composition, and `acryl-tui` carries Tomo's real presentation and
editor/input code rather than a re-authored renderer.

- `33439ec` (full `33439ec88c3e4c1f575b9e4d905bb2f01a2b3242`) — session bridge:
  `AcrylSessionBridge.subscribeEvents` streams incremental durable `SessionEvent`
  records (the streaming seam the terminal needs), and `dispose()` waits idle and
  `sessions.flush`es before releasing native handles so durable resume survives
  a clean exit. RED test first.
- `67bbaca` (full `67bbaca72db3af50d32238eec0f6358affcd3866`) — `bootAcrylHarnessProfile` composes the
  coding-agent rows dsh-base does not mount (`system-prompt` persona,
  `agent-presets` default `standard`, `session-stats`) as runtime-owned rows.
- `0b0cba5` (full `0b0cba5b5ccc5e78c0d127ab7d051005afde6e6b`) — ported Tomo presentation core into `acryl-tui`
  verbatim (`store.ts`, `render.ts`, `markdown.ts`, `sessionId.ts`,
  `tui/{theme,piTheme,text,liveText,Spinner,bannerText,statsFormat}` and the
  overlay type modules) with their vitest suites, renamed to the repo `.spec`
  convention, plus exact `@earendil-works/pi-tui@0.84.2` and `diff` deps.
  Type accommoda tions: `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`
  relaxed to Tomo's baseline in `acryl-tui`; compaction `SessionEvent`
  augmentation imported.
- `ecefaf4` (full `ecefaf4bcc5267ca42cf16e70f7ef2886642313a`) — ported Tomo input/editor chain
  (`CustomEditor`, `promptAutocomplete`, `commands`, `fileMention`, `fileIndex`,
  `miniTextField`, `actions`) + command/file-mention tests.

Source/verification: `specs/019-acryl-harness-runtime/` (re-scoped),
`acryl-harness-runtime/src/session-bridge.ts`, `acryl-harness-runtime/src/index.ts`,
`acryl-tui/src/{render,markdown,sessionId}.ts`, `acryl-tui/src/tui/*`, and their
tests. Upstream provenance: `docs/acryl/tomowang-dsh-tui-provenance.md`.

Next parity gap (not yet wired): TuiApp application shell + overlays, the ACRYL
host adapter over the bridge, Ink removal, and the TTY smoke — then approvals,
questions, overlays, model/preset controls, prompt history.
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

## 2026-08-28 - One runtime, many surface adapters selected

Commit: `1549539f1c2d78e498fd42567c4f5d840ff9130a`

ACRYL now implements coding-agent behavior once in its DeepSeek Harness/Cordis runtime. TUI, Electron, and Web invoke the same typed capabilities through direct, existing IPC/API, and existing HTTP/WebSocket adapters. Durable DSH sessions provide continuity across launches. A detached control daemon and cross-process attachment protocol are deferred until a real simultaneous-live-surface requirement exists.

Primary record: `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`. This decision supersedes the cross-process ownership sections of Spec 019.

## 2026-08-28 - Unused ownership and endpoint modules removed

Commit: `89a2de16848bc5ffe79f0901356385e410f27c9e`

The remaining speculative ownership, lease, local endpoint, attachment, and polling modules and their tests were deleted. The runtime retains its native durable-session bridge and normal profile boot path; control keeps only surface-neutral contracts still used today.

Verification: control (22 tests), runtime (9 tests), and TUI (20 tests) package checks.

## 2026-08-28 - P001 ownership experiment deliberately removed

Commit: `3285a7f182f1b8780f22c7947067d01844bda79f`
Reverted commit: `99af4c14871caa3e7fca1bddf4e3638c5953f7d8`

Under the one-runtime/many-surfaces decision, each launched surface now starts its ordinary local Harness/Cordis runtime. Durable DSH sessions, rather than control records, leases, sockets, or owner discovery, provide continuity across later launches. The direct TUI bootstrap ignores stale `.acryl/control` experiment state.

Primary sources: `acryl-tui/src/host/direct.ts` and `acryl-tui/tests/direct.spec.ts`. Verification: control, runtime, and TUI package checks.

## 2026-08-28 - Profile ownership and active-control protections added

Commit: `99af4c14871caa3e7fca1bddf4e3638c5953f7d8`

P001 adds guarded profile-lease recovery and an explicit server-side active-control authority, then routes session mutation through that authority. The legacy TUI host no longer owns direct Harness boot. This remains a local-process baseline; cross-process discovery and attachment orchestration require further independent review.

Primary sources: `acryl-control/src/ownership/active-control.ts`, `acryl-control/src/ownership/lease-store.ts`, `acryl-harness-runtime/src/session-control-endpoint.ts`, and `acryl-tui/src/host/direct.ts`. Verification: package checks and ownership/control tests.

## 2026-08-28 - Full pi-tui terminal baseline selected

Commit: `00b2da5f2bf519f0eca154b77fb5e6f4704df51d`

ACRYL now adopts the MIT-licensed `tomowang/dsh-tui` upstream snapshot `f7663341f604c3ad96e9b2b838a7ca2de8e84fd1` as its complete terminal behavior reference. Its pi-tui component and feature inventory replaces the earlier minimal `dsh-pi-tui` direction. ACRYL will preserve this terminal experience through `acryl-control` projections rather than shipping the upstream direct-Cordis bundle, so every surface continues to share one runtime and durable session authority.

Primary record: `docs/ACRYL-ROADMAP.md`. The upstream snapshot is `@tomowang/dsh-tui` 0.7.0 using pi-tui 0.84.2. No source integration has started.

## 2026-08-28 - Session endpoint polling lifecycle completed

Commit: `00b77eaf09adfd05b994a34555bda6124ad34815`

The temporary local endpoint subscription transport now performs one snapshot request at a time, schedules a later poll only after that request settles, and stops cleanly after disposal or a terminal endpoint error. Socket close, error, and request timeout now settle every client request. Integration coverage proves endpoint cancellation reaches a native aborted turn, fresh clients replay durable assistant messages, and disposed subscriptions do not receive later session events.

Primary sources: `acryl-control/src/protocol/endpoint-client.ts`, `acryl-control/tests/endpoint-client.spec.ts`, and `acryl-control/tests/session-control.integration.spec.ts`. Verification: `corepack pnpm --filter acryl-control run check` (51 tests) and `corepack pnpm --filter acryl-harness-runtime run check` (13 tests).

## 2026-08-28 - Local session endpoint capability and readiness correction

Commit: `0cb802aa978bc8fe8c6acf826837ee189d5758d4`

The local session endpoint now authorizes requests with endpoint-scoped random capabilities held only by the live runtime, rather than trusting caller-selected attachment mode. It waits for Unix socket readiness, reports bounded polling failures through `onError` and `whenError()`, and accepts prompts once their durable user event is committed without treating the model turn as complete. The control package test command now builds the runtime artifact first, making this artifact-plane integration test reproducible.

Primary sources: `acryl-harness-runtime/src/session-control-endpoint.ts`, `acryl-control/src/protocol/endpoint-client.ts`, and `acryl-control/tests/session-control.integration.spec.ts`. Verification: both package checks.

## 2026-08-28 - Native sessions exposed through the local control endpoint

Commit: `9a42d1da810db7c43dd907c1b3c7e3960adf0bc1`

The owner runtime now mounts its native durable session bridge behind the existing local control protocol. Endpoint clients exchange only session DTOs: snapshots, subscription polling, prompt commands, and cancellation. Fresh connections replay durable session state, attached clients remain read-only, and owner shutdown disposes the endpoint before native bridge and Harness root resources.

Primary sources: `acryl-harness-runtime/src/session-control-endpoint.ts`, `acryl-harness-runtime/src/owner-or-attach.ts`, and `acryl-control/src/protocol/endpoint-client.ts`. Verification: `acryl-control/tests/session-control.integration.spec.ts`, `corepack pnpm --filter acryl-control run check`, and `corepack pnpm --filter acryl-harness-runtime run check`.

## 2026-08-28 - Native session bridge and ownership hardening

Commit: `adff40026abd6c773cba63e315f5e31412e8f39b`

The native session bridge now proves durable transcript replay across a real resume, projects durable assistant and tool facts, forwards an active-turn cancellation, and releases subscriptions deterministically. Profile ownership is reserved before boot, remains reserved through ordered shutdown, carries a unique generation ID, and gives attached clients read-only session access. The bridge refuses a second active native session rather than leaking an additional agent handle.

Primary sources: `acryl-harness-runtime/src/session-bridge.ts` and `acryl-harness-runtime/src/owner-or-attach.ts`. Verification: `acryl-harness-runtime/tests/session-bridge.spec.ts`, `acryl-harness-runtime/tests/owner-or-attach.spec.ts`, and `corepack pnpm --filter acryl-harness-runtime run check`.

## 2026-08-28 - Single-root session owner-or-attach established

Commit: `218f28f615662fdd98b924c7182ec586ec96016b`

The runtime now has one owner-or-attach entry point for a profile. The first caller boots the native Harness root and selects a durable session; subsequent in-process callers receive an attached, projection-only client for that same root and session. Failed startup disposes the attempted bridge and root before later ownership can proceed. The remote control-endpoint path remains the next task.

Primary sources: `acryl-harness-runtime/src/owner-or-attach.ts` and `acryl-harness-runtime/tests/owner-or-attach.spec.ts`. Verification: `corepack pnpm --filter acryl-harness-runtime run check`.

## 2026-08-28 - Native durable Harness session bridge added

Commit: `35a166708bd69266377b84f1c2c15a8e4ab910fc`

`acryl-harness-runtime` now owns a small bridge that creates or resumes one pinned-Harness agent/session, derives its initial transcript and compact tool state from durable session events, and routes submitted prompts and cancellation to that native agent. It adds no alternate transcript store or presentation-layer access to Cordis or DSH objects.

Primary sources: `acryl-harness-runtime/src/session-bridge.ts` and `acryl-harness-runtime/src/index.ts`. Verification: `acryl-harness-runtime/tests/session-bridge.spec.ts`, `corepack pnpm --filter acryl-harness-runtime run typecheck`, and focused runtime tests.

## 2026-08-28 - Outer ACRYL workspace migrated to PNPM

Commit: `26aa4f872132757e2f890de34fe26e5b8a64f73b`

The ACRYL-owned workspace now uses Corepack PNPM 11.7.0 with a committed lockfile, translated dependency patches, explicit native-build permissions, and macOS architecture policy. The pinned `deepseek-harness/` submodule remains a separate, read-only PNPM workspace at `b150a551b8`; it is not included in the outer dependency graph.

The migration passed frozen installation, layout and architecture gates, typecheck, 1,144 tests, production build, and packaged macOS arm64 Electron smoke. Manual testing confirmed Electron chat, model responses, the advanced embedded renderer, and Development Canvas lifecycle controls. The bare embedded server URL is not a standalone Web surface and is deferred to the planned owner-or-attach `acryl-web` runtime.

Primary sources: `pnpm-workspace.yaml`, `.npmrc`, and `specs/020-pnpm-outer-workspace-migration/`. Verification: `specs/020-pnpm-outer-workspace-migration/evidence/verification.md`.

## 2026-08-27 - pi-tui selected as the ACRYL terminal surface

Commit: `ff9d4f1352538676ff969bf5451979a9fcf3d329`

ACRYL replaces the earlier React Ink direction with the working Node-based
`dsh-pi-tui` implementation. The terminal renderer remains a peer surface: it
projects durable Harness records and sends commands through `acryl-control`.
It must start or attach to the one profile runtime rather than create a second
Cordis root. This keeps the same agent controllable from pi-tui, Electron, and
Web.

Primary document: `docs/ACRYL-ROADMAP.md`.

## 2026-08-26 - First human-testable ACRYL vertical slice approved

Commit: `befa8cdfda3a51e8d0a0f9220d77bb1651591ea3`

The next work is constrained to one complete standalone feature: an
already-authenticated native Harness profile accepts an ACRYL terminal prompt,
returns a real provider response, and retains the exchange as durable Harness
session state. Provider switching, third-party agent adapters, multi-surface
attachment, and Desktop work are explicitly deferred until this human-testable
slice is finished.

## 2026-08-26 - Shared Harness runtime delivery ledger generated

Commit: `786a13ed1baf47c9863fa8eebb637217b0176050`

The 019 ledger now has 21 dependency-ordered, acceptance-driven tasks. The
first MVP slice is a Terminal-only one-root runtime that creates a fresh
durable Harness session without Electron. Multi-surface authenticated attach
and exclusive active control follow as a separate verified increment.

## 2026-08-26 - Shared Harness runtime design completed

Commit: `522c964853d74ed0fb1425e30b248f8c1a121530`

The 019 Spec Kit design now defines a host-neutral runtime as the sole owner of
pinned Harness profile boot, durable sessions, native agents, local attachment,
and ordered shutdown. It records the profile-generation, attachment, and
active-control lease model, a local control contract, dependency-closure
strategy, and headless walking-skeleton acceptance procedure.

## 2026-08-26 - Shared runtime control and authentication model clarified

Commit: `9c0c36bbcd2cffa2fd44d4d586107f38a2aad85c`

The ACRYL shared Harness runtime specification now requires compatible surfaces
to attach to one healthy profile owner rather than start competing writable
runtimes. Attachment uses an owner-issued local capability credential and
operating-system local endpoint permissions. Provider authentication remains
owned by provider-managed Harness profiles or CLIs, with no ACRYL secret
extraction or storage. Concurrent surfaces observe live state, while one
explicit active-control lease serializes agent actions and is automatically
released on disconnect, process death, or channel expiry.

## 2026-08-26 - Reusable agent engineering methodology established

Commit: `8d08cf7057c500cd562e2784d04280dafed72cb2`

A standalone methodology now records the repository-independent workflow for
GitHub Spec Kit, spec-driven tasks, Superpowers TDD/debugging/verification,
Cordis-style ownership, Ponytail minimalism, vertical slices, focused commits,
and durable evidence. It defines the roadmap and specification ledger as the
project's durable navigation and delivery records.

Primary document:
`docs/workmethodology/acryl-agent-co-developed-hybrid-engineering-methodology-github-spec-kit-matt-pocock-spec-driven-delivery-superpowers-tdd-debug-verification-cordis-lifecycle-architecture-ponytail-minimalism-vertical-slice-roadmap-ledger-execution.md`.

## 2026-08-26 - Durable Harness message dispatch has an explicit boundary

Commit: `25a6228cfc5107366d32b90269650ed1ff043a11`

`acryl-harness-runtime` now exports the typed durable-session message port and
receipt contract. React Ink can receive this port and submit identified
composer text through it, without creating an agent or persisting alternate
history in the presentation layer. A runtime implementation of the port is the
next slice.

Primary sources: `acryl-harness-runtime/src/durable-message.ts` and
`acryl-tui/src/render/ink-app.tsx`. Verification: runtime and TUI workspace
checks, including 22 TUI tests.

## 2026-08-26 - Ink terminal composer has an interactive state loop

Commit: `53c518126fadf89875ac22272de2923c24ed3d0f`

The Ink terminal now accepts typed text, supports deletion, and records an
explicit dispatch-pending message when Enter is pressed. This is intentionally
local presentation state only; the following slice replaces the pending marker
with a durable Harness session dispatch.

Primary source: `acryl-tui/src/render/ink-app.tsx`. Verification: 21 TUI tests,
typecheck, and build.

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
