# ACRYL extension examples

<!-- Generated from docs/docs.json by scripts/build-manifest.mjs. Do not edit here. -->

Every example is a real package. Each is mounted through the real Loader by the
pack gate and its declared outcome observed. Find the closest, read it, then adapt it.

| Example | Type | Teaches | Surfaces | Docs |
| --- | --- | --- | --- | --- |
| [lifecycle-function.basic](packages/lifecycle-function-basic/) | lifecycle-function | The smallest plugin: named exports name and apply, no dependencies. | tui web desktop | start.this-runtime |
| [service.provider](packages/service-provider-greeter/) | service-provider | A Service subclass provides a named service; export the class as apply. | tui web desktop | extending.service |
| [service.consumer](packages/service-consumer-greeter/) | service-consumer | inject is a hard dependency (PENDING then ACTIVE); ctx.get is optional. | tui web desktop | extending.service |
| [tool.basic](packages/tool-basic/) | tool | Register a model-callable tool with defineTool. | tui web desktop | extending.tool |
| [event-hook.basic](packages/event-hook-basic/) | event-hook | Listen to and emit an event; waterfall must call next(). | tui web desktop | extending.event-hook |
| [config-schema.basic](packages/config-schema-basic/) | config-schema | A Schemastery Config validated before apply. | tui web desktop | extending.config-schema |
| [prompt-contribution.basic](packages/prompt-contribution-basic/) | prompt-contribution | Add a static section to the system prompt. | tui web desktop | extending.prompt-contribution |
| [skill-provider.basic](packages/skill-provider-basic/) | skill-provider | Provide a bundled skill (name and description in context, body on demand). | tui web desktop | extending.skill-provider |
| [host-route.basic](packages/host-route-basic/) | host-route | Serve an HTTP route from a web or desktop host plugin. | web desktop | extending.host-route |
| [client-slot.header-action](packages/client-slot-header-action/) | client-slot | A UI plugin with no build step: top-bar button and panel, hand-written client bundle. | web desktop | extending.client-slot |
| [tui-command.basic](packages/tui-command-basic/) | tui-contribution | A slash command with an overlay in the terminal UI. | tui | extending.tui-command |
| [generated-capability.template](packages/generated-capability-template/) | generated-capability | The shape of a publishable, reviewable generated capability. | tui web desktop | extending.packaging |
