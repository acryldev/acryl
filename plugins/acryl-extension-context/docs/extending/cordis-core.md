# Cordis building blocks: what exists and where it is documented

Read this when you are unsure which Cordis or harness mechanism to use, or want the exact contract of
one. Paths below are relative to the docs folder (`docs/`); every one exists in this pack.

## The model in ten lines

- A **plugin** is a module exporting `name`, optionally `inject` and `Config`, and `apply(ctx, config)`.
- A **Fiber** is one mounted plugin instance. States: `PENDING` (a hard `inject` dependency is missing: healthy,
  waiting), `LOADING`, `ACTIVE` (`apply` ran), `FAILED` (real error), `UNLOADING`, `DISPOSED`.
- `inject: ['x']` is a **hard** dependency: the fiber stays PENDING until service `x` exists and remounts when
  its provider changes. `ctx.get('x')` is an **optional** dependency, read at call time (never captured at apply).
- A **Service** is a named capability on `ctx`: `class X extends Service { constructor(ctx) { super(ctx, 'x') } }`.
- An **effect** (`ctx.effect(() => { ...acquire; return () => release })`) owns every resource; registrations
  (`ctx.tools.register`, `ctx.on`, ...) are effects, so they disappear when the fiber unloads. A leak is a bug.
- **Events**: `ctx.emit` / `ctx.parallel` / `ctx.serial` / `ctx.bail` / `ctx.waterfall`; listen with `ctx.on`.
  A waterfall listener that only observes MUST still call `next()`.
- **Config** is a synchronous StandardSchema (a Schemastery object works), validated before `apply`.
- The **Loader** turns rows (`cordis.patch.yml` inserts, profile bundles) into mounted fibers. `id` is the stable
  row identity; `name` is the module.
- **Scope**: `ctx.isolate(...)`, `ctx.intercept(...)` and `ctx.extend(...)` derive a child context (class methods).
  `ctx.timer`, `ctx.hmr` and `ctx.loader` exist only when their plugin is loaded.
- Everything domain-specific (tools, llm, skills, slots, commands, settings, sessions) is a harness **service**
  built on this, not core Cordis.

## Which doc to read for what you are building

| You want to add | Read first | Then the reference |
| --- | --- | --- |
| A model-callable tool | `extending/tool-plugin.md` | `reference/cookbook/adding-a-tool.md`, `reference/subsystems/tools.md`, `reference/harness/tool-execution-pipeline.md` |
| A service others depend on | `extending/service.md` | `reference/cordis-api/service.md`, `reference/cordis-api/registry.md` |
| A capability with swappable providers | `extending/three-role-capability.md` | `reference/harness/capability-seams.md` |
| An event listener or interceptor | `extending/event-hook.md` | `reference/cordis-api/events.md`, `reference/harness/event-producer-consumer.md` |
| Validated configuration | `extending/config-schema.md` | `reference/harness/config-catalog.md`, `reference/subsystems/settings.md` |
| A system-prompt section | `extending/prompt-contribution.md` | `reference/subsystems/system-prompt.md` |
| A skill or skill provider | `extending/skill-provider.md` | `reference/subsystems/skills.md` |
| A chat slash command (all surfaces) | `extending/chat-command.md` | `reference/subsystems/commands.md` |
| A terminal overlay (CLI only) | `extending/tui-command.md` | `maps/mount-points.md` |
| Where something can mount, per surface | `maps/mount-points.md` | `maps/slot-contracts.md`, `reference/subsystems/slots.md` |
| Hooking the agent lifecycle (prompt, request, stream, session) | `maps/events.md` | `examples/packages/prompt-assemble-hook/`, `lifecycle-hooks-observer/` |
| The full list of plugin types and shipped plugins | `maps/taxonomy.md` | `reference/harness/architecture.md` |
| A new model provider | `extending/llm-adapter.md` | `reference/cookbook/adding-an-llm-adapter.md`, `reference/subsystems/llm-streaming.md` |
| An agent preset or persona | `extending/agent-preset.md` | `reference/subsystems/subagent.md`, `reference/subsystems/agent-team.md` |
| A backend HTTP/RPC route | `extending/host-route.md` | `reference/cookbook/adding-a-remote-api.md`, `reference/subsystems/web-server.md` |
| UI: button, panel, sidebar tab, settings card | `extending/client-slot.md` | `reference/subsystems/slots.md`, `reference/subsystems/client-modules.md`, `reference/subsystems/sidebar-right.md`, `reference/cookbook/adding-a-settings-card.md` |
| Desktop-only host features (profiles, pnpm, live activation) | `extending/desktop-main.md` | `reference/cordis-guides/hello-world-plugin-guide.md` |
| Shipping or generating a package | `extending/packaging.md` | `reference/cookbook/adding-a-package.md` |
| Something is PENDING or FAILED | `start-here/troubleshooting.md` | `reference/cordis-api/fiber.md` |

## When you need the whole picture

`reference/cordis-guides/cordis_system_guide_for_coding_agents.md` is the long handbook,
`reference/cordis-guides/cordis-usage-cheatsheet.md` the short source-validated version,
`reference/harness/cordis-primer.md` and `reference/harness/glossary.md` the vocabulary,
and `reference/harness/defensive-patterns.md` the failure-handling idioms. The reference docs were copied from the
repository and may link to paths that do not exist here; use the table above instead of following those links.

## Design before you code (for a new seam)

Before adding a new service, tool or event seam write down: the capability boundary; what it provides and
consumes; every effect and its disposer; configuration and stable row ids; the event dispatch mode; and how you
will verify it (real mount, PENDING then ACTIVE, provider swap, dispose, remount). For a small plugin one
sentence each is enough.
