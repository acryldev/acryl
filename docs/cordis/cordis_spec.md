# CORDIS SPEC — ACR Runtime Foundation & Coding-Agent Onboarding

> **File purpose:** `cordis_spec.md`  
> **Audience:** coding agents and engineers working on ACR / Relaygent  
> **Status:** architecture/onboarding specification; use as a living document  
> **Primary framework:** Cordis v4 / DeepSeek Harness Cordis fork  
> **Goal:** understand enough Cordis to build ACR as an agent-agnostic, dynamically composable, self-adapting ADE rather than as a monolithic application.

For implementation work, pair this architecture specification with the
[Cordis System Guide for Coding Agents](cordis_system_guide_for_coding_agents.md)
and the current [ACR Cordis alignment audit](acr_cordis_alignment_audit.md).
The system guide owns operational Context/Fiber/service/injection/effect/event/
Tool/Loader rules; this document owns the ACR architectural direction.

---

## 0. Read this first

ACR is intended to become an **agent-agnostic Agentic Development Environment (ADE)** and multiplexer that can host, coordinate, relay context between, and extend itself around many existing coding agents and LLMs.

Examples of external agents/providers ACR should be able to host or adapt:

- Claude Code
- OpenAI Codex CLI / Codex agents
- Pi
- OpenCode
- Gemini CLI
- Kilo
- future unknown coding agents
- remote/ACP-compatible agents
- native ACR/DSH-style agents

ACR should **not** hardcode one agent loop, one LLM, one memory system, one graph system, one orchestration methodology, or one UI.

The intended product model is:

```text
                    ACR / Relaygent
                          |
          +---------------+---------------+
          |               |               |
         GUI             TUI             CLI
          |               |               |
          +---------------+---------------+
                          |
                    ACR Runtime
                          |
                     Cordis v4
                          |
      +---------+---------+---------+---------+
      |         |         |         |         |
    Agents    Models    Memory    Graphs    Tools
      |         |         |         |         |
   Claude     OpenAI    Hindsight   Lat      MCP
   Codex      Anthropic Mem0        Omni...  LSP
   Pi         Gemini    ...         ...      Git
   OpenCode   local                         PTY
   ...
```

The critical architectural principle is:

> **Everything above a very small trusted substrate should be expressed as replaceable capabilities/plugins/providers whenever practical.**

Cordis is being evaluated as the runtime kernel that makes this possible.

---

# 1. Canonical references

A coding agent working on this project should treat the following as primary sources.

## Cordis

- Cordis repository:  
  https://github.com/cordiverse/cordis

- Cordiverse organization:  
  https://github.com/cordiverse

- Cordis paper repository:  
  https://github.com/cordiverse/paper

- Paper PDF:  
  https://github.com/cordiverse/paper/blob/main/paper.pdf

- DeepWiki index:  
  https://deepwiki.com/cordiverse/cordis

## DeepSeek Harness Cordis documentation

- Cordis primer:  
  https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer

- Cordis tutorial:  
  https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/

- Harness configuration:  
  https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config

- DeepSeek Harness repository:  
  https://github.com/deepseek-ai/deepseek-harness

- Harness architecture source:  
  https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md

- Harness Cordis primer source:  
  https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md

- Harness Cordis tutorial source:  
  https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cordis-tutorial

## Desktop reference implementation

- Anywhere Labs DSH Desktop:  
  https://github.com/anywhere-labs/deepseek-harness-desktop

This project is useful because it explores the idea that **desktop capabilities themselves participate in Cordis composition**, rather than treating Electron as only a dumb WebView wrapper.

## Important version warning

Cordis is under active development and its v4 API is not yet guaranteed stable.

As of this specification:

- upstream `cordiverse/cordis` core package is in the Cordis v4 line and has been published through release-candidate versions;
- DeepSeek Harness vendors/publishes its own Cordis build under the `@deepseek-ai/*` namespace;
- DSH should be treated as the most concrete production-oriented reference for Cordis v4 agent-runtime usage.

**Do not scatter raw Cordis imports everywhere in ACR.**  
Use an ACR-owned adapter/runtime boundary so Cordis can be upgraded, pinned, vendored, or replaced deliberately.

Recommended boundary:

```text
ACR domain APIs
      |
@acr/runtime-cordis
      |
Cordis v4
```

---

# 2. What Cordis is

Cordis describes itself as:

> **A Meta-Framework of Spatiotemporal Composability.**

Do not mentally classify it as a UI framework, desktop framework, agent framework, or dependency-injection container.

It is closer to a **runtime composition kernel**.

Cordis gives an application a shared context in which components/plugins can:

- provide named services;
- declare service requirements;
- activate when requirements become available;
- unload when requirements disappear;
- emit and intercept typed events;
- register reversible side effects;
- compose into scoped trees;
- be configured declaratively;
- be replaced through configuration changes;
- participate in hot module replacement.

The paper formalizes two orthogonal properties:

## Temporal composability

A component should be removable without leaving hidden state behind.

Cordis models this through **revertible effects**.

Conceptually:

```text
install capability
      |
      +--> register listener
      +--> start timer
      +--> mount child
      +--> expose service
      +--> register tool
      |
component removed
      |
      +--> all corresponding effects are reverted
```

A component is not considered truly composable if removal leaves listeners, timers, references, subprocesses, registrations, or other state behind.

## Spatial composability

A component should state **what capabilities it requires**, not manually coordinate boot order.

Cordis models this through reactive dependencies/coeffects.

Example:

```text
Plugin A requires:
- workspace
- storage
- embeddings

Current context:
workspace   YES
storage     YES
embeddings  NO

=> Plugin A remains PENDING.
```

Later:

```text
@acr/embeddings-local mounts
        |
        v
embeddings becomes available
        |
        v
Plugin A automatically activates
```

If `embeddings` later disappears:

```text
embeddings provider unloads
        |
        v
Plugin A unloads
        |
        v
its effects are reverted
```

When the provider returns, Plugin A can activate again.

