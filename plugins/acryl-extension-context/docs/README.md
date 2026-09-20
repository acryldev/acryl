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
| [Troubleshooting](start-here/troubleshooting.md) | A plugin is PENDING, FAILED, invisible or running stale code: symptom table and where to look. | tui web desktop | all |

## Extending ACRYL (by plugin type)

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [Cordis building blocks and where each is documented](extending/cordis-core.md) | You are unsure which Cordis or harness mechanism to use: the model in ten lines and a table from what you are building to its doc and reference. | tui web desktop | all |
| [Client slots: add UI to the Web and Desktop app (panel, button, tab, dashboard)](extending/client-slot.md) | The extension needs any UI in the app: a top-bar button, a panel, a sidebar tab, a board, a dashboard. | web desktop | all |
| [Tool plugins: give the agent a new capability](extending/tool-plugin.md) | The feature is something the agent should be able to DO (call an API, read a source, run an action). | tui web desktop | all |
| [Services: provide a capability, consume it, optional dependencies](extending/service.md) | Plugins must share a capability, or a plugin is PENDING on a missing service. | tui web desktop | all |
| [Events: listen, emit, intercept (waterfall)](extending/event-hook.md) | The feature reacts to, or intercepts, things that happen in the runtime. | tui web desktop | all |
| [Plugin configuration (Schemastery)](extending/config-schema.md) | The plugin needs validated settings. | tui web desktop | all |
| [Prompt contributions: add to the agent system prompt](extending/prompt-contribution.md) | The feature changes what the agent is told or how it behaves. | tui web desktop | all |
| [Skills: on-demand instructions for the agent](extending/skill-provider.md) | The feature is reusable instructions the agent loads only when needed. | tui web desktop | all |
| [Host routes: an HTTP API for a web or desktop plugin](extending/host-route.md) | A client UI needs a backend endpoint, or state must be shared across devices. | web desktop | all |
| [Terminal commands: slash commands with an overlay](extending/tui-command.md) | The feature is a terminal (tui) command or overlay. | tui | all |
| [LLM adapters: connect a new model provider](extending/llm-adapter.md) | Connect a new model provider route: the stream protocol and a working network-free adapter. | tui web desktop | all |
| [Packaging a plugin, and generated capabilities](extending/packaging.md) | Writing package.json and the patch, sharing the plugin, or recording a generated capability's permissions and provenance. | tui web desktop | all |
| [Three-role capability: definition, providers, consumers](extending/three-role-capability.md) | Several interchangeable implementations of one capability that consumers must not care about; swapping providers. | tui web desktop | all |
| [Profile and install services (desktopProfiles, desktopPnpm, livePluginActivation)](extending/desktop-main.md) | A plugin needs the active profile, package operations or live activation of another plugin. | tui web desktop | all |
| [Agent presets and personas](extending/agent-preset.md) | A different session composition (tools, prompt, skills) or identity, such as a reviewer or a minimal agent. | tui web desktop | all |
| [Chat slash commands](extending/chat-command.md) | A /command the user types in the chat that runs on the host without the model (reload, export, toggle). | tui web desktop | all |

## Delivery

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [Deliver a plugin live: local install, no restart](delivery/local-live.md) | The plugin is written and must become live now; a plugin must be CHANGED, FIXED, IMPROVED or REMOVED; acryl_install_plugin returned an error; or the plugin is PENDING, FAILED or not visible. | tui web desktop | all |
| [Delivering through the marketplace](delivery/marketplace.md) | The user wants to share or publish a plugin: readiness checks and the human publish step. | tui web desktop | all |

## Maps (generated)

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [Mount points per surface: where UI and host extensions attach (CLI, Web, Desktop)](maps/mount-points.md) | You must decide WHERE something mounts: which slot, terminal overlay, host service or Desktop frame, and which surface supports it. | tui web desktop | all |
| [Plugin taxonomy: every plugin type and every shipped plugin, per surface](maps/taxonomy.md) | You want the full list of plugin types, which surfaces have them, whether an agent can author one, and real shipped plugins to study. | tui web desktop | all |

## Reference (synced)

