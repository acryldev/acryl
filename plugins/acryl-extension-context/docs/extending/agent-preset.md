# Agent presets and personas

Use this to give sessions a different composition (tools, prompt sections, skills) or a different identity:
a read-only reviewer, a minimal two-tool agent, a domain specialist.

Example (a directory, not an npm package): `../examples/packages/agent-preset-reviewer/`.

## What a preset is

A directory `<id>/` with:

- `agent.cordis.yml`: a list of Loader rows naming the plugins this preset's sessions run, with their config.
  The `@deepseek-ai/dsh-persona` row sets the identity: `prefix` is the system prompt text, `complete: true`
  makes it the WHOLE prompt (nothing else is added), `includeRuntimeContext: false` drops the runtime snapshot.
- `preset.yml`: `name`, `description`, `order` (display).

The picker reads presets from the shipped root and from `<dshHome>/.agent-presets/<id>/` (the `user` root; `<id>`
must match `[a-z0-9][a-z0-9-]*`). A preset that cannot load is listed with the reason, not hidden.

## Rules

- **Start from a copy**: the shipped presets (`minimal`, `standard`, `ptc`, `cordis`) are the working reference.
  Authoring in the product is copy-then-edit; a copy never grants more than its source listed.
- A preset grants the capabilities of the plugins it names: treat it as trusted configuration and keep the plugin
  list minimal (a reviewer persona should not list write tools).
- A running session keeps its preset; only a session with no messages can switch. Tell the user to start a new
  session to try it.
- A subagent joins its parent's composition.
- The default preset is a setting (`agent-presets.default`), applied to sessions created afterwards.

## Verification status

The example's structure is copied from the shipped `minimal` preset, but the pack tests do not boot a session on
it. After writing one, ask the user to open the preset picker, start a new session on it and confirm the persona.

Details: `reference/subsystems/subagent.md`, `reference/subsystems/agent-team.md`,
`reference/subsystems/permission-presets.md`, `reference/harness/agent-lifecycle.md`.
