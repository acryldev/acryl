# ACRYL extension docs

<!-- Generated from docs.json by scripts/build-manifest.mjs. Do not edit here. -->

Read the file for your topic BEFORE implementing. Read it completely, follow its
cross-references and the example it names. Do not guess from memory of a similar
plugin. Verified working examples: `../examples/README.md`.

## Start here

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [This runtime: how ACRYL plugins are built, loaded and delivered](start-here/this-runtime.md) | Always first: the layers, the plugin and package contracts, and the two delivery paths. | tui web desktop | all |
| [Verify before you say it works](start-here/verify-before-done.md) | Before claiming a plugin works, stating a live fiber state, or delivering a package. | tui web desktop | all |

## Extending ACRYL (by plugin type)

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [Client slots: add UI to the Web and Desktop app (panel, button, tab, dashboard)](extending/client-slot.md) | The extension needs any UI in the app: a top-bar button, a panel, a sidebar tab, a board, a dashboard. | web desktop | all |
| [Tool plugins: give the agent a new capability](extending/tool-plugin.md) | The feature is something the agent should be able to DO (call an API, read a source, run an action). | tui web desktop | all |
| [Services: provide a capability, consume it, optional dependencies](extending/service.md) | Plugins must share a capability, or a plugin is PENDING on a missing service. | tui web desktop | all |
| [Events: listen, emit, intercept (waterfall)](extending/event-hook.md) | The feature reacts to, or intercepts, things that happen in the runtime. | tui web desktop | all |
| [Plugin configuration (Schemastery)](extending/config-schema.md) | The plugin needs validated settings. | tui web desktop | all |
| [Prompt contributions: add to the agent system prompt](extending/prompt-contribution.md) | The feature changes what the agent is told or how it behaves. | tui web desktop | all |
| [Skills: on-demand instructions for the agent](extending/skill-provider.md) | The feature is reusable instructions the agent loads only when needed. | tui web desktop | all |
| [Host routes: an HTTP API for a web or desktop plugin](extending/host-route.md) | A client UI needs a backend endpoint, or state must be shared across devices. | web desktop | all |
| [Terminal commands: slash commands with an overlay](extending/tui-command.md) | The feature is a terminal (tui) command or overlay. | tui | all |
| [LLM adapters: connect a new model provider](extending/llm-adapter.md) | The feature connects a new model provider. | tui web desktop | all |
| [Packaging a plugin, and generated capabilities](extending/packaging.md) | Writing package.json and the patch, sharing the plugin, or recording a generated capability's permissions and provenance. | tui web desktop | all |

## Delivery

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [Deliver a plugin live: local install, no restart](delivery/local-live.md) | The plugin is written and must become live now; a plugin must be CHANGED, FIXED, IMPROVED or REMOVED; acryl_install_plugin returned an error; or the plugin is PENDING, FAILED or not visible. | tui web desktop | all |
