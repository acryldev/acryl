# Cordis System Guide for Coding Agents

> **End-to-end practical handbook for building on Cordis and DeepSeek Harness (`dsh`)**
> **Target:** DeepSeek Harness vendored `@deepseek-ai/cordis` and its Harness capability layer
> **Audience:** coding agents and engineers modifying, extending, or designing a Cordis-based agent harness
> **Research snapshot:** 2026-08-24
> **Primary implementation target:** this repository's pinned
> `deepseek-harness/` checkout at
> `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`, including its vendored Cordis
> source snapshot and local lifecycle/Loader patches. Public `master` is a
> comparison source, not authority for code in this checkout.

---

**Path convention:** Unless an ACRYL/root path is written explicitly, paths such
as `docs/...`, `packages/...`, and `vendor/...` in this guide are relative to
the pinned `deepseek-harness/` submodule.

## 0. Purpose of this document

This is a **single, operational A-to-Z tutorial**. It is designed so that a coding agent can read one file and then safely implement Cordis-style components without repeatedly rediscovering the architecture.

It explains:

- what Cordis is and is not;
- how the formal ideas in *A Programming Paradigm for Spatiotemporal Composability* map to real TypeScript code;
- how `Context`, `Fiber`, `Service`, `Registry`, effects, disposers, coeffects, injection, events, configuration, isolation, interception, Loader reconciliation, and HMR actually work;
- how DeepSeek Harness builds agent semantics on top of Cordis;
- how `tools`, `llm`, sessions, agents, prompt assembly, jobs, shell, filesystem, sandbox, and other capability seams fit together;
- how to build plugins, services, providers, consumers, tools, LLM adapters, event hooks, and policy wrappers;
- how to compose and hot-swap those pieces from `cordis.yml`;
- how to diagnose `PENDING`, failed, stale, leaking, or incorrectly wired plugins;
- how a coding agent should decide **which Cordis primitive to use** for a requested feature;
- which design rules are mandatory if we want components to be safely replaceable at runtime.

This is intentionally **not** a prose-only conceptual introduction. Every important concept has a concrete coding pattern, implementation rule, or diagnostic recipe.

---

# Part I — Read this first: the mental model

## 1. Cordis in one sentence

**Cordis is a runtime meta-framework that turns application capabilities into dynamically mountable components whose dependencies are tracked and whose in-process contributions have owned cleanup.**

In DeepSeek Harness, this becomes:

```text
DeepSeek Harness / dsh
        │
        │ domain semantics: agents, LLMs, tools, sessions, prompts, policies, UI
        ▼
Cordis
        │
        │ composition semantics: plugins, services, injection, effects, events,
        │ fibers, scopes, configuration, reconciliation, HMR
        ▼
Node.js / OS / external systems
```

The most important architectural statement in Harness is:

> **The product is a plugin tree.**

The LLM adapter is a plugin. The tool registry is a plugin. The agent loop is a plugin. Session storage is a plugin. Sandbox behavior is a plugin. UI/surface bundles are plugins and configuration layers.

Cordis itself does **not** know what an LLM, agent, chat, Bash command, or session means. That is why it is a **meta-framework** rather than an agent framework.

---

## 2. The five ideas to keep in working memory

When editing a Cordis system, reduce almost everything to these five ideas:

1. **Plugin = lifecycle unit.**
   A plugin is something Cordis can mount, suspend/reload, and dispose.

2. **Context = scoped capability environment.**
   `ctx` is how a plugin sees services and registers owned behavior.

3. **`inject` = live dependency contract.**
   It is not only startup DI. A consumer activates only while required service implementations exist. Provider identity changes can reactivate the consumer.

4. **Registration = effect = ownership.**
   If a plugin registers a listener, tool, provider, timer, watcher, or other contribution, that contribution must belong to the plugin's Fiber and have cleanup.

5. **`cordis.yml` = desired composition.**
   Configuration expresses the plugin tree. Stable entry IDs let Loader reconcile edits, provider swaps, configuration changes, and HMR without treating the whole process as disposable.

If a feature cannot be explained with these five ideas, inspect the owning subsystem before adding another abstraction.

---

## 3. The object model: do not confuse these terms

```text
Plugin definition
    │ ctx.plugin(plugin)
    ▼
Fiber                      ← one mounted runtime instance
    │ owns
    ├── child Context      ← scoped view of capabilities
    ├── effect disposers
    ├── dependency snapshot
    ├── child Fibers
    └── lifecycle state

Context
    ├── resolves Services by stable names
    ├── registers effects/listeners/plugins
    ├── dispatches typed Events
    ├── carries isolation/intercept scope
    └── exposes Registry + current Fiber

Service provider plugin
    └── provides ctx.<serviceName>

Consumer plugin
    └── injects <serviceName>
```

### Plugin
A **definition** or mountable callback/class/object. It may have zero, one, or many live Fibers.

### Fiber
A **runtime instance** of a plugin. The Fiber owns activation state and cleanup. A Fiber is not a thread, coroutine, React Fiber, or process.

### Context
The scoped interface passed into the plugin. It behaves like a dynamic service environment plus lifecycle-aware registration surface.

### Service
A named capability exposed on `ctx`, e.g. `ctx.tools`, `ctx.llm`, `ctx.sessions`, or a custom `ctx.myCap`.

### Registry
Tracks plugin runtimes and Fibers. Useful for introspection and diagnostics.

### Effect
A lifecycle-owned environmental contribution with a cleanup operation.

### Coeffect / `inject`
A declaration of contextual requirements. In Cordis, these requirements are reactive to live provider changes.

---

# Part II — The theory translated into engineering

## 4. Why “spatiotemporal composability” matters

The Cordis paper separates dynamic composition into two orthogonal problems.

### 4.1 Temporal composability

Question:

> Can a component withdraw its own in-process contributions later without leaving stale state or deleting independent contributions from other components?

Example problem:

```text
Plugin A registers tool A
Plugin B registers tool B
Plugin A registers event listener A
Plugin A starts timer A

later: unload A
```

Correct result:

```text
Tool A removed
Listener A removed
Timer A stopped
Tool B remains
Everything B owns remains
```

This is what **revertible effects** are for.

### 4.2 Spatial composability

Question:

> Can components stay valid while the live dependency graph changes?

Example:

```text
consumer injects 'llm'
        │
        └── currently resolved to Provider A

Provider A disappears
Provider B appears
```

The consumer must not keep a stale reference to A. Cordis reacts to the dependency change, unloads the consumer's active episode, and runs it again against the new provider when requirements are satisfied.

This is what **reactive coeffects** are for.

### 4.3 Why both are required

Dependency rebinding without cleanup leaves old registrations alive.

Cleanup without dependency rebinding leaves consumers calling dead providers.

Cordis combines both dimensions inside one `Context`/Fiber runtime.

---

## 5. Revertible effects

A revertible effect is conceptually:

```text
acquire / contribute
        ↓
   environment changed
        ↓
      disposer
        ↓
 contribution withdrawn
```

Canonical Cordis form:

```ts
ctx.effect(() => {
  const timer = setInterval(doWork, 1000)

  return () => {
    clearInterval(timer)
  }
})
```

### Rule

**If Cordis does not already own the resource, acquire it inside `ctx.effect()` and return cleanup.**

Bad:

```ts
export function apply(ctx: Context) {
  setInterval(doWork, 1000)
}
```

The timer outlives the plugin.

Good:

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(doWork, 1000)
    return () => clearInterval(timer)
  })
}
```

---

## 6. Disposer

A **disposer** is the concrete cleanup function.

Examples:

```ts
() => clearTimeout(timer)
() => socket.close()
() => watcher.close()
() => registry.delete(key)
() => abortController.abort()
```

A disposer may also be asynchronous:

```ts
ctx.effect(async () => {
  const connection = await openConnection()

  return async () => {
    await connection.flush()
    await connection.close()
  }
})
```

The Fiber waits for owned asynchronous cleanup to reach quiescence before disposal settles.

### Important implementation nuance

Current vendored Cordis allows effect setup to produce:

- one disposer;
- a promise of a disposer;
- an iterable of disposers;
- an async iterable of disposers.

Do not reach for generator effects unless they simplify a real incremental-acquisition case. A single effect with explicit cleanup is easier to audit.

---

## 7. Twisted composition and LIFO cleanup

The formal idea is that forward operations compose in acquisition order while inverses compose in reverse order.

```text
forward:   A → B → C
cleanup:   C⁻¹ → B⁻¹ → A⁻¹
```

Practical example:

```ts
ctx.effect(() => {
  const socket = openSocket()
  const subscription = socket.subscribe('events')

  return async () => {
    // reverse dependency order
    await subscription.unsubscribe()
    await socket.close()
  }
})
```

### Cordis teardown nuance

At the Fiber level, multiple top-level effects may be cleaned concurrently. Therefore:

> **If teardown operations have a required sequence, keep them inside one effect disposer and await them in the required order.**

Do not rely on timing between two independent asynchronous top-level effects.

Bad:

```ts
ctx.effect(() => {
  const db = openDb()
  return async () => db.close()
})

ctx.effect(() => {
  const writer = createWriter(/* depends on db */)
  return async () => writer.flush()
})
```

If ordering matters, combine ownership:

```ts
ctx.effect(() => {
  const db = openDb()
  const writer = createWriter(db)

  return async () => {
    await writer.flush()
    await writer.close()
    await db.close()
  }
})
```

---

## 8. Left inverse

The mathematical ideal is:

```text
g(f(c)) = c
```

where:

- `c` = starting context/environment;
- `f` = effect;
- `g` = cleanup/inverse.

In real systems this does **not** mean time travel.

You cannot un-send a network packet or erase an external observer's memory.

The coding rule is narrower:

> Make the plugin's **owned in-process contribution** disappear so the rest of the running system behaves as if that contribution were no longer mounted.

---

## 9. Observational equivalence

Recovery does not require every memory bit to become identical to an earlier snapshot.

The useful target is:

> After withdrawal, subsequent supported operations cannot distinguish the environment from one in which that component's contribution is absent, except for effects that are inherently external/irreversible and explicitly outside the recovery model.

This distinction is crucial for agent systems:

- a persisted session event cannot be “unhappened” by plugin disposal;
- an HTTP request already sent cannot be recalled;
- a file mutation may need a domain-specific compensation strategy;
- process-local registrations **can** and should be removed exactly.

Do not sell `ctx.effect()` as a transaction manager. It is lifecycle ownership, not distributed rollback.

---

## 10. Reactive coeffects

A coeffect expresses what a component needs from its environment.

In Cordis:

```ts
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // During this activation episode, both are available.
  ctx.tools
  ctx.llm
}
```

The key word is **reactive**.

Cordis continually ties activation to the implementations that satisfy the injection set.

Conceptually:

```text
missing dependency
      ↓
   PENDING
      ↓ provider appears
   LOADING
      ↓
    ACTIVE
      ↓ provider disappears/replaced
  UNLOADING
      ↓
   PENDING
      ↓ new provider appears
   LOADING
      ↓
    ACTIVE
