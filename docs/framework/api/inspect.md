# Inspect

`ctx.inspect.plugins()` returns one report per plugin: `name`, `state`, `requires`, `provides`, `routes`, `middleware`, `other`, `removedOnUnload`.
`ctx.inspect.explain(name)` and `render()` give text. Routes `GET /api/inspect/plugins` and `GET /api/inspect/plugins/:name` expose the same (loopback only).
Registrations made inside an inline `ctx.inject(...)` callback count as the owning plugin's.