This is more than traditional dependency injection.  
It is **reactive runtime composition**.

---

# 3. Cordis in five ideas

A coding agent should internalize these before changing ACR runtime architecture.

## 3.1 Plugin

A plugin is a unit Cordis can mount/unmount.

A simple function can be a plugin:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello')
}
```

Cordis can also mount:

- function plugins;
- object plugins with `apply(ctx)`;
- `Service` subclasses;
- child plugins dynamically via `ctx.plugin(...)`.

Think:

```text
plugin = lifecycle-managed component
```

not:

```text
plugin = optional third-party addon only
```

In the Cordis/DSH philosophy, **core product functionality can itself be plugins**.

---

## 3.2 Context

A context is the shared capability environment.

Services are reached through stable keys:

```ts
ctx.tools
ctx.llm
ctx.sessions
ctx.agents
```

For ACR we should move toward keys such as:

```ts
ctx.acrAgentControl
ctx.rooms
ctx.relay
ctx.contextStore
ctx.memory
ctx.codeGraph
ctx.workspace
ctx.pty
ctx.ui
ctx.commands
```

Exact names are not finalized by this document.

The key idea is:

> consumers depend on a capability name/interface rather than importing a concrete provider.

Bad:

```ts
import { ClaudeAdapter } from '../providers/claude'
```

Preferred:

```ts
export const inject = ['acrAgentControl']

export function apply(ctx: Context) {
  ctx.acrAgentControl.attach(...)
}
```

The actual implementation can then come from configuration.

---

## 3.3 Services

A service is a named capability exposed on a context.

Example adapted from the official tutorial:

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

  greet(who: string) {
    return `Hello, ${who}!`
  }
}
```

Two things happen:

### Runtime

```ts
super(ctx, 'greeter')
```

registers the instance under:

```ts
ctx.greeter
```

### Compile time

TypeScript declaration merging teaches TS that `ctx.greeter` exists.

Service registration is itself lifecycle-managed.

When its provider unloads, the service disappears.

---

## 3.4 Inject

A plugin declares hard service requirements using `inject`.

```ts
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('ACR'))
}
```

Cordis does **not** require the YAML file to put `greeter` before the consumer.

Instead:

```text
provider missing
      |
      v
consumer PENDING

provider appears
      |
      v
consumer ACTIVE
```

Most importantly, this remains reactive **after startup**.

If the provider disappears:

```text
provider unloads
      |
      v
consumer unloads
      |
      v
consumer effects revert
```

If a replacement provider appears:

```text
replacement service appears
      |
      v
consumer activates again
```

This is one of the most important mechanisms for ACR.

It allows:

```text
AgentProvider implementation A
          |
          | remove
          v
dependent services unload
          |
          | install B
          v
dependent services rebind to B
```

without writing a separate home-grown dependency scheduler.

### Optional dependency

Do not use `inject` for something the plugin can live without.

Probe it:

```ts
const service = ctx.get('optionalService')

if (service) {
  // use it
}
```

---

## 3.5 Reversible effects

Cordis owns plugin lifetime.

Anything created for the lifetime of a plugin must be disposed with it.

For resources Cordis does not already track:

```ts
ctx.effect(() => {
  const timer = setInterval(work, 1000)

  return () => {
    clearInterval(timer)
  }
})
```

Think of an effect as:

```text
acquire
  +
record inverse
```

The inverse is executed when the owning plugin unloads.

Typical effects include:

- event listeners;
- timers;
- file watchers;
- network subscriptions;
- registrations;
- child plugins;
- UI contributions;
- tool registrations;
- capability-provider registrations;
- subprocess/process handles where practical;
- any resource that should disappear with the plugin.

A standing ACR rule should be:

> **No plugin-lifetime resource without a disposer.**

If teardown requires strict sequential ordering, put related teardown steps into one disposer and await them in order.

---

# 4. Fibers: Cordis runtime instances

Every loaded plugin instance owns a **fiber**.

The useful mental state machine is:

```text
PENDING
   |
   v
LOADING
   |
   v
ACTIVE
   |
   v
UNLOADING
   |
   v
DISPOSED

LOADING can also become FAILED.
```

Meanings:

- `PENDING`: declared, but required services are unavailable.
- `LOADING`: `apply()` / plugin activation is in progress.
- `ACTIVE`: plugin is live.
- `FAILED`: activation/config validation failed.
- `UNLOADING`: cleanup/disposers are executing.
- `DISPOSED`: completely torn down.

A coding agent debugging "the plugin prints nothing" should **inspect fiber state before changing random code**.

A PENDING plugin can be perfectly healthy; it may simply be waiting on an injected capability.

Example diagnostic idea:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  for (const runtime of ctx.registry.values()) {
    for (const fiber of runtime.fibers) {
      if (fiber.state === FiberState.PENDING) {
        console.log(`${fiber.name} waiting for dependency`)
      }
    }
  }
}
```

---

# 5. Child plugins and lifecycle ownership

Code can mount a child plugin:

```ts
const fiber = ctx.plugin(childPlugin)
```

The returned fiber is the runtime handle for that plugin instance.

Explicit disposal:

```ts
await fiber.dispose()
```

A child plugin mounted by a parent participates in lifecycle ownership.

When the parent disappears, child plugins should disappear with it.

This gives ACR a natural way to model nested runtime structures.

Possible mapping:

```text
ACR root
  |
  +-- workspace plugin
       |
       +-- room plugin
            |
            +-- agent instance plugin
                 |
                 +-- session plugins
                 +-- temporary tools
                 +-- scoped UI
```

Do not assume this exact hierarchy is final; use Cordis scopes/isolation deliberately and test reference ownership.

---

# 6. Services vs events

Use a **service** for a direct capability call.

Example:

```ts
await ctx.acrAgentControl.dispatch(...)
```

Use an **event** when producers should not need to know all consumers or when behavior needs interception/policy.

Example:

```ts
ctx.emit('acr/agent-started', agent)
```

or an interception point:

```text
agent/request
tool/execute
approval/request
relay/before-handoff
```

A useful design question is:

> Is this a capability I call, or an extension seam others may observe/intercept?

---

# 7. Typed events

Cordis uses TypeScript declaration merging for event types.

Example:

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'acr/agent-started'(id: string): void
  }
}
```

