## AIMBRACE  ai framework SPECS


 For what you are trying to build, I would **not** start from Hono/Nest/Fastify and simply add plugins. I would build around the **Cordis idea**, then borrow specific architectural mechanisms from a small number of excellent OSS projects.

I researched the current repositories and implementations, including Cordis itself.

## My ranking for your use case

| Candidate | What it teaches you | Relevance to your framework |
|---|---|---:|
| **Cordis** | Spatiotemporal composability, Context, Services, isolation, interception | ★★★★★ |
| **Effect** | Typed dependency graph, Context/Service/Layer, resource lifecycle, composition | ★★★★★ |
| **Fastify** | Plugin graph, encapsulation, dependency declarations, deterministic lifecycle | ★★★★★ |
| **UnJS Hookable** | Extremely clean typed hook/event primitive | ★★★★★ |
| **UnJS Unplugin** | Elegant plugin abstraction + adapters | ★★★★☆ |
| **Hono** | Minimal core, composable middleware, excellent DX | ★★★★☆ |
| **NestJS** | Module graph + DI architecture | ★★★☆☆ |
| **tRPC** | Excellent type-level API design and inference | ★★★☆☆ |

The most interesting combination is:

> **Cordis + Effect + Fastify + Hookable + Unplugin + Hono**

That gives you something considerably more interesting than another Nest/Fastify clone.

---

# 1. Cordis should remain the philosophical foundation

Cordis currently describes itself as a **“Meta-Framework of Spatiotemporal Composability.”** Its core is unusually small and is organized around:

```text
Context
 ├── Services
 ├── Events
 ├── Registry
 ├── Logger
 ├── Fiber
 └── Reflection
```

