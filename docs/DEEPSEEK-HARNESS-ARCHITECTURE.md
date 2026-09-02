DeepSeek Harness is best understood not as “a coding agent with plugins,” but as a **Cordis application graph where the coding agent itself is just one composition of plugins**.

That distinction explains almost the entire repository.

DeepSeek describes the architecture literally as “Everything is a plugin”: models, tools, skills, sessions, sandboxes, storage, loops, scheduling, and UI are all independently mounted capabilities. Cordis owns mounting, dependency resolution, lifecycle, events, and teardown. ([deepseek.com][1]) The repository architecture document goes even further: **“There is no privileged core to patch.”**

---

# 1. The mental model

For a SWE, I would model DeepSeek Harness roughly like this:

```text
┌────────────────────────────────────────────────────────────┐
│                        SURFACES                            │
│                                                            │
│   Web UI        CLI / headless       SDK        ACP        │
│     │                 │               │          │          │
└─────┼─────────────────┼───────────────┼──────────┼──────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│                  PROFILE / BUNDLE COMPOSITION              │
│                                                            │
│ cordis.yml + bundle patches + user patches + --patch       │
│                                                            │
│ decides WHICH plugins exist in this runtime                │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                       CORDIS KERNEL                        │
│                                                            │
│ Context                                                    │
│ Services                                                   │
│ Dependency injection                                       │
│ Events                                                     │
│ Plugin lifecycle                                           │
│ Effects / disposal                                         │
│ HMR                                                        │
│ Config composition                                         │
└────────────────────────────┬───────────────────────────────┘
                             │
          ┌──────────────────┼───────────────────┐
          │                  │                   │
          ▼                  ▼                   ▼
      Agent core          Capabilities       Infrastructure
      ---------           ------------       --------------
      session             fs                 storage
      agent               shell              credentials
      agent-loop          terminal           settings
      tools               web                sandbox
      system-prompt       skills             jobs
      llm                 subagents          telemetry
                          workflow
                          MCP
                          LSP
```

Cordis does **not** implement the coding agent.

Cordis is the **metaframework/kernel** that allows the coding agent to be assembled.

DeepSeek Harness implements the capabilities.

---

# 2. Cordis is effectively the microkernel

This is the most important architectural concept.

The Harness architecture says:

> plugins contribute services, typed events, and reversible effects to a shared context.

And even the model adapter, tool registry, session log and agent loop are plugins.

Conceptually:

```ts
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(...)
}
```

A plugin receives:

```text
ctx
```

which acts somewhat like a combination of:

```text
dependency injection container
+ event bus
+ service registry
+ lifecycle manager
+ plugin scope
```

For example:

```text
ctx.llm
ctx.tools
ctx.sessions
ctx.agents
ctx.fs
ctx.shell
ctx.jobs
ctx.goals
ctx.settings
```

are services supplied by plugins.

The tool tutorial demonstrates this directly: declaring

```ts
export const inject = ['tools']
```

means Cordis waits until the `tools` service exists before activating that plugin. Then the plugin calls:

```ts
ctx.tools.register(...)
```

to contribute functionality. ([deepseek-harness.github.io][2])

This is much more powerful than ordinary imports.

Instead of:

```ts
import filesystem from './filesystem'
```

you architect around:

```text
I need capability "fs"
```

and whichever provider supplies that capability wins through composition.

---

# 3. Why Cordis matters

It gives DSH four major architectural properties.

### Dependency inversion

Tools depend on:

```text
ctx.fs
```

not:

```text
FsLocalImplementation
```

So:

```text
tool-fs
      │
      ▼
    ctx.fs
      ▲
      │
 ┌────┼────────┐
 │    │        │
local sandbox  E2B
```

The repository explicitly says:

> Extension plugins depend on Service Definitions, never concrete providers.

---

### Lifecycle ownership

If plugin A registers:

```text
tool
event listener
service
timer
child plugin
```

those registrations belong to A.

Unload A:

```text
Cordis disposes everything A owns.
```

This is a huge part of the “spatiotemporal composability” idea.

Composition is not merely:

```text
what components exist
```

but:

```text
where they exist
when they exist
who owns them
when their effects disappear
```

---

### Dynamic composition

A runtime is a plugin tree.

You can replace:

```text
local fs
```

with:

```text
E2B fs
```

without rewriting `read`, `write`, `edit`, etc.

Or replace:

```text
agent-loop
```

while keeping:

```text
Agent API
tools
sessions
UI
```

---

### HMR

Cordis/Loader can reconcile plugin-tree changes.

This is why DSH can implement live configuration and even self-modifying runtime functionality.

The Cordis tutorial describes composition and HMR as first-class framework concepts. ([deepseek-harness.github.io][3])

---

# 4. Where Cordis actually lives

Very important detail:

DeepSeek does **not merely npm-install Cordis**.

There is:

```text
/vendor
```

containing:

```text
vendor/
├── cordis
├── cosmokit
├── group
├── hmr
├── include
├── loader
├── logger-console
├── schemastery
└── timer
```

([GitHub][4])

DeepSeek explicitly says these are **source-vendored copies** so that Harness fully owns its framework layer:

> auditable, patchable, pinned.

([GitHub][4])

They rename them into DeepSeek's namespace:

```text
cordis
→ @deepseek-ai/cordis

@cordisjs/plugin-loader
→ @deepseek-ai/cordis-plugin-loader
```

Their Cordis version currently identifies itself as:

```text
4.0.0-rc.7
```

in the vendored manifest. ([GitHub][4])

So structurally:

```text
DeepSeek Harness
│
├── vendor/
│   └── Cordis framework
│
└── packages/
    └── applications/capabilities built WITH Cordis
```

This separation is fundamental.

---

# 5. Repository root

Current high-level repository structure is:

```text
deepseek-harness/
├── .agents/
├── .claude/
├── .github/
├── apps/
├── docs/
├── native/
├── packages/
├── patches/
├── python/
├── scripts/
├── snapshots/
├── vendor/
└── website/
```

([GitHub][5])

Let's go through them.

---

# 6. `apps/`

```text
apps/
├── cli/
└── web/
```

([GitHub][6])

These are **application entry/surface projects**, not the architectural core.

Think:

```text
packages/* = reusable product capabilities
apps/*     = runnable/application-facing assembly
```

### `apps/cli`

Owns the `dsh` command-line executable / launcher behaviors.

Ultimately everything supported starts through the `dsh` entry point.

The architecture explicitly tries to prevent random alternative startup paths: supported applications resolve through `dsh` + a profile.

---

### `apps/web`

Browser-side application build entry.

But much of the reusable web architecture lives deeper under:

```text
packages/client
packages/host
packages/api
```

So `apps/web` should be viewed as **application assembly**, not the reusable UI framework itself.

---

# 7. `docs/`

This is unusually important in this repository.

It contains:

```text
architecture docs
subsystem contracts
event maps
cookbooks
developer guides
Cordis tutorial
generated module graph
configuration catalog
```

The repo actually treats architecture documentation almost like part of the contract.

For understanding DSH, these are particularly valuable:

```text
docs/architecture.md
docs/module-graph.md
docs/capability-seams.md
docs/subsystems/*
docs/cookbook/*
```

The architecture doc is effectively the conceptual specification for `packages/`.

---

# 8. `.agents/`

This is another interesting directory.

It contains design notes, architectural decisions, implementation notes, historical decisions, etc.

From the repository tree you can see things such as:

```text
.agents/notes/implemented/
.agents/notes/archived/architecture/
```

Many important architectural choices have dedicated records there.

This effectively functions somewhat like:

```text
ADRs
+ agent context
+ implementation design log
```

for humans and coding agents.

---

# 9. `.claude/`

Claude-specific development configuration/context.

This is repository-development tooling, not Harness runtime architecture.

---

# 10. `.github/`

Standard repository infrastructure:

```text
GitHub Actions
issue/discussion infrastructure
workflows
automation
```

Again, development infrastructure.

---

# 11. `native/`

Currently primarily:

```text
native/
└── landlock-run/
```

([GitHub][7])

`landlock-run` provides native Linux sandbox/process-confinement functionality.

The repository describes it as the self-restrict-then-exec launcher consumed by Harness. ([GitHub][7])

This supports the higher-level:

```text
packages/sandbox
```

architecture.

So:

```text
Cordis capability
     │
     ▼
ctx.sandbox
     │
     ▼
sandbox provider
     │
     ▼
native/landlock-run
```

on Linux.

---

# 12. `python/`

```text
python/
├── sdk/
└── sdk-runtime/
```

([GitHub][8])

The important thing is that Python is **not a separate Harness implementation**.

The architecture document says the Python SDK launches the normal `dsh` runtime and talks to it.

So:

```text
Python SDK
   │
   │ protocol
   ▼
dsh --profile sdk
   │
   ▼
same Cordis Harness runtime
```

This is a good architectural decision: one actual Harness implementation, multiple language clients.

---

# 13. `vendor/`

As discussed:

```text
Cordis kernel + Cordis ecosystem foundation
```

including:

```text
cordis
loader
include
group
hmr
timer
schemastery
cosmokit
logger-console
```

([GitHub][4])

This is effectively:

```text
Framework Layer
```

while `packages/` is:

```text
Harness Product Layer
```

---

# 14. `scripts/`

Repository engineering/build/code-generation/verification infrastructure.

Among other things, this repository generates and verifies:

```text
module dependency graph
package documentation contracts
architecture invariants
entrypoint rules
package metadata
```

For example, `packages/README.md` notes that `docs/module-graph.md` is generated with:

```bash
pnpm run gen-module-graph
```

and freshness-checked in CI.

---

# 15. `patches/`

Dependency/workspace patches.

This should not be confused with **Cordis runtime patches** such as:

```text
cordis.patch.yml
```

The latter are composition layers.

The root `patches/` directory is repository dependency/build maintenance.

---

# 16. `snapshots/`

Stored expected/generated test snapshots and validation artifacts.

Primarily development/test infrastructure rather than runtime capability code.

---

# 17. `website/`

The public documentation/website implementation.

The actual Harness Web UI is architecturally represented mainly by:

```text
apps/web
packages/client
packages/host
packages/api
```

rather than this marketing/documentation website.

---

# 18. Now the important part: `packages/`

There are currently roughly 50 **capability groups**.

Important terminology:

The folders directly under `packages/` are usually **package groups**, not necessarily single npm packages.

For example:

```text
packages/fs/
```