```

This is more than a one-time dependency container lookup.

---

## 11. Dependency identity matters, not just dependency name

Suppose a plugin injects `shell`.

```text
'shell' → LocalShell#fiber-15
```

Then configuration replaces it with:

```text
'shell' → RemoteShell#fiber-29
```

Even though the **name** is still `shell`, the provider Fiber identity changed.

Cordis tracks the implementation episode. A dependent plugin can be reactivated so it no longer holds references captured from the former provider.

This is one of the most important reasons to use stable service names and avoid importing concrete provider implementations into consumers.

---

## 12. Theory-to-code mapping

| Formal / conceptual notion | Cordis mechanism | Coding-agent rule |
|---|---|---|
| Component | Plugin + mounted Fiber | Put independently replaceable behavior behind a plugin boundary |
| Effect | `ctx.effect()` or lifecycle-aware registration | Every contribution must have an owner |
| Revertible effect | acquisition + disposer | Acquire and clean up in the same lifecycle scope |
| Disposer | returned cleanup function | Make it idempotent/safe and await real cleanup |
| Reactive coeffect | `inject` + service resolver | Declare hard dependencies instead of assuming load order |
| Context | `ctx` proxy and scope | Resolve capabilities through stable service names |
| Dependency topology | service providers + injection graph | Consumers depend on interfaces/capabilities, not concrete providers |
| Temporal withdrawal | Fiber unload | Expect every owned registration to disappear |
| Spatial rebind | provider identity change → reactivation | Never cache provider references outside the owning activation episode |
| Observational recovery | complete removal of owned live contributions | Test absence of stale tool/listener/provider/handle state |
| Composition | `ctx.plugin()` and Loader tree | Make desired runtime structure explicit |
| Dynamic reconciliation | Loader/HMR | Stable IDs + reversible plugin design are mandatory |

---

# Part III — The actual Cordis runtime

## 13. Target the right Cordis

There are two closely related targets:

### Upstream

```text
cordiverse/cordis
npm: cordis
```

### DeepSeek Harness vendored/rescoped line

```text
deepseek-ai/deepseek-harness/vendor/cordis
package: @deepseek-ai/cordis
```

At the inspected 2026-08-24 Harness snapshot, the vendor manifest records the
upstream source provenance:

```text
@deepseek-ai/cordis
upstream package: cordis
upstream version snapshot: 4.0.0-rc.7
upstream commit: 56b3d4f725681cf4556c1a8695a709cc3b6eed74
```

The rescoped package published by this pinned Harness checkout is currently
`@deepseek-ai/cordis` `4.0.1`. The upstream snapshot version documents source
provenance; the rescoped package version is the dependency/runtime version ACRYL
must satisfy.

Harness also carries local changes, including lifecycle hardening, lazy config resolution, and transactional Loader/Include reconciliation.

### Coding-agent rule

**When working inside DeepSeek Harness, treat its vendored source and generated Harness docs/types as authoritative.**

Do not copy an upstream Cordis example blindly if its API or Loader behavior differs.

Before implementing a nontrivial feature, inspect locally:

```text
vendor/cordis/src/
vendor/loader/src/
vendor/include/src/
vendor/hmr/src/
docs/cordis-primer.md
docs/cordis-tutorial/
docs/subsystems/
```

---

## 14. Creating the root Context

Pure Cordis can start with:

```ts
import { Context } from '@deepseek-ai/cordis'

const root = new Context()
```

The root Context creates core runtime machinery including:

```text
ctx.events
ctx.logger
ctx.reflect
ctx.registry
ctx.fiber
ctx.root
```

Harness normally creates the composition for you, so ordinary Harness plugins receive `ctx` rather than constructing another root.

### Rule

**Do not create random root Contexts inside feature plugins.**

A second root is a second dependency universe. Use child/scoped contexts only when isolation is intentional.

---

## 15. What `ctx` really is

The current Context is a Proxy-backed scoped environment.

It serves four jobs simultaneously:

1. **capability lookup** — `ctx.llm`, `ctx.tools`, `ctx.myService`;
2. **lifecycle ownership** — `ctx.effect`, `ctx.plugin`, `ctx.on`;
3. **event dispatch** — `ctx.emit`, `ctx.waterfall`, etc.;
4. **scope definition** — isolation/intercept behavior and current Fiber.

You should think:

```text
ctx = “the world this plugin is currently allowed to see and modify”
```

not:

```text
ctx = “a bag of global singleton objects”
```

---

## 16. Context API: core practical surface

Common public operations:

```ts
ctx.plugin(plugin, config?)
ctx.inject(dependencies, callback)
ctx.effect(effectBody)

ctx.on(event, listener, options?)
ctx.once(event, listener, options?)
ctx.emit(event, ...args)
ctx.parallel(event, ...args)
ctx.serial(event, ...args)
ctx.bail(event, ...args)
ctx.waterfall(event, ...args, next)

ctx.get('serviceName')

ctx.extend(meta?)
ctx.isolate('serviceName', label?)
ctx.intercept('serviceName', config)

ctx.registry
ctx.fiber
ctx.logger
ctx.root
```

Exact package-specific additions come through TypeScript declaration merging. In Harness, importing the package that owns a service/event surface is often required for types.

---

## 17. `extend()` — make a scoped child view

`extend(meta)` creates a child Context that prototypically inherits its parent and can carry extra metadata.

```ts
const child = ctx.extend({ requestId: 'r-123' })
```

The parent is not mutated.

Use this when a subsystem intentionally propagates scoped metadata.

Do **not** use `extend` as an arbitrary global state mechanism.

---

## 18. `isolate()` — create a separate service realm

```ts
const isolated = ctx.isolate('shell')
```

Below this child context, the named service resolves in a different isolation realm.

This is what allows two plugin groups to each have their own `shell` implementation under the same service name.

Conceptual example:

```text
root
├── group A  isolate(shell=A)
│   ├── LocalShell(timeout=5s)
│   └── agent A → ctx.shell = A's shell
│
└── group B  isolate(shell=B)
    ├── LocalShell(timeout=60s)
    └── agent B → ctx.shell = B's shell
```

### Important

Service isolation is **not a security sandbox**.

It changes Cordis resolution scope; it does not stop plugin code from using Node APIs directly.

---

## 19. `intercept()` — scoped service configuration

A service can expose interceptable configuration. A child context may provide an override:

```ts
const child = ctx.intercept('someService', {
  timeoutMs: 5000,
})
```

The service resolves config by combining intercept layers according to its contract.

This is advanced. Prefer ordinary plugin configuration until a service explicitly supports scoped interception and there is a real need for per-subtree behavior.

---

## 20. There is no generic `ctx.fork()` in current public Context API

The term **fork** is overloaded in architecture discussions.

Do not invent:

```ts
ctx.fork() // not the generic public Context API described by current source
```

Use the correct mechanism:

- mount a child lifecycle → `ctx.plugin(...)`;
- derive child context metadata → `ctx.extend(...)`;
- create a service realm → `ctx.isolate(...)`;
- alter scoped service config → `ctx.intercept(...)`;
- fork a **Harness session** → the session subsystem's `ctx.sessions.fork(...)` API, which is a completely different domain concept.

A coding agent must distinguish **context scope** from **session history fork**.

---

# Part IV — Plugins and Fibers

## 21. The three plugin shapes

Cordis accepts three practical forms.

### 21.1 Function plugin — default choice

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello')
}
```

A function itself can also be mounted:

```ts
function heartbeat(ctx: Context) {
  // ...
}

ctx.plugin(heartbeat)
```

### 21.2 Object plugin

```ts
export const plugin = {
  name: 'object-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### 21.3 Class plugin / Service subclass

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myService')
  }
}
```

Use class form when the plugin naturally **provides a service** or benefits from a service object's public methods/state.

### Default decision

```text
Need lifecycle only?         → function plugin
Need structured object form? → object plugin
Need to provide service API? → Service class
```

---

## 22. Plugin metadata

Current plugin runtime understands metadata such as:

```ts
export const name = 'my-plugin'
export const inject = ['tools', 'llm']
export const Config = /* Standard Schema */
```

At the underlying runtime type level there are also concepts such as `provide` and `intercept` metadata. Ordinary Harness authors should follow subsystem examples instead of manually manipulating low-level metadata without need.

---

## 23. `ctx.plugin()`

```ts
const fiber = ctx.plugin(myPlugin, config)
```

This:

1. resolves the plugin shape;
2. creates/reuses a plugin runtime record;
3. creates a child Fiber;
4. creates a child Context bound to that Fiber;
5. normalizes injection declarations;
6. waits for requirements;
7. validates configuration when activation is possible;
8. executes the plugin;
9. tracks all owned effects;
10. returns a Fiber-like thenable.

You can await initial settlement:

```ts
const fiber = await ctx.plugin(myPlugin)
```

Or keep the handle:

```ts
const fiber = ctx.plugin(myPlugin)
await fiber.await()
```

---

## 24. `ctx.inject()` shorthand

For localized dependency-gated behavior:

```ts
ctx.inject(['tools'], (ctx) => {
  // active only while tools exists
})
```

Conceptually it is shorthand for mounting a plugin with that injection declaration.

This is useful when a larger service/class needs one method or sub-behavior to come alive only under additional dependencies.

Do not use it to hide the primary dependencies of a top-level plugin. Those should remain visible in the plugin's `inject` metadata.

---

## 25. Fiber state machine — actual current states

The current vendored implementation exposes:

```text
PENDING
LOADING
ACTIVE
FAILED
UNLOADING
DISPOSED
```

Useful transition model:

```text
                         apply/config error
                              ┌───────► FAILED
                              │
PENDING ──deps ready────► LOADING ─────► ACTIVE
   ▲                                    │
   │                                    │ dependency/provider change
   │                                    │ restart/update/HMR
   │                                    ▼
   └────────────────────────────── UNLOADING
                                      │
                                      ├── still mounted, requirements absent
                                      │       → PENDING
                                      │
                                      ├── requirements already satisfied/new epoch
                                      │       → LOADING
                                      │
                                      └── explicit permanent disposal
                                              → DISPOSED
```

### Important correction: `INACTIVE`

Some conceptual explanations use the word **inactive**, but current `FiberState` does not export an `INACTIVE` enum member.

Treat “inactive” as a conceptual condition, not an enum constant.

### Important correction: temporary dependency loss ≠ permanent disposal

A service disappearing does not necessarily destroy the Fiber forever.

The active episode unloads. The mounted Fiber may settle back into `PENDING` and reactivate later.

`DISPOSED` means the Fiber's runtime identity has been explicitly removed and it cannot restart normally.

---

## 26. `PENDING` is not an error

A plugin in `PENDING` is saying:

```text
“I am mounted, but my declared environment does not currently exist.”
```

This is a valid state because a provider may appear later.

Therefore this can exit silently:

```ts
export const inject = ['doesNotExist']

export function apply(ctx: Context) {
  console.log('never prints while missing')
}
```

If nothing else keeps Node alive, the process can even exit cleanly.

### Diagnostic rule

When a plugin “does nothing,” inspect Fiber state before assuming its `apply()` is broken.

