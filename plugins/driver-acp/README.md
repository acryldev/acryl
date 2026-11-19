# driver-acp

Any agent that speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP) as a chat in the agent panel (M8, spec 046 T028).
The agent runs in the app folder and acts through the door, as the panel's other agents do. An agent needs no code here: it is a preset,
the command line that starts its ACP server. DeepSeek Harness is the first one, and other ACP agents are added by config.

```yaml
- id: agent-panel
  name: agent-panel
- id: driver-acp
  name: driver-acp
  config:
    agents:                      # replaces the presets; default: the presets whose command is on the PATH
      dsh: { command: dsh, args: [--profile, acp] }
    permissions: reject          # or allow: the answer to the agent's permission requests
```

The row goes after the panel's, injects `drivers` and `appInstance`, and stays PENDING without the panel. Each agent becomes the
panel driver `acp:<name>`. An agent whose command is not on the PATH gets no driver, and the plugin logs one line saying why. With
`NODE_ENV=production` or `ACRYL_DOOR=off` the plugin starts nothing.

## How it talks

ACP v1 over the agent's stdin and stdout, as newline-delimited JSON-RPC 2.0 (`connection.ts`). At the first message the driver starts the
agent, sends `initialize` and `session/new` with the app folder as `cwd`, and keeps that session, so later messages continue the
conversation. Each message is one `session/prompt`. Stop sends `session/cancel`. The client offers no file system or terminal
capabilities, so the agent uses its own tools. A `session/request_permission` gets the agent's own "reject once" option, or "allow once"
with `permissions: allow`.

What the panel shows (`chat.ts`):

- each `agent_message_chunk` as text;
- each tool call once, when it completes or fails: its title, its input, and its result or error;
- an error when a turn stops short (`refusal`, `max_tokens`, `max_turn_requests`) or the agent ends.

Thoughts and plans stay out of the chat.

## Processes

Every agent process is started inside one `ctx.effect`. Its disposer closes the agent's stdin, then sends SIGTERM, then kills it (the
whole process tree on Windows), and waits until it is gone. Unloading or reloading the plugin leaves no agent running. An agent that ended
on its own is started again, with a new session, at the next message.

## Provenance

The client is written from the ACP v1 specification, not ported from an SDK: the official SDK (`@agentclientprotocol/sdk`) is 8 MB with
two required peers, too much for a plugin copied into every app. To keep it honest, `test/conformance.test.ts` checks every message of a
session, sent and received, against the official ACP v1 JSON schema. The schema is vendored unmodified in `test/acp-v1/` with its Apache-2.0
license. It comes from `@agentclientprotocol/sdk@2.0.2` (`schema/v1/schema.json`); the version, source and checksum are in
`provenance.json`. To follow a newer schema, replace the file, update `provenance.json`, and run the test.

Checked live: `node scripts/verify-agent-panel.mjs --driver acp:dsh` (dsh on the PATH, a DeepSeek key) builds `/hello` from the panel
through `dsh --profile acp`.