contains multiple actual npm packages:

```text
fs
fs-local
fs-sandbox
tool-fs
tool-fs-search
...
```

Every published Harness package is scoped approximately:

```text
@deepseek-ai/dsh-*
```

and every package belongs to exactly one group.

---

# 19. `packages/core` — the agent spine

This is the place I would read first.

It contains:

```text
core/
├── scope/
├── session/
├── system-prompt/
├── tools/
├── agent-tool-presentation/
├── agent/
├── agent-default-model/
└── agent-loop/
```

This is the logical coding-agent kernel **above Cordis**.

## `scope`

Per-agent isolation/scoping primitive.

Allows something to exist only for:

```text
Agent A
```

rather than globally for every agent.

Useful for:

```text
agent-specific tools
agent-specific services
agent-specific event routing
```

---

## `session`

Core append-only event log abstraction.

This is extremely central.

Rather than maintaining one giant mutable:

```ts
messages[]
```

DSH records durable facts:

```text
turn/start
user/message
assistant/chunk
assistant/message
tool/call
tool/result
step/end
turn/end
...
```

Then model history is **derived from this log**.

The architecture states:

> The session log is the source of the context the model sees.

This is event-sourcing-inspired architecture.

---

## `system-prompt`

Builds system prompts out of registered sections.

Conceptually:

```text
SystemPromptService
   │
   ├── instructions
   ├── workspace info
   ├── time context
   ├── tool descriptions
   ├── dynamic context
   └── plugin-contributed sections
```

Instead of one hardcoded giant prompt.

---

## `tools`

The central tool registry and execution pipeline.

Conceptually:

```text
ctx.tools.register(tool)

                   ↓

model tool_call
     ↓
tools/pre-execute
     ↓
tools/execute
     ↓
tools/post-execute
     ↓
tool/result
```

The agent loop doesn't need to know:

```text
grep
read
write
bash
web
workflow
```

It just knows:

```text
ToolRegistry
```

---

## `agent-tool-presentation`

Controls how tools are exposed/presented for a given agent/preset.

This separates:

```text
what tools exist
```

from:

```text
what tool vocabulary this agent sees
```

---

## `agent`

Very important separation.

This owns the stable:

```text
Agent interface
ctx.agents
agent/* events
```

Plugins program against this abstraction.

---

## `agent-loop`

The **default implementation of Agent execution**.

This separation is deliberate:

```text
agent
  =
stable API

agent-loop
  =
current implementation
```

The repo explicitly states `agent-loop` is swappable.

This means you could theoretically implement:

```text
ReAct loop
DeepSeek loop
RLM loop
tree search loop
multi-turn planner loop
```

without replacing every tool/UI/session package.

This is one of the strongest architectural decisions in Harness.

---

# 20. Agent request lifecycle

Very approximately:

```text
User input
    │
    ▼
Agent inbox
    │
    ▼
turn/start
    │
    ▼
agent/pre-step
    │
    ▼
System prompt assembly
    │
    ▼
deriveMessages(session log)
    │
    ▼
agent/request
    │
    ▼
ctx.llm.stream()
    │
    ▼
assistant chunks
    │
    ├── tool calls?
    │       │
    │       ▼
    │   ctx.tools
    │       │
    │       ▼
    │   tool results
    │       │
    └───────┘
    │
    ▼
step/end

more work?
   yes ───► another step
   no
    │
    ▼
turn/end
```

The official architecture describes the same flow in detail.

---

# 21. `packages/llm`

Actual packages include:

```text
llm/
├── llm/
├── llm-deepseek/
├── llm-pi-ai/
├── deepseek-llm-api-extensions/
├── plugin-package-inventory-deepseek/
├── llm-retry/
└── token-meter/
```

### `llm`

Provider-neutral model protocol.

Defines things like:

```text
Message
ContentBlock
StreamChunk
adapter interface
ctx.llm
```

Think of this as DeepSeek Harness's model abstraction layer.

---

### `llm-deepseek`

Native DeepSeek provider adapter.

Handles:

```text
DeepSeek API
thinking
chat completions
image input
```

---

### `llm-pi-ai`

Very interesting package.

It adapts models/providers through the `pi-ai` model/provider ecosystem.

So DSH is not architecturally locked to DeepSeek models.

---

### `deepseek-llm-api-extensions`

Allows Harness plugins to add DeepSeek-specific top-level API request metadata.

---

### `plugin-package-inventory-deepseek`

Adds information about currently mounted Harness plugin packages to official DeepSeek requests.

---

### `llm-retry`

Retry behavior around failed requests.

Importantly, it integrates at durable agent-step boundaries rather than hiding retry logic inside random providers.

---

### `token-meter`

Measures token/context pressure from the durable session log.

This feeds context-management decisions.

---

# 22. `packages/fs`

Excellent example of capability layering.

```text
fs/
├── fs/
├── fs-local/
├── fs-sandbox/
├── fs-observation-policy/
├── tool-fs/
├── tool-fs-search/
└── tool-str-replace-editor/
```

plus remote:

```text
e2b/fs-e2b
```

Architecture:

```text
             model
               │
               ▼
           tool-fs
               │
               ▼
             ctx.fs
               │
      ┌────────┼──────────┐
      ▼        ▼          ▼
 fs-local  fs-sandbox   fs-e2b
```