Listener:

```ts
ctx.on('acr/agent-started', (id) => {
  console.log(id)
})
```

`ctx.on()` is an effect.

The listener disappears automatically when the plugin unloads.

Do **not** manually build global EventEmitter registries around Cordis unless a boundary genuinely requires one.

---

# 8. Event dispatch modes

Cordis/DSH currently exposes several dispatch semantics.

A coding agent must choose deliberately because the dispatch mode is part of the public contract.

## emit

```ts
ctx.emit(name, ...args)
```

Synchronous broadcast/observation.

Use when listeners observe and do not control the outcome.

---

## parallel

```ts
await ctx.parallel(name, ...args)
```

Run async listeners concurrently and await completion.

Use for independent asynchronous fan-out.

---

## serial

```ts
await ctx.serial(name, ...args)
```

Run listeners in registration order.

A result can stop subsequent processing according to Cordis semantics.

Useful for ordered decision chains.

---

## bail

```ts
ctx.bail(name, ...args)
```

Synchronous decision / early-return form.

Use only where the contract explicitly needs it.

---

## waterfall

```ts
await ctx.waterfall(name, ...args, defaultNext)
```

This is the most important interception mechanism.

A waterfall listener receives a continuation:

```ts
ctx.on('acr/request', async (request, next) => {
  // inspect / modify
  return next()
})
```

A listener may wrap downstream behavior:

```ts
ctx.on('acr/request', async (request, next) => {
  const result = await next()
  return transform(result)
})
```

Or deliberately short-circuit:

```ts
ctx.on('acr/request', async (request, next) => {
  if (shouldBlock(request)) {
    return blockedResult
  }

  return next()
})
```

### Critical rule

> **A waterfall listener that only observes or annotates MUST call `next()`.**

Forgetting `next()` accidentally swallows downstream/default behavior.

This deserves tests and linting where practical.

---

# 9. Cordis configuration: `cordis.yml`

Cordis configuration is not merely startup settings.

It is a declarative description of the **application's plugin composition**.

Simple example:

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'

- id: my-agent-provider
  name: './plugins/agent-provider.ts'
  config:
    provider: claude-code
```

Important entry concepts include:

- `id`
- `name`
- `config`
- `disabled`
- injection/dependency metadata where supported
- groups/composition
- isolation

## Stable IDs

Always prefer explicit stable IDs in ACR-owned composition.

Example:

```yaml
- id: acr-agent-claude
  name: './plugins/agent-claude.ts'
```

The loader uses IDs to reconcile edits.

Without stable IDs, a config edit can look like:

```text
old entry removed
+
new entry added
```

causing unnecessary remounts.

---

# 10. Config validation

A plugin can export a runtime config schema.

DSH commonly uses Schemastery:

https://github.com/shigma/schemastery

Example:

```ts
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})
```

Then:

```ts
export function apply(ctx: Context, config: Config) {
  // config has already been validated
}
```

Bad configuration should fail **before** the plugin runs half-configured.

ACR rule:

> Fail configuration loudly, early, and transactionally.

Do not leave partially activated generated plugins after config validation failure.

---

# 11. Computed configuration

The DSH Cordis loader supports `!!js` expressions in specific config locations.

Example:

```yaml
- id: demo
  name: './demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`disabled` can also be computed:

```yaml
disabled: !!js process.platform !== 'darwin'
```

Treat dynamic configuration as code.

ACR-generated expressions must go through the same trust/permission review as generated plugins.

Avoid using arbitrary expressions when a typed config option can solve the same problem.

---

# 12. Composition, groups and isolation

Cordis composition can contain nested groups.

Isolation can give groups separate instances of a service name.

Conceptually:

```text
root
 |
 +-- workspace A
 |    |
 |    +-- shell = local
 |
 +-- workspace B
      |
      +-- shell = remote
```

Both may expose a service named `shell` but consumers inside each isolated realm receive the provider for that realm.

This is highly relevant to ACR.

Potential ACR scope model:

```text
ACR root
  |
  +-- Workspace
       |
       +-- Room
            |
            +-- Agent
                 |
                 +-- Session
```

Possible scoped providers:

- filesystem
- subprocess
- PTY
- sandbox
- credentials
- model
- memory
- graph
- toolset
- context policy
- workspace checkout/worktree

Do not make every service global.

Agent/session-local capabilities should be scoped so one session can change providers without destabilizing unrelated sessions.

---

# 13. HMR: hot module replacement

Cordis HMR works because:

1. plugin effects are reversible;
2. services/dependencies are reactive;
3. the loader can replace a plugin instance;
4. dependent components can unload and reactivate.

DSH tutorial example uses:

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

When `hello.ts` changes:

```text
old hello plugin
    |
    v
UNLOADING
    |
effects revert
    |
    v
DISPOSED

new hello module
    |
    v
LOADING
    |
    v
ACTIVE
```

This is the inner mechanism ACR should build on for **HOT self-adaptation**.

Do not confuse HMR with full binary/core updating.  
See the HOT/WARM/COLD model later in this document.

---

# 14. TypeScript does still compile/transpile

Important clarification:

Cordis being TypeScript-based does **not** mean TypeScript source executes magically without transformation.

A typical generated plugin path is:

```text
plugin.ts
   |
   v
tsx / esbuild / swc / TypeScript transpilation
   |
   v
JavaScript module
   |
   v
dynamic import / Cordis mount
```

This transformation can be lightweight and fast.

During development, DSH's tutorial runs TypeScript directly via Node + `tsx`:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

For truly runtime-generated modules, ACR may support both:

```text
.ts   developer/generated typed plugin
.mjs  direct runtime-generated JavaScript plugin
```

Possible policy:

- author/source representation: TypeScript;
- test/type-check representation: TypeScript;
- runtime cache: compiled JS/ESM;
- emergency/generated tiny plugins: optional `.mjs`.

Do not let this distinction leak into the domain model.

A plugin is a plugin regardless of its source authoring language.

---

# 15. Why Cordis is interesting for self-adapting software

The desired ACR loop is:

```text
observe
  |
  v
reason
  |
  v
generate change
  |
  v
validate
  |
  v
test candidate
  |
  v
stage
  |
  v
activate
  |
  v
observe candidate
  |
  +--> healthy -> commit
  |
  +--> unhealthy -> rollback
```

Cordis directly helps with the inner runtime loop:

```text
generate plugin
      |
      v
load candidate
      |
      v
Cordis mounts
      |
      v
capability graph changes
      |
      v
dependent plugins react
      |
      v
old effects disappear
```

Example future user request:

> Add support for FooCode, a coding agent released today.

Desired ACR behavior:

```text
1. research FooCode CLI/API
2. infer adapter contract
3. generate @acr/agent-foocode
4. test spawn/send/stream/interrupt/resume/stop
5. stage plugin
6. mount through Cordis
7. register AgentProvider
8. UI/TUI automatically exposes FooCode
9. observe failures
10. rollback plugin if necessary
```

No ACR installer release should be required for an ordinary new agent adapter.

---

# 16. DeepSeek Harness as the principal reference implementation

DeepSeek Harness (DSH) is important because it demonstrates Cordis used as an **agent harness**, not only as a generic plugin framework.

DSH architecture treats major product parts as plugins, including:

- model adapters;
- tool registry;
- session log;
- agent interface;
- agent loop;
- system prompt assembly;
- persistence;
- sandbox/execution providers;
- UI/web profile.

Its architecture states that there is no privileged product core that every extension must patch; extensions are mounted as neighboring plugins/capabilities.

ACR should learn from this, but **must not become DSH-native-agent-centric**.

The fundamental inversion for ACR is:

```text
DSH emphasis:
model -> DSH agent loop -> tools

ACR emphasis:
                   ACR Room
                      |
       +--------------+--------------+
       |              |              |
   Claude Code      Codex            Pi
       |              |              |
       +--------------+--------------+
                      |
                relay/context
```

The DSH-native loop should become one possible provider, not the definition of an ACR agent.

---

# 17. DSH core seams worth learning from

DSH currently models key capabilities roughly as:

```text
ctx.sessions
ctx.systemPrompt
ctx.tools
ctx.agents
ctx.agentLoop
ctx.llm
```

The architecture separates capability seams into:

1. **Service Definition** — stable interface/contract.
2. **Service Provider** — implementation.
3. **Consumer** — code that uses the interface.

This pattern should become foundational in ACR.

Example:

```text
Agent Provider Seam

Definition:
@acr/contracts/agent-provider

Providers:
@acr/agent-claude-code
@acr/agent-codex
@acr/agent-pi
@acr/agent-opencode
@acr/agent-dsh-native

Consumers:
room runtime
session UI
relay service
orchestrators
commands
```

---

# 18. ACR capability model

The architecture target is:

> **Everything is a capability; capabilities may have multiple providers.**

Initial capability families:

```text
AgentProvider
ModelProvider
MemoryProvider
CodeGraphProvider
ContextProvider
ExecutionProvider
TerminalProvider
FilesystemProvider
WorkspaceProvider
ToolProvider
WorkflowProvider
OrchestratorProvider
UIContribution
CommandContribution
ProtocolProvider
PersistenceProvider
TelemetryProvider
AuthenticationProvider
```

Examples:

## AgentProvider

```text
Claude Code
Codex
Pi
OpenCode
Gemini CLI
Kilo
DSH native
future agents
```

## MemoryProvider

```text
Hindsight
Mem0
Supermemory
OpenViking
local SQLite
future systems
```

## CodeGraphProvider

```text
Lat
OmniGraph
Graphify
CodeGraph
future graph systems
```

## ProtocolProvider

```text
ACP
MCP
ACR protocol
JSON-RPC
PTY bridge
```

## UIContribution

```text
desktop panel
sidebar item
status item
command palette action
TUI pane
settings page
agent inspector
context meter
```

No capability category above should imply one mandatory implementation.

---

# 19. Proposed ACR runtime package boundary

Do not import Cordis directly throughout the whole application.

Recommended structure:

```text
packages/
  contracts/
  runtime/
  runtime-cordis/
  agents/
  rooms/
  relay/
  sessions/
  context/
  workspace/
  execution/
  ui-contracts/
  plugin-sdk/
```

Only `runtime-cordis` and deliberately Cordis-facing plugin packages should need intimate knowledge of Cordis internals.

Example:

```text
@acr/contracts
        |
        v
@acr/runtime
        |
        v
@acr/runtime-cordis
        |
        v
@deepseek-ai/cordis or upstream Cordis
```

Advantages:

- isolate unstable v4 APIs;
- make vendor pinning easier;
- permit a future Cordis fork;
- permit experiments with cordis-rs or another host;
- keep ACR domain contracts stable.

---

# 20. Fork vs dependency strategy

Do **not** immediately hard-fork Cordis just because ACR depends on it.

Recommended progression:

## Phase A — dependency + adapter

```text
ACR
 |
 +-- @acr/runtime-cordis
          |
          +-- pinned Cordis version
```

Learn where the framework actually constrains us.

## Phase B — vendored/pinned source if needed

DeepSeek Harness demonstrates this pattern.

If runtime correctness depends on exact Cordis semantics:

```text
vendor/cordis/
```

Record:

- exact upstream commit;
- local patches;
- synchronization process;
- tests proving ACR assumptions.

## Phase C — fork only with concrete reasons

Fork only when ACR requires changes upstream cannot or should not absorb.

Never fork just to rename Cordis.

---

# 21. Agent-agnostic ACR runtime

ACR should separate:

```text
AgentProvider
```

