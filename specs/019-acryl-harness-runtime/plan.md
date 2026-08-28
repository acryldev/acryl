# Implementation Plan: ACRYL pi-tui Durable Session Vertical Slice

**Branch**: `main` | **Date**: 2026-08-28 | **Spec**: [spec.md](spec.md)

## Summary

Deliver one human-testable terminal feature:

```text
acryl tui [--profile <name>] [--resume <session-id>]
```

The command requests an owner-or-attach connection for one named ACRYL profile.
`acryl-harness-runtime` owns the only writable pinned DeepSeek Harness/Cordis
root when ownership is available. Otherwise the terminal attaches through
`acryl-control`. The Node pi-tui renderer receives typed session snapshots and
submits typed commands through an `AcrylSessionClient`; it never receives a
Cordis `Context`, native DSH session service, agent handle, or ownership lease.

A user can send a prompt, see durable transcript and basic status/tool
projections, exit without losing the session, and resume that exact session.
This is the complete first vertical slice. GUI, standalone Web, provider
selection, approval dialogs, session browsing, and advanced tool-card controls
remain out of scope.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node.js `^22.19.0 || >=24.0.0`

**Package manager**: Corepack PNPM 11.7.0. The outer workspace is PNPM with
`deepseek-harness/` explicitly excluded. The pinned submodule remains its own
unchanged PNPM workspace.

**Primary dependencies**: Cordis 4.0.1, pinned `@deepseek-ai/dsh-*`
0.1.1-rc.2, Vitest 4.1.8, and exact normal
`@earendil-works/pi-tui@0.80.7` dependency ownership in `acryl-tui`.

**Storage**: Existing DSH profile configuration and durable sessions. ACRYL
adds no alternate transcript or session store.

**Testing**: `corepack pnpm --filter <workspace> run test`, followed by
workspace `typecheck`, `build`, and `check` commands. Tests are run once only.

**Target Platform**: Local Node terminal on macOS, Linux, and Windows. The
existing local control endpoint is the only attachment transport. The Electron
port 43120 renderer is not a standalone Web surface and is not touched here.

## Scope and non-goals

### In scope

- Replace the superseded React Ink renderer direction in `acryl-tui` with a
  Node pi-tui presentation.
- Add a minimal control projection and command contract: snapshot, subscribe,
  submit prompt, cancel.
- Have the runtime implement that contract over native durable Harness sessions
  and the native Harness agent.
- Let `acryl tui` request owner-or-attach and render the selected session.
- Render text transcript, agent status, and compact structured tool status
  projections from the typed snapshot.
- Print a resumable session ID on terminal exit and accept `--resume`.

### Out of scope

- GUI implementation or independent Web attachment.
- Model selection, provider switching, credentials, approval/question dialogs,
  slash-command catalog, session browser, token accounting, compaction UI, and
  expandable tool-detail cards.
- Codex, Claude, ACP, OpenCode, Gemini, Pi, and local adapters.
- A second runtime, terminal-scrollback persistence, or a global/external DSH
  installation flow.

## Provenance and dependency policy

`/Users/musichen/_projects/p11_acr_agentcontextrelay/dsh-pi-tui` is a read-only
working reference, not a runtime dependency or shipped installation. Record
its URL, reviewed commit, MIT license, and adapted component list in one small
`docs/acryl/dsh-pi-tui-provenance.md` note. Do not add a `vendor/` tree,
submodule, or Pi monorepo copy.

`@earendil-works/pi-tui@0.80.7` is owned as an exact normal dependency of
`acryl-tui` through the root PNPM lockfile. Do not patch or bundle it by
default. A future defect may justify a root PNPM patched dependency only with a
separate decision, test, and provenance update.

## Minimal control contract

`acryl-control` owns public types and the local client. The runtime owns the
server-side implementation. The renderer consumes only this interface:

```ts
interface AcrylSessionClient {
  snapshot(sessionId: string): Promise<AcrylSessionSnapshot>
  subscribe(
    sessionId: string,
    listener: (snapshot: AcrylSessionSnapshot) => void,
  ): Promise<{ dispose(): Promise<void> }>
  submitPrompt(input: {
    sessionId: string
    text: string
    clientCommandId: string
  }): Promise<void>
  cancel(input: { sessionId: string }): Promise<void>
}

interface AcrylSessionSnapshot {
  profile: string
  generationId: string
  attachment: 'owner' | 'attached'
  sessionId: string
  agentStatus: 'idle' | 'running' | 'waiting' | 'failed'
  transcript: readonly AcrylTranscriptItem[]
  tools: readonly AcrylToolProjection[]
}
```

