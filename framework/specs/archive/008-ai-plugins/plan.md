# Plan: Reference AI plugins and examples

```text
plugins/model   @aimbrace/plugin-model    types, Model service, ModelProviders registry, mock provider, hooks
plugins/memory  @aimbrace/plugin-memory   Memory service (long-term), createTaskMemory (scope-local), hooks
plugins/tools   @aimbrace/plugin-tools    Tool, defineTool, Tools registry, ToolRunner, builtin tools (calculator, clock), hooks
plugins/agent   @aimbrace/plugin-agent    AgentRuntime, Budget, task scope loop, hooks
examples/agent-cli   aimbrace.config.mjs + ask command plugin
examples/http-agent  routes plugin + host choice (hono | fastify)
```

Notes: valibot for plugin config; the calculator is a small recursive descent parser; each package default-exports its main plugin and declares `"aimbrace": { "plugin": "./dist/index.js" }` for discovery.