The current package itself is MIT licensed and deliberately exposes a relatively small core with optional loader/include functionality. [GitHub](https://github.com/hellOoSaksit/ai-project-scaffold/blob/main/examples/plugin-architecture/system-design.md?utm_source=chatgpt.com)

The important thing is that Cordis is **not really a conventional plugin framework**.

Its deeper model is:

```text
Context
   │
   ├── service
   ├── service
   ├── service
   │
   ├── event
   ├── event
   │
   └── child Context
           │
           ├── inherited services
           ├── local services
           └── isolated state
```

That is exactly the direction I would preserve.

---

# 2. But Effect has the best ideas for the dependency layer

Effect is probably the **single most valuable codebase to study** for your project.

Its current architecture has two particularly relevant concepts:

```text
Context
Service
Layer
```

A `Context` is a typed environment containing services.

A `Layer<ROut, E, RIn>` explicitly models:

```text
RIn  →  Layer  →  ROut
```

where:

```text
RIn  = required services
ROut = services provided
E    = possible construction error
```

Effect also memoizes layer construction and manages scopes/resources. [GitHub](https://github.com/unjs/c12?utm_source=chatgpt.com)

This is extremely powerful for your planned architecture.

### Your plugin could become

```ts
interface Plugin<
  Provides,
  Requires,
  Config = unknown
> {
  readonly id: string

  readonly requires: Requires
  readonly provides: Provides

  setup(ctx: Context<Requires>): PluginResult<Provides>
}
```

Then the compiler/runtime can understand:

```text
DatabasePlugin
    requires: Config
    provides: Database

OpenAIPlugin
    requires: Config
    provides: OpenAI

AgentPlugin
    requires: OpenAI + Database
    provides: AgentRuntime
```

giving:

```text
Config
 ↓
Database ──────┐
               ↓
OpenAI ───────→ AgentRuntime
```

That is much more useful than:

```ts
plugins: [
  database(),
  openai(),
  agent()
]
```

because the framework knows the **dependency graph**.

---

# 3. Fastify has probably the best practical plugin architecture

Fastify is extremely relevant.

Its philosophy is:

> everything is a plugin

and, critically, `register()` creates an **encapsulated context**.

This means:

```text
Application
│
├── Plugin A
│   ├── service
│   ├── routes
│   └── hooks
│
└── Plugin B
    ├── service
    ├── routes
    └── hooks
```

Changes inside one registered scope don't automatically leak into ancestors. Fastify explicitly describes this as its encapsulation model. [GitHub](https://github.com/fastify/fastify/blob/main/docs/Guides/Plugins-Guide.md?utm_source=chatgpt.com)

This maps beautifully onto Cordis.

### I would combine them

Cordis:

```ts
ctx.extend()
ctx.isolate()
```

Fastify:

```ts
register(plugin)
```

Your framework:

```ts
app.use(plugin)
```

could mean:

```text
create child Context
        ↓
resolve dependencies
        ↓
initialize plugin
        ↓
install services
        ↓
install hooks
        ↓
install resources
        ↓
commit child context
```

And importantly, you get **nested composability**.

```ts
app.use(
  auth(),
  api(),
  ai({
    providers: [
      openai(),
      anthropic(),
    ]
  })
)
```

Internally:

```text
App
│
├── Auth
│
├── API
│
└── AI
    │
    ├── OpenAI
    └── Anthropic
```

Fastify also has explicit plugin dependency metadata and version requirements. [GitHub](https://github.com/fastify/fastify-plugin/blob/main/README.md?utm_source=chatgpt.com)

That is something I would absolutely copy conceptually.

---

# 4. Hookable is the perfect tiny event primitive

This may actually be the **best small piece of software to steal architecture from**.

UnJS `hookable` is intentionally tiny:

```ts
const hooks = new Hookable<Hooks>()

hooks.hook("beforeRun", fn)
hooks.callHook("beforeRun", ...)
```

But it has several excellent details:

```text
typed hooks
serial execution
parallel execution
hookOnce
unregister
nested hook namespaces
deprecation chains
beforeEach / afterEach
minimal core variant
```

Its current implementation separates a very small `HookableCore` from the richer `Hookable`, and is designed to have very little runtime/bundle overhead. [GitHub](https://github.com/unjs/hookable/blob/main/src/hookable.ts?utm_source=chatgpt.com)

For your framework:

```ts
type RuntimeHooks = {
  "plugin:beforeInstall": (plugin: Plugin) => void
  "plugin:afterInstall": (plugin: Plugin) => void

  "agent:beforeRun": (run: AgentRun) => void
  "agent:afterRun": (run: AgentRun) => void

  "tool:beforeCall": (call: ToolCall) => void
  "tool:afterCall": (call: ToolResult) => void

  "context:dispose": () => void
}
```

Then your entire framework can communicate through typed hooks without creating dozens of bespoke event systems.

---

# 5. Unplugin teaches an important architectural lesson

Unplugin is not relevant because you need a build-plugin framework.

It's relevant because of **how it defines an abstract plugin once and adapts it outward**.

Its core API is approximately:

```ts
factory(options)
```

and then:

```text
         plugin
           │
     ┌─────┼─────┬──────┐
     ↓     ↓     ↓      ↓
   Vite  Rollup ESBuild Webpack
```

The current implementation has one abstract plugin definition and adapter implementations for many build systems. [GitHub](https://github.com/antfu/starter-ts?utm_source=chatgpt.com)

This is exactly the architecture you want at another level:

```text
             ACRYL Plugin
                  │
       ┌──────────┼──────────┐
       ↓          ↓          ↓
     CLI        Agent       Web
       │          │          │
       ↓          ↓          ↓
    Runtime     Runtime    Runtime
```

**One plugin contract; multiple hosts.**

That could become one of the defining characteristics of your framework.

---

# 6. Hono teaches you what NOT to put in the core

Hono is excellent because the core is extremely restrained.

Current Hono emphasizes:

```text
Web Standards
minimal dependencies
small core
middleware
runtime portability
TypeScript-first DX
```

The framework works across Node, Bun, Deno, Cloudflare Workers and other runtimes. [GitHub](https://github.com/fastify/fastify/blob/main/docs/Guides/Getting-Started.md?utm_source=chatgpt.com)

The lesson for your framework:

### Don't make this:

```text
ACRYL
├── HTTP
├── Database
├── Redis
├── AI
├── CLI
├── WebSockets
├── filesystem
├── agents
├── OpenAI
├── Anthropic
└── ...
```

Make:

```text
ACRYL CORE

Context
Plugin
Service
Hook
Scope
Registry
Lifecycle
Dependency Graph
```

Everything else is a plugin.

---

# 7. NestJS has useful ideas, but I would not copy its architecture

Nest's module system is fundamentally based around an application dependency graph.

```text
RootModule
 ├── imports
 ├── providers
 ├── controllers
 └── exports
```

The framework constructs the graph and uses DI to resolve it. [GitHub](https://github.com/nestjs/docs.nestjs.com/blob/master/content/modules.md?utm_source=chatgpt.com)

That's useful.

But Nest has more architectural ceremony:

```text
decorators
modules
controllers
providers
metadata
reflection
DI container
```

For ACRYL / your Cordis-inspired system I'd prefer:

```ts
export const AgentPlugin = definePlugin({
  id: "agent",

  requires: [Model, Tools, Memory],

  provides: [Agent],

  setup(ctx) {
    ...
  }
})
```

rather than:

```ts
@Module({
  providers: [...]
})
export class AgentModule {}
```

Much more functional, composable and runtime-friendly.

---

# 8. The architecture I would actually build

I would make **six layers**.

```text
┌──────────────────────────────────────────┐
│                 APPLICATION              │
│      your product / agent / CLI / web    │
└──────────────────────────────────────────┘
                     │
┌──────────────────────────────────────────┐
│                 PLUGINS                  │
│ AI │ DB │ Memory │ Tools │ HTTP │ TUI    │
└──────────────────────────────────────────┘
                     │
┌──────────────────────────────────────────┐
│             COMPOSITION ENGINE           │
│ dependency graph │ lifecycle │ scopes     │
│ isolation │ registration │ discovery      │
└──────────────────────────────────────────┘
                     │
┌──────────────────────────────────────────┐
│                   CORE                   │
│ Context │ Service │ Hook │ Registry      │
└──────────────────────────────────────────┘
                     │
┌──────────────────────────────────────────┐
│              RUNTIME PRIMITIVES          │
│ Promise │ AbortSignal │ AsyncLocalStorage │
│ EventTarget │ Web APIs │ timers           │
└──────────────────────────────────────────┘
```

---

# 9. Core abstraction: Context

I would retain Cordis's basic insight but simplify the public model.

```ts
interface Context {
  readonly parent?: Context

  get<T>(service: Service<T>): T

  provide<T>(
    service: Service<T>,
    value: T
  ): Context

  fork(): Context

  isolate(name: string): Context

  scope(): Scope
}
```

Then:

```ts
const db = ctx.get(Database)
```

rather than passing:

```ts
database,
logger,
config,
events,
memory,
model,
tools
```

through every function.

---

# 10. Service should be a first-class primitive

Something like:

```ts
const Database = service<Database>("database")

const Logger = service<Logger>("logger")

const Model = service<Model>("model")
```

Then:

```ts
ctx.provide(Database, postgres)
ctx.provide(Model, openai)
```

And a plugin declares:

```ts
definePlugin({
  id: "agent",

  requires: [
    Model,
    Logger,
    Tools,
    Memory,
  ],

  provides: [
    Agent,
  ],

  setup(ctx) {
    ...
  }
})
```

This is where **Effect's typed Context/Layer system is the strongest reference**. [GitHub](https://github.com/unjs/c12?utm_source=chatgpt.com)

---

# 11. Plugin should be a declarative composition unit

I would make the fundamental abstraction:

```ts
interface Plugin<
  Provides extends readonly Service<any>[],
  Requires extends readonly Service<any>[]
> {
  readonly id: string

  readonly provides: Provides
  readonly requires: Requires

  install(
    context: Context
  ): void | Promise<void>
}
```

But I'd go one step further.

Add:

```ts
interface Plugin {
  id: string

  version?: string

  requires?: Dependency[]
  optional?: Dependency[]

  setup?: SetupFn
  start?: LifecycleFn
  stop?: LifecycleFn

  hooks?: Hooks
}
```

So the framework can calculate:

```text
dependency DAG
      ↓
topological sort
      ↓
installation
      ↓
start
```

and reverse it for shutdown.

Fastify's graph/lifecycle approach is an excellent reference here. [GitHub](https://github.com/fastify/fastify/blob/main/docs/Guides/Plugins-Guide.md?utm_source=chatgpt.com)

---

# 12. The really interesting part: temporal composability

This is where your framework can become **more than "another plugin system."**

Cordis's unusual strength is its concept of context changing through time.

You could formalize:

```text
Context₀
   ↓
install(plugin A)
   ↓
Context₁
   ↓
install(plugin B)
   ↓
Context₂
   ↓
isolate()
   ↓
Context₃
```

Now imagine agent execution:

```text
Global Context
       ↓
Agent Context
       ↓
Task Context
       ↓
Tool Context
       ↓
Call Context
```

For an AI agent system this is extremely powerful.

Example:

```text
Agent
│
├── Model
├── Memory
├── Tools
│
└── Task #42
     │
     ├── temporary filesystem
     ├── task memory
     ├── token budget
     ├── tracing
     └── cancellation
```

Once the task completes:

```text
Task Context
     ↓
dispose()
```

Resources disappear.

This is where Cordis + Effect's scoped resource model becomes particularly compelling. Effect's Layer implementation explicitly incorporates scopes, memoization and resource finalization. [GitHub](https://github.com/unjs/c12?utm_source=chatgpt.com)

---

# 13. I would add a Registry primitive

Cordis already has Registry.

Keep it.

But make it generic:

```ts
Registry<T>
```

Examples:

```ts
Registry<ModelProvider>

Registry<Tool>

Registry<Command>

Registry<Route>

Registry<Agent>

Registry<Middleware>
```

Then plugins don't need to know one another.

Instead:

```ts
ctx.registry(Tools).add(myTool)
```

and another plugin does:

```ts
ctx.registry(Tools).all()
```

This gives:

```text
Plugin A ──┐
Plugin B ──┼──→ Registry<Tool> ←── Plugin C
Plugin D ──┘
```

instead of:

```text
A → B
B → C
C → D
```

That dramatically reduces coupling.

---

# 14. Hook system

Use the Hookable model almost directly.

```ts
type Hooks = {
  "context:create": (ctx: Context) => void

  "plugin:install": (plugin: Plugin) => void
  "plugin:start": (plugin: Plugin) => void
  "plugin:stop": (plugin: Plugin) => void

  "agent:start": (run: AgentRun) => void
  "agent:step": (step: AgentStep) => void
  "agent:end": (run: AgentRun) => void

  "tool:before": (call: ToolCall) => void
  "tool:after": (result: ToolResult) => void
}
```

And provide:

```ts
ctx.hooks.hook(...)
ctx.hooks.hookOnce(...)
ctx.hooks.callHook(...)
ctx.hooks.callHookParallel(...)
```

This gives you an extremely small event infrastructure. UnJS's implementation demonstrates that this can stay very small while retaining strong TypeScript inference. [GitHub](https://github.com/unjs/hookable/blob/main/src/hookable.ts?utm_source=chatgpt.com)

---

# 15. Use Hono's philosophy for adapters

Avoid putting environment-specific code into core.

Have:

```text
@acryl/core

@acryl/node
@acryl/bun
@acryl/deno

@acryl/http
@acryl/cli
@acryl/tui
@acryl/web
```

And:

```text
@acryl/plugin-openai
@acryl/plugin-anthropic
@acryl/plugin-filesystem
@acryl/plugin-postgres
@acryl/plugin-github
```

This resembles the good part of Hono's runtime portability and Unplugin's adapter model. [GitHub](https://github.com/hellOoSaksit/ai-project-scaffold/blob/main/examples/plugin-architecture/system-design.md?utm_source=chatgpt.com)

---

# 16. What I would NOT copy

### NestJS

Don't copy:

```text
decorator-heavy architecture
```

You don't need runtime metadata for everything.

### Express

Don't copy:

```text
global mutable application object
```

### Redux

Don't introduce a central global state store.

### LangChain

Don't make the core abstraction:

```text
Chain → Chain → Chain → Chain
```

Your abstraction should be:

```text
Context
   +
Services
   +
Plugins
   +
Scopes
   +
Hooks
```

### Generic EventEmitter

Don't use:

```ts
EventEmitter<string, any>
```

when TypeScript can express:

```ts
HookMap
```

---

# 17. The resulting conceptual model

I think your framework should eventually look like this:

```text
                         APPLICATION
                              │
                              ▼
                       Composition Root
                              │
                    ┌─────────┴─────────┐
                    │                   │
                 Context             Context
                    │                   │
             ┌──────┴──────┐            │
             │             │            │
          Services      Registries      │
             │             │            │
       ┌─────┼─────┐      │             │
       │     │     │      │             │
      DB    AI   Memory   Tools          │
       │     │     │      │              │
       └─────┴─────┴──────┘              │
                    │                    │
                    ▼                    │
                  Hooks ◄────────────────┘
                    │
                    ▼
                 Scopes
                    │
                    ▼
               Lifecycle
```

And the plugin graph:

```text
                 ┌──────────┐
                 │  Config  │
                 └────┬─────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
     Database       Logger        Model
        │             │             │
        └─────────────┼─────────────┘
                      ▼
                   Memory
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
        Tools       Agent       Planner
          │           │           │
          └───────────┼───────────┘
                      ▼
                   Runtime
```

This is much closer to **a compositional operating system for applications/agents** than a conventional framework.

---

# 18. The stack I recommend copying

I would explicitly treat these repositories as your architectural reference library:

### Tier 1 — directly study

**Cordis**

Copy the ideas:

```text
Context
Service
Registry
Isolation
Interception
Fibers/scopes
spatiotemporal composition
```

**Effect**

Copy:

```text
typed Context
Service identifiers
Layer composition
dependency requirements
resource Scope
memoization
lifecycle
```

**Fastify**

Copy:

```text
plugin graph
registration
encapsulation
dependency metadata
load/start/close ordering
```

### Tier 2 — copy primitives

**Hookable**

Copy:

```text
typed hooks
nested hooks
serial/parallel execution
unregister functions
HookableCore
```

**Unplugin**

Copy:

```text
one abstract plugin
multiple adapters
factory pattern
optional peer integrations
tiny core
```

### Tier 3 — copy DX philosophy

**Hono**

Copy:

```text
small core
zero unnecessary dependencies
runtime neutrality
excellent TypeScript API
composition
```

**tRPC**

Copy:

```text
aggressive type inference
API ergonomics
type-level contracts
```

tRPC's current project explicitly focuses on end-to-end type safety without code generation and keeps the runtime footprint small. [GitHub](https://github.com/nestjs/nest?utm_source=chatgpt.com)

---

# 19. My proposed framework architecture

I'd make the repository roughly:

```text
acryl/
│
├── packages/
│
│   ├── core/
│   │   ├── context/
│   │   ├── service/
│   │   ├── plugin/
│   │   ├── registry/
│   │   ├── hooks/
│   │   ├── scope/
│   │   ├── lifecycle/
│   │   ├── graph/
│   │   └── reflection/
│   │
│   ├── runtime/
│   │
│   ├── loader/
│   │
│   ├── config/
│   │
│   ├── cli/
│   │
│   ├── tui/
│   │
│   └── adapters/
│
├── plugins/
│   ├── filesystem/
│   ├── git/
│   ├── shell/
│   ├── http/
│   ├── database/
│   ├── memory/
│   ├── model/
│   ├── tools/
│   └── agents/
│
└── examples/
```

And critically:

```text
core has ZERO knowledge of:
OpenAI
Anthropic
GitHub
Postgres
React
Next.js
CLI
Agent
```

Those are plugins.

---

# 20. The key architectural improvement over Cordis

I would add one thing that Cordis does not make as explicit as Effect/Fastify:

## A first-class typed dependency graph

For example:

```ts
const Agent = definePlugin({
  id: "agent",

  requires: [
    Model,
    Memory,
    Tools,
  ],

  provides: [
    AgentRuntime,
  ],

  setup(ctx) {
    return {
      AgentRuntime: createAgentRuntime(
        ctx.get(Model),
        ctx.get(Memory),
        ctx.get(Tools),
      )
    }
  }
})
```

The framework can then calculate:

```text
requires(Model)
requires(Memory)
requires(Tools)

        ↓

dependency graph

        ↓

topological installation

        ↓

runtime context
```

That would make **CORDIS's composability + Effect's type-level dependency algebra + Fastify's runtime plugin graph** work together.

That is the combination I think is genuinely novel.

---

# Bottom line

For your project, my answer is:

> **Do not create "another plugin framework." Create a TypeScript application composition runtime.**

Use:

```text
CORDIS
   │
   ├── philosophical model
   │
   └── Context / isolation / temporal composition

EFFECT
   │
   └── typed services / dependency algebra / scopes

FASTIFY
   │
   └── plugin graph / encapsulation / lifecycle

HOOKABLE
   │
   └── event/hook primitive

UNPLUGIN
   │
   └── universal plugin + adapter model

HONO
   │
   └── minimal-core / runtime-neutral DX
```

The most important architectural equation would be:

```text
                 Plugin
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
       Requires  Provides  Hooks
          │        │        │
          └────────┼────────┘
                   ▼
                Context
                   │
              Composition
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
      Scope      Registry   Lifecycle
```

That is the architecture I would use as the starting point for **ACRYL BLENDS / your TypeScript Cordis-based framework**, rather than directly cloning any existing framework.