`AcrylTranscriptItem` contains only stable durable message identity, author,
and renderable content blocks. `AcrylToolProjection` contains a call identity,
name, and compact lifecycle status. The protocol transports snapshots and
commands, never DSH objects, callbacks, credentials, or raw terminal bytes.

## Direct DSH binding replacement

The reference TUI reads `ctx.agents`, `ctx.sessions`, `ctx.commands`,
`ctx.tools`, and DSH session events directly. In ACRYL:

| Reference behavior | First-slice ACRYL boundary |
|---|---|
| session event replay | `AcrylSessionClient.snapshot()` and `subscribe()` |
| prompt command execution | `submitPrompt()` |
| turn cancellation | `cancel()` |
| agent running state | `snapshot.agentStatus` |
| tool call/result display | `snapshot.tools` |
| profile/session startup and resume | launcher request to runtime, then an `AcrylSessionClient` |

The first port copies only renderer logic necessary to display transcript,
composer, status, and compact tool state. It does not port reference Cordis
plugins, startup parsing, direct agent/session access, model selector,
questions, or resume process replacement.

## Cordis mini-design

### Capability and plugin boundary

`acryl-harness-runtime` is the only owner of profile preparation, DSH root
boot, native session/agent handles, durable event projection, and shutdown.
`acryl-control` owns the transport-neutral contracts, local endpoint, and
client. `acryl-tui` owns only pi-tui process-terminal and renderer lifecycle.

### Provides and consumes

The runtime provides the minimal session projection/command implementation and
mounts it into the existing `acryl-control` protocol. It consumes native
Harness `sessions`, `agents`, and their durable event services through the one
root. The TUI consumes `AcrylSessionClient` only.

### Effects and disposal

The runtime effect owns native agent handles, subscription registration, and
endpoint publication; shutdown disposes subscriptions and agent handles before
the root, then removes endpoint and lease metadata. A TUI process disposing
its renderer only closes its client subscription. If it was the owner, its
launcher then asks the runtime to perform the ordered owner shutdown. An
attached TUI cannot dispose the root.

### Configuration and composition

Profile composition continues to use the pinned Harness profile and user patch
layers. No TUI Loader row or TUI configuration is added. The current HMR launch
rule remains unchanged. Runtime routes and session identity are selected by the
existing profile configuration, not a TUI setting.

### Events and durability

Native DSH durable session events are the transcript and tool-projection
source. The runtime emits a monotonically ordered control snapshot when the
projection changes. The subscription notification is ephemeral; a reconnect
rebuilds from durable records. Prompt commands are explicitly accepted by the
runtime before agent work begins.

### Verification

Tests prove native prompt dispatch becomes durable transcript state, snapshot
replay matches that state, cancellation reaches the native handle, owner and
attached clients use the same client contract, and renderer disposal leaves no
terminal listener. A local human smoke proves prompt, response, exit, and
resume through `acryl tui`.

## Owner-or-attach flow

```text
acryl tui --profile P [--resume S]
  -> acryl-tui asks acryl-harness-runtime for P owner-or-attach
  -> runtime/control acquire or observe P lease
  -> owner: boot one root, mount control server, choose new or resumed S
  -> attached: authenticate to current control endpoint and choose S
  -> both paths return AcrylSessionClient + selected session identity
  -> pi-tui renders snapshots and sends only typed commands
```

TUI does not decide lease ownership, boot a root, or access DSH services. A
future GUI or Web client uses this same `AcrylSessionClient` contract and the
same `profile`, `generationId`, and `sessionId`; this slice proves that with one
generic second-client contract test, not GUI/Web implementations.

## Delivery tasks

1. Add the small `acryl-control` session contract and local client validation.
2. Implement the runtime-owned native DSH session projection, prompt dispatch,
   cancellation, owner-or-attach result, and ordered cleanup.
3. Add exact pi-tui dependency ownership and the provenance note.
4. Replace the Ink mount with a minimal pi-tui transcript/composer renderer
   using only `AcrylSessionClient`.
5. Extend CLI grammar with `--resume`, request owner-or-attach, and print the
   resumable session identity at controlled exit.
6. Run focused tests and one human local smoke. Stop here.

## Human acceptance

With an already-authenticated ACRYL Harness profile:

```bash
corepack pnpm --filter acryl-tui run build
node acryl-tui/lib/bin.js tui --profile <profile>
```

Type a prompt. Observe a native provider response, agent status, and any
compact tool projection. Exit, copy the printed session ID, then run:

```bash
node acryl-tui/lib/bin.js tui --profile <profile> --resume <session-id>
```

The earlier transcript must render and the next prompt must continue the same
durable session.