---

## 27. Fiber methods a coding agent should know

### Await stable initial state

```ts
await fiber.await()
```

Startup/config errors are rethrown.

### Permanently dispose mounted instance

```ts
await fiber.dispose()
```

Waits for owned cleanup and children.

### Restart current plugin

```ts
await fiber.restart()
```

Unload and activate again using current configuration/dependencies.

### Update config

```ts
await fiber.update(newConfig)
```

Validation/reconciliation hooks can participate.

### Inspect effects

Current Fiber provides diagnostic metadata for live effects:

```ts
fiber.getEffects()
```

This can be valuable when hunting lifecycle leaks.

---

## 28. The Registry

Every Context exposes the plugin registry:

```ts
ctx.registry
```

Diagnostic example:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  for (const runtime of ctx.registry.values()) {
    for (const fiber of runtime.fibers) {
      console.log({
        name: fiber.name,
        state: FiberState[fiber.state],
        uid: fiber.uid,
      })
    }
  }
}
```

Depending on TS enum emission/const-enum setup, direct reverse lookup may not be available in every build; the tutorial's robust check is comparing to `FiberState.PENDING` and logging the name.

### Use Registry for

- diagnostics;
- runtime introspection tooling;
- developer panels;
- HMR/debugging tests.

### Do not use Registry for

- ordinary cross-plugin business calls;
- searching for a concrete provider instead of defining a service dependency;
- creating hidden load-order coupling.

---

# Part V — Effects: the non-negotiable lifecycle discipline

## 29. What is already an effect

Many Cordis/Harness registration APIs already attach cleanup to the current Fiber.

Examples include:

```ts
ctx.on(...)
ctx.once(...)
ctx.plugin(...)
```

And Harness registries are designed similarly:

```ts
ctx.tools.register(...)
ctx.llm.registerAdapter(...)
```

Service provisioning is also lifecycle-owned.

Therefore you should not wrap every Cordis helper in another `ctx.effect()` mechanically.

---

## 30. When to write `ctx.effect()` yourself

Use it for resources Cordis does not know how to clean up.

Common cases:

```text
setTimeout / setInterval
filesystem watcher
WebSocket / TCP connection
message-broker subscription
child process not owned by another Harness service
third-party event emitter registration
temporary file / lock
native handle
background queue worker
external SDK subscription
```

Example watcher:

```ts
ctx.effect(() => {
  const watcher = watch(directory, onChange)
  return () => watcher.close()
})
```

Example emitter:

```ts
ctx.effect(() => {
  emitter.on('data', onData)
  return () => emitter.off('data', onData)
})
```

---

## 31. Effect anti-pattern: acquire outside the effect

Risky:

```ts
const socket = openSocket()

export function apply(ctx: Context) {
  ctx.effect(() => {
    return () => socket.close()
  })
}
```

The resource does not have a clean one-to-one relation to the plugin activation episode.

Preferred:

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const socket = openSocket()
    return () => socket.close()
  })
}
```

This keeps acquisition and release inside one owner scope.

---

## 32. Effect anti-pattern: fire-and-forget asynchronous setup

Bad:

```ts
export function apply(ctx: Context) {
  void connect().then(connection => {
    // Now who owns this if the plugin unloaded before connect resolved?
  })
}
```

Better:

```ts
export function apply(ctx: Context) {
  ctx.effect(async () => {
    const connection = await connect()
    return () => connection.close()
  })
}
```

Harness's vendored Cordis includes lifecycle hardening specifically around re-entrant/async setup and disposal. Use the framework path instead of rebuilding ownership yourself.

---

## 33. Effect anti-pattern: cleanup creates new long-lived effects

During unload, the owner is leaving. Do not register replacement listeners/timers from a disposer unless the owning architecture explicitly creates a new Fiber elsewhere.

Current vendored lifecycle hardening rejects effect creation while a Fiber is `UNLOADING`.

This is a useful invariant:

```text
cleanup removes ownership
cleanup does not secretly extend ownership
```

---

## 34. Effect audit checklist

For every plugin, a coding agent should ask:

```text
[ ] What does apply() add to the process?
[ ] Which additions are already lifecycle-aware APIs?
[ ] Which additions need ctx.effect()?
[ ] Can asynchronous setup complete after unload begins?
[ ] Does the framework own that race, or did I create a detached promise?
[ ] Does each disposer fully quiesce its resource?
[ ] Does cleanup depend on another cleanup ordering?
[ ] If yes, are those steps inside one disposer?
[ ] Does any callback retain ctx/service references after unload?
[ ] Can an external irreversible side effect occur? If so, is that consciously outside rollback semantics?
```

---

# Part VI — Services and live dependency injection

## 35. What a Service is

A Service is a named capability.

Examples in Harness:

```ts
ctx.tools
ctx.llm
ctx.agents
ctx.sessions
ctx.systemPrompt
ctx.shell
ctx.fs
ctx.sandbox
ctx.jobs
```

A consumer should depend on the **capability name/interface**, not on the concrete provider package.

---

## 36. Provide a custom service

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(name: string) {
    return `Hello, ${name}!`
  }
}

export const name = 'greeter-provider'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

Two independent things happen:

### Runtime

```ts
super(ctx, 'greeter')
```

provides the service in the current Cordis scope.

### Compile time

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}
```

teaches TypeScript that `ctx.greeter` exists.

Declaration merging alone does **not** provide anything at runtime.

---

## 37. Consume a required service with `inject`

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from './greeter-provider.ts'

export const name = 'greeter-consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('Ada'))
}
```

The contract is:

```text
apply() runs only while greeter is available in this service scope
```

Do not duplicate runtime checks inside `apply()` for a hard dependency.

---

## 38. Required vs optional dependencies

### Required

```ts
export const inject = ['metrics']

export function apply(ctx: Context) {
  ctx.metrics.record('loaded', 1)
}
```

Plugin should not run without the capability.

### Optional

```ts
export function apply(ctx: Context) {
  const metrics = ctx.get('metrics')
  metrics?.record('loaded', 1)
}
```

Plugin remains useful without the capability.

### Decision rule

Ask:

> If this service does not exist, is the plugin's behavior still valid and complete?

- no → `inject`;
- yes → optional lookup or a separate dependency-gated sub-plugin.

---

## 39. Never use YAML order as dependency order

Wrong assumption:

```yaml
- name: './provider.ts'
- name: './consumer.ts'
```

Therefore provider loads first.

That is **not** the Cordis contract. Entries may start concurrently.

Correct dependency:

```ts
export const inject = ['myService']
```

`cordis.yml` says **what exists**. `inject` says **what must be ready before activation**.

---

## 40. Dynamic provider replacement

Suppose provider A and B implement the same service definition.

Consumer:

```ts
export const inject = ['translator']

export function apply(ctx: Context) {
  ctx.on('document/received', doc => {
    void ctx.translator.translate(doc.text)
  })
}
```

Swap provider A for B in configuration.

Correct Cordis behavior:

```text
1. old provider leaves
2. consumer's active episode unloads
3. consumer-owned listener disappears
4. new provider activates
5. consumer reactivates
6. listener is registered again against the new dependency environment
```

No stale provider reference survives if the plugin follows ownership rules.

---

## 41. Service definition / provider / consumer = capability seam

For a capability intended to have replaceable implementations, use three roles.

```text
             Service Definition
           interface + request/result
              /             \
             /               \
        Provider           Consumer
      implementation     tool/feature/etc.
```

DeepSeek Harness's Bash family is the canonical pattern:

```text
dsh-shell         → definition

dsh-bash-local    → provider

dsh-tool-bash     → consumer/model-facing tool
```

Provider and consumer depend on the definition. They should not depend on each other.

---

## 42. Do not split every tiny feature into three packages

Capability seams are valuable when implementations need to vary independently.

For a one-off tool whose implementation is unlikely to be replaced, this is enough:

```text
one plugin
  └── registers one tool
```

Split when you need:

- multiple providers;
- environment-specific execution;
- independent security/policy boundary;
- independent API evolution;
- multiple different consumers;
- per-agent or per-group provider selection.

Architecture is not improved by package count alone.

---

# Part VII — Events

## 43. Service call vs event

Use a **Service method** when the caller knows which capability it wants and needs a result.

```ts
await ctx.shell.execute(request)
```

Use an **Event** when behavior is open to observers/interceptors and the producer should not know the consumers.

```ts
ctx.emit('stats/report', data)
```

Or:

```ts
await ctx.waterfall('policy/request', request, defaultHandler)
```

---

## 44. Declare typed events

```ts
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}
```

Then:

```ts
ctx.on('stats/report', (name, count) => {
  console.log(name, count)
})

ctx.emit('stats/report', 'tool_call', 1)
```

The declaration merge gives compile-time typing. It does not automatically emit or register anything.

---

## 45. Event dispatch modes

### `emit` — synchronous broadcast

```ts
ctx.emit('feature/changed', payload)
```

- listeners invoked synchronously;
- values ignored;
- returned promises not awaited.

Use for cheap observation/notification where asynchronous completion is not part of the producer contract.

### `parallel` — await all listeners concurrently

```ts
await ctx.parallel('feature/flush', payload)
```

Use when all listeners must finish but do not depend on each other's order/results.

Current core aggregates failures after concurrent settlement.

### `serial` — ordered async short-circuit

```ts
const result = await ctx.serial('feature/check', input)
```

Listeners run in registration order and are awaited. First value other than `null`, `false`, or `undefined` bails out.

### `bail` — synchronous short-circuit

```ts
const result = ctx.bail('feature/check-sync', input)
```

Same bail condition, synchronous.

### `waterfall` — around-middleware

```ts
const result = await ctx.waterfall(
  'feature/transform',
  input,
  async () => defaultResult,
)
```

Listeners wrap downstream behavior.

---

## 46. Waterfall: the most dangerous event mode to misuse

Example:

```ts
ctx.on('demo/transform', async (input, next) => {
  const result = await next()
  return result.trim()
})
```

Another listener can intentionally intercept:

```ts
ctx.on('demo/transform', async (input, next) => {
  if (input.includes('blocked')) {
    return 'blocked'
  }

  return next()
})
```

### Absolute rule

> A waterfall listener that is only observing, logging, measuring, or annotating must call `next()`.

Bad logger:

```ts
ctx.on('agent/request', async (req, next) => {
  console.log(req)
  // forgot next() — downstream model request is swallowed
})
```

Correct:

```ts
ctx.on('agent/request', async (req, next) => {
  console.log(req)
  return next()
})
```

Missing `next()` is a deliberate veto, not an innocent omission.

---

## 47. Event listeners are effects

```ts
ctx.on('tools/result', handler)
```

belongs to the current Fiber and is removed automatically when that Fiber unloads.

Do not add manual global listener cleanup around ordinary `ctx.on()` unless you are intentionally disposing the listener earlier than plugin lifetime.

---

## 48. Cordis events vs durable Harness session events

This distinction prevents many architectural mistakes.

### Live Cordis events

Examples:

```text
agent/request
tools/result
approval/request
session/event
```

These are runtime dispatch surfaces.