| Doc | Read it when | Surfaces | Applies |
| --- | --- | --- | --- |
| [Harness subsystems: Subsystems](reference/subsystems/README.md) | English \| [中文](README.zh.md) | tui web desktop | partial |
| [Harness subsystems: Agent Teams](reference/subsystems/agent-team.md) | English \| [中文](agent-team.zh.md) | tui web desktop | partial |
| [Harness subsystems: User Approval](reference/subsystems/approval.md) | English \| [中文](approval.zh.md) | tui web desktop | partial |
| [Harness subsystems: Durable Attachments](reference/subsystems/attachment.md) | English \| [中文](attachment.zh.md) | tui web desktop | partial |
| [Harness subsystems: Client Modules](reference/subsystems/client-modules.md) | English \| [中文](client-modules.zh.md) | tui web desktop | partial |
| [Harness subsystems: Client Resources](reference/subsystems/client-resources.md) | English \| [中文](client-resources.zh.md) | tui web desktop | partial |
| [Harness subsystems: Code Runtime](reference/subsystems/code-runtime.md) | English \| [中文](code-runtime.zh.md) | tui web desktop | partial |
| [Harness subsystems: Human Commands](reference/subsystems/commands.md) | English \| [中文](commands.zh.md) | tui web desktop | partial |
| [Harness subsystems: Compaction](reference/subsystems/compaction.md) | English \| [中文](compaction.zh.md) | tui web desktop | partial |
| [Harness subsystems: Conversation assembly](reference/subsystems/conversation.md) | English \| [中文](conversation.zh.md) | tui web desktop | partial |
| [Harness subsystems: Core](reference/subsystems/core.md) | English \| [中文](core.zh.md) | tui web desktop | partial |
| [Harness subsystems: User Credentials](reference/subsystems/credentials.md) | English \| [中文](credentials.zh.md) | tui web desktop | partial |
| [Harness subsystems: Extensions](reference/subsystems/extensions.md) | English \| [中文](extensions.zh.md) | tui web desktop | partial |
| [Harness subsystems: Message Feedback](reference/subsystems/feedback.md) | English \| [中文](feedback.zh.md) | tui web desktop | partial |
| [Harness subsystems: Filesystem](reference/subsystems/filesystem.md) | English \| [中文](filesystem.zh.md) | tui web desktop | partial |
| [Harness subsystems: Same-session goals](reference/subsystems/goal.md) | English \| [中文](goal.zh.md) | tui web desktop | partial |
| [Harness subsystems: Runtime Invariants](reference/subsystems/invariants.md) | English \| [中文](invariants.zh.md) | tui web desktop | partial |
| [Harness subsystems: Background Task Runtime](reference/subsystems/jobs.md) | English \| [中文](jobs.zh.md) | tui web desktop | partial |
| [Harness subsystems: LLM Streaming](reference/subsystems/llm-streaming.md) | English \| [中文](llm-streaming.zh.md) | tui web desktop | partial |
| [Harness subsystems: LSP navigation](reference/subsystems/lsp.md) | English \| [中文](lsp.zh.md) | tui web desktop | partial |
| [Harness subsystems: Permission Presets](reference/subsystems/permission-presets.md) | English \| [中文](permission-presets.zh.md) | tui web desktop | partial |
| [Harness subsystems: Session Persistence](reference/subsystems/persistence.md) | English \| [中文](persistence.zh.md) | tui web desktop | partial |
| [Harness subsystems: Plan Mode](reference/subsystems/plan.md) | English \| [中文](plan.zh.md) | tui web desktop | partial |
| [Harness subsystems: Process Sandbox](reference/subsystems/sandbox.md) | English \| [中文](sandbox.zh.md) | tui web desktop | partial |
| [Harness subsystems: Session-local Schedule](reference/subsystems/schedule.md) | English \| [中文](schedule.zh.md) | tui web desktop | partial |
| [Harness subsystems: Scoped Registration](reference/subsystems/scope.md) | English \| [中文](scope.zh.md) | tui web desktop | partial |
| [Harness subsystems: Session Projections](reference/subsystems/session-projection.md) | English \| [中文](session-projection.zh.md) | tui web desktop | partial |
| [Harness subsystems: Session Query](reference/subsystems/session-query.md) | English \| [中文](session-query.zh.md) | tui web desktop | partial |
| [Harness subsystems: Session References](reference/subsystems/session-reference.md) | English \| [中文](session-reference.zh.md) | tui web desktop | partial |
| [Harness subsystems: SessionTelemetryBackend](reference/subsystems/session-telemetry.md) | English \| [中文](session-telemetry.zh.md) | tui web desktop | partial |
| [Harness subsystems: Session Titles](reference/subsystems/session-title.md) | English \| [中文](session-title.zh.md) | tui web desktop | partial |
| [Harness subsystems: Sessions](reference/subsystems/session.md) | English \| [中文](session.zh.md) | tui web desktop | partial |
| [Harness subsystems: User Settings](reference/subsystems/settings.md) | English \| [中文](settings.zh.md) | tui web desktop | partial |
| [Harness subsystems: Bash Executor](reference/subsystems/shell.md) | English \| [中文](shell.zh.md) | tui web desktop | partial |
| [Harness subsystems: Right Sidebar](reference/subsystems/sidebar-right.md) | English \| [中文](sidebar-right.zh.md) | tui web desktop | partial |
| [Harness subsystems: Skills](reference/subsystems/skills.md) | English \| [中文](skills.zh.md) | tui web desktop | partial |
| [Harness subsystems: Web Client Slots](reference/subsystems/slots.md) | English \| [中文](slots.zh.md) | tui web desktop | partial |
| [Harness subsystems: Spill Storage](reference/subsystems/spill.md) | English \| [中文](spill.zh.md) | tui web desktop | partial |
| [Harness subsystems: Storage](reference/subsystems/storage.md) | English \| [中文](storage.zh.md) | tui web desktop | partial |
| [Harness subsystems: Subagent](reference/subsystems/subagent.md) | English \| [中文](subagent.zh.md) | tui web desktop | partial |
| [Harness subsystems: Subprocess](reference/subsystems/subprocess.md) | English \| [中文](subprocess.zh.md) | tui web desktop | partial |
| [Harness subsystems: System Prompt Assembly](reference/subsystems/system-prompt.md) | English \| [中文](system-prompt.zh.md) | tui web desktop | partial |
| [Harness subsystems: Persistent PTY Sessions](reference/subsystems/terminal.md) | English \| [中文](terminal.zh.md) | tui web desktop | partial |
| [Harness subsystems: Todo](reference/subsystems/todo.md) | English \| [中文](todo.zh.md) | tui web desktop | partial |
| [Harness subsystems: Token Meter](reference/subsystems/token-meter.md) | English \| [中文](token-meter.zh.md) | tui web desktop | partial |
| [Harness subsystems: Tools](reference/subsystems/tools.md) | English \| [中文](tools.zh.md) | tui web desktop | partial |
| [Harness subsystems: Typert remote calls](reference/subsystems/typert.md) | English \| [中文](typert.zh.md) | tui web desktop | partial |
| [Harness subsystems: User Interaction](reference/subsystems/user-questions.md) | English \| [中文](user-questions.zh.md) | tui web desktop | partial |
| [Harness subsystems: Web Client architecture](reference/subsystems/web-client.md) | English \| [中文](web-client.zh.md) | tui web desktop | partial |
| [Harness subsystems: HTTP Server](reference/subsystems/web-server.md) | English \| [中文](web-server.zh.md) | tui web desktop | partial |
| [Harness subsystems: Web Access](reference/subsystems/web.md) | English \| [中文](web.zh.md) | tui web desktop | partial |
| [Harness subsystems: Webhook runtime](reference/subsystems/webhook.md) | English \| [中文](webhook.zh.md) | tui web desktop | partial |
| [Harness subsystems: Workflow](reference/subsystems/workflow.md) | English \| [中文](workflow.zh.md) | tui web desktop | partial |
| [Harness subsystems: Workspaces](reference/subsystems/workspace.md) | English \| [中文](workspace.zh.md) | tui web desktop | partial |
| [Cordis API: Context](reference/cordis-api/context.md) | Run `pnpm run gen-cordis-catalog` to regenerate. --> | tui web desktop | partial |
| [Cordis API: Events](reference/cordis-api/events.md) | Run `pnpm run gen-cordis-catalog` to regenerate. --> | tui web desktop | partial |
| [Cordis API: Fiber](reference/cordis-api/fiber.md) | Run `pnpm run gen-cordis-catalog` to regenerate. --> | tui web desktop | partial |
| [Cordis API: Inherited Cordis API](reference/cordis-api/inherited.md) | Run `pnpm run gen-cordis-catalog` to regenerate. --> | tui web desktop | partial |
| [Cordis API: Registry](reference/cordis-api/registry.md) | Run `pnpm run gen-cordis-catalog` to regenerate. --> | tui web desktop | partial |
| [Cordis API: Service](reference/cordis-api/service.md) | Run `pnpm run gen-cordis-catalog` to regenerate. --> | tui web desktop | partial |
| [Harness cookbook: Cookbook: adding a workspace package](reference/cookbook/adding-a-package.md) | English \| [中文](adding-a-package.zh.md) | tui web desktop | partial |
| [Harness cookbook: Cookbook: adding a Remote API](reference/cookbook/adding-a-remote-api.md) | English \| [中文](adding-a-remote-api.zh.md) | tui web desktop | partial |
| [Harness cookbook: Cookbook: adding a settings card](reference/cookbook/adding-a-settings-card.md) | English \| [中文](adding-a-settings-card.zh.md) | tui web desktop | partial |
| [Harness cookbook: Tool authoring reference](reference/cookbook/adding-a-tool.md) | English \| [中文](adding-a-tool.zh.md) | tui web desktop | partial |
| [Harness cookbook: Cookbook: adding an LLM adapter](reference/cookbook/adding-an-llm-adapter.md) | English \| [中文](adding-an-llm-adapter.zh.md) | tui web desktop | partial |
| [Harness cookbook: Cookbook: extension plugin shapes](reference/cookbook/extension-cookbook.md) | English \| [中文](extension-cookbook.zh.md) | tui web desktop | partial |
| [Harness architecture: Cordis Primer](reference/harness/cordis-primer.md) | English \| [中文](cordis-primer.zh.md) | tui web desktop | partial |
| [Harness architecture: Capability Seams And Core Services](reference/harness/capability-seams.md) | Run `pnpm run gen-doc-graphs` to regenerate. --> | tui web desktop | partial |
| [Harness architecture: Glossary](reference/harness/glossary.md) | English \| [中文](glossary.zh.md) | tui web desktop | partial |
| [Harness architecture: Defensive patterns](reference/harness/defensive-patterns.md) | English \| [中文](defensive-patterns.zh.md) | tui web desktop | partial |
| [Harness architecture: Event Producer And Consumer Matrix](reference/harness/event-producer-consumer.md) | Run `pnpm run gen-doc-graphs` to regenerate. --> | tui web desktop | partial |
| [Harness architecture: Tool Execution Pipeline](reference/harness/tool-execution-pipeline.md) | Run `pnpm run gen-doc-graphs` to regenerate. --> | tui web desktop | partial |
| [Harness architecture: Agent Turn And Step Lifecycle](reference/harness/agent-lifecycle.md) | Run `pnpm run gen-doc-graphs` to regenerate. --> | tui web desktop | partial |
| [Harness architecture: DeepSeek Harness Architecture](reference/harness/architecture.md) | English \| [中文](architecture.zh.md) | tui web desktop | partial |
| [Harness architecture: Plugin Config Catalog](reference/harness/config-catalog.md) | Run `pnpm run gen-config-catalog` to regenerate. --> | tui web desktop | partial |
| [Harness architecture: Tool Schema Catalog](reference/harness/tool-catalog.md) | Run `pnpm run gen-tool-catalog` to regenerate. --> | tui web desktop | partial |
| [Cordis guides: Cordis usage cheatsheet (source-validated)](reference/cordis-guides/cordis-usage-cheatsheet.md) | Cordis is a **meta-framework**: it knows nothing about LLMs, agents, tools, sessions, or shell. | tui web desktop | partial |
| [Cordis guides: Cordis System Guide for Coding Agents](reference/cordis-guides/cordis_system_guide_for_coding_agents.md) | **Path convention:** Unless an ACRYL/root path is written explicitly, paths such | tui web desktop | partial |
| [Cordis guides: Hello World: a Cordis plugin for this DSH Desktop repository](reference/cordis-guides/hello-world-plugin-guide.md) | This guide is the smallest practical path from one JavaScript module to a | tui web desktop | partial |
| [Cordis guides: Development Canvas as a standalone Cordis plugin](reference/cordis-guides/development-canvas-plugin.md) | Development Canvas follows the same law as the rest of ACRYL: **everything is a | tui web desktop | partial |
