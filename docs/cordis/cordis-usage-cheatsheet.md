# Cordis usage cheatsheet (source-validated)

> **Purpose:** one condensed, operationally-accurate page for building on Cordis / DeepSeek
> Harness in this repo. Distils `docs/cordis/` + `docs/cordisplugins/` and **validates them
> against the vendored source**, so implementers don't trip on doc-vs-source drift.
>
> **Authority:** the pinned `deepseek-harness/` submodule. The vendored framework is
> `@deepseek-ai/cordis` **4.0.1** (a re-scoped ESM-first fork of upstream `cordis`), flat at
> `deepseek-harness/vendor/cordis/src`. The **generated** reference API docs live at
> `deepseek-harness/docs/cordis-api/*` (context/events/fiber/registry/service/inherited) —
> note `vendor/cordis/README.md` links to `docs/api/core.md` etc. which are **stale and do not
> exist**; use `docs/cordis-api/*`.
>
> The repo rule (AGENTS.md) requires reading `docs/cordis/cordis_system_guide_for_coding_agents.md`
> (the long handbook) before changing a plugin/service/tool. Treat this cheatsheet as the fast
> entry point; the handbook and `docs/cordis-api/*` are the full contract.

---

## 1. The kernel model

Cordis is a **meta-framework**: it knows nothing about LLMs, agents, tools, sessions, or shell.
DeepSeek Harness supplies those as domain services. The product is a **plugin tree** — every
capability above a tiny trusted substrate is a replaceable plugin.