That is exactly what DSH calls a **capability seam**.

---

# 23. Service Definition / Provider / Consumer

This pattern repeats throughout Harness.

For filesystem:

### Service Definition

```text
fs/
```

Defines:

```text
ctx.fs
```

and the interface.

### Service Provider

```text
fs-local
fs-sandbox
fs-e2b
```

Implement the interface.

### Consumer

```text
tool-fs
tool-fs-search
```

Expose functionality to the model.

This is essentially:

```text
Ports & Adapters / Hexagonal Architecture
+
Dependency Injection
+
runtime plugin composition
```

Cordis makes the composition dynamic.

The Harness docs explicitly call this pattern a **seam**.

---

# 24. Every top-level package group

Here is the useful mental map of all current groups. The repository's authoritative group list is here. ([GitHub][9])

| Group                 | Think of it as                                       |
| --------------------- | ---------------------------------------------------- |
| `core`                | Agent kernel/API/loop/tools/prompt/session-log spine |
| `api`                 | Backend-for-frontend and RPC API assembly            |
| `typert`              | Runtime type graph + RPC/type registry               |
| `goal`                | Persistent goal/objective inside a session           |
| `schedule`            | Scheduled follow-up work tied to sessions            |
| `feedback`            | Explicit human feedback capture                      |
| `identity`            | Anonymous/shared Harness identity                    |
| `llm`                 | Provider-neutral LLM layer and adapters              |
| `e2b`                 | Remote E2B execution providers                       |
| `subprocess`          | Generic process execution abstraction                |
| `shell`               | Bash execution service and shell tools               |
| `terminal`            | Long-lived PTY terminal sessions                     |
| `code-runtime`        | Programmatic code execution runtime                  |
| `sandbox`             | Process-confinement abstraction/providers            |
| `fs`                  | Filesystem abstraction/providers/tools               |
| `lsp`                 | Language Server Protocol capability                  |
| `skill`               | Skill discovery/loading/provider system              |
| `compaction`          | Context compaction service                           |
| `context`             | Dynamic model-visible context injection              |
| `subagent`            | Delegation/subagent abstraction                      |
| `jobs`                | Generic async/background jobs                        |
| `experimental`        | Internal/private prototypes                          |
| `workflow`            | Structured workflow execution engine                 |
| `webhook`             | Authenticated external event → agent session         |
| `web`                 | Internet search/fetch capabilities                   |
| `attachment`          | Durable attachment identity/storage                  |
| `spill`               | Large tool-result externalization/storage            |
| `todo`                | Model-facing todo management                         |
| `plan`                | Agent/user collaborative planning state              |
| `preset`              | Per-session composition / agent modes                |
| `guard`               | Runtime/loop safety and hygiene policies             |
| `bundle`              | Reusable Cordis compositions                         |
| `extensions`          | Runtime introspection/self-modification              |
| `hooks`               | Claude Code/Codex-style hook bridges                 |
| `session`             | Durable session persistence/projections/titles       |
| `session-query`       | Search/retrieval over sessions                       |
| `settings`            | User settings abstraction/storage                    |
| `credentials`         | Credential storage/references/auth flows             |
| `storage`             | Non-session generic persistence                      |
| `workspace`           | Workspace/project domain entity                      |
| `sdk`                 | External JSON-RPC SDK                                |
| `acp`                 | Agent Client Protocol server                         |
| `interaction`         | Human approvals/permissions/ask-user                 |
| `boot`                | Cordis app/profile startup infrastructure            |
| `host`                | Node/server half of Web UI                           |
| `client`              | Browser-side Harness UI framework/plugins            |
| `test-support`        | Harness-specific testing infrastructure              |
| `runtime-diagnostics` | Runtime invariant checking                           |
| `util`                | Low-level dependency-free helpers                    |

These are not arbitrary feature folders. Most are intentionally bounded **capability families**.

---

# 25. `subprocess`

This is lower-level than `shell`.

Think:

```text
ctx.subprocess
```

provides:

```text
spawn process
kill process
process tree ownership
stdout/stderr
execution world
```

Then:

```text
shell
terminal
LSP
```

can depend on that execution seam.

This becomes particularly useful for:

```text
local machine
vs
E2B remote environment
```

---

# 26. `shell`

Bash capability.

Likely layering:

```text
shell contract
   │
   ▼
shell-local
   │
   ▼
ctx.subprocess
```

with separate model-facing Bash tools.

This means changing process execution world can relocate Bash without rewriting the agent tool.

The architecture explicitly notes that filesystem and subprocess can share one “execution world,” letting E2B move multiple capabilities together.

---

# 27. `terminal`

Persistent PTY runtime.

This differs from shell:

```text
shell
= execute command

terminal
= persistent interactive process/session
```

Useful for:

```text
REPLs
dev servers
interactive CLIs
long-lived terminals
```

The group has:

```text
owner-scoped terminal sessions
local implementation
model-facing terminal tools
```

---

# 28. `code-runtime`

Runtime for code generated by the model.

This is particularly relevant to DeepSeek's **Code Mode**.

DeepSeek says Code Mode allows the model to combine multiple tool operations in one TypeScript program. ([deepseek.com][1])

Conceptually:

```text
LLM generates TS
      │
      ▼
code-runtime
      │
      ▼
tool SDK
      │
 ┌────┼──────────┐
 fs   web       shell ...
```