### Durable session-event records

Examples:

```text
turn/start
step/start
user/message
assistant/chunk
assistant/message
tool/call
tool/result
turn/end
```

These are facts stored in the session log.

Do not assume a durable event type automatically has a same-named Cordis event.

To observe the durable stream, listen to the session subsystem's runtime event and inspect record type:

```ts
ctx.on('session/event', event => {
  if (event.type === 'tool/result') {
    // durable session fact
  }
})
```

### Rule

**If model-visible or replay-critical state must survive reload, it belongs in durable session history—not only in a transient Cordis event.**

---

# Part VIII — Plugin configuration

## 49. Config type + runtime schema

Recommended pattern:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  maxRetries: number
  verbose: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)
}
```

A TypeScript interface is compile-time only.

The exported runtime `Config` schema validates input before activation.

---

## 50. Fail before partial activation

Bad configuration should prevent `apply()` from running.

This is desirable:

```text
raw config
   ↓
validate + defaults
   ↓ invalid
FAILED
```

rather than:

```text
apply half starts
opens resources
then discovers bad config
then tries to recover manually
```

Use schema constraints for self-contained validation.

Use dependency-aware validation for resource/provider names that can only be resolved once services are active.

---

## 51. Tunable deployment values belong in config

Bad:

```ts
const TIMEOUT_MS = 30_000
```

if deployments may legitimately differ.

Better:

```ts
export interface Config {
  timeoutMs: number
}

export const Config = Schema.object({
  timeoutMs: Schema.number().default(30_000),
})
```

Rule:

> If two deployments may need different values, `cordis.yml` should be able to change it without editing source.

---

## 52. `!!js` computed configuration in Harness Loader

Harness's Loader/Include layer supports computed values in `config`:

```yaml
- id: demo
  name: './demo.ts'
  config:
    apiKey: !!js process.env.DEMO_API_KEY
```

And computed `disabled`:

```yaml
- id: platform-feature
  name: './platform-feature.ts'
  disabled: !!js process.platform !== 'darwin'
```

Important behavior in the current Harness patches:

- plugin `config` expressions are resolved lazily when declared injections are active, against that plugin context;
- `disabled` is evaluated at mount decisions against Loader context;
- other entry metadata stays literal;
- nested Include rows preserve expressions until the owning row activates.

Do not assume arbitrary YAML fields execute JavaScript.

---

## 53. Config update and HMR

A config edit can cause the plugin's old activation episode to unload and the new one to activate.

That is why lifecycle-clean registrations matter even when source code never changes.

The test is:

```text
change config 20 times
```

and confirm there is still:

```text
one listener
one tool registration
one timer
one provider
```

not 20 of each.

---

# Part IX — `cordis.yml`, Loader, reconciliation, and HMR

## 54. Minimal composition

```yaml
- name: './hello.ts'
```

Each row is a plugin entry.

A better long-lived config uses stable IDs:

```yaml
- id: hello
  name: './hello.ts'
```

---

## 55. Stable IDs are operationally important

Without a stable `id`, Loader may not be able to identify a row across configuration rereads as the same logical entry.

Use explicit IDs for application-level rows that should be reconciled rather than treated as unrelated removals/additions.

Good:

```yaml
- id: llm-provider
  name: './providers/deepseek.ts'

- id: my-tools
  name: './tools/index.ts'
```

---

## 56. `disabled`

Keep a row but prevent mounting:

```yaml
- id: experimental-feature
  name: './experimental.ts'
  disabled: true
```

Flip to false and dependency-gated consumers can activate as services appear.

This is preferable to commenting random pieces in and out when you want stable identity and patchability.

---

## 57. Groups and isolation

Harness docs show group-style composition for separate service realms.

Conceptual configuration:

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - id: shell-a
      name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 5000
    - id: consumer-a
      name: './consumer-a.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - id: shell-b
      name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 60000
    - id: consumer-b
      name: './consumer-b.ts'
```

Both consumers inject `shell`, but service resolution is scoped.

---

## 58. HMR composition

Tutorial setup:

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'

- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'

- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']

- id: hello
  name: './hello.ts'
```

HMR itself has dependencies. In the tutorial it needs the timer service for debounce and logs via Cordis logger.

This is a good illustration of Cordis philosophy: even the reload machinery participates in the same dependency system.

---

## 59. Harness-specific transactional reconciliation

DeepSeek Harness's vendored Loader/Include layer contains local hardening beyond the plain conceptual tutorial.

Its vendor manifest explicitly describes transactional behavior such as:

- import a changed candidate before disposing a working entry when possible;
- await lifecycle settlement;
- restore previous plugin/config when candidate application fails;
- reconcile grouped changes and undo partial changes on failure;
- validate Include candidate content before committing cached state;
- serialize Include child-tree mutation;
- keep failed dependencies `PENDING` rather than corrupting the live tree.

### Why this matters

HMR safety depends on two layers:

```text
Loader reconciliation correctness
            +
plugin effect/disposer correctness
```

Transactional Loader logic cannot save a plugin that leaked an unmanaged global timer or mutated an external singleton irreversibly.

---

## 60. HMR mental model

For a changed plugin:

```text
old code ACTIVE
     │
     ▼
unload old activation
     │ cleanup effects
     ▼
load candidate code
     │ validate/configure
     ▼
ACTIVE new code
```

With Harness reconciliation, failed candidate application can be contained/restored in more cases.

### Coding-agent requirement

A plugin must be written as if `apply()` can happen many times in one process.

If that assumption breaks the implementation, it is not HMR-safe.

---

# Part X — DeepSeek Harness: Cordis becomes an agent runtime

## 61. Agent Harness definition

An agent harness is the surrounding execution environment that turns a model into an operational agent.

It supplies things such as:

```text
system prompts
model providers
model-tool loop
tools
sessions/history
permissions/approval
storage
filesystem/shell
sandboxing
background jobs
agent coordination
UI/CLI surfaces
telemetry
```

Cordis manages composition. Harness defines these domain capabilities.

---

## 62. Important built-in Harness service names

The exact generated subsystem docs and TypeScript types are authoritative, but major current services include:

| Capability | Typical `ctx` key | Purpose |
|---|---|---|
| Session log/runtime | `ctx.sessions` | durable session event store, fork/resume primitives |
| System prompt | `ctx.systemPrompt` | assembled prompt sections and tool schema contribution |
| Tool runtime | `ctx.tools` | model-visible tool registry and guarded execution pipeline |
| Live agents | `ctx.agents` | active agent handles and agent events |
| Agent loop | `ctx.agentLoop` | default turn/step driver |
| LLM | `ctx.llm` | provider-neutral generation and adapter routing |
| Shell | `ctx.shell` | shell capability seam |
| Filesystem | `ctx.fs` | filesystem capability seam |
| Sandbox | `ctx.sandbox` | process/file confinement integration |
| Jobs | `ctx.jobs` | durable-ish runtime ownership of background work |
| Commands | `ctx.commands` | human/runtime commands that do not require model tool selection |

Before using any service, inspect its owning subsystem docs and package declarations because Harness is evolving quickly.

---

## 63. Turn and Step

Current Harness architecture defines:

### Step

One model request plus the tool executions caused by the response.

### Turn

Zero or more steps that drain one accepted input until no additional work is owed.

Simplified flow:

```text
turn/start
  claim input
  assemble prompt + tool schemas
  agent/pre-step
    step/start
      persist user/message
      derive model history
      agent/request
        llm/stream
          assistant/chunk*
          assistant/message
      tool/call*
        tools/pre-execute
        tools/execute
        tools/post-execute
        tool/result*
    step/end
    maybe another step
  agent/turn-stopping
turn/end
```

### “Round”

Do not treat `round` as a universal Cordis runtime primitive.

Where a strategy/outer-loop package uses “round,” follow that package's contract. In the current core architecture, **Turn** and **Step** are the primary loop terms.

---

## 64. “Everything is a plugin” does not mean “everything is a separate package”

It means major runtime capabilities can be mounted and replaced through the composition model.

Good plugin boundary:

```text
LLM provider
filesystem provider
permission policy
tool family
memory/context system
agent loop strategy
UI surface
```

Usually bad plugin boundary:

```text
one tiny pure helper function
one constant
one local data transform with no lifecycle/config/replacement need
```

Make a unit a plugin when lifecycle, replacement, configuration, ownership, or dependency topology matters.

---

# Part XI — Tools: from Cordis plugin to model-callable capability

## 65. A Tool is not a Cordis primitive

This distinction is fundamental.

Cordis provides:

```text
plugin
service
inject
effect
event
scope
fiber
loader
```

Harness provides a **`tools` Service**.

A model-facing tool is registered into that service:

```ts
ctx.tools.register(...)
```

So a tool plugin is ordinary Cordis composition plus a Harness-specific registry operation.

---

## 66. Minimal tool

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',

    parameters: {
      name: {
        type: 'string',
        required: true,
        description: 'The name to greet',
      },
    },

    output: {
      schema: { type: 'string' },
      render: (_args, value) => [
        { type: 'text', text: value },
      ],
    },

    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

What happens:

```text
inject tools
   ↓
plugin waits until ToolRuntime exists
   ↓
register tool definition
   ↓
registration becomes owned by plugin Fiber
   ↓
Tool schema joins model-visible tool set
   ↓
plugin unload
   ↓
tool unregisters automatically
```

---

## 67. Tool definition anatomy

```text
name
  stable model-visible operation name

description
  tells model what the operation does

parameters
  validates and types model-supplied arguments

output.schema
  canonical programmatic value contract

execute(args, exec)
  does the real work

output.render(args, value)
  converts canonical value to model-facing Native content

presentation metadata / presenters (optional)
  UI replay/card concern, separate from canonical return
```

---

## 68. The canonical-value rule

A production tool should return a structured canonical value, not prose that other code must parse.

Bad:

```ts
return `Created file at ${path} with id ${id}`
```

if downstream code needs both fields.

Better:

```ts
output: {
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      id: { type: 'string' },
    },
    required: ['path', 'id'],
  },
  render: (_args, value) => [{
    type: 'text',
    text: `Created ${value.path}`,
  }],
},

async execute(args) {
  return { path, id }
}
```

Programmatic truth belongs in the canonical value. Human/model formatting belongs in the renderer.

---

## 69. Tool argument validation

`defineTool` validates the model-generated arguments according to its parameter DSL before `execute()`.

Inside `execute`, TypeScript can infer argument types.

You still must validate semantic constraints not represented by the schema.

Example:

```ts
parameters: {
  limit: { type: 'number', required: true },
}