| Piece | What it is | Key facts |
|---|---|---|
| **`Context`** | Scoped capability environment: DI container + service locator + event bus + effect owner + lifecycle scope. Proxy-backed. | `extend`/`isolate`/`intercept` are **class methods**; most `ctx.*` members are **mixed-in accessors** installed at root boot via `ReflectService.mixin`. Don't create random root `Context`s (each root is a second dependency universe). |
| **Service** | A named capability on `ctx` (`ctx.tools`, `ctx.llm`, `ctx.shell`). | `class X extends Service { constructor(ctx){ super(ctx,'name') } }` **provides at runtime**; `declare module 'cordis' { interface Context { name } }` is **compile-time only**. |
| **`inject`** | Live dependency contract. | `export const inject = ['tools']` is a **hard requirement** — the fiber stays `PENDING` until every named service exists. Not a load-order hint. Provider identity change reactivates consumers. |
| **Events** | Typed event bus. | 5 dispatch modes: `emit` (sync, no await), `parallel` (`Promise.allSettled`), `serial` (in order until bail), `bail` (first bail value), `waterfall` (compose; veto = **don't call `next()`**). |
| **Fiber** | One mounted plugin instance; the lifecycle unit. | States `PENDING → LOADING → ACTIVE → FAILED → UNLOADING → DISPOSED`. `PENDING` is valid (missing hard dep), not an error. `ACTIVE` = `apply` called. |
| **Effects** | Reversible ownership. | Registration = effect = ownership. Every resource is acquired inside **one owning `ctx.effect()`** and released by its disposer (LIFO, single-shot). A leak is an architecture bug. |
| **Loader** | `cordis.yml`/bundle/patch rows → live plugin tree. | Applies normalized `EntryOptions[]` to an `Entry` tree (`EntryGroup.update`/`Entry.create`); it does **not** parse YAML (the `include` plugin does). HMR is a plugin, requires `--expose-internals`, and is transactional. |

## 2. The plugin contract

A plugin module exports, in order of common use:

```ts
export const name = 'my-plugin'        // stable id; MUST match the Loader row
export const inject = ['tools']        // hard deps (the fiber PENDINGs on them)
export const Config = /* sync StandardSchemaV1 */   // optional, validated before apply
export function apply(ctx, config?) { /* register capabilities, all effect-owned */ }
```

- **Shapes:** function plugin (default, lifecycle only) → object plugin (structured) → `Service` class (only when the plugin **provides** a named service). Prefer function until you need to provide a service.
- **Config:** a **StandardSchemaV1, synchronous** schema (see §4 correction 1). Cordis validates the row config and fills defaults before `apply` — do NOT export a plain object.
- **Registration chain:**
  ```
  profile → dsh.profile.bundles → bundle.dsh.bundle.patch → cordis.patch.yml
      → Loader row (name = package name or absolute module path)
      → import module → Cordis calls apply(ctx)
  ```
  Desktop uses the **same** Loader/bundle contracts but inserts its own layer per generation.
- **Disposal rule:** every resource inside one owning `ctx.effect()`; stable Loader `id`s; config is **replaced**, not deep-merged; a provider change unloads + reactivates consumers driven by service availability, never YAML row order.

## 3. Harness Tool contract (source: `AGENTS.md`, not `docs/cordisplugins/`)

A **Harness Tool** is a cordis consumer of `ctx.tools`, not a Cordis primitive:

```ts
export const inject = ['tools']
export function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name, description,
    parameters: { /* ValueSchemaSpec */ },
    output: { schema: /* ValueSchemaSpec */, render(args, value) { return [{ type: 'text', text }] } },
    async execute(args, exec) { /* observe exec.signal; return the canonical value */ },
  }))
  // registration is effect-owned → disposed with the Fiber
}
```

Contract requirements: canonical typed output split into `output.schema` (machine, lossless JSON)
and `output.render` (model-facing `ContentBlock[]`); honour `exec.signal`; traverse the tool
policy/event pipeline; no `output` declaration → `register` throws a `TypeError`. Effect-owned so
it disappears when its Fiber unloads.

## 4. Source corrections (doc-vs-source drift — rely on the source)

These materially affect an implementation; validate against the vendored source, not the
handbook wording.

1. **`Config` uses sync StandardSchema, not schemastery.** Core `resolveConfig` calls
   `Config['~standard'].validate(config)` and **throws `TypeError('Async config validation is
   not supported')`** for promise-yielding schemas (`vendor/cordis/src/fiber.ts:53-55`).
   Schemastery `z.object` is used only for loader/timer/hmr *option* schemas, not plugin `Config`.
2. **`ctx.timer`, `ctx.hmr`, `ctx.loader` are NOT on core.** They exist only when their plugin is
   loaded. Never assume them without an `inject` dependency. `ctx.hmr` throws unless the process
   was launched with `--expose-internals`.
3. **`ctx.root` is `@experimental`**; **`ctx.baseUrl` is optional and loader-set** (core leaves it
   `undefined`). Don't rely on them in a plugin.
4. **`parallel` mislabels its dispatch mode as `'emit'`** in the `internal/dispatch` diagnostic
   (`events.ts` calls `dispatch('emit', …)` internally) — a real nuance if a plugin branches on mode.
5. **`FiberState` enum order is `PENDING, LOADING, ACTIVE, FAILED, DISPOSED, UNLOADING`**
   (`DISPOSED=4`, `UNLOADING=5`) — differs from the JSDoc narrative order.
6. **Real generated API docs are `deepseek-harness/docs/cordis-api/*`.** The
   `vendor/cordis/README.md` links (`docs/api/core.md`, `docs/guides/loader-config.md`, …) are
   stale and do not exist.
7. **Vendored `@deepseek-ai/cordis` is 4.0.1** (ESM-first fork). The vendor manifest table's
   `4.0.0-rc.7` is the *upstream* reference; the actual package/json in-tree is 4.0.1.

## 5. Six-part mini-design (required before any new service seam)

Per `AGENTS.md`, write these before creating a service/tool/provider/event seam:

1. **Capability and plugin boundary** — what domain owns it and why it needs independent
   lifecycle/config/replacement.
2. **Provides and consumes** — services/tools/events/durable facts; hard `inject` requirements and
   intentional optional `ctx.get()` deps.
3. **Effects and disposal** — every activation-owned resource, its disposer, cleanup order,
   cancellation, quiescence.
4. **Configuration and composition** — validated runtime schema, stable Loader row ids,
   scopes/isolation, provider-replacement behavior.
5. **Events and durability** — dispatch mode, explicit waterfall `next()` semantics, which
   replay-critical facts live in durable session state.
6. **Verification** — real Loader activation + PENDING/reactivation, provider replacement,
   disposal, repeated mount/reload, leak checks.

## 6. Worked pattern (what a correct ACRYL plugin looks like)

The shipped `acryl_workspace_status` (`acryl-harness-runtime/src/plugin-acryl-workspace-status.ts`)
follows this exactly: `inject: ['tools']`, `ctx.tools.register(defineTool({...}))` with
`output.schema`/`render` and `exec.signal`, auto-mounted on the booted `ctx.tools` seam, and
effect-owned so it disposes with its Fiber. For a **resource-owning** plugin, use the pattern:

```ts
export const inject = ['someService']
export function apply(ctx, config) {
  ctx.effect(() => {
    const handle = startResource(config)        // or ctx.on(...), ctx.tools.register(...)
    return () => handle.stop()                   // sequential, idempotent disposer
  }, 'my-plugin: resource')
  // optional-on-this-profile capability: use ctx.get('optionalService') instead of inject
}
```

## 7. Reference pointers

- Long handbook: `docs/cordis/cordis_system_guide_for_coding_agents.md`
- Generated API: `deepseek-harness/docs/cordis-api/{context,events,fiber,registry,service,inherited}.md`
- Vendor source: `deepseek-harness/vendor/cordis/src/` (core), `vendor/loader/src/`, `vendor/include/src/`
- Plugin authoring: `docs/cordisplugins/` (hello-world, development-canvas)
- Tool contract + mini-design + fiber states: repo `AGENTS.md` → "Cordis development protocol"