instead of:

```text
LLM → tool → LLM → tool → LLM → tool
```

you can have:

```text
LLM
 ↓
program
 ↓
tool
tool
tool
loop
condition
map
filter
 ↓
result
```

This can massively reduce model round trips.

---

# 29. `sandbox`

Defines:

```text
ctx.sandbox
```

and process-confinement implementations.

Officially it includes:

```text
bubblewrap
Landlock
Seatbelt
```

backends.

Platform mapping roughly:

```text
Linux → bwrap / Landlock
macOS → Seatbelt
```

This does not need to infect every execution tool.

Instead:

```text
shell
terminal
subprocess
```

can go through the sandbox seam.

---

# 30. `lsp`

Language Server Protocol integration.

Architecture:

```text
LSP service seam
    │
    ├── stdio language server provider
    │
    └── model-facing lsp tool
```

Useful for semantic coding operations that are stronger than grep:

```text
definitions
references
symbols
diagnostics
type information
```

---

# 31. `skill`

Skills are another provider-registry capability.

Think:

```text
ctx.skills
      │
      ├─ local skills
      ├─ installed skills
      └─ future providers
```

and model-facing tools expose:

```text
catalog
load
```

rather than coupling the agent loop to a particular skill directory.

---

# 32. `compaction`

Context compaction is also not hardcoded into the loop.

It is its own capability family:

```text
compaction contract
     │
     ├── compaction provider
     │
     └── command/consumer
```

That's important.

It lets you theoretically substitute:

```text
simple summarization
semantic compression
RLM-style navigation
graph-based context
hierarchical memory
```

without rewriting `agent-loop`.

---

# 33. `context`

This is model-visible dynamic request context.

Examples include:

```text
workspace instructions
current time
references
dynamic contextual information
```

The distinction from sessions matters:

```text
session
= durable event history

context
= additional information entering a model request
```

But DSH has a strong rule:

> Model-visible means logged.

So if context actually reaches the model, the system ensures it is reconstructable in the session stream.

That enables deterministic:

```text
replay
fork
resume
trajectory inspection
```

---

# 34. `subagent`

Subagent abstraction.

The agent does not have to know whether delegation means:

```text
spawn a new Harness child Agent
delegate to some external coding agent
use another provider
resume another session
```

It talks to a provider-registry contract.

This is exactly the right abstraction for agent interoperability.

---

# 35. `jobs`

Generic background-job system.

Conceptually:

```text
start async task
   ↓
Job
   ↓
later:
 job_status
 job_collect
 job_cancel
```

instead of forcing every long-running tool to invent its own background-work architecture.

---

# 36. `workflow`

Higher-level structured execution.

The repository specifically mentions:

```text
workflow
ralph
```

tools and a worker-thread engine.

Think of it as above primitive tools:

```text
tool
  = atomic capability

workflow
  = coordinated multi-step execution
```

---

# 37. `web`

Internet/search capability family.

Again likely follows:

```text
web service abstraction
      │
      ├── search providers
      ├── fetch providers
      └── model-facing web tools
```

So a search vendor is replaceable without rewriting the agent.

---

# 38. `webhook`

External system → Harness.

Conceptually:

```text
GitHub / Slack / custom webhook
         │
         ▼
   signature verification
         │
         ▼
 trusted webhook rule
         │
         ▼
 Workspace Session
         │
         ▼
       Agent
```

Good for unattended/automation workloads.

---

# 39. `attachment`

Handles durable attachment identity.

Instead of UI passing around arbitrary temp file paths:

```text
Attachment ID
   │
   ▼
validated object
   │
   ▼
content-addressed storage
```

This provides stable attachments across:

```text
sessions
replay
API
web UI
```

---

# 40. `spill`

Tool outputs can become enormous.

Rather than put:

```text
500 KB grep output
```

directly into model context, spill can externalize it:

```text
tool result
   │
   ├─ small → inline
   │
   └─ huge → storage
             │
             └─ reference
```

Again, context architecture separated from storage architecture.

---

# 41. `todo`

Simple model-facing:

```text
todo_write
```

tool.

It's small but intentionally isolated from the agent loop.

This demonstrates their philosophy:

> even apparently tiny agent behaviors shouldn't require modifying the central loop.

---

# 42. `goal`

Persistent objective management.

Different from todo:

```text
goal
= what this session is fundamentally trying to accomplish

todo
= tactical work list
```

The `goal` capability can use agent events to influence continuation behavior.

---

# 43. `plan`

Explicit plan-collaboration state.

The package description mentions:

```text
direct entry command
reviewed exit
```

So plan mode is modeled as structured runtime state, not just:

```text
"please make a plan" prompt hack
```

---

# 44. `preset`

Very important.

Presets provide **per-session agent composition** using Cordis configuration.

Think:

```text
Standard
Minimal
Code
Creator
Custom
```

as compositions.

DeepSeek currently advertises:

```text
Standard
Code
Minimal
Creator
```

runtime modes. ([deepseek.com][1])

Instead of:

```ts
if (mode === 'creator') ...
```

the architectural direction is:

```text
mode = plugin composition
```

Much cleaner.

---

# 45. `guard`

Agent-loop hygiene policies.

Examples called out by the repository include:

```text
repeated tool-call reminders
tools/execute deadline enforcement
```

Again these are listeners/plugins around the loop rather than logic hardcoded into the loop.

---

# 46. `extensions`

This is one of the most unusual and interesting parts.

The package group is described as:

> Agent runtime self-modification: live plugin/service inspection and model-written mount/unmount.

In other words, an agent can inspect its Cordis environment:

```text
what plugins exist?
what services exist?
```

potentially create/plugin code, then:

```text
mount it
test it
unmount it
```

This is possible precisely because the Harness runtime itself is represented as a live plugin graph.

This is the architectural basis for **Creator Mode**.

---

# 47. `hooks`

Interoperability layer for:

```text
Claude Code
Codex
```

style wire protocols/hooks.

This means third-party coding-agent conventions can be bridged without contaminating `agent-loop`.

---

# 48. `session`

This is separate from:

```text
core/session
```

and the distinction is important.

### `core/session`

Defines the fundamental session/event-log API used by the agent core.

### `packages/session`

Adds the durable **data plane**, including things like:

```text
persistence providers
session projection
titles
reporting
backends
```

The repository describes this group as:

> persistence seam + backends, projection seam, log-backed titles, session reporting.

This is another good split:

```text
logical session contract
vs
storage/projection infrastructure
```

---

# 49. `session-query`

Search layer over sessions.

Supports concepts including:

```text
logical corpus
bounded reads
lineage
semantic filtering
SQLite FTS
```

This is essentially the foundation for historical context navigation.

---

# 50. `storage`

General non-session persistence.

Keeps generic application data separate from the highly structured append-only session log.

---

# 51. `settings`

Abstract user-settings service plus provider(s).

Again:

```text
consumer
  ↓
ctx.settings
  ↑
provider
```

rather than reading arbitrary JSON config all across the codebase.

---

# 52. `credentials`

Credentials are represented by references/records rather than blindly exposing secrets to plugins.

The group contains:

```text
credential abstractions
env / .env provider
authorization flows
human interaction
```

This matters because agent runtimes frequently need:

```text
GitHub token
API key
cloud credentials
MCP auth
```

without putting all secrets into model-visible context.

---

# 53. `workspace`

Domain concept for a project/workspace.

A session and workspace are not the same:

```text
Workspace
   │
   ├── files
   ├── repository
   ├── environment
   └── sessions
```

This distinction becomes important for persistent coding-agent products.

---

# 54. `interaction`

Human collaboration plane.

Includes concepts such as:

```text
approval
permission policy
commands
ask-user
```

So model-human interaction isn't hardcoded in every tool.

Typical execution:

```text
tool wants dangerous operation
        │
        ▼
interaction policy
        │
        ▼
approval request
        │
        ▼
user
```

---

# 55. `sdk`

Out-of-process integration architecture.

The repository says:

```text
JSON-RPC protocol
TypeScript client/server
```

Meaning external applications can control Harness without embedding Harness implementation code.

---

# 56. `acp`

Agent Client Protocol server.

This exposes Harness through ACP for automation/integration.

It is another **surface adapter** around the same internal capabilities.

---

# 57. `api`

Backend-for-frontend assembly.

This sits between:

```text
browser client
       │
       ▼
API / RPC gateway
       │
       ▼
Cordis services
```

The repository mentions Typert RPC specifically.

---

# 58. `typert`

Runtime type/RPC graph infrastructure.

Think:

```text
TypeScript service/type information
      ↓
generated graph/artifacts
      ↓
RPC runtime registry
      ↓
client/server contract
```

It appears to underpin typed communication between runtime and clients.

---

# 59. `host`

Server half of the Web GUI.

Owns things such as:

```text
HTTP routes
API gateway
server integrations
```

The package summary describes it as:

> Web-GUI host half: API gateway + HTTP route server.

---

# 60. `client`

Browser-side counterpart.

Described as:

```text
shell
wire
object services
slots
ui-* plugins
```

Notice the architecture again:

**even UI is pluginized.**

So the browser itself has something resembling extension surfaces rather than one monolithic React application.

---

# 61. `boot`

Crucial, though not sexy.

This is what converts:

```text
profile
+
bundle layers
+
cordis.patch.yml
+
--patch
```

into an actual running Cordis plugin tree.

It is the bridge between:

```text
CLI
```

and:

```text
Cordis runtime.
```

---

# 62. `bundle`

This is where actual product compositions are described.

DeepSeek's architecture says the important compositions include:

```text
dsh-base
dsh-web-app
dsh-headless
dsh-sdk-app
dsh-acp-app
dsh-sdk-minimal
```

You can think of bundles as:

```text
predefined Lego assemblies
```

while individual packages are the Lego bricks.

---

# 63. Profiles vs bundles

This can initially be confusing.

## Bundle

An installable configuration layer.

Example:

```text
dsh-base
```

might contribute:

```text
LLM
filesystem
shell
tools
sessions
credentials
sandbox
...
```

---

## Profile

Defines a runnable setup.

Example:

```text
web
```

might compose:

```text
base bundle
+
web app bundle
+
your plugins
+
your cordis.patch.yml
```

The docs describe the layer order as:

```text
bundle 1
bundle 2
...
profile cordis.patch.yml
home cordis.patch.yml
--patch overlays
```

---

# 64. Runtime composition example