async execute(args) {
  if (!Number.isInteger(args.limit) || args.limit <= 0) {
    throw new Error('limit must be a positive integer')
  }
}
```

Do not assume a primitive type check expresses every business invariant.

---

## 70. Honor cancellation

Production tool:

```ts
async execute(args, exec) {
  return await readFile(args.path, {
    encoding: 'utf8',
    signal: exec.signal,
  })
}
```

If a downstream API supports `AbortSignal`, pass `exec.signal`.

If it does not, write an adapter that cooperates with cancellation as far as possible.

Ignoring cancellation creates teardown and session-stopping problems.

---

## 71. Tool identity is runtime-owned

The tool execution runtime protects identity fields such as:

```text
callId
name
arguments
agent
token
signal
optional parent execution identity
```

Treat arguments as read-only input.

Do not mutate the registered tool definition after registration. To replace behavior, let the owning effect/plugin dispose and register a replacement.

That is the Cordis way:

```text
replace component
not mutate hidden shared definition in place
```

---

## 72. Tool error behavior

Infrastructure failure should throw.

A domain-successful but nonideal outcome should often remain a valid canonical value.

Example Bash:

```text
process exited code 2
```

can still be a successfully executed tool whose canonical result contains `exitCode: 2`, rather than an infrastructure exception.

Use exceptions for failure of the tool execution contract itself.

---

## 73. Tool execution policy extension points

Harness exposes a pipeline around tool execution.

Conceptually:

```text
tool call
   ↓
tools/pre-execute
   ↓
tools/execute       ← around-dispatch wrappers
   ↓
actual tool body
   ↓
tools/post-execute
   ↓
normalized result
   ↓
tools/result        ← observation
```

Typical uses:

### `tools/pre-execute`

- permission decision;
- allow/deny/ask policy;
- argument policy.

### `ctx.tools.guard()`

A final monotonic deny mechanism where appropriate. A later extension should not be able to undo the denial.

### `tools/execute`

Around behavior:

- timeout;
- tracing;
- metrics;
- retry when semantically safe;
- execution wrapping.

Remember waterfall semantics: delegate with `next()` unless intentionally replacing/vetoing.

### `tools/post-execute`

- presentation adjustment;
- attach model context;
- confidentiality filtering;
- result transformation under the subsystem contract.

### `tools/result`

Observe normalized immutable outcome.

Good for:

- telemetry;
- logs;
- counters;
- analytics;
- non-mutating observers.

---

## 74. Tool observer example

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('')

    console.log(`[tool] ${exec.name} -> ${text.slice(0, 120)}`)
  })
}
```

Because `ctx.on()` is an effect, HMR does not accumulate duplicate observers.

---

## 75. Code Mode

Harness can expose registered visible tools programmatically through Code Mode, conceptually:

```ts
await tools.some_tool(args)
```

The key architecture property is that the call re-enters the normal tool pipeline rather than bypassing policy/lifecycle.

Code Mode receives the canonical value, not the rendered prose content.

Therefore canonical output schemas are APIs, not only display metadata.

---

## 76. Background work

Long-running work should not be implemented by returning from a tool while a detached promise keeps mutating state.

Harness provides a jobs capability for published background work.

Follow the jobs subsystem pattern so:

- work has an owner;
- it has an ID;
- cancellation semantics are explicit;
- owner disposal can clean it;
- output/read lifecycle is bounded;
- the tool returns a canonical handle.

The outer tool's `exec.signal` is appropriate for foreground work. Once background work is formally published, its task-owned cancellation lifecycle takes over according to the jobs contract.

---

# Part XII — LLM adapters

## 77. LLM adapter role

The LLM subsystem is another capability seam.

A provider adapter translates:

```text
Harness GenerateOptions
        ↓
provider-specific API request
        ↓
provider stream
        ↓
Harness StreamChunk protocol
```

The agent loop should not know provider SDK details.

---

## 78. Minimal adapter skeleton

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import {
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  constructor(private apiKey: string) {
    super()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. translate options -> provider request
    // 2. stream provider response
    // 3. yield valid Harness chunks
  }
}

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  const adapter = new MyAdapter(config.apiKey)
  ctx.llm.registerAdapter(config.providers, adapter)
}
```

The registration belongs to the adapter plugin's Fiber.

---

## 79. StreamChunk protocol

Canonical text stream:

```ts
async function* stream(): AsyncIterable<StreamChunk> {
  yield {
    type: 'block-start',
    index: 0,
    blockType: 'text',
  }

  yield {
    type: 'text-delta',
    index: 0,
    text: 'Hello',
  }

  yield {
    type: 'text-delta',
    index: 0,
    text: ' world',
  }

  yield {
    type: 'block-end',
    index: 0,
    block: {
      type: 'text',
      text: 'Hello world',
    },
  }

  yield {
    type: 'usage',
    usage: {
      inputTokens: 100,
      outputTokens: 2,
    },
  }

  yield {
    type: 'finish',
    reason: { kind: 'stop' },
  }
}
```

Tool-call block pattern:

```ts
yield {
  type: 'block-start',
  index: 1,
  blockType: 'tool-call',
}

yield {
  type: 'tool-call-delta',
  index: 1,
  id: CallId('call-123'),
  name: 'greet',
  argumentsDelta: '{"name":"Ada"}',
}

yield {
  type: 'block-end',
  index: 1,
  block: {
    type: 'tool-call',
    id: CallId('call-123'),
    name: 'greet',
    arguments: '{"name":"Ada"}',
  },
}

yield {
  type: 'finish',
  reason: { kind: 'tool-calls' },
}
```

Rules:

```text
[ ] block-start has matching block-end
[ ] index identifies content-block order
[ ] tool-call argumentsDelta is raw JSON text
[ ] usage precedes finish
[ ] finish is the final chunk
```

---

## 80. Adapter errors and cancellation

Provider failures should become stable Harness LLM errors, not arbitrary silent fallbacks.

Pattern:

```ts
import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
} from '@deepseek-ai/dsh-llm'

class HttpAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...attributionHeaders(),
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
      }),
      signal: options.signal,
    })

    if (!response.ok) {
      throw new LlmError(
        `Provider API error: ${response.status}`,
        'PROVIDER_HTTP_ERROR',
      )
    }

    // parse stream...
  }
}
```

### Rule

If Harness supplies cancellation, forward it to the provider SDK/request.

Do not silently drop unsupported explicit generation fields. Follow the adapter contract and fail with a meaningful stable error when the provider cannot honor a required option.

---

# Part XIII — An end-to-end hands-on Cordis mini-system

## 81. Goal

Build a small replaceable capability from scratch:

```text
TextTransform service definition
       │
       ├── Uppercase provider
       └── Lowercase provider

Transform tool consumer

Metrics observer

cordis.yml chooses provider

HMR/provider swap demonstrates reactivity
```

This example intentionally mirrors a real agent capability seam while remaining keyless and deterministic.

---

## 82. Setup against DeepSeek Harness checkout

From repository root:

```sh
pnpm install
mkdir -p tmp/cordis-system-guide
cd tmp/cordis-system-guide
```

Run tutorial compositions with:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

The launcher creates the root Context, mounts Loader, and reads `./cordis.yml`.

---

## 83. Step 1 — first plugin

Create `hello.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('[hello] active')
}
```

`cordis.yml`:

```yaml
- id: hello
  name: './hello.ts'
```

Run:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Expected:

```text
[hello] active
```

---

## 84. Step 2 — add an owned effect

Create `heartbeat.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'heartbeat'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('[heartbeat] tick')
    }, 1000)

    return () => {
      clearInterval(timer)
      console.log('[heartbeat] disposed')
    }
  })
}
```

Add it:

```yaml
- id: heartbeat
  name: './heartbeat.ts'
```

Now HMR/disabling this plugin can stop the timer cleanly.

---

## 85. Step 3 — define the service contract

Create `transform-service.ts`:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export interface TransformRequest {
  text: string
}

export interface TransformResult {
  text: string
  provider: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    textTransform: TextTransformService
  }
}

export abstract class TextTransformService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'textTransform')
  }

  abstract transform(
    request: TransformRequest,
  ): Promise<TransformResult>
}
```

This file defines the **stable capability API**.

It does not choose an implementation.

---

## 86. Step 4 — provider A

Create `transform-uppercase.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import {
  TextTransformService,
  type TransformRequest,
  type TransformResult,
} from './transform-service.ts'

class UppercaseTransform extends TextTransformService {
  async transform(
    request: TransformRequest,
  ): Promise<TransformResult> {
    return {
      text: request.text.toUpperCase(),
      provider: 'uppercase',
    }
  }
}

export const name = 'transform-uppercase'

export function apply(ctx: Context) {
  ctx.plugin(UppercaseTransform)
}
```

Add:

```yaml
- id: transform-provider
  name: './transform-uppercase.ts'
```

---

## 87. Step 5 — direct service consumer

Create `transform-consumer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from './transform-service.ts'

export const name = 'transform-consumer'
export const inject = ['textTransform']

export function apply(ctx: Context) {
  void ctx.textTransform
    .transform({ text: 'Cordis' })
    .then(result => {
      console.log('[consumer]', result)
    })
}
```

Add:

```yaml
- id: transform-consumer
  name: './transform-consumer.ts'
```

Load order does not matter. `inject` is the dependency.

---

## 88. Step 6 — declare an event

Add to `transform-service.ts`:

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    textTransform: TextTransformService
  }

  interface Events {
    'text-transform/result'(result: TransformResult): void
  }
}
```

Update provider:

```ts
class UppercaseTransform extends TextTransformService {
  async transform(request: TransformRequest): Promise<TransformResult> {
    const result = {
      text: request.text.toUpperCase(),
      provider: 'uppercase',
    }

    this.ctx.emit('text-transform/result', result)
    return result
  }
}
```

Because `ctx` in `Service` is protected, the subclass can use it.

---

## 89. Step 7 — event observer

Create `transform-metrics.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from './transform-service.ts'

export const name = 'transform-metrics'

export function apply(ctx: Context) {
  let count = 0

  ctx.on('text-transform/result', result => {
    count += 1
    console.log(
      `[metrics] count=${count} provider=${result.provider}`,
    )
  })
}
```

Add:

```yaml
- id: transform-metrics
  name: './transform-metrics.ts'
```

The observer does not need to know provider or consumer packages.

---

## 90. Step 8 — make provider configurable

Update `transform-uppercase.ts`:

```ts
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  prefix: string
}

export const Config: Schema<Config> = Schema.object({
  prefix: Schema.string().default(''),
})

class UppercaseTransform extends TextTransformService {
  constructor(
    ctx: Context,
    private prefix: string,
  ) {
    super(ctx)
  }

  async transform(request: TransformRequest): Promise<TransformResult> {
    const result = {
      text: this.prefix + request.text.toUpperCase(),
      provider: 'uppercase',
    }

    this.ctx.emit('text-transform/result', result)
    return result
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.plugin(class Provider extends UppercaseTransform {
    constructor(childCtx: Context) {
      super(childCtx, config.prefix)
    }
  })
}
```

For production code, prefer a simpler named provider class/factory structure rather than an anonymous class if diagnostics/type ergonomics suffer. The point is that deployment-specific values come from validated config.

YAML:

```yaml
- id: transform-provider
  name: './transform-uppercase.ts'
  config:
    prefix: '[UP] '
```

---

## 91. Step 9 — add the Harness Tool consumer

Create `transform-tool.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from './transform-service.ts'

export const name = 'transform-tool'
export const inject = ['tools', 'textTransform']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'transform_text',
    description: 'Transform text using the configured text-transform provider.',

    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'Text to transform',
      },
    },

    output: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          provider: { type: 'string' },
        },
        required: ['text', 'provider'],
      },

      render: (_args, value) => [{
        type: 'text',
        text: `${value.text}\n(provider: ${value.provider})`,
      }],
    },

    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw exec.signal.reason ?? new Error('aborted')
      }

      return ctx.textTransform.transform({
        text: args.text,
      })
    },
  }))
}
```

This plugin requires two independent services:

```text
tools
textTransform
```

It activates only while both are present.

---

## 92. Step 10 — compose with real Harness tool runtime

Minimal keyless tool-pipeline composition from the official tutorial requires system prompt + tools:

```yaml
- id: system-prompt
  name: '@deepseek-ai/dsh-system-prompt'

