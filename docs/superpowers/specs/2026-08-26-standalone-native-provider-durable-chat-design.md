# Standalone Native-Provider Durable Chat - Vertical Slice Design

## Goal

Make the standalone `acryl` terminal host useful to a human in one complete
flow:

```text
start ACRYL -> type a prompt -> native configured Harness route responds
-> response is visible -> session records the exchange durably
```

This is the first delivery slice for `specs/019-acryl-harness-runtime`. It
ends only when a human can run it and verify the result.

## Scope

Included:

- `acryl tui --profile <name>` starts one normal pinned Harness profile without
  Electron.
- The owner terminal creates one new durable Harness session.
- Ink composer input dispatches through a runtime-owned native Harness message
  port.
- The configured provider route already present in that Harness profile is used
  to create and run a native agent.
- The terminal shows the submitted message, running/error state, and final
  assistant response.
- Restarting or opening the selected session projects the durable exchange.

Excluded:

- Provider picker or switching UI.
- Claude Code, Codex, OpenCode, Pi, ACP, or terminal-process adapters.
- ACRYL-managed OAuth, API keys, credentials, or secret copying.
- Desktop attachment, local-control credentials, multi-surface leases, and Web.
- Streaming-token rendering if the pinned agent API does not expose an existing
  safe projection seam. Final-response rendering is the minimum accepted
  behavior for this slice.

## Existing seam and minimal design

The existing Ink app accepts input and already has a `DurableSessionMessagePort`
interface. It currently only records `Dispatch pending`; `createAcrylRenderer`
does not pass `sessionId` or `messagePort`; the runtime does not implement the
port.

Use the existing seam rather than inventing a new protocol:

1. `acryl-harness-runtime` creates one Harness session with `ctx.sessions`.
2. Its runtime-owned message port validates non-empty text and dispatches it to
   an agent handle created through `ctx.agents` using the selected profile's
   normal provider/model route.
3. The port derives submitted and assistant response projections from the
   durable Harness session. It returns a typed result or a non-secret error.
4. `acryl-tui/src/host/direct.ts` receives the session identity and port from
   the runtime handle.
5. `acryl-tui/src/render/app.tsx` forwards both values into `AcrylInkApp`.
6. `AcrylInkApp` renders the current durable transcript and failure state. It
   does not own session persistence, agent lifecycle, or credentials.

The runtime handle owns the agent handle and disposes it before its Cordis root
is disposed. The user profile owns model-route configuration and provider
authentication. A missing route or expired provider login is shown as guidance,
not handled by ACRYL credential code.

## Files

```text
acryl-harness-runtime/src/durable-message.ts     # extend result/projection contract
acryl-harness-runtime/src/native-agent.ts        # runtime-owned native message port
acryl-harness-runtime/src/index.ts               # create session and expose the handle
acryl-harness-runtime/tests/native-agent.spec.ts # real Harness-facing RED/GREEN tests

acryl-tui/src/host/direct.ts                      # obtain selected session and port
acryl-tui/src/render/app.tsx                      # forward them to Ink
acryl-tui/src/render/ink-app.tsx                  # render durable transcript/results
acryl-tui/tests/ink-app.spec.tsx                  # human-visible projection behavior
acryl-tui/tests/direct.spec.ts                    # owner-host durable session integration
```

No new package, provider abstraction, storage format, setting, or dependency is
needed.

## Error and lifecycle behavior

- Empty input does nothing.
- A missing configured native route presents a non-secret actionable status;
  it never reports fake readiness or a fabricated response.
- An agent failure records an error projection without deleting the durable
  submitted message.
- Closing the TUI disposes its agent handle, then its runtime root. It does not
  delete durable session history.
- Session history comes only from Harness durable state, never terminal
  scrollback.

## Tests and human acceptance

RED-GREEN tests must prove:

1. A runtime-created session is durable and the message port associates a
   dispatch with that session.
2. The port invokes the native Harness agent seam, not a terminal adapter or
   mock provider in production code.
3. The renderer receives the actual `sessionId` and port.
4. Ink visibly renders user input, final assistant output, and an actionable
   non-secret failure.
5. Existing runtime boot and disposal tests remain green.

Human acceptance after implementation:

```bash
acryl tui --profile <already-authenticated-profile>
```

Type `Hello`, press Enter, and observe a real response. Reopen the session
through the delivered session-opening command or host action and verify both
messages are visible. A real provider call is optional only in automated tests;
it is mandatory for the human acceptance check on a profile the user has
already authenticated.

## Decision

Implement this one end-to-end slice before any attachment, provider-adapter, or
Desktop work. If the pinned Harness agent contract cannot produce a final
response through the existing profile route, stop and revise this design rather
than introducing a parallel agent loop.