from:

```text
AgentInstance
```

from:

```text
AgentSession
```

from:

```text
Room
```

Conceptual API only:

```ts
interface AgentProvider {
  id: string

  detect(): Promise<Availability>

  spawn(input: SpawnInput): Promise<AgentInstance>
}

interface AgentInstance {
  send(input: AgentInput): Promise<void>
  interrupt(): Promise<void>
  stop(): Promise<void>
}

interface AgentSession {
  id: string
  providerId: string
  workspaceId: string
  status: AgentStatus
}

interface Room {
  id: string
  members: AgentSession[]
}
```

Do not copy this literally without checking existing implementation contracts.

The principle matters more than names:

> **external coding agents are first-class providers, not subprocess hacks hidden inside UI code.**

---

# 22. Context relay is an ACR domain concept, not a Cordis feature

Cordis solves runtime composition.

It does **not** automatically solve ACR's core product domain:

- persistent cross-agent room;
- session capture;
- context compaction;
- context relay/handoff;
- replay;
- account/profile switching;
- shared room identities;
- context lineage;
- agent switching;
- transcript normalization;
- trace capture.

Implement these as ACR services/capabilities on top of Cordis.

Example conceptual services:

```text
ctx.rooms
ctx.relay
ctx.contextStore
ctx.traceStore
ctx.sessionBridge
```

Cordis is the kernel; ACR remains the product.

---

# 23. Durable facts vs live events

Borrow a strong idea from DSH:

> durable facts should live in a replayable log; live coordination should use runtime events.

Possible ACR split:

## Durable

Persist:

```text
room/created
agent/joined
agent/left
session/started
user/message
agent/message
tool/call
tool/result
handoff/created
handoff/accepted
context/compacted
generation/promoted
generation/rolled-back
```

## Live

Use Cordis events:

```text
acr/agent/pre-spawn
acr/agent/status
acr/relay/before-handoff
acr/relay/after-handoff
acr/context/before-compact
acr/plugin/candidate
acr/plugin/health
acr/generation/switching
```

Do not use ephemeral events as the only record of facts that must survive restart.

---

# 24. UI must be composable too

If ACR wants generative/self-adapting UI, do not hardcode all features into React routes/components.

Define UI contribution seams.

Conceptual:

```text
UIContribution
 |
 +-- sidebar item
 +-- panel
 +-- route
 +-- settings section
 +-- status widget
 +-- command
 +-- room renderer
 +-- agent renderer
```

Future request:

> Add a panel showing token usage by agent.

Desired result:

```text
generated plugin
 |
 +-- TokenUsageService
 +-- UIContribution
```

Mount plugin:

```text
Cordis
 |
 +--> service appears
 |
 +--> UI registry receives contribution
 |
 +--> panel appears
```

No full desktop rebuild.

The same idea should extend to TUI:

```text
TUIContribution
 |
 +-- pane
 +-- command
 +-- status region
 +-- modal
```

---

# 25. Self-adaptation levels: HOT / WARM / COLD

ACR should classify every self-change.

## HOT

No application process restart.

Examples:

- agent adapter;
- LLM provider;
- memory provider;
- graph provider;
- tool;
- command;
- workflow;
- context strategy;
- UI contribution;
- event listener;
- most policy plugins.

Mechanism:

```text
generate
 -> validate
 -> transpile/import
 -> mount
 -> observe
 -> commit/rollback
```

Cordis HMR/effects/dependency resolution are central here.

---

## WARM

Restart a Cordis/application generation, but not necessarily the outer desktop executable.

Examples may include:

- replacement of desktop service graph;
- window manager plugin;
- PTY bridge;
- profile runtime;
- Cordis version within a compatible host;
- major host composition change.

Mechanism:

```text
build candidate generation
 -> test
 -> dispose current generation
 -> mount candidate
 -> health check
 -> promote or restore
```

Design every generation so resources do not leak across boundaries.

---

## COLD

Requires replacement of the executable/runtime substrate.

Examples:

- Electron version;
- Node version;
- native `.node` modules;
- Rust/native binaries;
- Tauri core;
- signing/bootstrap changes;
- OS entitlements;
- installer changes;
- Chromium flags that require process startup.

Mechanism:

```text
build candidate artifact
 -> test in isolation
 -> stage
 -> external supervisor performs atomic swap
 -> restart
 -> health check
 -> commit or rollback
```

COLD does not mean "not self-updatable."

It means:

> **transactional self-update rather than in-process hot replacement.**

---

# 26. External supervisor / self-update architecture

To push self-adaptation beyond the running process, introduce a tiny external supervisor.

Conceptual architecture:

```text
OS
 |
 +-- ACR application
 |     |
 |     +-- Desktop shell
 |     +-- Node/Electron/Tauri
 |     +-- Cordis
 |     +-- plugins
 |
 +-- ACR Supervisor
       |
       +-- stage
       +-- verify
       +-- stop
       +-- switch
       +-- boot
       +-- health-check
       +-- rollback
       +-- commit
```

Prefer platform-native supervision rather than relying only on cron:

```text
macOS   launchd
Linux   systemd / user systemd
Windows Windows Service / Task Scheduler
```

The supervisor should be much smaller and more conservative than the adaptive runtime.

---

# 27. Generation model

Never overwrite the currently working runtime in place if avoidable.

Use generations.

Conceptually:

```text
ACR/
  generations/
    141/
    142/
    143/
  current  -> 143
  previous -> 142
```

Self-update flow:

```text
current = 143

build 144
   |
test 144
   |
stage 144
   |
switch current -> 144
   |
launch
   |
health check
   |
   +-- healthy -> commit
   |
   +-- unhealthy -> rollback current -> 143
```

For HOT plugins, this can be implemented at plugin/package/profile level.

For WARM changes, use Cordis/application generations.

For COLD changes, use external supervisor generations.

---

# 28. Candidate health protocol

A self-adapting system must know when a new generation is safe.

Suggested candidate states:

```text
BUILT
VALIDATED
STAGED
STARTED
READY
HEALTHY
COMMITTED
```

Failure path:

```text
FAILED
ROLLED_BACK
QUARANTINED
```

Possible checks:

```text
Cordis root starts
critical services ACTIVE
no unexpected PENDING fibers
storage opens
session replay works
PTY starts
agent provider smoke test works
UI boots
plugin registry loads
no fatal event errors
heartbeat reaches supervisor
```

A candidate must not become "committed" merely because the process started.

---

# 29. Generated plugin provenance

Every agent-generated capability should carry provenance.

Suggested layout:

```text
plugin/
  manifest.json
  source/
  compiled/
  permissions.json
  tests/
  compatibility.json
  provenance.json
  history/
  rollback.json
```

`provenance.json` may record:

```json
{
  "generatedBy": "agent/model identifier",
  "reason": "user requested FooCode support",
  "sourceReferences": [],
  "createdAt": "...",
  "parentGeneration": "...",
  "requestedPermissions": []
}
```

Do not blindly expose private prompts or secrets in provenance.

The point is auditability.

---

# 30. Permission model

Self-adaptation without permissions becomes arbitrary code execution with a friendly UI.

Every generated or installed plugin should declare requested capability classes.

Examples:

```text
filesystem.read
filesystem.write
process.spawn
network.connect
credentials.read
workspace.modify
git.write
ui.contribute
terminal.spawn
desktop.window
desktop.tray
update.stage
update.commit
```

A plugin that only renders a context meter should not automatically inherit:

```text
Full Disk Access
arbitrary shell
update supervisor authority
```

Cordis handles lifecycle/composition; **ACR must add a serious authorization model on top.**

---

# 31. Desktop architecture: Electron vs Tauri

Cordis does not require Electron or Tauri.

Both can host a dynamic Node/Cordis runtime.

## Electron advantage for ACR

Electron main-process code is JS/TS/Node.

That means more desktop behavior can potentially remain dynamically replaceable.

Example:

```text
tiny Electron bootstrap
       |
       v
Cordis-managed desktop runtime
       |
       +-- window service
       +-- tray service
       +-- terminal service
       +-- profiles service
       +-- updater UI
```

A well-designed Electron ACR can keep most desktop behavior outside the tiny immutable bootstrap.

This may be strategically valuable for **maximum malleability**.

## Tauri advantage

Tauri gives:

```text
Rust
native shell
small binary/webview model
strong native boundary
```

But changes to Rust/native behavior generally require a native rebuild and restart.

With the COLD supervisor model this is still self-updatable, just not normally HOT.

## Current recommendation

Do not choose solely on "Electron is heavy" or "Tauri is cool."

Evaluate against ACR's unusual primary requirement:

> **How much of the product can safely remain a replaceable runtime capability?**

---

# 32. Anywhere Labs pattern worth borrowing

Reference:

https://github.com/anywhere-labs/deepseek-harness-desktop

The important idea is not "use Electron because they use Electron."

It is:

> **desktop services participate in the same compositional runtime instead of creating an unrelated parallel plugin system.**

The desktop host should expose stable services to the runtime and keep raw native internals behind controlled boundaries.

Desired conceptual pattern:

```text
Electron/Tauri native substrate
           |
           v
       Cordis Host
           |
    +------+------+------+
    |             |      |
 DSH/ACR       Desktop  3rd-party
 services      services plugins
```

Avoid:

```text
Cordis plugin system
        +
totally separate Electron plugin system
        +
totally separate TUI plugin system
```

One capability model should drive all surfaces where practical.

---

# 33. Minimal immutable bootstrap

If Electron is chosen, make `main` tiny.

Bad:

```text
main.ts
  12,000 lines
  agents
  windows
  terminal
  profiles
  updater
  plugin manager
  storage
  everything
```

Preferred:

```text
electron/
  bootstrap.mjs

runtime/
  host.ts

plugins/
  desktop-window/
  desktop-tray/
  desktop-terminal/
  desktop-menu/
  desktop-workspace/
  desktop-update/
```

Bootstrap responsibilities should approach:

```text
locate runtime
verify runtime
start runtime generation
supervise runtime
request rollback if runtime fails
```

The less logic in the irreversible bootstrap, the deeper ACR can self-adapt.

---

# 34. Do not let "self-updating" mean random self-editing

Reject this architecture:

```text
agent decides improvement
 -> edits arbitrary production source files
 -> hopes application survives
```

Preferred:

```text
agent proposes MutationPlan
 -> creates candidate
 -> static validation
 -> tests
 -> sandbox run
 -> staged generation
 -> activation
 -> health observation
 -> commit / rollback
```

Example model:

```ts
interface MutationPlan {
  class: 'HOT' | 'WARM' | 'COLD'
  scope: string[]
  reason: string
  expectedBenefit?: string
  permissions: string[]
  validation: ValidationPlan
  rollback: RollbackPlan
}
```

Do not treat this interface as finalized.

---

# 35. Cordis plugin authoring rules for ACR

A coding agent creating an ACR plugin should follow these rules.

## Rule 1 — define the capability contract first

Do not begin with implementation.

Ask:

```text
What service/event/capability is being added?
Who provides it?
Who consumes it?
Can multiple providers exist?
What scope should it live in?
```

## Rule 2 — depend on interfaces/services, not implementations

Bad:

```ts
import FooMemory from './foo-memory'
```

Preferred:

```ts
export const inject = ['memory']
```

## Rule 3 — make every registration reversible

If a plugin creates something, know how it disappears.

## Rule 4 — avoid hidden globals

Global maps/singletons bypass Cordis scope/lifecycle semantics.

## Rule 5 — use events for interception

Do not modify the agent loop merely to add an approval policy, logger, transformer, or observer if a seam can handle it.

## Rule 6 — choose scope deliberately

Global capability?

Workspace?

Room?

Agent?

Session?

Turn?

## Rule 7 — stable config IDs

Generated composition must be reconcilable.

## Rule 8 — type config and fail loud