- id: tools
  name: '@deepseek-ai/dsh-tools'

- id: transform-provider
  name: './transform-uppercase.ts'
  config:
    prefix: '[UP] '

- id: transform-metrics
  name: './transform-metrics.ts'

- id: transform-tool
  name: './transform-tool.ts'
```

Why `system-prompt`?

The tools service contributes schemas to system-prompt assembly and therefore has its own injection requirements.

When a subsystem stays `PENDING`, inspect **its dependencies too**, not only your plugin's.

---

## 93. Step 11 — provider B

Create `transform-lowercase.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import {
  TextTransformService,
  type TransformRequest,
  type TransformResult,
} from './transform-service.ts'

class LowercaseTransform extends TextTransformService {
  async transform(
    request: TransformRequest,
  ): Promise<TransformResult> {
    const result = {
      text: request.text.toLowerCase(),
      provider: 'lowercase',
    }

    this.ctx.emit('text-transform/result', result)
    return result
  }
}

export const name = 'transform-lowercase'

export function apply(ctx: Context) {
  ctx.plugin(LowercaseTransform)
}
```

Now change only the provider row:

```yaml
- id: transform-provider
  name: './transform-lowercase.ts'
```

The service name stays:

```text
textTransform
```

but provider identity changes.

Consumers injecting it are reconciled to the new capability environment.

That is spatial composability in practical form.

---

## 94. Step 12 — deliberately remove the provider

Disable it:

```yaml
- id: transform-provider
  name: './transform-lowercase.ts'
  disabled: true
```

Expected conceptual state:

```text
transform-provider → not active
transform-consumer → PENDING
transform-tool     → PENDING because textTransform missing
metrics observer  → can remain ACTIVE because it does not require textTransform
```

Re-enable provider and consumers can reactivate.

---

## 95. Step 13 — verify no duplicate registrations

With HMR running, edit provider/tool several times.

Verify:

```text
[ ] transform_text appears once
[ ] metrics listener runs once per result
[ ] no old provider is called
[ ] no old timer/watch survives
[ ] provider swap changes output immediately after reconciliation
```

If duplicate behavior appears, find the unmanaged effect.

---

# Part XIV — Three-role capability design for real systems

## 96. Package layout

For a mature capability:

```text
packages/
  my-cap/
    definition/
      src/index.ts
    provider-local/
      src/index.ts
    provider-remote/
      src/index.ts
    tool-my-cap/
      src/index.ts
```

Definition:

```text
service class/interface
request/result types
shared stable domain vocabulary
```

Provider:

```text
implementation
environment-specific config
resource ownership
```

Consumer:

```text
tool
agent behavior
UI bridge
workflow
```

---

## 97. The Definition owns the contract

Bad dependency graph:

```text
tool imports local provider
remote provider imports tool types
```

Good:

```text
provider-local ─┐
provider-remote ├──► definition
consumer-tool ──┘
```

This is what makes replacement credible rather than nominal.

---

## 98. Resolve defaults explicitly

For a complex capability, do not smear fallback logic throughout execution:

```ts
const timeout = req.timeout ?? config.timeout ?? 30_000
const cwd = req.cwd ?? config.cwd ?? process.cwd()
```

Prefer an explicit resolution phase:

```ts
interface ResolvedSpec {
  timeoutMs: number
  cwd: string
}

function resolveRequest(
  request: Request,
  config: Config,
): ResolvedSpec {
  return {
    timeoutMs: request.timeoutMs ?? config.timeoutMs,
    cwd: request.cwd ?? config.cwd,
  }
}
```

Then execution uses the resolved spec.

This improves testability, diagnostics, and provider parity.

---

# Part XV — Profiles, bundles, patches, and publishing

## 99. Bundle vs Profile

### Bundle

An npm package that contributes a configuration layer.

Manifest:

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

Answers:

```text
“What does this package contribute to a composition?”
```

### Profile

A runnable named composition under Harness home.

Manifest concept:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "my-bundle"
      ]
    }
  }
}
```

Answers:

```text
“Which bundles compose this runtime, in what layer order?”
```

A bundle and a profile are different roles.

---

## 100. Bundle structure

Example:

```text
my-plugin/
├── package.json
├── cordis.patch.yml
└── index.js
```

`package.json`:

```json
{
  "name": "dsh-my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: my-plugin
      name: dsh-my-plugin
```

---

## 101. Install into a profile

```sh
dsh plugin --profile demo add ./my-plugin
```

Inspect effective config:

```sh
dsh --profile demo --dump-config
```

Run:

```sh
dsh --profile demo
```

Remove:

```sh
dsh plugin --profile demo remove dsh-my-plugin
```

---

## 102. Layer precedence

Current docs describe effective configuration layers in this order:

```text
1. bundle patches in profile bundle order
2. profile cordis.patch.yml
3. $DSH_HOME/cordis.patch.yml
4. each --patch overlay in argv order
```

Later layers win.

Important:

> A patch replacing an entry's `config` replaces that row's whole config value; do not assume arbitrary deep merge.

When overriding an earlier row, restate all required configuration keys.

---

## 103. Git install build-script warning

Installing from Git can fetch source without prebuilt artifacts.

For TypeScript packages, authors may need a self-contained `prepare` build.

Modern pnpm may require users to explicitly allow install-time builds.

Treat that permission as a security decision:

```text
allowing build scripts = allowing package code to execute at install time
```

Prefer pinned commits and trusted source.

For lower-friction distribution, publish built artifacts to npm or ship a tarball.

---

# Part XVI — Coding-agent decision framework

## 104. Given a feature request, choose the Cordis mechanism

| Need | Prefer |
|---|---|
| Independently mount/unmount behavior | plugin |
| Direct callable capability | Service |
| Hard dependency on capability | `inject` |
| Optional capability | `ctx.get()` or dependency-gated sub-plugin |
| Raw resource with cleanup | `ctx.effect()` |
| Observe a runtime occurrence | event listener |
| Multiple async observers must complete | `parallel` event |
| Ordered decision chain | `serial` / `bail` |
| Around-policy / interception | `waterfall` |
| Model-callable operation | `ctx.tools.register(defineTool(...))` |
| New model provider | `ctx.llm.registerAdapter(...)` |
| Replaceable implementation family | Definition + Provider + Consumer seam |
| Per-subtree provider | service isolation |
| Per-subtree service config | intercept mechanism if service supports it |
| Runtime composition change | Loader config / patch |
| Source hot-swap | HMR + reversible plugin |
| Durable model-visible fact | session event/log, not only live event |
| Background task | jobs subsystem, not detached promise |

---

## 105. Coding-agent implementation algorithm

When asked to add a feature:

```text
1. Identify the owning domain/capability.
2. Search generated subsystem docs and package types.
3. Decide whether this is:
   - service capability,
   - provider,
   - consumer,
   - tool,
   - event hook,
   - policy wrapper,
   - configuration composition.
4. List required services.
5. Put hard dependencies in inject.
6. List every side effect created during activation.
7. Make each effect lifecycle-owned.
8. Add validated config for deployment-specific values.
9. Use stable config entry IDs.
10. Test initial activation.
11. Test missing dependencies → PENDING.
12. Test provider removal/replacement.
13. Test plugin disposal.
14. Test config reload/HMR.
15. Assert no duplicate/stale registrations.
16. If model-visible behavior changed, test durable session/replay implications.
```

---

# Part XVII — Debugging

## 106. Plugin prints nothing

Check in this order:

```text
1. Is the row in effective config?
   dsh --profile <name> --dump-config

2. Is module path/name resolvable?

3. Is row disabled?

4. What is Fiber state?

5. Is it PENDING because an injected service is absent?

6. Is the provider itself PENDING on another service?

7. Did Config validation fail?

8. Is a logger exporter present for the diagnostic path?

9. Did a source/HMR candidate fail and get rolled back?
```

Do not add sleep/retry hacks before understanding the dependency graph.

---

## 107. Diagnose PENDING Fibers

Tutorial pattern:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setTimeout(() => {
      for (const runtime of ctx.registry.values()) {
        for (const fiber of runtime.fibers) {
          if (fiber.state === FiberState.PENDING) {
            console.log(
              `${fiber.name} is PENDING — check required services`,
            )
          }
        }
      }
    }, 500)

    return () => clearTimeout(timer)
  })
}
```

Notice that even the diagnostic timer is lifecycle-owned.

---

## 108. Duplicate tool/listener after HMR

Symptom:

```text
one save → handler fires twice
second save → three times
```

Likely cause:

```text
registration happened outside Cordis effect ownership
```

Audit:

```text
ctx.on                → already owned
ctx.tools.register    → should be owned by tools registry
ctx.llm.register...   → should be owned
raw emitter.on        → must wrap
setInterval           → must wrap
third-party callback  → likely must wrap
module-scope mutable singleton → suspicious
```

---

## 109. Provider swap causes stale calls

Likely causes:

- consumer did not declare `inject`;
- provider object copied into module-global state;
- asynchronous work escaped the activation lifecycle;
- callback registered outside Fiber ownership;
- optional lookup was cached forever.

Correct pattern:

```ts
export const inject = ['provider']

export function apply(ctx: Context) {
  // capture ctx.provider only inside resources owned by this activation
}
```

---

## 110. Waterfall suddenly stops core behavior

Inspect every listener on that waterfall.

Find one that logs/annotates but does not:

```ts
return next()
```

This is one of the highest-value Cordis debugging heuristics.

---

## 111. Plugin fails only after config edit

Check:

- schema mismatch;
- patch replaced whole config instead of deep-merging;
- `!!js` expression evaluates only after required injections and now sees a different provider/context;
- stable row ID missing;
- HMR candidate import/build error;
- provider change triggered a consumer restart that reveals an unmanaged global.

---

## 112. Cleanup hangs

Look for:

- async disposer waiting forever;
- work not observing abort signal;
- disposer waiting on an event emitted only by already-disposed child;
- circular cleanup dependency between independent effects;
- detached background work not managed by jobs;
- external SDK close/flush without timeout semantics.

If cleanup order is important, consolidate it in one effect.

---

# Part XVIII — Anti-pattern catalog

## 113. Importing concrete providers in consumers

Bad:

```ts
import { LocalShell } from '@my/local-shell'
```

inside a tool that should work with any shell implementation.

Better:

```ts
export const inject = ['shell']

