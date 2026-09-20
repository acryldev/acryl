# System prompt: where it comes from, how to change it, and the current copy

For development. The model's system prompt is not one file: it is assembled at the start of each turn from sections that different
packages contribute, ordered by a numeric `order`. This folder tells you where each part lives, how to change it, and holds a generated
copy of what the model actually receives.

## Current copy (generated, jump straight to it)

- [Web and Desktop, standard preset](current/web.md): system prompt text and tool list.
- [CLI (terminal engine)](current/cli.md): system prompt text and tool list.

Regenerate after any change (the copy is captured from the real engine, so it cannot drift):

```bash
ACRYL_DUMP_SYSTEM_PROMPT=docs/system-prompt/current \
  corepack pnpm --filter acryl-harness-runtime exec vitest run tests/dump-system-prompt.spec.ts
```

The generator is [`tests/dump-system-prompt.spec.ts`](../../runtime/acryl-harness-runtime/tests/dump-system-prompt.spec.ts) (opt-in, no model
call succeeds, a dummy key is used; temp paths are scrubbed). Desktop uses the same runtime and the same client as Web, so it shares the Web copy.

## How the prompt is assembled

1. **Sections.** Plugins call `ctx.systemPrompt.section({ name, order, text })`. Lower `order` comes first. The registry, the built-in order
   table (`HARNESS_IDENTITY -1000`, `DEPLOYMENT_PERSONA_PREFIX 0`, `TOOL_BASH 1000`, `TOOL_READ 1100`, ..., and the ACRYL router at `9500`) and the
   identity line live in
   [`deepseek-harness/packages/core/system-prompt/src/index.ts`](../../deepseek-harness/packages/core/system-prompt/src/index.ts).
   Reference: [`deepseek-harness/docs/subsystems/system-prompt.md`](../../deepseek-harness/docs/subsystems/system-prompt.md).
2. **Persona.** Identity and working-directory lines come from the persona row of the agent preset:
   [`presets/standard/agent.cordis.yml`](../../deepseek-harness/packages/preset/agent-presets/presets/standard/agent.cordis.yml) (`prefix`, `suffix`,
   with `{{model}}` and `{{cwd}}`); the row is [`dsh-persona`](../../deepseek-harness/packages/preset/persona/src/index.ts).
3. **Tool guidance.** Each tool package contributes its own "Use the read tool..." paragraph at its own `order` (`dsh-tool-*` packages under
   [`deepseek-harness/packages`](../../deepseek-harness/packages)); the tool definitions (name, description, parameters) follow the prompt as the
   tool list.
4. **Workspace instructions.** `AGENTS.md` / `CLAUDE.md` from the workspace and the user-global `AGENTS.md` are appended by
   [`dsh-agent-instructions`](../../deepseek-harness/packages/context/agent-instructions/src/index.ts) (size limit `maxBytes`, set in the preset).
5. **Runtime context.** A separate "Current runtime context" message (file policy, cwd, and so on) is sent as a user message by
   [`runtime-context.ts`](../../deepseek-harness/packages/core/agent-loop/src/runtime-context.ts), not as part of the system prompt.
6. **Skills.** The skill list (name and description only; bodies load on demand through the `skill` tool) is contributed by the skills service;
   the extension pack's skills come from
   [`plugins/acryl-extension-context/lib/skills.js`](../../plugins/acryl-extension-context/lib/skills.js).
7. **ACRYL extension router (self-extension).** The section that tells the agent it can extend ACRYL, where the docs and examples are, and which
   tools install, verify, list, remove and prepare-publish an extension. Text:
   [`plugins/acryl-extension-context/lib/router.js`](../../plugins/acryl-extension-context/lib/router.js); the topic map is generated from
   [`docs/docs.json`](../../plugins/acryl-extension-context/docs/docs.json); registered by
   [`plugins/acryl-extension-context/index.js`](../../plugins/acryl-extension-context/index.js) (`order 9500`, name `acryl:extension-router`).

## How to change it

| I want to change | Edit | Notes |
| --- | --- | --- |
| The self-extension instructions (router) | [`router.js`](../../plugins/acryl-extension-context/lib/router.js) | Must stay under the token budget (1500, enforced by `scripts/plugin.test.mjs`). Static text is cached across turns: keep it stable; put dynamic facts in `PromptContext`. |
| Which docs the router lists | [`docs.json`](../../plugins/acryl-extension-context/docs/docs.json), then `node scripts/build-manifest.mjs` in the pack | The topic list is generated from the manifest; `reference.*` docs are intentionally omitted from it. |
| A skill's wording | `plugins/acryl-extension-context/skills/<name>/SKILL.md` | Name and description are what sits in context; the body loads on demand. |
| The identity or working-directory line | the persona row in the preset [`agent.cordis.yml`](../../deepseek-harness/packages/preset/agent-presets/presets/standard/agent.cordis.yml) | It is in the read-only harness submodule: change it through a user preset or a Loader patch, never by editing `deepseek-harness/` (constitution III). A user preset lives in `<dshHome>/.agent-presets/<id>/`. |
| Per-project or per-user standing instructions | `AGENTS.md` or `CLAUDE.md` in the workspace, or `<dshHome>/AGENTS.md` | Loaded by agent-instructions; no code change; good for "you can extend ACRYL yourself, offer it when a feature is missing". |
| A new prompt section from a plugin | `ctx.systemPrompt.section({ name, order, text })` | See [`extending/prompt-contribution.md`](../../plugins/acryl-extension-context/docs/extending/prompt-contribution.md). Use an order that places it where you want; the router uses `9500` (last). |
| Tool guidance or tool descriptions | the tool's package (`dsh-tool-*`) | Upstream for harness tools; for a tool you write, its `description` and its section. |

Known: the identity line still reads "You are an AI agent powered by DeepSeek Harness." because it is the harness's unconditional opener
(`includeHarnessIdentity`), not an ACRYL section. Changing it needs a supported switch upstream or a preset persona that shadows the prefix.

## Tune it with evidence

Change the text, regenerate the copy above, then re-run the same prompts against a real model and compare the tool calls and results:

```bash
ACRYL_E2E_PROMPTS='build a kanban with a top-bar button||change its colors||remove it' \
ACRYL_E2E_KEY_FILE=~/.secure-storage/llmproviders/deepseek/deepseek.json ACRYL_E2E_LOG=/tmp/e2e.jsonl \
  corepack pnpm --filter acryl-harness-runtime exec vitest run tests/e2e-real-model.spec.ts
```

([`e2e-real-model.spec.ts`](../../runtime/acryl-harness-runtime/tests/e2e-real-model.spec.ts); `ACRYL_E2E_ENGINE=tui` runs the terminal engine.) Judge
by behavior: did it load the skill, read the routed docs and the nearest example, verify, install, and report the status, without over-reading.
