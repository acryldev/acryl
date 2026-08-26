# Cordis Practical Tutorial & Coding-Agent Implementation Specification

> **Purpose:** This document is an implementation-oriented guide for a coding agent that must understand, build, modify, or review a Cordis-based application/plugin system.
>
> **Target:** upstream `cordiverse/cordis` v4-era APIs, with notes for DeepSeek Harness's vendored package names.
>
> **Core rule:** treat every plugin as a dynamically mountable component whose **effects must be reversible** and whose **dependencies must be declared**.

---

## Table of Contents

1. [What Cordis is](#1-what-cordis-is)
2. [The mental model: spatiotemporal composability](#2-the-mental-model-spatiotemporal-composability)
3. [Architecture at a glance](#3-architecture-at-a-glance)
4. [Package-name warning: upstream vs DeepSeek Harness](#4-package-name-warning-upstream-vs-deepseek-harness)
5. [Booting a Cordis application](#5-booting-a-cordis-application)
6. [Plugins: the basic unit of composition](#6-plugins-the-basic-unit-of-composition)
7. [Context (`ctx`): the shared capability surface](#7-context-ctx-the-shared-capability-surface)
8. [Services: register capabilities on `ctx`](#8-services-register-capabilities-on-ctx)
9. [Dependency injection with `inject`](#9-dependency-injection-with-inject)
10. [Effects and disposers: make side effects reversible](#10-effects-and-disposers-make-side-effects-reversible)
11. [Fibers: the lifecycle unit](#11-fibers-the-lifecycle-unit)
12. [Events: typed communication between plugins](#12-events-typed-communication-between-plugins)
13. [The five event dispatch modes](#13-the-five-event-dispatch-modes)
14. [Waterfall: middleware / policy interception](#14-waterfall-middleware--policy-interception)
15. [Configuration and validation](#15-configuration-and-validation)
16. [Loader: turn config into a live plugin tree](#16-loader-turn-config-into-a-live-plugin-tree)
17. [Groups and service isolation](#17-groups-and-service-isolation)
18. [Include: external config files and computed config](#18-include-external-config-files-and-computed-config)
19. [HMR: Hot Module Replacement](#19-hmr-hot-module-replacement)
20. [Timer: why Cordis needs a timer service](#20-timer-why-cordis-needs-a-timer-service)
21. [Logging and `logger-console`](#21-logging-and-logger-console)
22. [A complete minimal wired example](#22-a-complete-minimal-wired-example)
23. [Runtime update, restart, disposal, and diagnostics](#23-runtime-update-restart-disposal-and-diagnostics)
24. [Rules for building Cordis plugins](#24-rules-for-building-cordis-plugins)
25. [Common anti-patterns](#25-common-anti-patterns)
26. [`cordis/packages` package-by-package guide](#26-cordispackages-package-by-package-guide)
27. [Which package should I use?](#27-which-package-should-i-use)
28. [Implementation checklist for a coding agent](#28-implementation-checklist-for-a-coding-agent)
29. [Glossary](#29-glossary)
30. [Source references](#30-source-references)

---

# 1. What Cordis is

Cordis is a **meta-framework for dynamically composed applications**.

It is not primarily a web framework, UI framework, agent framework, or application framework.

Its job is to provide the runtime rules for composing components:

- mount a component,
- expose capabilities,
- declare dependencies,
- react when dependencies appear/disappear/change,
- register side effects,
- undo those side effects,
- reload components,
- update configuration,
- reconcile a declarative plugin tree,
- hot-reload only affected components.

The useful mental model is:

```text
Application
  =
Context
  +
Plugin tree
  +
Services
  +
Dependencies
  +
Effects/disposers
  +
Events
  +
Loader reconciliation
```

A Cordis application should therefore be designed as a **set of replaceable plugins**, not as one privileged core with many hard imports.

---

# 2. The mental model: spatiotemporal composability

The Cordis paper frames dynamic composition along two orthogonal axes.

## 2.1 Temporal composability

**Question:**

> Can this component be removed later without leaving anything behind?

Examples of side effects:

- event listeners,
- intervals,
- timeouts,
- open sockets,
- filesystem watchers,
- process handlers,
- registered tools,
- routes,
- hooks,
- monkey patches,
- service registrations,
- child plugins.

Cordis's answer is **revertible effects**.

Every registration should have an inverse.

```text
register listener     -> unregister listener
open socket           -> close socket
start interval        -> clear interval
register tool         -> unregister tool
provide service       -> remove service
mount child plugin    -> dispose child plugin
```

Cordis tracks the inverse and executes cleanup when the owning plugin/fiber unloads.

**Practical rule:**

> If you create a side effect, Cordis must know how to undo it.

---

## 2.2 Spatial composability

**Question:**

> Can components declare what they need without manually controlling startup order?

Cordis's answer is **reactive coeffects**, implemented in normal application code primarily through service dependencies such as `inject`.

Instead of:

```ts
await startDatabase()
await startApi()
await startWorkers()
```

a consumer declares:

```ts
export const inject = ['database']
```

Cordis waits until `database` exists.

More importantly, this is not only a boot-time check.

If the provider disappears:

```text
database provider unloads
        ↓
dependent plugin unloads
        ↓
its effects are reverted
        ↓
new database provider appears
        ↓
dependent plugin loads again
```

So dependency wiring is reactive rather than a one-shot startup dance.

---

## 2.3 Together

Temporal:

```text
Component removed
→ undo everything it did
```

Spatial:

```text
Dependency changed
→ reevaluate affected components
```

Together:

```text
safe dynamic composition
```

This is the central idea behind Cordis.

---

# 3. Architecture at a glance

```text
┌────────────────────────────────────────────────────┐
│                    Context                         │
│                     `ctx`                          │
│                                                    │
│ services: ctx.tools, ctx.llm, ctx.foo ...          │
│ events:   ctx.on / emit / parallel / ...           │
│ effects:  ctx.effect(...)                          │
│ plugins:  ctx.plugin(...)                          │
│ fiber:    ctx.fiber                                │
│ registry: ctx.registry                             │
│ logger:   ctx.logger                               │
│ reflect:  ctx.reflect                              │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│                     Fiber                          │
│ one mounted plugin instance                        │
│                                                    │
│ - lifecycle state                                  │
│ - validated config                                 │
│ - dependencies                                     │
│ - owned effects                                    │
│ - child plugins                                    │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│                    Loader                          │
│ declarative plugin-tree manager                    │
│                                                    │
│ cordis.yml / JSON                                  │
│        ↓                                           │
│ Entry tree                                         │
│        ↓                                           │
│ mount / update / unmount / reconcile               │
└──────────────────┬─────────────────────────────────┘
                   │
             optional support
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
       Include    HMR      Group
                   │
                   ▼
                 Timer
```

The **core owns the runtime model**.

The **loader owns declarative composition**.

Almost everything else is itself a plugin/service built on that model.

---

# 4. Package-name warning: upstream vs DeepSeek Harness

There are two naming surfaces you may encounter.

## Upstream Cordis

```text
cordis
@cordisjs/plugin-loader
@cordisjs/plugin-include
@cordisjs/plugin-group
@cordisjs/plugin-hmr
@cordisjs/plugin-timer
@cordisjs/plugin-logger-console
```

## DeepSeek Harness vendored/repackaged Cordis

Examples in the Harness tutorial use names such as:

```text
@deepseek-ai/cordis
@deepseek-ai/cordis-plugin-loader
@deepseek-ai/cordis-plugin-timer
@deepseek-ai/cordis-plugin-hmr
@deepseek-ai/cordis-plugin-logger-console
```

**Coding-agent rule:**

Before editing imports, inspect the repository's `package.json`.

Do not mechanically replace one namespace with the other.

The concepts and APIs are the same family, but package names differ.

---

# 5. Booting a Cordis application

The upstream Cordis launcher reduces boot to four operations:

```ts
import { Context } from 'cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@cordisjs/plugin-loader'

const ctx = new Context()

ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)

await ctx.loader.create({
  name: '@cordisjs/plugin-include',
  config: {
    path: './cordis.yml',
  },
})
```

Interpret this carefully.

## Step 1 — create the root context

```ts
const ctx = new Context()
```

This is the root dependency/service/lifecycle container.

---

## Step 2 — establish module-resolution base

```ts
ctx.baseUrl = ...
```

Relative plugin paths in config need a base location.

---

## Step 3 — mount Loader

```ts
await ctx.plugin(Loader)
```

`ctx.plugin()` returns a **Fiber** and the fiber is awaitable.

Awaiting it means startup waits until the plugin has reached a settled lifecycle state.

---

## Step 4 — mount Include through Loader

```ts
await ctx.loader.create({
  name: '@cordisjs/plugin-include',
  config: {
    path: './cordis.yml',
  },
})
```

`Include` reads the config file.

That file then defines the actual application tree.

This is the important inversion:

```text
BAD:
main.ts manually imports and starts every application subsystem

GOOD:
main.ts starts Cordis + Loader
configuration declares the application
```

---

# 6. Plugins: the basic unit of composition

A plugin can be represented in several shapes.

Use the simplest shape that fits the job.

---

## 6.1 Function plugin

Preferred for normal behavior.

```ts
import type { Context } from 'cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello')
}
```

When loaded through Loader, the module exports metadata plus `apply`.

---

## 6.2 Plain function mounted directly

```ts
function heartbeat(ctx: Context) {
  // ...
}

const fiber = ctx.plugin(heartbeat)
```

Useful for small child behaviors.

---

## 6.3 Object plugin

```ts
const plugin = {
  name: 'example',
  inject: ['database'],

  apply(ctx: Context) {
    // ...
  },
}

ctx.plugin(plugin)
```

Useful when metadata and behavior belong together.

---

## 6.4 Class / Service plugin

Use when the plugin **provides a named service**.

```ts
import { Context, Service } from 'cordis'

class MetricsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }

  record(name: string, value: number) {
    // ...
  }
}

ctx.plugin(MetricsService)
```

The class is both:

```text
plugin lifecycle unit
+
service provider
```

---

# 7. Context (`ctx`): the shared capability surface

Almost all Cordis interaction goes through `ctx`.

Typical properties and methods:

```ts
ctx.plugin(...)
ctx.effect(...)

ctx.get(...)
ctx.provide(...)
ctx.set(...)
ctx.mixin(...)

ctx.on(...)
ctx.emit(...)
ctx.parallel(...)
ctx.serial(...)
ctx.bail(...)
ctx.waterfall(...)

ctx.fiber
ctx.registry
ctx.logger
ctx.reflect
ctx.root
```

Think of `ctx` as:

```text
dependency container
+
service locator
+
plugin owner scope
+
event bus
+
effect owner
+
runtime introspection surface
```

But do **not** treat it as a bag of arbitrary global mutable state.

Services should own capabilities.

Events should represent observation/interception.

Effects should own resource lifetime.

---

# 8. Services: register capabilities on `ctx`

There are two distinct things developers often confuse:

1. **Type registration**
2. **Runtime registration**

They are not the same.

---

## 8.1 Type registration with declaration merging

```ts
declare module 'cordis' {
  interface Context {
    greeter: GreeterService
  }
}
```

This tells TypeScript:

```text
ctx.greeter exists and has type GreeterService
```

It creates **no runtime service**.

---

## 8.2 Runtime registration with `Service`

```ts
class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(name: string) {
    return `Hello, ${name}!`
  }
}
```

`super(ctx, 'greeter')` is the runtime registration.

The instance becomes:

```ts
ctx.greeter
```

and is automatically removed with its owning fiber.

---

## 8.3 Complete service definition

```ts
import { Service, type Context } from 'cordis'

declare module 'cordis' {
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

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

---

## 8.4 Direct `ctx.provide()`

Cordis also supports direct service registration.

```ts
declare module 'cordis' {
  interface Context {
    featureFlags: FeatureFlags
  }
}

export function apply(ctx: Context) {
  const flags = new FeatureFlags()

  ctx.provide('featureFlags', flags)
}
```

`ctx.provide()` returns a disposer.

The service is also owned by the current fiber and removed on unload.

Use this for lightweight service values.

Use a `Service` subclass when the capability has meaningful lifecycle, configuration, methods, or dependencies.

---

## 8.5 Optional service lookup

If a dependency is genuinely optional, do not declare it as required merely for convenience.

```ts
const metrics = ctx.get('metrics')

metrics?.record('startup', 1)
```

`ctx.get()` lets code probe a service without requiring it through `inject`.

---

# 9. Dependency injection with `inject`

Required dependencies belong in `inject`.

```ts
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

Cordis guarantees that required dependencies are available before `apply()` runs.

---

## 9.1 Do not encode startup order in YAML

Wrong:

```yaml
# "database must be first"
- name: ./database.ts
- name: ./api.ts
- name: ./workers.ts
```

and assume file order solves dependency timing.

Instead:

```ts
// api.ts
export const inject = ['database']
```

```ts
// workers.ts
export const inject = ['api']
```

Dependencies express the relationship.

---

## 9.2 Missing dependencies are normally PENDING

If:

```ts
export const inject = ['timer']
```

but nobody provides `timer`, the plugin does not partially start.

It stays:

```text
PENDING
```

This is a legitimate state because the provider may appear later.

---

## 9.3 Dependency disappearance after startup

Suppose:

```text
Plugin A provides database
Plugin B injects database
```

When A disappears:

```text
A unloads
↓
database service disappears
↓
B is no longer valid
↓
B unloads
↓
B's effects are cleaned up
```

When another database provider appears:

```text
database becomes available
↓
B loads again
```

This is the practical meaning of reactive dependency composition.

---

## 9.4 `ctx.inject()`

For programmatic composition Cordis also exposes:

```ts
ctx.inject(['database'], (ctx) => {
  // runs when database is available
})
```

Conceptually this is shorthand for a plugin whose `inject` declares those dependencies.

Use declarative plugin metadata for normal application plugins.

Use `ctx.inject()` for localized programmatic behavior.

---

# 10. Effects and disposers: make side effects reversible

This is the most important operational pattern in Cordis.

---

## 10.1 External side effect

Raw code:

```ts
const timer = setInterval(work, 1000)
```

Problem:

If the plugin is hot-reloaded or disabled, the interval may continue firing.

That creates:

- duplicate work,
- memory leaks,
- stale closures,
- invalid references,
- orphan handles.

---

## 10.2 Cordis-owned effect

```ts
ctx.effect(() => {
  const timer = setInterval(work, 1000)

  return () => {
    clearInterval(timer)
  }
})
```

The body acquires the resource.

The returned function releases it.

Cordis tracks the release function.

---

## 10.3 The rule

Whenever you write:

```text
subscribe
listen
open
start
watch
register
attach
patch
```

ask:

```text
what is the inverse?
```

Then put acquisition and inverse together.

---

## 10.4 Socket example

```ts
ctx.effect(() => {
  const socket = connect()

  socket.on('message', onMessage)

  return async () => {
    socket.off('message', onMessage)
    await socket.close()
  }
})
```

---

## 10.5 Filesystem watcher example

```ts
ctx.effect(() => {
  const watcher = watch(path, handler)

  return () => watcher.close()
})
```

---

## 10.6 Process signal example

```ts
ctx.effect(() => {
  const handler = () => shutdown()

  process.on('SIGTERM', handler)

  return () => {
    process.off('SIGTERM', handler)
  }
})
```

---

## 10.7 What is already an effect

Do not wrap everything in another `ctx.effect()` blindly.

Cordis registration APIs already participate in lifecycle ownership.

Examples include:

```ts
ctx.on(...)
ctx.plugin(...)
ctx.provide(...)
```

and framework registries built correctly on Cordis should also return/register disposers.

In DeepSeek Harness, registry operations such as tool registration are designed to disappear with the owning plugin.

---

## 10.8 Effect cleanup order

Disposers are tracked and started in reverse registration order.

Think LIFO:

```text
setup A
setup B
setup C

unload:

cleanup C
cleanup B
cleanup A
```

If several asynchronous cleanup actions require strict sequencing, keep that sequence inside **one disposer**:

```ts
ctx.effect(() => {
  const a = openA()
  const b = openB()

  return async () => {
    await closeB(b)
    await closeA(a)
  }
})
```

Do not rely on independent async disposers to serialize one after another.

---

## 10.9 Label important effects

The current API supports an optional label:

```ts
ctx.effect(() => {
  // ...
  return dispose
}, 'agent-session-stream')
```

This helps `fiber.getEffects()` diagnostics.

Use labels for important long-lived resources.

---

# 11. Fibers: the lifecycle unit

A **Fiber** represents one mounted plugin instance.

`ctx.plugin()` returns one.

```ts
const fiber = ctx.plugin(myPlugin)
```

The fiber owns:

- validated config,
- dependency snapshot,
- lifecycle state,
- effects,
- child plugins,
- cleanup.

---

## 11.1 Lifecycle states

Conceptually:

```text
PENDING
  ↓ dependencies ready
LOADING
  ↓
ACTIVE

errors → FAILED

unload:
ACTIVE
  ↓
UNLOADING
  ↓
DISPOSED
```

A plugin waiting for a required service remains `PENDING`.

---

## 11.2 Await startup

```ts
const fiber = ctx.plugin(myPlugin)

await fiber
```

or explicitly:

```ts
await fiber.await()
```

Use this when startup correctness requires the plugin to finish loading before proceeding.

---

## 11.3 Dispose

```ts
await fiber.dispose()
```

Disposal waits for cleanup to finish.

It recursively cleans owned child plugins and registered effects.

---

## 11.4 Restart

```ts
await fiber.restart()
```

Use when you need the same plugin and same config to be cleanly unloaded and loaded again.

---

## 11.5 Update config

```ts
await fiber.update(newConfig)
```

The current API validates the new config, runs the internal update waterfall, and normally restarts the plugin.

Do not mutate `fiber.config` directly.

---

## 11.6 Inspect effects

```ts
const effects = fiber.getEffects()
```

Useful when debugging:

- leaked resources,
- unexpectedly live registrations,
- lifecycle ownership.

---

# 12. Events: typed communication between plugins

Use events when one plugin should not know concrete consumers.

Example:

```text
stats service
    emits
stats/report
    ↓
0..N observers
```

---

## 12.1 Declare event types

```ts
declare module 'cordis' {
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}
```

This is compile-time declaration merging.

Again:

```text
declaration merging != runtime registration
```

---

## 12.2 Listen

```ts
ctx.on('stats/report', (name, count) => {
  console.log(name, count)
})
```

The listener is lifecycle-owned.

When the plugin unloads, the listener disappears.

---

## 12.3 Emit

```ts
ctx.emit('stats/report', 'tool_call', 3)
```

No plugin imports the listener implementation.

This preserves loose coupling.

---

## 12.4 Event naming

Prefer namespaced event names:

```text
agent/step
tool/result
stats/report
session/updated
policy/check
```

Avoid generic names:

```text
update
change
done
```

The event namespace is flat, so names should communicate ownership.

---

# 13. The five event dispatch modes

Cordis provides five interaction contracts.

---

## 13.1 `emit`

Synchronous broadcast.

```ts
ctx.emit('stats/report', name, count)
```

Use when:

```text
everyone may observe
nobody controls the result
```

---

## 13.2 `parallel`

Asynchronous broadcast, listeners run concurrently.

```ts
await ctx.parallel('task/observed', task)
```

Use when:

```text
all listeners should run
all may be async
they do not depend on listener order
```

---

## 13.3 `serial`

Async listeners run in order.

The first meaningful result can stop later listeners.

```ts
const result = await ctx.serial('policy/check', input)
```

Use for ordered asynchronous decision chains.

---

## 13.4 `bail`

Synchronous short-circuit.

```ts
const result = ctx.bail('cache/get', key)
```

Use when:

```text
first listener that can answer wins
and the path is synchronous
```

---

## 13.5 `waterfall`

Around-middleware / interception.

```ts
const result = await ctx.waterfall(
  'request/transform',
  request,
  terminal,
)
```

Listeners receive `next()` and can:

- observe,
- transform,
- wrap,
- veto,
- replace,
- short-circuit.

Use it for policy surfaces.

---

# 14. Waterfall: middleware / policy interception

Waterfall is the right model for interceptable behavior.

Example event:

```ts
declare module 'cordis' {
  interface Events {
    'demo/transform'(
      input: string,
      next: () => Promise<string>,
    ): Promise<string>
  }
}
```

Listener 1 wraps downstream:

```ts
ctx.on('demo/transform', async (input, next) => {
  const result = await next()

  return result.toUpperCase()
})
```

Listener 2 may veto:

```ts
ctx.on('demo/transform', async (input, next) => {
  if (input === 'forbidden') {
    return 'BLOCKED'
  }

  return next()
})
```

This gives a chain conceptually like:

```text
policy A
  └─ next()
      policy B
        └─ next()
            final handler
```

Use waterfall when multiple plugins need the ability to intercept a decision without hardwiring themselves to each other.

---

# 15. Configuration and validation

A plugin should define a schema for user-supplied/runtime configuration.

Cordis uses the **Standard Schema** interface.

DeepSeek Harness examples use Schemastery.

---

## 15.1 Example

```ts
import Schema from 'schemastery'
import type { Context } from 'cordis'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(Schema.string()).required(),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

---

## 15.2 YAML

```yaml
- id: greeter
  name: ./greeter.ts
  config:
    greeting: Hello
    targets:
      - alpha
      - beta
```

---

## 15.3 Fail fast

Invalid configuration should fail before a partially initialized plugin becomes active.

Do not do:

```ts
export function apply(ctx, config) {
  const socket = connect()

  if (!valid(config)) {
    throw new Error('invalid config')
  }
}
```

Prefer schema validation first.

---

## 15.4 Schema validation is not semantic validation

Schema:

```text
"provider" must be a string
```

Semantic validation:

```text
provider "foo" actually exists
```

A plugin should still reject semantically impossible settings at the earliest reliable point.

---

# 16. Loader: turn config into a live plugin tree

The Loader is where Cordis becomes practical for larger applications.

Without Loader:

```ts
ctx.plugin(A)
ctx.plugin(B)
ctx.plugin(C)
```

With Loader:

```yaml
- id: a
  name: ./a.ts

- id: b
  name: ./b.ts

- id: c
  name: ./c.ts
```

The configuration becomes a representation of the running application.

---

## 16.1 Entry concepts

A loader entry typically contains:

```yaml
- id: worker
  name: ./worker.ts
  config:
    concurrency: 4
  disabled: false
```

Important fields:

### `id`

Stable identity for reconciliation.

Use explicit IDs in long-lived configuration.

Without a stable identity, an edit can look like:

```text
old entry removed
+
new entry added
```

rather than:

```text
same entry updated
```

---

### `name`

Module specifier:

```yaml
name: ./plugin.ts
```

or:

```yaml
name: some-npm-package
```

---

### `config`

Plugin configuration:

```yaml
config:
  timeout: 5000
```

---

### `disabled`

Keep the entry in config but do not mount it.

```yaml
disabled: true
```

This is a useful operational switch.

---

### `inject`

The loader entry model can also carry injection metadata.

Normally prefer defining service requirements with the plugin itself unless runtime composition specifically needs to override/augment them.

---

## 16.2 Reconciliation

When the config tree changes:

```text
new entry
→ mount

deleted entry
→ dispose

changed config
→ update/restart

disabled true
→ unmount

disabled false
→ mount
```

This is why the config file can be treated as a live source of truth.

---

## 16.3 Loader is not just startup

Do not reduce Loader to:

```text
"thing that reads YAML on boot"
```

Its real role is:

```text
configuration
↔
entry tree
↔
running fibers
```

with reconciliation across changes.

---

# 17. Groups and service isolation

A group represents a nested sub-tree.

Example:

```yaml
- id: agents
  name: '@cordisjs/plugin-group'
  group: true
  config:
    - id: planner
      name: ./planner.ts

    - id: executor
      name: ./executor.ts
```

The group gives a subtree a shared lifecycle/composition boundary.

---

## 17.1 Why group?

Use a group when several entries conceptually belong together.

Examples:

```text
one agent profile
one tenant
one workspace
one adapter bundle
one provider stack
one feature set
```

---

## 17.2 Group internals

Upstream `packages/group` is deliberately minimal.

It re-exports the `Group` implementation from Loader.

So:

```text
@cordisjs/plugin-group
```

is a convenient package surface for loader's nested-entry group implementation.

Do not treat it as an independent orchestration engine.

---

## 17.3 Service isolation

Cordis contexts support isolated service scopes.

Concept:

```text
root shell service
   │
   ├── group A: isolated `shell`
   │     └── local implementation A
   │
   └── group B: isolated `shell`
         └── local implementation B
```

Consumers in A and B can both ask for:

```ts
ctx.shell
```

while receiving different providers.

This is useful for:

- tenant-specific services,
- sandbox instances,
- per-agent executors,
- test doubles,
- different model/provider stacks.

Do not invent unique service names merely to emulate isolation if the capability is conceptually the same.

---

# 18. Include: external config files and computed config

`@cordisjs/plugin-include` is the bridge between Loader and external configuration files.

It is responsible for loading a tree from a file such as:

```text
cordis.yml
cordis.yaml
config.json
```

and applying it to an `EntryTree`.

---

## 18.1 Basic usage

The upstream launcher does:

```ts
await ctx.loader.create({
  name: '@cordisjs/plugin-include',
  config: {
    path: './cordis.yml',
  },
})
```

---

## 18.2 Include depends on Loader

The source declares:

```ts
static inject = ['loader']
```

So Include does not work meaningfully without Loader.

---

## 18.3 Supported config ideas

The current implementation exposes configuration including:

```ts
{
  path,
  initial?,
  patches?,
  enableLogs?,
}
```

---

## 18.4 Initial config

If the file does not exist and an `initial` tree is supplied, Include can create an initial config.

---

## 18.5 Patches

Include supports patching entries by stable `id`.

This enables layered composition such as:

```text
base composition
+
deployment patch
+
user patch
```

without forking the entire tree.

Patches can:

- override entry fields,
- insert entries,
- target nested groups.

Stable IDs therefore become architecturally important.

---

## 18.6 Computed config with `!!js`

The YAML implementation defines a custom `!!js` value representation.

Harness tutorial example:

```yaml
- name: ./config-demo.ts
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

Use computed configuration sparingly.

Prefer static declarative values where possible.

Use expressions when the composition truly depends on runtime environment.

---

# 19. HMR: Hot Module Replacement

**HMR = Hot Module Replacement.**

In Cordis this means:

```text
source file changes
↓
determine affected modules/plugins
↓
dispose old fibers
↓
undo their effects
↓
load updated module
↓
mount new fibers
```

The key reason this is safe is not HMR itself.

It is safe because plugins are designed around reversible lifecycle ownership.

---

## 19.1 What HMR watches

The current upstream HMR plugin uses Chokidar.

It builds/uses module dependency information and distinguishes:

- plugin/user modules that can be partially reloaded,
- framework/external modules that require full reload,
- config files that should trigger config reconciliation.

---

## 19.2 Required dependencies

The upstream HMR service declares dependencies on:

```text
loader
timer
```

Why Loader?

Because HMR needs to understand and manipulate loaded plugin/module entries.

Why Timer?

Because file changes must be debounced/throttled safely without leaking scheduling handles.

---

## 19.3 Recommended HMR composition

For an upstream-style app:

```yaml
- id: logger-console
  name: '@cordisjs/plugin-logger-console'

- id: timer
  name: '@cordisjs/plugin-timer'

- id: hmr
  name: '@cordisjs/plugin-hmr'
  config:
    root:
      - .
```

DeepSeek Harness uses its own package namespace for these equivalents.

The console exporter is not conceptually required for HMR correctness, but is highly useful so lifecycle/HMR logs are visible.

---

## 19.4 HMR is a lifecycle test

If a plugin cannot survive:

```text
mount
→ unload
→ mount again
```

without duplicates or stale state, the plugin has a lifecycle bug.

HMR exposes that bug quickly.

Treat HMR compatibility as a useful quality check for plugin design.

---

# 20. Timer: why Cordis needs a timer service

Raw JavaScript timers are external side effects:

```ts
setTimeout(...)
setInterval(...)
```

They are not automatically associated with a Cordis fiber.

That makes them easy to leak.

The timer package solves this by exposing fiber-owned scheduling.

---

## 20.1 Mount it

```yaml
- id: timer
  name: '@cordisjs/plugin-timer'
```

It registers:

```ts
ctx.timer
```

and mixes common scheduling methods directly onto `ctx`.

---

## 20.2 Available APIs

The current package mixes:

```ts
ctx.timeout(...)
ctx.interval(...)
ctx.throttle(...)
ctx.debounce(...)
```

and deprecated compatibility forms:

```ts
ctx.setTimeout(...)
ctx.setInterval(...)
```

Prefer:

```ts
ctx.timeout()
ctx.interval()
```

---

## 20.3 Timeout callback

```ts
ctx.timeout(() => {
  console.log('later')
}, 1000)
```

The timer is cleaned if the owning plugin unloads first.

---

## 20.4 Awaitable timeout

```ts
await ctx.timeout(1000)
```

This gives lifecycle-aware sleep semantics.

If the context is disposed first, the timer is cancelled and the operation rejects.

---

## 20.5 Interval

```ts
ctx.interval(() => {
  poll()
}, 5000)
```

No manual `clearInterval()` is needed for normal plugin-lifetime ownership.

---

## 20.6 Debounce

```ts
const refresh = ctx.debounce(() => {
  rebuildIndex()
}, 250)

watcher.on('change', refresh)
```

When the plugin unloads, pending scheduling is cleaned.

---

## 20.7 Throttle

```ts
const report = ctx.throttle((value) => {
  send(value)
}, 1000)
```

Useful for noisy streams/events.

---

## 20.8 Why Timer matters beyond convenience

The point is not saving a line of code.

The point is:

```text
timer lifetime
=
plugin lifetime
```

This is exactly the Cordis design philosophy.

---

# 21. Logging and `logger-console`

Cordis core already contains logging infrastructure.

`@cordisjs/plugin-logger-console` is a **console exporter**, not the entire logging system.

Its job is to render Cordis log messages into terminal/browser-console output.

---

## 21.1 Use scoped loggers

Prefer:

```ts
const logger = ctx.logger('my-plugin')

logger.info('started')
logger.warn('slow response')
logger.error(error)
```

or APIs provided by the current logger service.

The goal is attributable logs.

---

## 21.2 Why scoped logging matters

In a dynamic plugin system, logs should answer:

```text
which component emitted this?
```

Do not scatter anonymous global:

```ts
console.log(...)
```

through production plugins unless it is a trivial local tutorial.

---

## 21.3 Console exporter configuration

The current package supports options such as:

- color support,
- max length,
- per-scope levels,
- timestamps,
- time-difference display,
- label width/alignment.

Use it as an output adapter.

Do not couple plugins to console output itself.

---

# 22. A complete minimal wired example

This example demonstrates:

- service provision,
- dependency injection,
- events,
- reversible effects,
- timer service,
- loader configuration.

Directory:

```text
example/
├── cordis.yml
├── greeter.ts
├── reporter.ts
└── heartbeat.ts
```

---

## 22.1 `greeter.ts`

```ts
import { Service, type Context } from 'cordis'

declare module 'cordis' {
  interface Context {
    greeter: GreeterService
  }

  interface Events {
    'greeter/called'(name: string): void
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(name: string) {
    this.ctx.emit('greeter/called', name)

    return `Hello, ${name}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

---

## 22.2 `reporter.ts`

```ts
import type { Context } from 'cordis'
import type {} from './greeter.ts'

export const name = 'reporter'
export const inject = ['greeter']

export function apply(ctx: Context) {
  const logger = ctx.logger('reporter')

  ctx.on('greeter/called', (name) => {
    logger.info('greeted %s', name)
  })

  logger.info(ctx.greeter.greet('Cordis'))
}
```

What happens:

```text
reporter requires greeter
↓
Cordis waits for greeter
↓
reporter loads
↓
listener registration belongs to reporter fiber
↓
reporter calls ctx.greeter
↓
greeter emits event
↓
reporter observes it
```

---

## 22.3 `heartbeat.ts`

Preferred, if Timer is installed:

```ts
import type { Context } from 'cordis'
import type {} from '@cordisjs/plugin-timer'

export const name = 'heartbeat'
export const inject = ['timer']

export function apply(ctx: Context) {
  ctx.interval(() => {
    ctx.logger('heartbeat').debug('tick')
  }, 5000)
}
```

Alternative raw resource form:

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      ctx.logger('heartbeat').debug('tick')
    }, 5000)

    return () => clearInterval(timer)
  })
}
```

The timer plugin version is preferred if Timer is already part of the runtime.

---

## 22.4 `cordis.yml`

```yaml
- id: logger
  name: '@cordisjs/plugin-logger-console'

- id: timer
  name: '@cordisjs/plugin-timer'

- id: hmr
  name: '@cordisjs/plugin-hmr'
  config:
    root:
      - .

- id: greeter
  name: './greeter.ts'

- id: reporter
  name: './reporter.ts'

- id: heartbeat
  name: './heartbeat.ts'
```

---

## 22.5 Runtime relationships

```text
logger-console
    │
    └── terminal output

timer
    │
    ├── heartbeat
    └── hmr

greeter
    │ service: ctx.greeter
    ▼
reporter

greeter event
    │
    └── greeter/called
             ▼
          reporter

hmr
    │
    └── watches source
           ↓
       dispose/reload
```

---

# 23. Runtime update, restart, disposal, and diagnostics

A coding agent working on Cordis must reason about the application while it is already running.

---

## 23.1 Change plugin configuration programmatically

```ts
await fiber.update({
  greeting: 'Hi',
})
```

Expected semantics:

```text
validate
↓
internal update hooks
↓
unload current instance
↓
run disposers
↓
load with new config
```

---

## 23.2 Force restart

```ts
await fiber.restart()
```

Use when code wants a clean lifecycle pass without changing config.

---

## 23.3 Dispose

```ts
await fiber.dispose()
```

After disposal:

- plugin effects are gone,
- child plugins are gone,
- provided services are gone,
- listeners are gone.

Do not continue using references owned by that plugin.

---

## 23.4 Diagnose PENDING plugins

If a plugin appears to do nothing, do not immediately assume its `apply()` is broken.

Inspect fiber state.

Conceptually:

```ts
for (const runtime of ctx.registry.values()) {
  for (const fiber of runtime.fibers) {
    console.log(fiber.name, fiber.state)
  }
}
```

Common cause:

```text
PENDING
+
missing required injected service
```

---

## 23.5 Diagnose effect ownership

Use:

```ts
fiber.getEffects()
```

for live effect metadata.

Ask:

```text
Who owns this listener?
Who owns this timer?
Who owns this watcher?
Will it disappear on unload?
```

If the answer is unclear, the architecture is incomplete.

---

# 24. Rules for building Cordis plugins

A coding agent implementing a Cordis component MUST follow these rules.

---

## Rule 1 — Declare required capabilities

If a plugin needs a service:

```ts
export const inject = ['serviceName']
```

Do not assume loader order.

---

## Rule 2 — Use service keys, not concrete provider imports

Consumer:

```ts
ctx.shell.execute(...)
```

Prefer this over:

```ts
import { LocalShellProvider } from './local-shell'
```

if `shell` is intended to be replaceable.

---

## Rule 3 — Register runtime services separately from TS types

Both are required for a clean developer experience.

Type:

```ts
declare module 'cordis' {
  interface Context {
    foo: FooService
  }
}
```

Runtime:

```ts
super(ctx, 'foo')
```

or:

```ts
ctx.provide('foo', foo)
```

---

## Rule 4 — Every external side effect needs a disposer

```ts
ctx.effect(() => {
  acquire()

  return () => release()
})
```

---

## Rule 5 — Prefer lifecycle-aware Cordis APIs

Prefer:

```ts
ctx.on(...)
ctx.plugin(...)
ctx.provide(...)
ctx.timeout(...)
ctx.interval(...)
```

over equivalent global/raw mechanisms when available.

---

## Rule 6 — Use events for policy/observation

Events are appropriate when:

- zero or many plugins may observe,
- callers should not know listeners,
- behavior may be intercepted,
- a policy chain is desired.

---

## Rule 7 — Use services for owned capabilities

Services are appropriate when:

```text
one capability has an owner/provider
and consumers call it directly
```

Examples:

```text
database
llm
tools
shell
sessions
metrics
```

---

## Rule 8 — Validate config before side effects

Schema validation must happen before meaningful runtime acquisition.

---

## Rule 9 — Give Loader entries stable IDs

Especially when:

- HMR is enabled,
- config is patched,
- entries are updated at runtime,
- nested groups are used.

---

## Rule 10 — A plugin must survive a clean reload

Test:

```text
load
→ use
→ unload
→ assert cleanup
→ load again
→ assert no duplicates
```

---

# 25. Common anti-patterns

## Anti-pattern 1 — naked interval

```ts
export function apply() {
  setInterval(work, 1000)
}
```

Fix:

```ts
ctx.interval(work, 1000)
```

or `ctx.effect()`.

---

## Anti-pattern 2 — service consumer imports provider implementation

```ts
import db from './postgres-provider'
```

Fix:

```ts
export const inject = ['database']

ctx.database.query(...)
```

---

## Anti-pattern 3 — manually encoded startup choreography

```ts
await loadDatabase()
await loadApi()
await loadWorker()
```

Fix dependencies:

```text
api injects database
worker injects api
```

---

## Anti-pattern 4 — type declaration mistaken for service registration

```ts
declare module 'cordis' {
  interface Context {
    foo: Foo
  }
}
```

This does not create `ctx.foo`.

Provide it at runtime.

---

## Anti-pattern 5 — registration without unregister path

```ts
externalRegistry.add(handler)
```

If the external API returns no disposer, create one:

```ts
ctx.effect(() => {
  externalRegistry.add(handler)

  return () => externalRegistry.remove(handler)
})
```

---

## Anti-pattern 6 — hidden mutable global state

```ts
const clients = new Map()
```

outside lifecycle ownership can survive reloads unexpectedly.

Prefer state owned by a service/plugin instance.

---

## Anti-pattern 7 — HMR used to hide bad lifecycle

HMR is not magic cleanup.

It only works safely if the old plugin can actually be disposed.

---

# 26. `cordis/packages` package-by-package guide

The upstream repository currently contains these nine packages.

---

## 26.1 `packages/core`

### NPM package

```text
cordis
```

### Role

The core runtime.

Current source exports the core areas:

```text
context
events
fiber
logger
registry
service
utils
```

Internally there is also reflection/service-resolution machinery.

### What it owns

#### Context

```ts
new Context()
```

The shared scoped runtime object.

#### Registry

```ts
ctx.plugin(...)
ctx.inject(...)
```

Plugin loading and dependency injection.

#### Fiber

One mounted plugin lifecycle instance.

#### Effects

```ts
ctx.effect(...)
```

Reversible registrations.

#### Services / reflection

```ts
ctx.get(...)
ctx.provide(...)
ctx.set(...)
ctx.mixin(...)
ctx.accessor(...)
```

#### Events

```ts
ctx.on(...)
ctx.emit(...)
ctx.parallel(...)
ctx.serial(...)
ctx.bail(...)
ctx.waterfall(...)
```

#### Logging infrastructure

Core logger/event structures.

### When to use

Always.

Any Cordis application directly or transitively depends on `cordis`.

### Coding-agent guidance

Start architecture work here when debugging:

- service resolution,
- dependency visibility,
- plugin lifecycle,
- effect cleanup,
- event dispatch,
- fiber state.

Do not patch Loader/HMR to work around a core-lifecycle misunderstanding until core semantics are understood.

---

## 26.2 `packages/create`

### NPM package

```text
create-cordis
```

### What `"create"` means

This is the **project scaffolding CLI**.

It is not a runtime component.

Its package description is essentially:

```text
Setup a Cordis application
```

The CLI scaffolds from:

```text
@cordisjs/boilerplate
```

and is what enables the normal:

```sh
npm create cordis
```

style workflow.

### What it actually does

The current scaffolder:

1. chooses/asks for a project name,
2. prepares the target directory,
3. queries the npm registry for the selected template,
4. downloads the template tarball,
5. extracts it,
6. updates `package.json`,
7. handles package-manager/Yarn setup,
8. can initialize Git,
9. can install dependencies,
10. can start the generated project.

### Important distinction

```text
create
=
developer bootstrap tool

NOT

application runtime service
```

### When to use

Use it when starting a fresh Cordis project.

Do not add `create-cordis` as a runtime dependency unless you are intentionally building a scaffolding tool.

---

## 26.3 `packages/group`

### NPM package

```text
@cordisjs/plugin-group
```

### Role

Convenience package for nested Loader groups.

The current source is effectively:

```ts
import { Group } from '@cordisjs/plugin-loader'

export default Group
```

So it is a thin package boundary over Loader's `Group`.

### Why it exists

It lets Loader configuration refer to a normal package/plugin name:

```yaml
- id: my-group
  name: '@cordisjs/plugin-group'
  group: true
  config:
    - ...
```

### Use it for

- nested plugin bundles,
- feature groups,
- tenant/workspace groups,
- grouped lifecycle boundaries,
- isolated service stacks.

### Do not treat it as

- a separate scheduler,
- a separate DI engine,
- a separate process manager.

The real mechanics live in Loader.

---

## 26.4 `packages/hmr`

### NPM package

```text
@cordisjs/plugin-hmr
```

### HMR abbreviation

```text
HMR = Hot Module Replacement
```

### Role

Watch source/config changes and reload only the affected Cordis plugins when possible.

### Current important dependencies

It injects:

```text
loader
timer
```

### Current implementation ideas

- Chokidar filesystem watcher,
- module dependency traversal,
- accepted/declined reload analysis,
- partial reload of plugin code,
- full reload for framework/external changes,
- config-file refresh when an included config changes,
- debouncing through Timer.

### Typical config

```yaml
- id: timer
  name: '@cordisjs/plugin-timer'

- id: hmr
  name: '@cordisjs/plugin-hmr'
  config:
    root:
      - .
```

Add console logging during development so HMR actions are visible.

### Use it for

- local development,
- self-updating plugin hosts,
- dynamic agent/tool systems,
- long-lived processes where one component should reload without restarting everything.

### Architectural dependency

HMR only works cleanly because effects are reversible.

---

## 26.5 `packages/include`

### NPM package

```text
@cordisjs/plugin-include
```

### Role

Load an external configuration file into Loader as an entry tree.

### Dependency

```text
inject: loader
```

### Supported responsibilities

- read YAML,
- read JSON,
- create initial config when configured,
- maintain an included subtree,
- refresh it,
- write updates back when writable,
- apply ID-targeted patches,
- support loader config expressions.

### Canonical boot usage

```ts
await ctx.loader.create({
  name: '@cordisjs/plugin-include',
  config: {
    path: './cordis.yml',
  },
})
```

### Why separate Include from Loader?

Loader should know how to manage the live entry tree.

Include knows how to obtain/persist one representation of that tree.

Conceptually:

```text
Loader
=
runtime tree manager

Include
=
file-backed tree source
```

This separation means other tree sources could exist.

---

## 26.6 `packages/loader`

### NPM package

```text
@cordisjs/plugin-loader
```

### Role

Declarative application composition and reconciliation.

### The most important package after core

Loader manages:

- `Entry`,
- `EntryTree`,
- nested groups,
- plugin module importing,
- entry identity,
- entry config,
- disabled state,
- entry update,
- entry disposal,
- config reconciliation,
- loader-specific lifecycle events,
- module-loading internals used by HMR.

### Core model

```text
EntryOptions
↓
Entry
↓
Fiber
```

An entry tells Loader what should exist.

A fiber represents the live plugin instance that fulfills that entry.

### Loader does not merely load once

It reconciles:

```text
desired tree
vs
running tree
```

### Use it when

- application composition should be data/config driven,
- plugins need dynamic enable/disable,
- HMR is required,
- config updates should restart only affected components,
- profiles/presets/overlays are needed.

### You can avoid Loader when

You are building a tiny embedded use of Cordis and intentionally mount a few plugins directly in code.

But any non-trivial plugin ecosystem should strongly consider Loader.

---

## 26.7 `packages/logger-console`

### NPM package

```text
@cordisjs/plugin-logger-console
```

### Role

Export Cordis logs to console output.

### Important distinction

```text
core contains logging infrastructure
logger-console is one exporter
```

### Current configuration surface includes ideas such as

```text
colors
maxLength
levels
showDiff
showTime
label
```

### Use it for

- development terminal output,
- CLI applications,
- local debugging,
- seeing Loader/HMR transitions.

### Replace it when

Logs should go to:

- JSON,
- OpenTelemetry,
- files,
- external logging infrastructure,
- a GUI log panel.

Plugins should depend on logging semantics, not the console exporter.

---

## 26.8 `packages/timer`

### NPM package

```text
@cordisjs/plugin-timer
```

### Role

Provide lifecycle-aware scheduling.

### Why Cordis needs it

Because raw timers are side effects that can outlive a plugin.

The timer service makes scheduling an owned reversible effect.

### Service

```ts
ctx.timer
```

### Mixed methods

```ts
ctx.timeout(...)
ctx.interval(...)
ctx.throttle(...)
ctx.debounce(...)
```

Compatibility aliases:

```ts
ctx.setTimeout(...)
ctx.setInterval(...)
```

are currently deprecated in favor of `timeout` / `interval`.

### Use it for

- sleeps,
- retries,
- polling,
- debounce,
- throttle,
- periodic health checks,
- HMR debounce,
- delayed plugin work.

### Prefer it over

raw `setTimeout()` / `setInterval()` inside Cordis plugins, unless the raw timer is intentionally wrapped by your own `ctx.effect()`.

---

## 26.9 `packages/utils`

### NPM package

```text
@cordisjs/utils
```

### Current status

The package is marked:

```json
"private": true
```

So treat it as repository/internal support rather than a stable public application package.

### Current source

It provides a lifecycle-aware `List<T>` abstraction.

Its `push()` is implemented as an effect:

```text
push value
→ add it to internal map
→ disposer removes it
```

This is a useful demonstration of how even data-structure registrations can follow Cordis lifetime.

### Use it directly?

Normally no.

Because it is private, external applications should not build architectural dependencies on it unless the repository explicitly changes its public status.

### What to learn from it

A collection can itself be lifecycle-aware.

For example, plugin-owned contributions to a registry/list should disappear automatically on plugin unload.

That is a pattern worth copying into your own service registries.

---

# 27. Which package should I use?

| Need | Package |
|---|---|
| Basic plugin runtime | `cordis` |
| Start a new project | `create-cordis` |
| Config-driven plugin tree | `@cordisjs/plugin-loader` |
| Read `cordis.yml` / JSON into Loader | `@cordisjs/plugin-include` |
| Nested entry subtree | `@cordisjs/plugin-group` |
| Hot source reload | `@cordisjs/plugin-hmr` |
| Lifecycle-safe timeout/interval/debounce/throttle | `@cordisjs/plugin-timer` |
| Terminal log output | `@cordisjs/plugin-logger-console` |
| Internal repo helper patterns | `@cordisjs/utils` |

Typical serious application:

```text
cordis
+
loader
+
include
+
timer
+
logger-console
+
hmr in development
+
your plugins
```

---

# 28. Implementation checklist for a coding agent

When asked to implement or review a Cordis feature, follow this sequence.

## A. Identify the component

- [ ] What is the plugin's responsibility?
- [ ] Is it behavior only, or a reusable service?
- [ ] Should it be a function plugin or `Service` subclass?

---

## B. Identify dependencies

- [ ] Which `ctx.<service>` capabilities are required?
- [ ] Add them to `inject`.
- [ ] Which capabilities are optional?
- [ ] Use `ctx.get()` for truly optional services.

---

## C. Register service types

If providing a service:

- [ ] Add declaration merging to `Context`.
- [ ] Register the service at runtime via `Service` or `ctx.provide()`.

Never stop after only the TypeScript declaration.

---

## D. Enumerate every side effect

Search the implementation for:

```text
on(
addListener
setInterval
setTimeout
watch
open
connect
register
subscribe
add
patch
spawn
```

For each one ask:

- [ ] Does Cordis already own this registration?
- [ ] If not, is it inside `ctx.effect()`?
- [ ] Does the effect return the inverse/disposer?

---

## E. Decide communication style

Use **service** when:

```text
one provider owns a capability
```

Use **event** when:

```text
0..N observers/interceptors should participate
```

Use **waterfall** when:

```text
plugins may wrap, transform, veto, or short-circuit
```

---

## F. Validate config

- [ ] Define a Standard Schema compatible config validator.
- [ ] Supply defaults in schema.
- [ ] Reject invalid input before resource acquisition.
- [ ] Perform semantic validation where necessary.

---

## G. Loader integration

For Loader-managed plugins:

- [ ] Give the entry a stable `id`.
- [ ] Use `name` as module/package specifier.
- [ ] Put runtime options under `config`.
- [ ] Use `disabled` rather than deleting entries when an operational toggle is useful.
- [ ] Use groups for real subtrees.
- [ ] Use isolation when the same service key needs different local providers.

---

## H. HMR/reload test

Explicitly test:

```text
load
→ interact
→ update or reload
→ verify disposer execution
→ load new instance
→ verify no duplicate listeners/timers/services
```

---

## I. Dependency-loss test

If the plugin injects a service:

```text
load provider
→ load consumer
→ unload provider
→ verify consumer unloads
→ restore provider
→ verify consumer reloads
```

---

## J. Diagnostics

When something "does nothing":

1. inspect fiber state,
2. check for `PENDING`,
3. verify injected service names,
4. verify provider is mounted,
5. verify module name/path,
6. enable logger-console,
7. inspect live effects,
8. inspect Loader entry identity/config.

---

# 29. Glossary

## Component

Conceptual dynamically composable unit.

In normal Cordis implementation this is represented by a plugin/fiber plus its effects/dependencies.

---

## Plugin

Executable Cordis component definition.

Can be:

- function,
- object with `apply`,
- class/`Service`.

---

## Context / `ctx`

Shared scoped runtime surface carrying services, events, lifecycle APIs, and metadata.

---

## Service

Named capability exposed on `ctx`.

Example:

```ts
ctx.tools
ctx.llm
ctx.database
```

---

## Inject

Declaration of required service dependencies.

```ts
export const inject = ['database']
```

---

## Effect

A side effect whose inverse/disposer Cordis tracks.

---

## Disposer

Function that reverses an effect.

---

## Fiber

One mounted plugin instance and its lifecycle state/effects/config/dependencies.

---

## Temporal composability

Ability to remove a component and completely reverse its side effects.

---

## Spatial composability

Ability to declare dependencies and react when the capability environment changes.

---

## Coeffect

Conceptually, what a component requires from its environment.

In day-to-day Cordis work, required services through `inject` are the clearest manifestation.

---

## Loader

Runtime that turns a declarative entry tree into mounted plugins and reconciles changes.

---

## Entry

Loader's description of one desired plugin/group node.

---

## Include

File-backed source for a Loader entry tree.

---

## Group

Nested Loader subtree.

---

## HMR

**Hot Module Replacement**.

Reload changed code with minimal impact on the rest of the running application.

---

## Waterfall

Around-middleware event dispatch where listeners receive `next()` and can wrap or short-circuit downstream behavior.

---

# 30. Source references

Primary source material used to assemble this specification:

- Cordis repository: https://github.com/cordiverse/cordis
- Cordis packages: https://github.com/cordiverse/cordis/tree/main/packages
- Cordis paper repository: https://github.com/cordiverse/paper
- Paper PDF: https://github.com/cordiverse/paper/blob/main/paper.pdf
- DeepSeek Harness Cordis tutorial: https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/
- Cordis Primer: https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer
- Cordis API: https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context

Transcript/source video supplied for this guide:

- https://www.youtube.com/watch?v=jikDdmMzyQY

---

# Final coding-agent instruction

When modifying a Cordis system, do **not** think:

```text
"Where should I call startup and shutdown?"
```

Think:

```text
What capability does this plugin provide?
What capabilities does it require?
What effects does it create?
What inverse disposes each effect?
Who owns those effects?
What happens if a dependency disappears?
Can this fiber be unloaded and mounted again cleanly?
Can Loader reconcile this from configuration?
```

If those questions have precise answers, the component fits the Cordis model.

If they do not, fix the ownership/dependency model before adding more orchestration code.