export function apply(ctx: Context) {
  return ctx.shell.execute(...)
}
```

---

## 114. Encoding load order in YAML

Bad:

```text
“put provider three lines earlier”
```

Correct:

```ts
inject = ['provider']
```

---

## 115. Global mutable registry outside lifecycle

Bad:

```ts
GLOBAL_TOOLS.push(tool)
```

with no inverse.

Correct:

```ts
const remove = registry.register(tool)
ctx.effect(() => remove)
```

or use the framework's lifecycle-aware registry API.

---

## 116. Detached promises

Bad:

```ts
void longRunningWork()
```

when it outlives activation and mutates state.

Use:

- an effect with async cleanup;
- cancellation signal;
- jobs subsystem for published background tasks;
- a child plugin whose Fiber owns the work.

---

## 117. Tool returns prose instead of data

Bad:

```text
"Job started with id job-17"
```

Better:

```json
{
  "kind": "background",
  "jobId": "job-17"
}
```

Render prose separately.

---

## 118. Optional capability declared as hard dependency unnecessarily

If metrics are optional, this:

```ts
inject = ['metrics']
```

can disable an otherwise useful plugin.

Use optional lookup or a small injected sub-plugin.

---

## 119. Required capability treated as optional

Opposite problem:

```ts
const shell = ctx.get('shell')
if (!shell) return
```

for a plugin whose sole purpose requires shell.

This hides misconfiguration.

Use `inject = ['shell']` and let `PENDING` express the dependency contract.

---

## 120. Treating isolation as security

`ctx.isolate('shell')` prevents service resolution collisions.

It does not stop arbitrary plugin code from:

```ts
import fs from 'node:fs'
```

Security requires sandbox/process/permission boundaries from the appropriate subsystem/OS layer.

---

## 121. Assuming effect cleanup can undo external history

A disposer can close a socket.

It cannot retract:

- packets already sent;
- messages already published externally;
- money already transferred;
- durable session events already committed;
- files overwritten without a saved inverse.

For those domains, use compensation/idempotency/versioning/transaction protocols appropriate to the external system.

---

# Part XIX — Designing self-updatable systems with Cordis

## 122. What Cordis makes dynamically replaceable

Cordis is especially strong for **in-process higher layers**:

```text
agent behavior
model adapters
tools
policies
memory/context services
prompt contributors
workflows
runtime registries
UI/plugin adapters
configuration-selected providers
```

These can be represented as plugin/service/effect surfaces and reconciled at runtime.

---

## 123. What Cordis does not magically hot-swap

Some layers remain host/bootstrap concerns:

```text
Node/Electron executable
native ABI changes
OS entitlements
code signing
preload security boundary
Chromium runtime flags
native .node modules with incompatible ABI
installer/updater itself
process-level crashes
```

A self-updating application should separate:

```text
small stable bootstrap / host
          +
large Cordis-managed dynamic layer
```

The dynamic layer can evolve aggressively while the bootstrap owns restart, binary replacement, code-signing, and rollback when a process restart is unavoidable.

---

## 124. Safe self-modification rule

An agent that edits a Cordis plugin should not immediately mutate arbitrary live global state.

Preferred loop:

```text
1. edit plugin source/config
2. build/typecheck/test candidate
3. Loader/HMR imports candidate
4. reconcile old → candidate
5. await lifecycle settlement
6. observe health checks
7. keep candidate or restore previous composition
```

DeepSeek Harness's transactional Loader patches are useful here, but they are only one part of the safety story.

---

# Part XX — Testing Cordis components

## 125. Minimum lifecycle test matrix

Every serious plugin should be tested under more than startup.

```text
[ ] initial mount
[ ] invalid config
[ ] required provider missing
[ ] provider appears later
[ ] provider disappears
[ ] provider replaced by compatible implementation
[ ] plugin config update
[ ] source HMR/restart
[ ] explicit fiber.dispose()
[ ] parent disposal
[ ] async work aborted during unload
[ ] repeated mount/unmount cycles
[ ] no duplicate registrations after N cycles
```

---

## 126. Effect leak test

Record baseline counts:

```text
listeners
registered tools
open watchers
active timers
provider entries
child Fibers
```

Then:

```text
mount → activate → dispose
```

Repeat many times.

Final state should equal baseline for everything the plugin owned.

This is the engineering approximation of recovery/observational equivalence.

---

## 127. Provider replacement test

Given:

```text
consumer injects myCap
```

Test:

```text
provider A mount
consumer ACTIVE
call → A

replace A with B
consumer unload/reload
call → B

assert A no longer receives calls
assert consumer registration count stays 1
```

---

## 128. Waterfall contract test

Test both delegation and veto.

```ts
ctx.on('my/request', async (req, next) => {
  trace.push('outer-before')
  const result = await next()
  trace.push('outer-after')
  return result
})
```

Assert order around downstream execution.

Then add a veto listener and assert the default handler did not run.

---

## 129. Tool contract tests

At minimum:

```text
[ ] valid args execute
[ ] invalid args rejected before body
[ ] semantic validation errors clear
[ ] canonical output matches output.schema
[ ] renderer produces expected model content
[ ] cancellation reaches operation
[ ] tool unregisters on plugin unload
[ ] policy hooks still run
[ ] Code Mode receives canonical value
[ ] replay/UI presenter is pure if provided
```

---

# Part XXI — Practical reference: “what should I use?”

## 130. Plugin vs Service vs Tool vs Event

```text
Plugin
  = lifecycle/replacement unit

Service
  = direct named capability consumed by code

Tool
  = model-callable operation registered in Harness tools service

Event
  = open runtime notification/interception contract
```

A single feature may involve all four:

```text
Plugin: Git provider plugin
Service: ctx.git
Tool: git_status
Events: git/pre-operation, git/result
```

Do not make one concept impersonate another.

---

## 131. Service vs event decision examples

### Need current database result

```ts
await ctx.database.query(...)
```

Service.

### Notify plugins that session title changed

```ts
ctx.emit('session/title-changed', ...)
```

Event.

### Allow policies to wrap model request

```ts
ctx.waterfall('agent/request', ..., next)
```

Waterfall event.

### Allow model to query database

```ts
ctx.tools.register(defineTool(...))
```

Tool consumer over database Service.

---

# Part XXII — Coding-agent rules: MUST / SHOULD / MUST NOT

## 132. MUST

1. **MUST declare every hard service dependency.**
2. **MUST make every activation-owned resource disposable.**
3. **MUST assume a plugin can activate more than once in one process.**
4. **MUST validate deployment configuration before using it.**
5. **MUST use service/capability boundaries rather than concrete provider imports when replacement is intended.**
6. **MUST call `next()` in waterfall listeners unless intentionally vetoing/replacing downstream behavior.**
7. **MUST honor cancellation in tools/LLM/provider operations where the contract supplies a signal.**
8. **MUST keep canonical tool data separate from model/UI formatting.**
9. **MUST inspect the local vendored API/types before relying on upstream examples.**
10. **MUST test unload/reload, not only startup.**

---

## 133. SHOULD

1. **SHOULD use function plugins by default.**
2. **SHOULD use a `Service` class when exposing a direct capability.**
3. **SHOULD use stable config row IDs.**
4. **SHOULD keep order-dependent cleanup inside one disposer.**
5. **SHOULD namespace custom service and event names to avoid collisions.**
6. **SHOULD keep provider-specific logic behind a capability definition.**
7. **SHOULD use generated subsystem surfaces as the source of truth for Harness events/services.**
8. **SHOULD make configuration defaults safe and unsurprising.**
9. **SHOULD use durable session events for replay/model-visible facts.**
10. **SHOULD keep the bootstrap smaller and less dynamic than the Cordis-managed layer in self-updating systems.**

---

## 134. MUST NOT

1. **MUST NOT rely on `cordis.yml` line order for dependency readiness.**
2. **MUST NOT leave raw timers/watchers/listeners outside ownership.**
3. **MUST NOT cache required provider references across activation episodes.**
4. **MUST NOT treat `PENDING` as automatically erroneous.**
5. **MUST NOT assume `INACTIVE` is a current Fiber enum state.**
6. **MUST NOT invent `ctx.fork()` for generic Context branching.**
7. **MUST NOT treat service isolation as a sandbox.**
8. **MUST NOT let a logging waterfall hook omit `next()`.**
9. **MUST NOT make programmatic callers parse rendered tool prose for IDs/fields.**
10. **MUST NOT assume plugin disposal reverses irreversible external history.**

---

# Part XXIII — Architecture review template for coding agents

## 135. Before implementing a Cordis feature, write this mini-design

```md
## Capability
What domain does this belong to?

## Plugin boundary
Why should this behavior have independent lifecycle/config/replacement?

## Provides
Which service(s), tool(s), event(s), or session facts does it provide?

## Injects
Which required services must exist before activation?

## Optional dependencies
Which capabilities improve behavior but are not required?

## Effects
List every process-local side effect created while active.

## Disposal
How does each effect quiesce?

## Config
Which deployment-dependent values are validated fields?

## Events
Which event mode is used and why?

## HMR/replacement
What happens when this plugin or one of its providers changes?

## Durable state
Does anything model-visible or replay-critical need a session event?