No half-configured plugin.

## Rule 9 — generated code must be testable independently

Every generated provider should have smoke tests.

## Rule 10 — never assume load order

If behavior depends on a service, declare it.

---

# 36. ACR anti-patterns

## Anti-pattern: mandatory native ACR agent loop

ACR must remain able to host external agents.

A native DSH-like agent may exist, but as one provider.

---

## Anti-pattern: giant god service

Avoid:

```text
ctx.acr.doEverything()
```

Prefer focused seams.

---

## Anti-pattern: agents implemented in React components

UI should render/control agent services.

It should not own their lifecycle.

---

## Anti-pattern: PTY process ownership hidden in UI

PTY/process management is runtime/native capability.

UI observes it.

---

## Anti-pattern: plugin unload that leaks process/timer/listener

Treat as architecture bug.

---

## Anti-pattern: hardcoded startup ordering

Use `inject`.

---

## Anti-pattern: every provider global

Use isolation/scopes.

---

## Anti-pattern: generated plugin gets all permissions

Least privilege.

---

## Anti-pattern: editing current generation in place

Stage new generation and rollback.

---

## Anti-pattern: forking Cordis before understanding it

Use/pin/adapter first.

---

# 37. Suggested ACR plugin package anatomy

Example only:

```text
packages/plugins/agent-foocode/
  package.json
  README.md
  src/
    index.ts
    provider.ts
    transport.ts
    events.ts
    config.ts
  test/
    smoke.test.ts
    lifecycle.test.ts
    reconnect.test.ts
  cordis.patch.yml
```

Tests should include:

```text
mount
service becomes available
consumer activates
spawn mock agent
send input
stream output
interrupt
dispose
all processes stop
all listeners disappear
provider unloads
consumer becomes inactive/PENDING
provider remounts
consumer returns ACTIVE
```

Lifecycle tests matter as much as functional tests.

---

# 38. First ACR Cordis experiment

Do not migrate the entire product immediately.

Build a small proof.

## Experiment objective

Prove that Cordis can support a real ACR provider swap.

### Services

Create:

```text
acrAgentControl
rooms
```

### Providers

Implement two fake agents:

```text
fake-agent-a
fake-agent-b
```

### Consumer

A room service injects:

```text
acrAgentControl
```

### Test

1. Start with fake-agent-a.
2. Open a room.
3. Confirm provider A serves it.
4. Replace provider A with B through Cordis config/HMR.
5. Confirm lifecycle cleanup for A.
6. Confirm dependent consumer reactivates.
7. Confirm provider B serves new activity.
8. Confirm no timers/listeners/process handles leak.
9. Confirm config rollback restores A.

If this cannot be made clean and understandable, do not proceed to broad migration.

---

# 39. Second experiment: generative plugin installation

Build:

```text
plugin-candidates/
plugin-active/
plugin-history/
```

Flow:

```text
agent writes simple provider plugin
 -> typecheck
 -> unit test
 -> launch isolated Cordis root
 -> verify service appears
 -> dispose root
 -> verify cleanup
 -> copy/promote plugin
 -> edit composition
 -> HMR mount
```

Then deliberately generate a broken plugin.

Verify:

```text
candidate fails
active generation remains healthy
rollback is automatic
```

---

# 40. Third experiment: UI contribution

Create a generated UI plugin that contributes:

```text
Agent Status panel
```

No manual route edit should be required.

The panel should disappear cleanly when plugin unloads.

This proves:

```text
runtime capability
+
generative UI
+
reversible lifecycle
```

---

# 41. Fourth experiment: WARM generation

Replace several runtime capabilities together.

Candidate generation:

```text
AgentProvider B
MemoryProvider B
new UI contribution
```

Test candidate in isolation.

Dispose current generation.

Promote candidate.

Rollback on failed health check.

---

# 42. Fifth experiment: COLD supervisor

Only after HOT/WARM work.

Implement a minimal external supervisor capable of:

```text
stage
verify
switch
launch
health
rollback
```

Test with a harmless versioned bootstrap artifact.

Do not give generated plugins direct unrestricted access to supervisor authority.

---

# 43. Cordis/DSH quick-start sandbox

For a coding agent learning Cordis from DSH:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install

mkdir -p tmp/cordis-tutorial
cd tmp/cordis-tutorial
```

The DSH tutorial launcher:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

The launcher creates a root `Context`, mounts the Loader, and loads `./cordis.yml`.

Work through:

1. first plugin;
2. lifecycle/effects;
3. services;
4. events;
5. config;
6. composition/HMR;
7. integration with Harness.

Tutorial:

https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cordis-tutorial

---

# 44. Recommended reading order for coding agents

Read in this order:

1. This `cordis_spec.md`.
2. Cordis primer:  
   https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer
3. Cordis tutorial:  
   https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/
4. DSH architecture:  
   https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
5. Cordis repository source:  
   https://github.com/cordiverse/cordis
6. Cordis paper README/PDF:  
   https://github.com/cordiverse/paper  
   https://github.com/cordiverse/paper/blob/main/paper.pdf
7. Anywhere Labs desktop architecture:  
   https://github.com/anywhere-labs/deepseek-harness-desktop

Do not begin by reading the entire Cordis source tree cold.

First internalize:

```text
Context
Service
inject
effect
Fiber
event modes
loader
composition
HMR
isolation
```

Then inspect implementation details.

---

# 45. Working vocabulary

Use these terms consistently.

## Context

Runtime capability environment.

## Service

Named capability exposed through context.

## Provider

Plugin implementing a service/capability.

## Consumer

Plugin using a service/capability.

## Plugin

Lifecycle-managed component.

## Fiber

Runtime instance/state of a mounted plugin.

## Effect

Reversible lifecycle-owned side effect.

## Inject

Hard service dependency.

## Event

Typed communication/interception seam.

## Waterfall

Around-middleware event chain with `next()`.

## Composition

Configured plugin tree.

## Generation

One coherent runtime composition that can be tested/promoted/disposed.

## HOT mutation

Plugin/capability change without process restart.

## WARM mutation

Runtime/generation restart.

## COLD mutation

Executable/native substrate replacement.

---

# 46. Questions a coding agent must answer before adding architecture

Before implementing any significant ACR capability, answer:

```text
1. What is the stable capability contract?
2. Is this a service or an event seam?
3. Who provides it?
4. Can multiple providers exist?
5. What plugins consume it?
6. Is it required or optional?
7. What is its scope?
8. What effects does it create?
9. How are those effects disposed?
10. What happens if the provider disappears?
11. What state must survive reload?
12. What is durable vs live?
13. Can this be HOT?
14. If not, is it WARM or COLD?
15. How is the candidate tested?
16. What is rollback?
17. What permissions are required?
18. How is provenance recorded?
```

If these questions are unanswered, the feature is not ready to become part of the self-adaptive architecture.

---

# 47. Initial architecture hypothesis

The current preferred direction is:

```text
                    ACR
                     |
       +-------------+-------------+
       |             |             |
    Desktop         TUI           CLI
       |             |             |
       +-------------+-------------+
                     |
                 ACR APIs
                     |
              Cordis Runtime
                     |
     +---------------+----------------+
     |               |                |
 ACR Domain      Providers        UI Contributions
     |               |                |
 rooms            agents            panels
 relay            models            commands
 sessions         memory            routes
 context          graphs            TUI panes
 traces           tools             settings
                     |
             Native capability layer
                     |
            PTY / FS / process / OS
