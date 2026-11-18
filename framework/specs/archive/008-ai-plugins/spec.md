# Feature Specification: Reference AI plugins and examples

**Milestone**: M8 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

Four plugins and two examples that prove the architecture on the brief's own use case, an agent
system: model providers contribute to a registry, tools contribute to a registry and vanish with
their plugin, memory is a service, and the agent runs **every task in its own Scope** with a token
budget, task-local memory, tracing hooks and cancellation. A deterministic mock model keeps
everything offline.

```text
Config -> Model(Registry<ModelProvider>) --\
          Memory ------------------------- +--> Agent (Task scope: Budget, TaskMemory, signal)
          Tools(Registry<Tool>) -----------/
```

## User Scenarios & Testing

### User Story 1 - Providers and tools without coupling (P1)

A second plugin adds a model provider or a tool; the agent uses it without knowing the plugin. Disposing that plugin removes it.

### User Story 2 - One scope per agent run (P1)

`agent.run(input)` opens `task:<id>`, provides a task-local `Budget` and `TaskMemory`, runs the model/tool loop, and disposes the scope. After the run, `app.probe().scopes` is 0 and nothing leaked.

### User Story 3 - Budget and cancellation (P1)

`budgetTokens` stops a run with status `budget_exceeded`; an `AbortSignal` (or app shutdown) stops it with `cancelled`, interrupting the model call and tool calls in flight.

### User Story 4 - Typed tracing hooks (P2)

`agent:start`, `agent:step`, `agent:end`, `model:*`, `tool:*`, `memory:write` are declared via `HookExtensions` and observable from the app.

### User Story 5 - The CLI host (P1)

`examples/agent-cli`: `aimbrace ask "calc: 2+3"` runs the agent through a plugin-contributed command.

### User Story 6 - The HTTP hosts (P1)

`examples/http-agent`: the same plugin set serves `POST /ask` and `GET /graph` under Hono and under Fastify with identical results.

## Requirements

- **FR-801**: The plugin packages depend on `@aimbrace/core` (and each other's tokens) only; no model vendor SDK.
- **FR-802**: Tool arguments MUST be validated with the tool's Standard Schema; invalid arguments, unknown tools and thrown errors become `isError` results, never crashes.
- **FR-803**: The calculator tool MUST NOT use `eval` or `Function`.
- **FR-804**: A cancelled or budget-exceeded run MUST still dispose its scope and report a result.
- **FR-805**: The mock model is deterministic and honours its `AbortSignal`.
- **FR-806**: Both examples are tested in CI without network access beyond localhost.