## Tests
How do we prove mount → use → unload → remount is clean?
```

A coding agent should be able to answer every section before merging a new core capability.

---

# Part XXIV — Applying the model to an ACRYL-style agent platform

## 136. Recommended Cordis decomposition

For an agent-agnostic runtime, treat major swappable systems as capability seams rather than hardwired imports.

Example conceptual tree:

```text
ACRYL / agent runtime
├── session store service
├── agent adapter registry
│   ├── Codex provider
│   ├── Claude provider
│   └── Pi provider
├── context compaction service
│   ├── provider A
│   └── provider B
├── memory service
│   ├── local
│   └── remote
├── codebase graph service
│   ├── graph provider A
│   └── graph provider B
├── shell / filesystem realm
├── approval policy
├── handoff/relay workflow
├── tool families
├── UI/TUI surface plugins
└── telemetry/trace observers
```

Each provider should be selectable by composition, not by editing consumers.

---

## 137. Example: agent adapter seam

Definition:

```ts
abstract class CodingAgentService extends Service {
  abstract startSession(spec: StartSpec): Promise<AgentSession>
  abstract resumeSession(id: string): Promise<AgentSession>
  abstract stopSession(id: string): Promise<void>
}
```

Providers:

```text
CodexAdapter
ClaudeAdapter
PiAdapter
OpenCodeAdapter
```

Consumers:

```text
relay workflow
session UI
handoff tool
multi-agent orchestrator
```

Consumers inject a stable capability. They should not import each provider package directly.

---

## 138. Example: optional memory

If an agent runtime works without memory:

```ts
export function apply(ctx: Context) {
  const memory = ctx.get('memory')
  // enhance if present
}
```

If a particular plugin is specifically a “memory-grounded planner,” then memory is required:

```ts
export const inject = ['memory']
```

The dependency semantics should express product truth.

---

## 139. Example: hot-swapping context graph provider

A context graph consumer should depend on:

```text
ctx.codeGraph
```

not:

```text
OmniGraph SDK concrete client
Lat.md concrete implementation
```

Then composition can choose provider per workspace/agent realm.

If the provider is replaced, consumers' active episodes restart cleanly against the new provider.

That is exactly the kind of system Cordis is designed to make tractable.

---

# Part XXV — Source-reading guide for coding agents

## 140. Read docs in this order

For a new coding agent entering the codebase:

```text
1. docs/cordis-primer.md
2. docs/cordis-tutorial/index.md
3. docs/cordis-tutorial/01-first-plugin.md
4. 02-lifecycle-and-effects.md
5. 03-services.md
6. 04-events.md
7. 05-config.md
8. 06-composition-and-hmr.md
9. 07-into-the-harness.md
10. docs/architecture.md
11. owning docs/subsystems/<domain>.md
12. owning package README/types/source
13. vendor/cordis source only when behavior remains unclear
```

For tool work also read:

```text
docs/cookbook/adding-a-tool.md
packages/core/tools/README.md
```

For LLM work:

```text
docs/user/develop/practice/llm-adapter.md
packages/llm/llm*/
```

---

## 141. Inspect implementation before guessing

High-value files:

```text
vendor/cordis/src/context.ts
vendor/cordis/src/fiber.ts
vendor/cordis/src/registry.ts
vendor/cordis/src/service.ts
vendor/cordis/src/events.ts
vendor/README.md
```

These answer questions such as:

- what exact Fiber states exist;
- when config is resolved;
- how dependencies trigger activation;
- what an effect can return;
- what `dispose()` waits for;
- how event modes actually dispatch;
- which behavior differs from upstream Cordis.

---

# Part XXVI — Compact master reference

## 142. Cordis primitive cheat sheet

| Primitive | Meaning | Most common use |
|---|---|---|
| `Context` | scoped runtime environment | service lookup + registrations |
| `ctx.plugin()` | mount child lifecycle | compose behavior from code |
| `ctx.inject()` | gated child behavior | conditional behavior on services |
| `Fiber` | mounted plugin instance | lifecycle state/cleanup/debugging |
| `Service` | named capability | provider abstraction |
| `inject` | required service set | dependency-driven activation |
| `ctx.get()` | optional service lookup | optional enhancement |
| `ctx.effect()` | own custom side effect | timer/socket/watcher cleanup |
| `ctx.on()` | lifecycle-owned listener | event observation/interception |
| `emit` | sync broadcast | notification |
| `parallel` | await all listeners | fan-out completion |
| `serial` | ordered async bail | decision chain |
| `bail` | ordered sync bail | synchronous decision |
| `waterfall` | around-middleware | policy/interception |
| `ctx.extend()` | child context metadata | scoped context derivation |
| `ctx.isolate()` | new service realm | multiple providers of same name |
| `ctx.intercept()` | scoped service config | service-specific overrides |
| `ctx.registry` | plugin runtime registry | introspection/debugging |

---

## 143. Fiber state cheat sheet

| State | Meaning | Coding implication |
|---|---|---|
| `PENDING` | mounted, requirements not ready | do not expect `apply()` yet |
| `LOADING` | activation running | setup/effects may be in progress |
| `ACTIVE` | current activation live | dependencies and registrations valid |
| `FAILED` | config/apply failed | inspect error/log and candidate rollback |
| `UNLOADING` | cleanup in progress | do not register new effects |
| `DISPOSED` | permanently removed | Fiber cannot simply reactivate |

---

## 144. Event mode cheat sheet

| Mode | Awaited? | Order | Stops early? | Typical use |
|---|---:|---|---:|---|
| `emit` | no | registration | no | notification |
| `parallel` | yes | concurrent | no | fan-out work |
| `serial` | yes | registration | yes | async decision |
| `bail` | no | registration | yes | sync decision |
| `waterfall` | depends on handlers | nested registration order | yes by omitting `next()` | policy/wrapping |

---

## 145. Harness extension cheat sheet

| Goal | Mechanism |
|---|---|
| Add LLM provider | `ctx.llm.registerAdapter(...)` |
| Add model-facing capability | `ctx.tools.register(defineTool(...))` |
| Add execution policy | tool/agent capability events |
| Add shell provider | shell service seam |
| Add filesystem provider | fs service seam |
| Add process confinement | sandbox service seam |
| Add background work | jobs service |
| Add human command | commands service |
| Add model context | agent/context APIs under owning subsystem |
| Observe durable facts | `session/event` + event type |
| Add replay-critical model-visible state | extend durable session event model |
| Give sessions/agents separate provider instances | isolated service realm/preset composition |

---

# Part XXVII — Final operating principles

## 146. The Cordis discipline

A Cordis system remains comprehensible when every dynamic contribution can answer four questions:

```text
1. Who owns me?
2. What do I require?
3. How do I leave?
4. What happens when my provider changes?
```

If any answer is “some global singleton probably handles it,” the design is incomplete.

---

## 147. The most important invariants

### Ownership invariant

Every live registration/resource has one lifecycle owner.

### Dependency invariant

Every hard capability dependency is declared and reactively tracked.

### Re-entry invariant

A plugin may activate repeatedly without accumulating stale state.

### Replacement invariant

A consumer does not retain a retired provider across activation episodes.

### Event invariant

Waterfall delegation is explicit; observation cannot accidentally suppress core behavior.

### Tool invariant

Programmatic value, model-facing rendering, and UI presentation remain distinct.

### Durability invariant

Model-visible/replay-critical facts come from durable session state, not ephemeral callbacks alone.

### Security invariant

Cordis composition/isolation is not mistaken for OS-level sandboxing.

---

## 148. The one paragraph a coding agent should remember

When adding behavior to a Cordis system, make it a plugin only if it benefits from independent lifecycle or composition. Declare every required capability with `inject`; access providers through stable service names rather than concrete implementations. Treat every registration and resource as an owned effect, using lifecycle-aware Cordis/Harness registries when available and `ctx.effect()` for everything else. Expect provider loss, config updates, HMR, and repeated activation. Use services for direct capabilities, events for open observation/interception, waterfalls only with deliberate `next()` semantics, tools for model-callable APIs with canonical typed values, and durable session events for facts that must survive replay. Then test not only whether the component starts, but whether it can leave and return without leaving a trace it does not own.

---

# Appendix A — Practical source map

## DeepSeek Harness development tutorials

- https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/
- https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool
- https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config
- https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish
- https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/
- https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service
- https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/events
- https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/
- https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/llm-adapter

## Hands-on Cordis tutorial

- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/
- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/01-first-plugin
- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/02-lifecycle-and-effects
- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/03-services
- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/04-events
- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/05-config
- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/06-composition-and-hmr
- https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/07-into-the-harness

## Parsed Markdown in repository

- https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cordis-tutorial
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md

## Vendored implementation

- https://github.com/deepseek-ai/deepseek-harness/tree/master/vendor/cordis
- https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/context.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/fiber.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/registry.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/service.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/events.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md

## Upstream Cordis

- https://github.com/cordiverse/cordis

## Paper

- https://github.com/cordiverse/paper
- https://github.com/cordiverse/paper/blob/main/paper.pdf

Title:

> *A Programming Paradigm for Spatiotemporal Composability*

The repository marks the paper as a **preprint under active revision**, draft dated 2026-08-13. Treat specific formal claims as draft research and verify the latest revision before citing them academically.

## Supplemental explanatory articles

- https://redreamality.com/blog/cordis-spatiotemporal-composability-deepseek-harness/
- https://jeffxiong.substack.com/p/everything-is-a-plugin

Use articles as explanation, not as the implementation source of truth. For code, prefer current Harness docs, current vendored source, and generated TypeScript surfaces.

---

# Appendix B — Coding-agent completion checklist

Before declaring a Cordis feature complete:

```text
ARCHITECTURE
[ ] Correct owning subsystem chosen
[ ] Plugin boundary justified
[ ] Service/provider/consumer roles separated only where useful

DEPENDENCIES
[ ] Hard dependencies in inject
[ ] Optional dependencies intentionally optional
[ ] No YAML-order dependency
[ ] No concrete provider import where a seam is intended

LIFECYCLE
[ ] Every raw resource has cleanup
[ ] No detached long-running promise
[ ] Cleanup quiesces async work
[ ] Order-dependent teardown is inside one disposer
[ ] Repeated activation does not accumulate state

CONFIG
[ ] Runtime schema exported
[ ] Defaults validated
[ ] Deployment tunables configurable
[ ] Stable row id used
[ ] Patch semantics understood

EVENTS
[ ] Correct dispatch mode chosen
[ ] Waterfall observers call next()
[ ] Listener registration is lifecycle-owned
[ ] Durable fact vs live event distinction is correct

TOOLS
[ ] Parameters typed/validated
[ ] Canonical output schema is useful programmatically
[ ] Renderer contains prose, canonical value contains data
[ ] Cancellation signal honored
[ ] Tool disappears on plugin unload
[ ] Policy pipeline not bypassed

LLM
[ ] Provider-neutral request mapping correct
[ ] StreamChunk ordering valid
[ ] block-start/block-end pairs valid
[ ] usage before finish
[ ] signal forwarded
[ ] stable LlmError used for provider failures

HMR / REPLACEMENT
[ ] Source reload tested
[ ] Config reload tested
[ ] Provider swap tested
[ ] Missing provider → PENDING tested
[ ] Candidate failure/rollback behavior understood
[ ] No duplicate listener/tool/provider after repeated reload

SECURITY / DURABILITY
[ ] Cordis isolation not treated as sandbox
[ ] External irreversible effects explicitly considered
[ ] Model-visible replay-critical state persisted through session model

DIAGNOSTICS
[ ] Useful plugin name
[ ] Errors fail loud enough to diagnose
[ ] Fiber state can be inspected
[ ] Effect leaks can be audited
```

---

# Appendix C — 30-second onboarding prompt for another coding agent

Use this when delegating Cordis work to a sub-agent:

```text
This repository uses DeepSeek Harness's vendored @deepseek-ai/cordis.
Treat vendor/cordis and generated subsystem types/docs as authoritative over generic
upstream examples. Cordis plugins are lifecycle units. Hard service requirements go
in inject and are live: consumers unload/re-activate when provider implementations
change. Every registration/resource must be owned by the current Fiber; ctx.on,
ctx.plugin, service provisioning, ctx.tools.register and ctx.llm.registerAdapter are
lifecycle-aware, while raw timers/watchers/connections must be wrapped in ctx.effect
with cleanup. PENDING is a valid missing-dependency state. Current Fiber states are
PENDING, LOADING, ACTIVE, FAILED, UNLOADING, DISPOSED; there is no public INACTIVE
enum. Use services for direct capabilities, events for open extension points, and
always call next() in waterfall observers unless intentionally vetoing. A Harness
tool is not a Cordis primitive: it is registered into ctx.tools and should return a
canonical typed value separate from model/UI rendering. Assume plugins can be hot-
reloaded and activated repeatedly. Test provider removal/replacement and disposal,
not only startup. Before coding, inspect the owning docs/subsystems page and local
package types.
```

---

**End of guide.**