```

If Electron is used:

```text
tiny Electron bootstrap
        |
Cordis-managed desktop services
        |
ACR runtime
```

If Tauri is used:

```text
Tauri/Rust stable native layer
        |
Node/Cordis adaptive runtime
        |
ACR plugins
```

Do not finalize Electron vs Tauri before running the self-adaptation experiments.

---

# 48. Long-term ACR vision

The long-term target is not merely an extensible IDE.

It is:

> **a self-adapting agentic development environment that treats coding agents, LLMs, memory systems, graph systems, tools, workflows, and UI as composable providers, can generate new capabilities for itself, test those capabilities, activate them transactionally, observe their behavior, and roll them back when they fail.**

Cordis is valuable because its core abstractions line up with that goal:

```text
revertible effects
+
reactive dependencies
+
scoped services
+
typed events
+
declarative composition
+
HMR
```

ACR adds the missing product/system layers:

```text
agent-agnostic multiplexer
+
persistent rooms
+
context relay
+
session/trace capture
+
provider ecosystem
+
generative UI
+
permission model
+
candidate testing
+
generation management
+
supervised rollback/update
```

---

# 49. Non-goal: rewriting everything immediately

Do not use this document as justification to rebuild every current ACR experiment at once.

First prove:

```text
Cordis service swap
Cordis lifecycle cleanup
agent provider seam
runtime-generated plugin
UI contribution
generation rollback
```

Then expand.

A small, correct compositional kernel is more valuable than a large theoretical plugin architecture that nobody can debug.

---

# 50. Final directive to the coding agent

When implementing ACR on Cordis:

1. **Treat Cordis as a runtime kernel, not the product.**
2. **Keep ACR domain contracts above Cordis.**
3. **Make external coding agents first-class providers.**
4. **Use services for capabilities and events for observation/interception.**
5. **Declare hard dependencies with `inject`; never depend on startup order.**
6. **Every plugin-lifetime side effect must be reversible.**
7. **Use scopes/isolation for workspace/room/agent/session-specific providers.**
8. **Keep durable facts in replayable storage; do not rely on ephemeral events.**
9. **Make UI contribution-based so functionality can appear/disappear dynamically.**
10. **Treat generated plugins as candidate artifacts with tests, permissions, provenance, and rollback.**
11. **Classify mutations as HOT, WARM, or COLD.**
12. **Use Cordis generations for runtime changes and an external supervisor for binary/core changes.**
13. **Do not let self-adaptation become uncontrolled in-place source mutation.**
14. **Pin Cordis behind `@acr/runtime-cordis`; vendor/fork only when evidence justifies it.**
15. **Use DeepSeek Harness as the Cordis-v4 agent-runtime reference implementation, but invert its product assumptions so ACR remains agent-agnostic.**

The desired property is:

```text
ACR Core is stable enough to trust.
ACR capabilities are dynamic enough to grow.
ACR generations are safe enough to replace themselves.
```

That is the architecture to build toward.

---

# Appendix A — source links

Cordis:

https://github.com/cordiverse/cordis

Cordiverse:

https://github.com/cordiverse

Cordis paper:

https://github.com/cordiverse/paper

Cordis paper PDF:

https://github.com/cordiverse/paper/blob/main/paper.pdf

DeepSeek Harness:

https://github.com/deepseek-ai/deepseek-harness

Cordis primer:

https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer

Cordis tutorial:

https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/

Cordis config tutorial:

https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config

DSH architecture:

https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md

DSH primer source:

https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md

DSH tutorial source:

https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cordis-tutorial

Anywhere Labs DSH Desktop:

https://github.com/anywhere-labs/deepseek-harness-desktop

Cordis-rs experimental port:

https://github.com/dshbox/cordis-rs

---

# Appendix B — one-screen Cordis cheat sheet

```text
PLUGIN
lifecycle-managed component

CONTEXT
shared capability environment

SERVICE
named capability at ctx.<key>

INJECT
hard dependency; plugin waits/reacts

EFFECT
acquire resource + registered inverse/disposer

FIBER
runtime plugin instance
PENDING -> LOADING -> ACTIVE -> UNLOADING -> DISPOSED
                  \-> FAILED

EVENT
typed communication/interception seam

WATERFALL
around-middleware; call next() unless intentionally short-circuiting

CORDIS.YML
declarative application composition

HMR
dispose old plugin effects + mount new implementation

ISOLATION
different provider instances in different scopes

ACR USE
capabilities/providers + runtime self-adaptation
```