Suppose the base configuration conceptually contains:

```yaml
- llm
- agent
- agent-loop
- fs
- fs-local
- tools
- shell
- sessions
```

Your custom patch could effectively say:

```text
disable fs-local
enable fs-e2b
```

and suddenly:

```text
read
write
edit
bash
LSP
```

can operate against the remote execution world if those consumers are wired through those capability seams.

That is the power of the architecture.

---

# 65. `mcp`

One current `packages/` folder not reflected in the slightly older top-level README table is:

```text
packages/mcp
```

The live GitHub directory listing includes it. ([GitHub][9])

This is the MCP capability/integration family, allowing Harness to consume external MCP-provided functionality rather than requiring every integration to be a native DSH package.

The fact that the live tree can move ahead of the group-map documentation is worth keeping in mind because the project explicitly warns that it is in fast-moving developer preview.

---

# 66. `test-support`

Shared testing infrastructure:

```text
testkits
replay testing
invariant tests
Cordis Loader smoke tests
```

The interesting part is that DSH tests architecture-level invariants, not only functions.

---

# 67. `runtime-diagnostics`

Runtime architecture validation.

Think:

```text
Is the active plugin graph valid?
Are required services installed?
Are package assumptions satisfied?
Are runtime invariants broken?
```

Useful especially because the system allows dynamic composition.

---

# 68. `util`

Very low-level utilities.

The repository explicitly wants this package to remain low-dependency.

Examples given include:

```text
Branded<B>
home/path helpers
timeout
retention
```

---

# 69. What makes the architecture unusual

A normal coding agent commonly looks approximately like:

```text
Agent class
 ├── LLMClient
 ├── ToolManager
 ├── BashTool
 ├── FileTool
 ├── ContextManager
 ├── SessionManager
 └── UI
```

Everything ultimately depends on `Agent`.

DeepSeek Harness instead looks like:

```text
Cordis Context
│
├── LLM service
│    ├── DeepSeek adapter
│    └── pi-ai adapter
│
├── Agent service
│    └── AgentLoop provider
│
├── Tools service
│    ├── filesystem tools
│    ├── shell tools
│    ├── web tools
│    ├── workflow
│    └── ...
│
├── FS service
│    ├── local
│    ├── sandbox
│    └── E2B
│
├── Subagent service
│    └── providers...
│
├── Session service
│
├── Interaction service
│
└── UI / APIs / SDKs
```

There is much less:

```text
parent object → child object
```

and much more:

```text
capability → context service → provider
```

---

# 70. So where exactly is Cordis used?

Almost everywhere.

Cordis provides the mechanisms for:

### 1. Plugin initialization

```ts
apply(ctx, config)
```

### 2. Dependency injection

```ts
inject = ['tools', 'fs']
```

### 3. Service registry

```text
ctx.tools
ctx.fs
ctx.llm
...
```

### 4. Event system

```text
agent/*
tools/*
session/*
fs/*
```

### 5. Lifecycle

```text
mount
activate
dispose
unload
```

### 6. Effects

Registrations automatically belong to their plugin lifecycle.

### 7. Scope

Capabilities can be attached to particular agent contexts.

### 8. Configuration

```text
cordis.yml
```

### 9. Composition

Plugin trees.

### 10. HMR

Live plugin/config replacement.

This is why the tutorial says:

> every capability — tools, LLM adapters, file access, the agent loop itself — is a plugin mounted into a shared context.

([deepseek-harness.github.io][3])

---

# 71. DeepSeek Harness and the Cordis paper

The paper's “spatiotemporal composability” idea makes more sense when looking at DSH.

Traditional DI answers:

```text
Which implementation satisfies this interface?
```

Cordis additionally cares about:

```text
WHERE is this capability mounted?

WHEN does it exist?

WHO owns its lifecycle?

WHAT context sees it?

WHAT happens when its plugin disappears?
```

So you can have:

```text
Root Context
│
├── global fs
├── global llm
│
├── Agent A context
│    ├── tools A
│    └── permissions A
│
└── Agent B context
     ├── tools B
     └── permissions B
```

and safely tear down Agent A's capability set without affecting Agent B.

That's the “spatial” side.

Lifecycle:

```text
load
activate
effects
dependencies change
reload
dispose
```

is the “temporal” side.

---

# 72. The three strongest architectural patterns

If you were extracting lessons for another harness, I would reduce DSH to three patterns.

## Pattern A — Capability seams

```text
Definition
    ↑
Provider
    ↓
Consumer
```

Example:

```text
fs interface
      ↑
 fs-local
      ↓
 tool-fs
```

Never let model-facing tools know concrete execution providers.

---

## Pattern B — Event-sourced model context

```text
facts
 ↓
append-only session log
 ↓
projection
 ↓
model messages
```

not:

```text
mutate messages[] everywhere
```

This is what enables:

```text
resume
fork
replay
trajectory
audit
search
context reconstruction
```

DeepSeek explicitly records system prompts, reasoning, tool activity, subagent scheduling and context injection as traceable run information. ([deepseek.com][1])

---

## Pattern C — Composition instead of feature switches

Instead of:

```ts
if (codeMode) ...
if (creatorMode) ...
if (minimalMode) ...
```

prefer:

```text
Standard preset
   =
plugin tree A

Minimal preset
   =
plugin tree B

Creator preset
   =
plugin tree C
```

Then new agent products become mostly **new compositions**.

---

# 73. One especially important insight: the loop is intentionally boring

The actual intelligence doesn't belong in a gigantic `AgentLoop`.

The loop primarily coordinates:

```text
session
prompt
LLM
tools
events
continuation
```

Capabilities contribute behavior around it.

That means things such as:

```text
compaction
goals
plans
subagents
tool guards
permissions
context injection
retry
```

can attach around the loop instead of growing it indefinitely.

That's how they keep the core replaceable.

---

# 74. If I were reading the code as a SWE

I would read it in this order:

```text
1. vendor/cordis
       ↓
2. docs/cordis-primer.md
       ↓
3. packages/core/agent
       ↓
4. packages/core/agent-loop
       ↓
5. packages/core/session
       ↓
6. packages/core/tools
       ↓
7. packages/core/system-prompt
       ↓
8. packages/llm/llm
       ↓
9. packages/fs/fs
       ↓
10. packages/fs/fs-local
       ↓
11. packages/fs/tool-fs
       ↓
12. packages/subprocess
       ↓
13. packages/shell
       ↓
14. packages/interaction
       ↓
15. packages/session
       ↓
16. packages/preset
       ↓
17. packages/bundle
       ↓
18. packages/boot
       ↓
19. packages/host + client
       ↓
20. packages/extensions
```

After those, most of the remaining repository becomes straightforward.

---

# 75. The architecture in one diagram

```text
                         USER
                          │
                 ┌────────┴────────┐
                 │                 │
               Web UI          SDK / ACP
                 │                 │
          packages/client          │
                 │                 │
          packages/host/api ◄──────┘
                 │
                 ▼
              ctx.agents
                 │
                 ▼
        ┌─────────────────┐
        │     Agent       │
        │ stable contract │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │   agent-loop    │
        │ default driver  │
        └────────┬────────┘
                 │
     ┌───────────┼─────────────┐
     │           │             │
     ▼           ▼             ▼
 sessions   system-prompt     tools
     │           │             │
     │           │     ┌───────┼────────┐
     │           │     ▼       ▼        ▼
     │           │    fs     shell     web
     │           │     │       │
     │           │     │       ▼
     │           │     │   subprocess
     │           │     │       │
     │           │     └──┬────┘
     │           │        ▼
     │           │     sandbox
     │           │
     └───────────┼───────────────┐
                 ▼               │
                LLM              │
                 │               │
        ┌────────┴───────┐       │
        ▼                ▼       │
 DeepSeek adapter    pi-ai       │
                                log
                                 │
                                 ▼
                        append-only events


------------------------------------------------
                 EVERYTHING ABOVE
------------------------------------------------
                       runs inside
                           │
                           ▼
                   ┌─────────────┐
                   │   CORDIS    │
                   │             │
                   │ Context     │
                   │ Services    │
                   │ Events      │
                   │ Lifecycles  │
                   │ Effects     │
                   │ DI          │
                   │ HMR         │
                   └─────────────┘
```

---

# 76. The shortest possible description

**Cordis is the OS/kernel.**

**DeepSeek Harness `packages/*` are drivers and services.**

**`agent-loop` is merely one process running on that OS.**

**Bundles/presets are distributions/configurations of that OS.**

**Web, SDK, ACP and headless are different frontends to essentially the same composed runtime.**

And the core design principle is:

```text
Don't modify the agent to add behavior.

Define a capability,
expose it as a Cordis service/event,
implement a provider,
and compose it into the runtime.
```

That is why the architecture can legitimately claim:

> **Everything is a plugin.**

([deepseek.com][1])

For ACRYL specifically, this architecture has direct implications for where to place your own RLM/context subsystem, multi-surface control plane, self-written plugins, and Pi-TUI/Electron/Web adapters: most of those should become **Cordis capability families**, while the actual surfaces remain consumers of stable services rather than owners of agent state.

[1]: https://deepseek.com/harness/en/ "DeepSeek Harness developer preview: Everything is a plugin"
[2]: https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool?utm_source=chatgpt.com "Build a tool | DeepSeek Harness"
[3]: https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/?utm_source=chatgpt.com "Cordis tutorial | DeepSeek Harness"
[4]: https://github.com/deepseek-ai/deepseek-harness/tree/master/vendor "deepseek-harness/vendor at master · deepseek-ai/deepseek-harness · GitHub"
[5]: https://github.com/deepseek-ai/deepseek-harness "GitHub - deepseek-ai/deepseek-harness: DeepSeek Harness: Everything is a Plugin. · GitHub"
[6]: https://github.com/deepseek-ai/deepseek-harness/tree/master/apps "deepseek-harness/apps at master · deepseek-ai/deepseek-harness · GitHub"
[7]: https://github.com/deepseek-ai/deepseek-harness/tree/master/native "deepseek-harness/native at master · deepseek-ai/deepseek-harness · GitHub"
[8]: https://github.com/deepseek-ai/deepseek-harness/tree/master/python "deepseek-harness/python at master · deepseek-ai/deepseek-harness · GitHub"
[9]: https://github.com/deepseek-ai/deepseek-harness/tree/master/packages "deepseek-harness/packages at master · deepseek-ai/deepseek-harness · GitHub"
