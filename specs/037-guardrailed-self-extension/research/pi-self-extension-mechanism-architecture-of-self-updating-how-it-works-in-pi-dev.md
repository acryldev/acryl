# Pi Self-Extension Mechanism & Architecture of self-updating - how it works in pi.dev


I traced the current `main` branch of `earendil-works/pi` through the resource loader, system-prompt builder, extension loader, extension runner, `AgentSession`, and the lower-level agent loop.

The central result is:

> **Pi does not make itself extensible by putting its source code into the model context. It makes itself extensible by making its architecture locally addressable, giving the model ordinary file/code tools, and embedding a compact routing protocol in the system prompt that tells the model exactly where to retrieve the authoritative documentation and examples.**

The rest of the mechanism makes that retrieved knowledge executable through a hot-loadable extension runtime.

---

# 1. The whole mechanism in one sentence

The complete Pi self-extension loop is:

```text
Pi starts
  ↓
ResourceLoader discovers extensions / skills / context / docs
  ↓
AgentSession builds a structured system prompt
  ↓
system prompt tells model where Pi's architecture docs/examples live
  ↓
user asks "build an extension"
  ↓
model uses read/grep/find/ls/bash to retrieve the relevant Pi docs/source
  ↓
model learns ExtensionAPI + lifecycle + examples
  ↓
model writes a .ts extension
  ↓
Pi reloads/discovers the extension
  ↓
jiti loads the module
  ↓
extension factory receives ExtensionAPI
  ↓
extension registers tools/commands/hooks/UI/etc.
  ↓
Pi rebuilds runtime + tool registry + prompt
  ↓
next LLM turn can use the new capability
  ↓
extension can itself modify context/prompt/tool behavior on future turns
```

The critical property is that **the knowledge used to extend Pi is retrieved from the running software environment rather than embedded wholesale into the model's initial context**.

---

# 2. First important correction: what Pi does NOT do

Pi does **not** do this:

```text
SYSTEM PROMPT
    +
entire Pi source tree
    +
entire docs/
    +
entire examples/
    ↓
LLM
```

It would be far too expensive and would become stale whenever the implementation changes.

Instead it does this:

```text
SYSTEM PROMPT

"You are a coding assistant inside Pi."

"Pi documentation is located here:
  README = X
  docs = Y
  examples = Z

When modifying Pi:
  read the relevant docs
  read examples
  follow .md cross-references"
```

Then the model uses the coding tools.

The relevant source is [`packages/coding-agent/src/core/system-prompt.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts). ([GitHub][1])

That distinction is fundamental if you're extracting this for ACRYL.

---

# 3. The actual system-prompt architecture

The source defines a structured system prompt rather than one giant immutable string.

Conceptually, Pi builds:

```text
SystemPrompt
├── preamble
├── tools
├── rules
├── docs
├── addendum
├── project_context
├── skills
├── cwd
└── extension-added sections
```

The current default preamble is essentially:

> “You are an expert coding assistant operating inside pi…”

It then generates the tools section, rules, documentation routing section, project context, skills catalog, current working directory, and extension-defined sections. ([GitHub][1])

The source structure is explicitly represented as `SystemPromptSections`, where every section other than `preamble` is wrapped in a named XML-like section.

That means the conceptual model is:

```xml
<preamble>
...
</preamble>

<tools>
...
</tools>

<rules>
...
</rules>

<docs>
...
</docs>

<project_context>
...
</project_context>

<skills>
...
</skills>

<cwd>
...
</cwd>
```

The implementation uses structured `SystemMessage.sections` so individual sections can be changed independently. ([GitHub][1])

---

# 4. The most important part: the `docs` section

Pi's default prompt contains a specific routing instruction for its own architecture.

The source tells the model that Pi documentation is available through:

```text
Main documentation
Additional docs
Examples
```

and then maps topics such as:

```text
extensions
themes
skills
prompt templates
TUI
keybindings
SDK
custom providers
models
packages
environment variables
```

to the appropriate documentation/example locations.

It also explicitly tells the model, for Pi-related work, to:

```text
read the docs
read examples
follow markdown cross-references
```

and to read relevant Pi `.md` files completely. ([GitHub][1])

This is the **self-description mechanism**.

Pi is effectively telling the model:

```text
"I have an architecture.
Here is the address of the architecture.
Use your coding tools to retrieve it."
```

That is much closer to an **architecture index** than to conventional prompt stuffing.

---

# 5. The documentation paths are dynamic

Pi does not hard-code one absolute developer-machine path into the prompt.

`system-prompt.ts` calls:

```text
getReadmePath()
getDocsPath()
getExamplesPath()
```

Those are implemented in `config.ts`.

Pi determines its package directory and derives:

```text
<package>/README.md
<package>/docs
<package>/examples
```

So whether Pi is running from a source checkout, installed package, or another supported distribution layout, the prompt points at the resources belonging to that installation. ([GitHub][1])

This is an important design rule:

> **The architecture pointer should resolve from the current runtime installation, rather than be baked into the model instructions as a machine-specific path.**

---

# 6. The second context channel: `AGENTS.md`

Pi has another mechanism that is different from the docs router.

`resource-loader.ts` discovers context files such as:

```text
~/.pi/agent/AGENTS.md
<ancestor>/AGENTS.md
<current>/AGENTS.md
```

and alternatives such as:

```text
AGENTS.override.md
CLAUDE.md
```

The files are actually read and assembled as project instructions.

Conceptually:

```text
Architecture knowledge:
    docs section
    → pointer
    → model retrieves details

Project operating instructions:
    AGENTS.md
    → actual content injected
```

That is an important distinction.

### Pi has two different strategies

```text
STATIC BOOTSTRAP KNOWLEDGE

"Pi architecture lives here."
"Use this documentation."

                versus

ACTIVE PROJECT INSTRUCTIONS

"Follow these rules for this repository."
"Run these commands."
"Use these conventions."
```

---

# 7. Skills use another version of the same idea

Skills are also indexed instead of blindly dumping every skill body into the initial context.

`skills.ts` creates an `<available_skills>` section containing:

```text
name
description
location
```

and tells the model to load a skill file with `read`/`bash` when the task matches it.

So:

```text
SYSTEM PROMPT

available_skills
  ├── Skill A
  │    description
  │    location
  │
  ├── Skill B
  │    description
  │    location
  │
  └── Skill C
       description
       location
```

then:

```text
task
 ↓
skill match
 ↓
read SKILL.md
 ↓
full procedural instructions
```

This is a second example of the same two-stage context strategy.

([GitHub][1])

---

# 8. This produces a two-level context architecture

Pi therefore has:

```text
LEVEL 1 — INDEX / ROUTING

small context
    ↓
what exists
where it lives
when to use it


LEVEL 2 — PAYLOAD / DETAIL

actual file
    ↓
full instructions
full API
examples
implementation
```

For the architecture specifically:

```text
SYSTEM PROMPT
      │
      │ architecture pointer
      ▼
docs/extensions.md
      │
      ├── API descriptions
      ├── lifecycle
      ├── examples
      └── cross references
             │
             ▼
      examples/extensions/
             │
             ▼
      actual source code
             │
             ▼
      tests / implementation
```

This is one of the strongest ideas in Pi.

---

# 9. Startup: exact runtime sequence

Now the complete runtime sequence.

## Phase A — CLI startup

Pi begins through `packages/coding-agent/src/main.ts`.

That path eventually constructs the agent-session runtime and its services.

The actual heavy lifting is delegated into:

```text
createAgentSessionServices()
createAgentSession()
```

in the coding-agent core.

The session runtime establishes:

```text
cwd
agentDir
settings
model runtime
resource loader
session manager
```

before constructing the usable agent.

---

# 10. ResourceLoader is the bootstrap engine

`DefaultResourceLoader` in:

```text
packages/coding-agent/src/core/resource-loader.ts
```

is the central resource aggregation mechanism.

It handles:

```text
extensions
skills
prompt templates
themes
AGENTS.md / CLAUDE.md
SYSTEM.md
APPEND_SYSTEM_PROMPT.md
package resources
```

The resource loader is therefore effectively:

```text
                ResourceLoader
                     │
       ┌─────────────┼──────────────┐
       ▼             ▼              ▼
  executable      behavioral     instructional
  extensions      resources       resources
```

It resolves package resources, loads extensions, loads skills, loads prompts/themes, then loads project context files and system-prompt overrides.

---

# 11. Extension discovery happens before the first user prompt

Pi's extension loader looks for extension modules in conventional locations.

Current discovery includes:

```text
project:
  .pi/extensions/

global:
  ~/.pi/agent/extensions/

explicit:
  CLI/configured paths
```

Within an extension directory it recognizes:

```text
foo.ts
foo.js

foo/
  index.ts

foo/
  index.js

foo/
  package.json
  "pi": {
    "extensions": [...]
  }
```

It deliberately does not recursively scan arbitrary nested directory structures; complex packages should use their manifest to declare entrypoints. ([GitHub][2])

---

# 12. Extension loading is actual executable loading

The extension loader uses `jiti`.

That means Pi can load TypeScript extension modules directly rather than requiring a separate compile step.

The current loader creates a module loader, resolves Pi's extension-facing dependencies, and imports the module. ([GitHub][2])

The extension module contract is basically:

```ts
export default function (pi: ExtensionAPI) {
    ...
}
```

or an async variant:

```ts
export default async function (pi: ExtensionAPI) {
    ...
}
```

The async factory is awaited before startup continues.

That matters because an extension can perform one-time initialization before the rest of startup proceeds. ([GitHub][2])

---

# 13. What exactly happens when Pi loads an extension

The loader creates an internal `Extension` object containing registries such as:

```text
handlers
tools
messageRenderers
entryRenderers
commands
flags
shortcuts
```

Then it creates an `ExtensionAPI`.

Then:

```text
factory(extensionAPI)
```

is invoked.

The extension performs calls such as:

```text
pi.on(...)
pi.registerTool(...)
pi.registerCommand(...)
pi.registerShortcut(...)
pi.registerFlag(...)
pi.registerMessageRenderer(...)
pi.registerEntryRenderer(...)
pi.registerProvider(...)
```

The registrations are collected.

If initialization succeeds:

```text
commit()
```

If initialization throws:

```text
discard()
```

and the extension is not activated.

([GitHub][2])

This is important for self-generated extensions:

> **The model produces normal source code. The runtime gives that source code an API object. There is no separate “AI extension protocol”.**

---

# 14. The ExtensionAPI is the capability boundary

Pi's extension API gives an extension access to:

```text
event subscriptions
tools
commands
shortcuts
flags
provider registration
message sending
user-message injection
session persistence
tool management
model selection
thinking level
session lifecycle
context usage
compaction
system prompt
UI
inter-extension events
```

The runtime context includes things like:

```text
ctx.cwd
ctx.sessionManager
ctx.model
ctx.modelRegistry
ctx.ui
ctx.mode
ctx.hasUI
ctx.signal
ctx.abort()
ctx.compact()
ctx.getSystemPrompt()
```

The command context adds session-management operations such as:

```text
ctx.newSession()
ctx.fork()
ctx.navigateTree()
ctx.switchSession()
ctx.reload()
```

The distinction between normal extension context and command context is explicit in the current API surface.

---

# 15. Runtime binding happens after extension loading

There is an important architectural separation.

While the extension is being loaded, some runtime actions are not bound yet.

Pi therefore creates an `ExtensionRuntime`, initially containing state and placeholders.

Then `ExtensionRunner.bindCore()` attaches the real runtime operations:

```text
sendMessage
sendUserMessage
appendEntry
tool management
model management
thinking level
session operations
provider registration
...
```

Provider registrations that happen during extension loading can be queued and flushed when core binding completes.

This is a clean plugin architecture:

```text
extension declaration phase
          ↓
runtime binding phase
          ↓
active execution phase
```

---

# 16. AgentSession constructs the actual tool registry

`AgentSession` then combines:

```text
built-in tools
+
extension tools
+
SDK/custom tools
```

and builds a registry.

The current source performs roughly:

```text
Base tools
    ↓
Extension tools
    ↓
Custom SDK tools
    ↓
allowlist / denylist filtering
    ↓
ToolDefinition registry
    ↓
wrapped executable AgentTool registry
```

---

# 17. Every tool has two different identities

This is a particularly important detail for coding agents.

A Pi tool has:

```text
EXECUTION DEFINITION
    name
    parameters
    execute()
    etc.

PROMPT METADATA
    promptSnippet
    promptGuidelines
```

The source extracts `promptSnippet` and `promptGuidelines` from registered tools and uses them when constructing the system prompt.

So a tool has two channels:

```text
Tool definition
      │
      ├──► model's callable tool schema
      │
      └──► prompt guidance
```

This allows an extension to change both:

```text
what the model can call
```

and:

```text
how the model should think about calling it
```

without hard-coding both concepts into the global system prompt.

---

# 18. AgentSession creates its base system-prompt state

`AgentSession._rebuildSystemPrompt()` gathers:

```text
resourceLoader.getSystemPrompt()
resourceLoader.getAppendSystemPrompt()
resourceLoader.getSkills()
resourceLoader.getAgentsFiles()
current tools
tool snippets
tool guidelines
cwd
```

and converts them into normalized `BuildSystemPromptOptions`.

Conceptually:

```text
resources
    +
tools
    +
project context
    +
skills
    +
cwd
      ↓
BuildSystemPromptOptions
      ↓
buildSystemPromptSections()
      ↓
SystemPromptSections
```

This is the canonical path by which runtime state becomes model-facing instructions.

---

# 19. Important nuance: the low-level Agent is generic

The lower-level `@earendil-works/pi-agent-core` Agent does not know Pi's extension documentation concept.

It basically manages:

```text
messages
tools
model
agent loop
tool execution
event lifecycle
queues
```

The current `Agent` source exposes `transformContext`, `convertToLlm`, `beforeToolCall`, `afterToolCall`, and the streaming function as generic hooks. ([GitHub][3])

Therefore:

```text
Pi-specific extensibility
        ↓
AgentSession + ExtensionRunner
        ↓
generic Agent
```

This separation is architecturally important.

---

# 20. Now the user sends the first real prompt

Suppose the user types:

> Build an extension that adds a `/deploy` command and a `deploy` tool.

The input arrives at:

```text
AgentSession.prompt()
```

Current sequence:

```text
prompt()
   │
   ├── extension command check
   ├── input hooks
   ├── skill expansion
   ├── prompt-template expansion
   ├── model/auth checks
   ├── compaction checks
   │
   └── before_agent_start
          │
          ├── system prompt customization
          ├── tool loadout customization
          └── optional injected custom messages
```

Then the user message and any updated system message are sent to the agent.

---

# 21. Slash-command dispatch happens before the LLM

This is easy to miss.

If the prompt starts with `/`, Pi first checks whether the text represents an extension command.

For example:

```text
/deploy production
```

can be intercepted as:

```text
ExtensionCommand.handler(...)
```

without going to the LLM at all.

That is why Pi distinguishes:

```text
normal prompt
```

from:

```text
extension command
```

inside `AgentSession.prompt()`.

---

# 22. Then `input` hooks execute

If it is an ordinary prompt, Pi runs extension `input` handlers.

These can:

```text
continue
transform
handle
```

The handlers are chained.

So:

```text
user input
   ↓
extension A
   ↓
extension B
   ↓
extension C
   ↓
final input
```

An extension can therefore modify or consume a user's input before it reaches the model.

---

# 23. Skill/template expansion happens

After input interception, Pi expands:

```text
/skill:name
```

and prompt templates.

An explicitly invoked skill is actually loaded from its file.

The current code reads the `SKILL.md`, strips frontmatter, and wraps it into a skill block that is inserted into the prompt.

That means the skill mechanism has both:

```text
catalog in system prompt
```

and:

```text
full skill body on demand
```

Again:

```text
index → payload
```

---

# 24. Then comes the crucial `before_agent_start`

Pi invokes:

```text
extensionRunner.emitBeforeAgentStart(...)
```

This is one of the most important self-modification hooks.

Every `before_agent_start` handler receives:

```text
prompt
images
systemPrompt
systemPromptOptions
```

The `systemPromptOptions` object is mutable.

An extension can therefore modify things like:

```text
selectedTools
sections
toolGuidelines
promptGuidelines
appendSystemPrompt
etc.
```

Or it can return a completely forced system-prompt string.

---

# 25. The hooks are chained, not isolated

Suppose there are three extensions:

```text
extension A
extension B
extension C
```

and all have:

```text
before_agent_start
```

Then Pi effectively does:

```text
BasePromptOptions
       ↓
A modifies options
       ↓
B sees A's modifications
       ↓
C sees A+B modifications
       ↓
final prompt options
```

The runner explicitly keeps one mutable current options object while invoking the handlers sequentially.

This is important for composability.

---

# 26. Pi can expose the current rendered system prompt to an extension

Inside `before_agent_start`, the extension can inspect the current prompt.

The runner constructs a dynamic `getSystemPrompt()` and a dynamic `systemPrompt` accessor backed by the current mutable prompt options.

So an extension doesn't need to reconstruct Pi's prompt format itself.

Conceptually:

```text
extension
    ↓
event.systemPrompt
    ↓
render(currentSystemPromptOptions)
```

This is useful for meta extensions, debugging, prompt customizers, and agent-generated extensions.

---

# 27. Official example: prompt self-customization

Pi itself contains:

```text
examples/extensions/prompt-customizer.ts
```

This example reads:

```text
event.systemPromptOptions.selectedTools
event.systemPromptOptions.skills
```

and creates context-aware guidance.

It then adds a custom section such as:

```text
tool_guidance
```

to the structured system prompt.

This is an excellent example of the architectural model:

```text
runtime state
   ↓
extension examines state
   ↓
extension modifies systemPromptOptions
   ↓
Pi renders new prompt
```

---

# 28. Then Pi creates a system-message patch

After `before_agent_start`, Pi calls:

```text
_preparePromptAndToolLoadout(...)
```

This does two things simultaneously:

```text
1. set executable tools
2. compare current prompt sections with desired prompt sections
```

The comparison uses:

```text
diffSystemPromptSections(...)
```

So if only one section changed:

```text
<skills>
...
</skills>
```

Pi does not conceptually need to rebuild an unrelated giant string.

It can represent the change as a section patch.

([GitHub][1])

---

# 29. This is an important context-efficiency mechanism

The prompt architecture is therefore:

```text
system prompt = structured state

not:

system prompt = immutable blob
```

That means runtime extensions can cause:

```text
tools section change
rules section change
skill section change
custom section change
cwd section change
```

independently.

The source explicitly documents these sections as independently replaceable. ([GitHub][1])

This is highly relevant to ACRYL because self-evolving systems are going to change their own context model frequently.

---

# 30. Now the actual coding agent sees the user request

At this point the model sees something approximately like:

```text
SYSTEM

You are an expert coding assistant operating inside pi...

<tools>
...
</tools>

<rules>
...
</rules>

<docs>
Pi documentation...
Main docs = ...
Additional docs = ...
Examples = ...
For extensions use docs/extensions.md ...
Read docs and examples before implementing...
</docs>

<project_context>
...
</project_context>

<skills>
...
</skills>

<cwd>
...
</cwd>


USER

Build an extension that adds a /deploy command...
```

That is the critical moment.

The model has:

```text
architecture INDEX
```

but not:

```text
complete architecture PAYLOAD
```

---

# 31. What the model is expected to do next

The model now has ordinary coding tools.

For a Pi-specific task, its instructed workflow is effectively:

```text
1. Read docs/extensions.md
2. Read relevant examples
3. Follow documentation cross-references
4. Inspect source if necessary
5. Inspect tests if semantics are unclear
6. Implement extension
```

The source itself does not automatically execute these reads just because the user asked for an extension.

This is a very important precision point:

> **The documentation-loading behavior is model-directed, not a hidden deterministic Pi “architecture retrieval engine”.**

Pi's responsibility is to put the routing instruction and local file locations into context.

The LLM decides which reads to perform.

---

# 32. Why the model can discover the exact current API

Suppose the docs say:

```text
use pi.registerTool(...)
```

The model can then open:

```text
docs/extensions.md
```

and see:

```text
ExtensionAPI
ToolDefinition
events
commands
UI
examples
```

Then it can inspect:

```text
src/core/extensions/types.ts
```

for the exact type definitions.

Then:

```text
src/core/extensions/runner.ts
```

for actual behavior.

Then:

```text
examples/extensions/*.ts
```

for implementation patterns.

Then tests.

So Pi provides an implicit hierarchy:

```text
README
   ↓
topic docs
   ↓
cross-reference
   ↓
example
   ↓
type definition
   ↓
runtime implementation
   ↓
tests
```

This is much more robust than relying solely on model memory.

---

# 33. Extension docs deliberately contain working examples

The extension documentation itself points the model to:

```text
examples/extensions/
```

and that directory contains concrete patterns for:

```text
custom tools
commands
prompt modification
permission gates
compaction
providers
UI
session state
sub-agents
sandboxing
remote execution
```

The documentation even says Pi can create extensions and instructs the user/model to ask it to build one for the use case. ([GitHub][4])

This matters because coding agents learn APIs much more reliably from:

```text
type definition
+
explanation
+
canonical implementation example
```

than from prose alone.

---

# 34. The model writes the extension

Suppose it produces:

```text
.pi/extensions/deploy.ts
```

The source might conceptually look like:

```ts
export default function (pi) {
    pi.registerCommand("deploy", {
        description: "...",
        handler: async (...) => {
            ...
        }
    });

    pi.registerTool({
        name: "deploy",
        description: "...",
        parameters: ...,
        async execute(...) {
            ...
        }
    });
}
```

The actual extension contract is documented and typed by `ExtensionAPI`/`ToolDefinition`.

---

# 35. Writing the file is not the same as loading the extension

This is an important operational boundary.

When the coding agent writes:

```text
.pi/extensions/deploy.ts
```

the current in-memory `ExtensionRunner` does not magically execute the new file simply because it now exists on disk.

You need:

```text
restart
```

or:

```text
reload
```

to rediscover/reload the extension.

Pi's docs explicitly identify `/reload` as the mechanism for hot-reloading auto-discovered extensions. ([GitHub][4])

---

# 36. What `/reload` actually does

The current `AgentSession.reload()` does roughly:

```text
old ExtensionRunner
        ↓
session_shutdown
        ↓
invalidate old runtime
        ↓
reload settings
        ↓
reset provider API state
        ↓
ResourceLoader.reload()
        ↓
discover/load extensions again
        ↓
rebuild runtime
        ↓
rebuild tool registry
        ↓
session_start(reason="reload")
        ↓
resources_discover(reason="reload")
        ↓
rebuild system-prompt state
```

That is the actual hot-swap cycle.

---

# 37. Old extension contexts are invalidated

This is a sophisticated piece of runtime hygiene.

When Pi reloads, the old extension runtime is invalidated.

Its contexts are guarded by an `assertActive()` mechanism.

So an old captured context cannot safely continue operating after:

```text
reload
new session
fork
switch
```

The runtime marks itself stale and throws when stale APIs are accessed.

This prevents a very dangerous class of bugs:

```text
old extension instance
       │
       ├── stale state
       ├── old handlers
       └── old session references
              ↓
       accidentally mutate new runtime
```

Pi explicitly prevents that.

and:

---

# 38. Reload clears the extension module cache

The extension loader maintains an extension cache.

During reload, Pi clears the cache so the new extension source is actually imported again rather than returning the old factory.

So:

```text
disk changed
   ↓
reload
   ↓
extension cache cleared
   ↓
new TypeScript module imported
   ↓
new factory instantiated
```

This is what makes source-code editing + reload work as a real development loop. ([GitHub][2])

---

# 39. New extension factory executes

Once rediscovered:

```text
deploy.ts
```

is loaded by jiti.

Then:

```text
default export
    ↓
ExtensionAPI
    ↓
factory(api)
```

The new extension registers:

```text
/deploy
deploy tool
events
etc.
```

Those registrations become part of the new `ExtensionRunner`.

---

# 40. The new tool becomes part of the tool registry

After loading, `_refreshToolRegistry()` sees the extension's registered tools.

It constructs:

```text
extension tool definition
      ↓
wrapped AgentTool
      ↓
tool registry
      ↓
active tool set
```

Then `_rebuildSystemPrompt()` is run so the prompt reflects the current tool state.

---

# 41. This is where actual model-facing extensibility happens

A new tool has both:

```text
runtime capability
```

and:

```text
model-facing description
```

The runtime gets:

```text
execute()
```

while the model gets:

```text
name
description
parameter schema
```

plus optional:

```text
promptSnippet
promptGuidelines
```

Therefore:

```text
extension source
       ↓
runtime registration
       ↓
tool registry
       ├── executable capability
       └── model-facing contract
```

This is exactly the structure you want in an agentic plugin system.

---

# 42. Then `session_start` executes

After the new extension is loaded, Pi emits:

```text
session_start
```

The extension can use that to initialize runtime state.

This is important because the extension factory itself should not necessarily start long-lived resources such as:

```text
sockets
timers
watchers
background processes
```

The official docs recommend starting session-scoped resources from lifecycle events such as `session_start`.

---

# 43. Then `resources_discover` executes

After `session_start`, extensions can contribute more resources.

An extension can return:

```text
skillPaths
promptPaths
themePaths
```

through:

```text
resources_discover
```

Pi then adds those resources to `ResourceLoader` and rebuilds the prompt.

So there is an interesting second-order capability:

```text
extension
   ↓
creates/discovers resource paths
   ↓
ResourceLoader
   ↓
new skills/prompts/themes
   ↓
system prompt
```

This means one extension can dynamically extend not just runtime behavior, but Pi's **resource graph**.

---

# 44. Now the next prompt sees the new extension

On the next user prompt:

```text
AgentSession.prompt()
```

runs again.

The new extension is now part of:

```text
ExtensionRunner
```

and its tools are in:

```text
ToolRegistry
```

and its hooks can participate in:

```text
before_agent_start
context
tool_call
tool_result
turn_start
turn_end
...
```

Therefore the agent has actually gained a new capability.

---

# 45. The second-order self-extension loop

This is where Pi becomes genuinely interesting.

Suppose the model-generated extension contains:

```text
before_agent_start
```

Now the newly generated extension itself can modify the agent's future context.

So:

```text
AGENT
  │
  │ creates extension
  ▼
EXTENSION
  │
  │ changes system prompt/context/tools
  ▼
AGENT
  │
  │ now operates under improved capability
  ▼
EXTENSION
```

This is a recursive capability structure.

The extension is not merely:

```text
new function
```

It can be:

```text
new context policy
new tool
new lifecycle behavior
new resource
new UI
new provider
new workflow
```

---

# 46. The per-turn prompt mutation mechanism

For every ordinary prompt, Pi runs:

```text
before_agent_start
```

again.

Therefore an extension can implement:

```text
dynamic system prompt
```

rather than a one-time startup modification.

Example:

```text
current mode = debugging
      ↓
extension sees mode
      ↓
adds debugging instructions

current mode = deployment
      ↓
extension sees mode
      ↓
adds deployment instructions
```

The prompt is dynamically assembled for each turn.

---

# 47. Then comes the `context` event — a deeper layer

There are actually **two different context-modification mechanisms**.

## Layer 1

```text
before_agent_start
```

changes:

```text
system prompt
tool loadout
prompt sections
```

## Layer 2

```text
context
```

changes:

```text
AgentMessage[]
```

before an LLM request.

`ExtensionRunner.emitContext()` takes the current message array, clones it, then passes it through each extension's context handler.

Each handler may return a modified message array.

That means a coding agent extension can inject/remove/rewrite actual conversation messages immediately before provider invocation.

---

# 48. `context` is actually on the lower-level LLM path

This is critical.

In `packages/agent/src/agent-loop.ts`, the request path is effectively:

```text
AgentContext.messages
       ↓
transformContext(...)
       ↓
convertToLlm(...)
       ↓
normalizeContext(...)
       ↓
streamFunction(...)
       ↓
LLM provider
```

The current `Agent` source exposes the `transformContext` hook, and the loop uses it before conversion to provider messages. ([GitHub][3]) ([GitHub][5])

Pi wires:

```text
Agent.transformContext
        ↓
ExtensionRunner.emitContext()
```

So the extension `context` hook is not merely a startup event.

It operates at the actual model-request boundary.

---

# 49. This means `context` happens on every LLM call

Suppose one user prompt causes:

```text
LLM call #1
  ↓
tool
  ↓
LLM call #2
  ↓
tool
  ↓
LLM call #3
```

The model can receive a context transformed by the `context` extensions before each provider request.

Conceptually:

```text
prompt
 ├── context transform → LLM #1
 ├── tool
 ├── context transform → LLM #2
 ├── tool
 └── context transform → LLM #3
```

That is a major difference between:

```text
startup customization
```

and:

```text
persistent interception of every reasoning step
```

---

# 50. There is another layer: provider-request interception

After context transformation, Pi also supports:

```text
before_provider_request
```

which can inspect or replace the provider payload.

There is also:

```text
before_provider_headers
```

for request headers.

The current runner explicitly chains these handlers.

So Pi's control plane is effectively:

```text
USER INPUT
   ↓
input
   ↓
skill/template expansion
   ↓
before_agent_start
   ↓
AGENT
   ↓
context
   ↓
convertToLlm
   ↓
before_provider_headers
   ↓
before_provider_request
   ↓
PROVIDER
```

That is an extremely powerful extension architecture.

---

# 51. Tool calls have their own interception layer

When the model emits a tool call, Pi can route it through extension hooks such as:

```text
tool_execution_start
tool_call
tool_execution_update
tool_result
tool_execution_end
```

The particularly important one is:

```text
tool_call
```

An extension can return a blocking result.

For example:

```text
model:
    bash("rm -rf ...")

        ↓

extension:
    tool_call

        ↓

if dangerous:
    ask user
    return block
```

This means the agent can add new policies without modifying the core bash tool.

---

# 52. The extension can therefore control almost the entire agent lifecycle

Pi gives extension hooks across:

```text
PROJECT TRUST
SESSION START
RESOURCE DISCOVERY
INPUT
BEFORE AGENT START
AGENT START
TURN START
CONTEXT
PROVIDER HEADERS
PROVIDER REQUEST
PROVIDER RESPONSE
TOOL CALL
TOOL EXECUTION
TOOL RESULT
TURN END
AGENT END
COMPACTION
SESSION SWITCH
SESSION FORK
SESSION SHUTDOWN
```

The official extension lifecycle documentation contains a full lifecycle diagram.

This is much closer to:

```text
agent operating-system plugin API
```

than to:

```text
simple plugin callback API
```

---

# 53. The architecture can modify the system prompt, messages, tools and provider request independently

This is one of the strongest architectural properties.

Think in terms of four mutation boundaries:

```text
                  EXTENSION CONTROL PLANE

       ┌─────────────────────────────────┐
       │                                 │
       │ 1. SYSTEM PROMPT                │
       │    before_agent_start           │
       │                                 │
       │ 2. MESSAGE CONTEXT              │
       │    context                      │
       │                                 │
       │ 3. TOOL EXECUTION               │
       │    tool_call / tool_result      │
       │                                 │
       │ 4. PROVIDER REQUEST             │
       │    before_provider_request      │
       │                                 │
       └─────────────────────────────────┘
```

This is the real self-extensibility substrate.

---

# 54. What makes this different from ordinary plugin systems

A traditional plugin system might be:

```text
host application
   ↓
plugin API
   ↓
plugin does something
```

Pi is:

```text
host application
      ↓
self-description layer
      ↓
LLM discovers API
      ↓
LLM writes plugin
      ↓
host dynamically loads plugin
      ↓
plugin changes future host behavior
      ↓
LLM receives changed capabilities
```

This closes the loop.

That is why Pi is interesting for a self-evolving ACRYL architecture.

---

# 55. Pi does NOT need a special “build extension” tool

This is another subtle but important property.

There is no special tool like:

```text
create_extension()
```

in the core architecture.

The agent can simply use:

```text
read
grep
find
ls
bash
write
edit
```

and standard filesystem operations.

So the self-extension mechanism is built from **ordinary coding-agent primitives**.

That makes it extremely general.

---

# 56. Why that is powerful

The model is effectively operating in:

```text
self-describing filesystem
```

rather than:

```text
closed plugin API exposed through special meta-tools
```

The environment itself provides:

```text
documentation
source
examples
tests
type definitions
extension directory
runtime reload
```

The model has the same primitives a human developer has.

So:

```text
human developer:
    inspect docs
    inspect source
    write extension
    reload

coding agent:
    read docs
    read source
    write extension
    reload
```

This symmetry is a major design principle.

---

# 57. The extension documentation itself is part of the executable developer experience

Pi's `extensions.md` isn't merely reference documentation.

It functions as an **agent-readable implementation specification**.

It tells the coding agent:

```text
where extensions go
how to define them
which APIs exist
what lifecycle events exist
what context is available
how tools work
how UI works
how errors work
what examples exist
```

And then provides source-level examples.

Therefore the docs are effectively:

```text
human API reference
+
coding-agent instruction set
```

([GitHub][4])

---

# 58. A particularly strong detail: source and docs remain colocated

The prompt path points into the installed Pi package.

Therefore:

```text
Pi binary/package
   ├── README.md
   ├── docs/
   ├── examples/
   └── runtime
```

The model is pointed to documentation that belongs to the same software version/runtime.

This reduces:

```text
version mismatch
```

between:

```text
what the model read
```

and:

```text
what the runtime actually implements
```

That is significantly better than relying on external web docs as the authoritative source.

---

# 59. Pi therefore has a local “source of truth” strategy

The preferred hierarchy is essentially:

```text
current installed runtime
        ↓
its own README/docs/examples
        ↓
actual source files
```

rather than:

```text
model memory
        ↓
random web documentation
        ↓
guess
```

This is particularly useful for coding agents because APIs evolve quickly.

---

# 60. Hot reload turns source editing into runtime evolution

The complete cycle becomes:

```text
MODEL
 │
 │ write
 ▼
extension.ts
 │
 │ reload
 ▼
ExtensionLoader
 │
 │ import
 ▼
ExtensionFactory
 │
 │ register
 ▼
ExtensionRunner
 │
 ├── tools
 ├── commands
 ├── hooks
 ├── UI
 ├── providers
 └── resources
 │
 ▼
AgentSession
 │
 ▼
new prompt state
 │
 ▼
MODEL
```

This is effectively:

```text
write → load → bind → observe
```

rather than requiring a rebuild of the entire agent.

---

# 61. Official reload example

Pi includes:

```text
examples/extensions/reload-runtime.ts
```

which demonstrates a reload-oriented extension workflow.

It uses an extension command with:

```text
ctx.reload()
```

and can expose a model-callable tool that sends a follow-up message to invoke the command path.

This is important because `reload()` is currently available on the command-oriented context rather than the basic `ExtensionContext`. The current type definitions make that separation explicit.

---

# 62. Why this command-context distinction matters for autonomous coding agents

Imagine the newly generated extension has an LLM tool:

```text
finish_implementation
```

The tool can modify files.

But the extension tool's basic context does not expose the same session-transition operations as `ExtensionCommandContext`.

So an autonomous “write itself and immediately reload itself” workflow needs an explicit mechanism.

Pi's own example demonstrates the pattern of routing a tool-driven action through a command/follow-up path.

This is a real architectural boundary, not merely documentation convention.

---

# 63. Packages extend the same model

Pi can bundle:

```text
extensions
skills
prompt templates
themes
```

into installable packages.

Package manifests can declare the resources.

Thus the distributable architecture is:

```text
Pi package
 ├── extensions/
 ├── skills/
 ├── prompts/
 └── themes/
```

The package manager resolves them and `ResourceLoader` incorporates them.

That means self-created functionality can move from:

```text
one local .ts file
```

to:

```text
reusable package
```

without changing the fundamental architecture.

---

# 64. Security boundary

There is an important caveat.

Extensions are executable code with the user's permissions.

Pi therefore has project trust logic specifically because project-local resources such as:

```text
.pi/extensions
.pi/skills
.pi/prompts
```

can alter agent behavior.

The architecture recognizes that:

```text
repository file
    ↓
agent context
```

is itself a prompt-injection surface.

So project resources are subject to trust handling.

The security documentation explicitly distinguishes trust from complete prompt-injection safety.

For a self-evolving framework, this is essential.

---

# 65. Pi's real “self-extension specification”

If I reduce the current implementation to a coding-agent spec, it is this:

## A. Self-description

The agent runtime MUST expose a machine-readable/local addressable description of:

```text
core architecture
extension API
resource system
examples
```

The system prompt MUST contain pointers to those resources.

## B. On-demand retrieval

The system prompt SHOULD instruct the coding agent:

```text
when modifying the host:
    read the relevant documentation
    inspect canonical examples
    follow references
    inspect source when necessary
```

The runtime does NOT need to inject the entire source tree.

## C. Generic coding primitives

The coding agent MUST have:

```text
read
search
list
edit/write
execute
```

so it can retrieve and modify the architecture using the same interface it uses for ordinary repositories.

## D. Dynamic extension ABI

An extension MUST have a stable entrypoint:

```text
default export factory
```

and receive a runtime API object.

## E. Declarative registration

The extension MUST be able to register:

```text
tools
commands
events
shortcuts
providers
UI
resource paths
renderers
```

without changing the host core.

## F. Lifecycle interception

The runtime MUST expose hooks around:

```text
input
prompt construction
context transformation
provider request
tool execution
session lifecycle
```

## G. Hot reload

The runtime SHOULD support:

```text
invalidate old runtime
clear module cache
rediscover modules
instantiate new modules
rebind core
rebuild tools
rebuild prompt
resume operation
```

## H. Context safety

Old extension contexts MUST become invalid after reload/session replacement.

## I. Resource rehydration

Extensions SHOULD be able to contribute new:

```text
skills
prompts
themes
```

to the runtime resource graph.

## J. Two-tier context

Prefer:

```text
small index → detailed payload
```

rather than:

```text
everything → initial prompt
```

---

# 66. Pi's architecture as a formal state machine

This is probably the most useful representation for implementing the pattern elsewhere:

```text
                     ┌───────────────────────┐
                     │     RUNTIME START     │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ RESOURCE DISCOVERY    │
                     │                       │
                     │ extensions            │
                     │ skills                │
                     │ context files         │
                     │ system prompt files   │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ SYSTEM PROMPT BUILD   │
                     │                       │
                     │ preamble              │
                     │ tools                 │
                     │ rules                 │
                     │ docs router           │
                     │ project context       │
                     │ skill index           │
                     │ cwd                   │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     USER PROMPT       │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ INPUT TRANSFORMS      │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ BEFORE_AGENT_START    │
                     │                       │
                     │ prompt customization  │
                     │ tool loadout          │
                     │ injected messages     │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │      AGENT LOOP       │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ CONTEXT TRANSFORM     │
                     │                       │
                     │ modify AgentMessage[] │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ PROVIDER TRANSFORMS   │
                     └───────────┬───────────┘
                                 │
                                 ▼
                           ┌───────────┐
                           │   MODEL   │
                           └─────┬─────┘
                                 │
                       ┌─────────┴─────────┐
                       │                   │
                     text              tool call
                       │                   │
                       │                   ▼
                       │          ┌─────────────────┐
                       │          │ TOOL INTERCEPT  │
                       │          └────────┬────────┘
                       │                   │
                       │                   ▼
                       │             tool execute
                       │                   │
                       └──────────┬────────┘
                                  │
                                  ▼
                            next LLM turn
```

---

# 67. Self-extension is a recursive state transition

Now add the coding agent's ability to modify source:

```text
       CURRENT RUNTIME
             │
             │ model reads architecture
             ▼
       ARCHITECTURE MODEL
             │
             │ model writes extension
             ▼
       NEW SOURCE FILE
             │
             │ reload
             ▼
       NEW RUNTIME STATE
             │
             │ exposes new capability
             ▼
       NEXT AGENT TURN
```

Therefore:

```text
runtime
  → architecture knowledge
  → model
  → source mutation
  → runtime mutation
  → architecture knowledge
```

is a closed feedback loop.

---

# 68. What Pi's model is actually “learning” during extension creation

It is not learning Pi permanently.

There are three levels:

### Level 1 — pretrained knowledge

The model may already know some Pi concepts.

### Level 2 — bootstrap context

System prompt says:

```text
Pi docs are here.
For extensions use these docs/examples.
```

### Level 3 — retrieved implementation knowledge

The model reads:

```text
docs/extensions.md
examples/extensions/foo.ts
src/core/extensions/types.ts
src/core/extensions/runner.ts
tests/...
```

The final implementation is mostly based on:

```text
runtime-specific source retrieval
```

rather than:

```text
pretraining
```

This is exactly what you want for rapidly evolving coding-agent frameworks.

---

# 69. Why this can survive API changes

Suppose tomorrow Pi changes:

```ts
pi.registerTool(...)
```

into:

```ts
pi.registerTool(...)
```

with new required fields or changed lifecycle semantics.

A model operating from memory might generate obsolete code.

A model operating using the Pi architecture loop can:

```text
read current docs
    ↓
read current types
    ↓
read current examples
    ↓
generate current extension
```

The source of truth is therefore:

```text
current runtime
```

rather than:

```text
model memory
```

---

# 70. This is the part I would copy directly into ACRYL BLENDS

The strongest transferable idea is not the specific `ExtensionAPI`.

It is:

# **Self-Describing Runtime + Addressable Architecture + Reloadable Capability Registry**

Formally:

```text
Runtime R
has:

ArchitectureIndex(R)

ArchitectureIndex(R) contains:
    canonical docs
    canonical examples
    API contracts
    architecture maps
    subsystem routing

Agent has:
    read
    search
    inspect
    write
    execute

Agent receives:
    ArchitectureIndex(R)

Agent may:
    retrieve detailed architecture
    modify extension/module source
    register new capability

Runtime then:
    discovers capability
    validates capability
    activates capability
    updates context
    exposes capability to next inference
```

That is the generalized Pi pattern.

---

# 71. The ACRYL-style version

For your self-evolving architecture, I would turn Pi's implicit mechanism into something more explicit:

```text
ACRYL RUNTIME

/architecture/
    manifest.md
    index.json

    concepts/
    protocols/
    lifecycle/
    context/
    plugins/
    persistence/
    events/
    runtime/

/examples/
    plugins/
    agents/
    components/
    migrations/

/contracts/
    plugin-api.ts
    runtime-api.ts
    context-api.ts
```

Then inject only:

```text
<architecture>
Architecture manifest:
  /architecture/manifest.md

Architecture index:
  /architecture/index.json

When modifying ACRYL:
  read the relevant architecture entry
  follow references
  inspect canonical examples
  inspect contracts and tests
  implement through the supported extension boundary
</architecture>
```

Then the agent uses:

```text
read
grep
find
edit
write
bash
```

to fetch the rest.

That is the Pi mechanism generalized.

---

# 72. I would make one improvement over Pi

Pi's system prompt mainly tells the model:

```text
here are the docs
```

For ACRYL, I would explicitly introduce an **architecture manifest**.

For example:

```json
{
  "architectureVersion": "7",
  "subsystems": {
    "plugins": {
      "contract": "contracts/plugin-api.ts",
      "docs": "architecture/plugins.md",
      "examples": "examples/plugins/"
    },
    "context": {
      "contract": "contracts/context-api.ts",
      "docs": "architecture/context.md"
    }
  }
}
```

Then the system prompt only needs to say:

```text
Read architecture/index.json first.
Use it to identify the authoritative contract and examples
for the subsystem you are modifying.
Do not infer architecture from unrelated source files.
```

That is a more explicit version of what Pi is doing implicitly.

---

# 73. Another improvement: make architecture retrieval deterministic

Pi relies largely on the LLM following:

```text
read docs
read examples
follow references
```

For ACRYL I would create an explicit tool:

```text
architecture_lookup(
    topic: "plugin-runtime"
)
```

returning:

```text
canonical contract
canonical docs
canonical examples
canonical tests
dependency boundaries
```

But I would keep the filesystem mechanism too.

So:

```text
Architecture index tool
          +
filesystem inspection
```

gives the agent both:

```text
fast semantic routing
```

and:

```text
exact source inspection
```

---

# 74. The complete coding-agent protocol I would extract from Pi

A coding agent modifying its own host framework should follow:

```text
SELF-MODIFICATION PROTOCOL

1. Identify the subsystem being changed.

2. Read the architecture index for that subsystem.

3. Read the canonical architecture document.

4. Follow its referenced contracts.

5. Read at least one canonical implementation example.

6. Read relevant tests.

7. Inspect current source implementation where behavior is ambiguous.

8. Determine the supported extension/plugin boundary.

9. Implement through that boundary whenever possible.

10. Write the new extension/module.

11. Validate type/API compatibility.

12. Reload or restart the runtime.

13. Verify that the capability was discovered.

14. Verify that the capability appears in the runtime registry.

15. Verify that the system prompt/tool context reflects the capability.

16. Execute a real model turn using the new capability.

17. If the extension changes context/prompt behavior,
    inspect the subsequent turn rather than assuming activation succeeded.
```

That is a stronger formalization of Pi's implicit workflow.

---

# 75. Most important architectural takeaway

Pi's self-extensibility is **not one feature**.

It is the composition of about eight mechanisms:

```text
1. Self-documentation
2. Documentation routing in system prompt
3. On-demand source retrieval
4. Stable extension ABI
5. Dynamic capability registry
6. Fine-grained lifecycle hooks
7. Hot reload
8. Context/prompt reconstruction
```

Remove any one and the loop becomes significantly weaker.

The especially powerful combination is:

```text
self-description
        +
ordinary file tools
        +
dynamic module loading
        +
runtime registration
        +
prompt regeneration
        +
hot reload
```

That is the real architecture.

---

# 76. Canonical Pi source map

These are the files I would give directly to a coding agent implementing the same architecture.

### System prompt / self-description

[packages/coding-agent/src/core/system-prompt.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts?utm_source=chatgpt.com)

This is the key file for the architecture-routing mechanism. ([GitHub][1])

### Runtime/resource discovery

[packages/coding-agent/src/core/resource-loader.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts?utm_source=chatgpt.com)

Loads extensions, skills, project context, system-prompt resources, and other resources.

### Extension module loader

[packages/coding-agent/src/core/extensions/loader.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/loader.ts?utm_source=chatgpt.com)

Handles discovery, jiti loading, extension factories, registration and reload cache. ([GitHub][2])

### Extension runtime/event dispatcher

[packages/coding-agent/src/core/extensions/runner.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/runner.ts?utm_source=chatgpt.com)

Controls lifecycle hooks, prompt mutation, context mutation and provider/tool interception.

### Extension API/type contract

[packages/coding-agent/src/core/extensions/types.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts?utm_source=chatgpt.com)

The API contract an agent needs to understand to write extensions.

### AgentSession

[packages/coding-agent/src/core/agent-session.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/agent-session.ts?utm_source=chatgpt.com)

The bridge between Pi-specific runtime resources/extensions and the generic agent loop.

### Agent SDK construction

[packages/coding-agent/src/core/sdk.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/sdk.ts?utm_source=chatgpt.com)

Builds the Agent, ResourceLoader and AgentSession integration.

### Generic agent

[packages/agent/src/agent.ts](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent.ts?utm_source=chatgpt.com)

Owns generic transcript/tool/loop state. ([GitHub][3])

### Agent loop

[packages/agent/src/agent-loop.ts](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts?utm_source=chatgpt.com)

The actual `transformContext → convertToLlm → provider` path.

### Skills

[packages/coding-agent/src/core/skills.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/skills.ts?utm_source=chatgpt.com)

Shows the index-then-load pattern.

### Extension documentation

[packages/coding-agent/docs/extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md?utm_source=chatgpt.com)

The model-facing implementation specification and examples index. ([GitHub][4])

### Prompt customizer example

[examples/extensions/prompt-customizer.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/prompt-customizer.ts?utm_source=chatgpt.com)

Shows runtime-driven system-prompt mutation.

### Reload example

[examples/extensions/reload-runtime.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/reload-runtime.ts?utm_source=chatgpt.com)

Shows the practical self-reload pattern.

### Package/resource model

[packages/coding-agent/docs/packages.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md?utm_source=chatgpt.com)

Shows how extensions, skills, prompts and themes become distributable resources.

---

# 77. Final distilled architecture

The exact pattern worth taking from Pi is:

```text
                         CODING AGENT
                              │
                              ▼
                 ┌────────────────────────┐
                 │     SYSTEM PROMPT       │
                 │                        │
                 │ role                  │
                 │ tools                 │
                 │ rules                 │
                 │ architecture router ◄─┼──────┐
                 │ skill index            │      │
                 │ project context        │      │
                 └───────────┬────────────┘      │
                             │                   │
                             ▼                   │
                    MODEL REASONING             │
                             │                   │
               ┌─────────────┼────────────┐      │
               │             │            │      │
               ▼             ▼            ▼      │
             read          grep        find       │
               │             │            │       │
               └─────────────┼────────────┘       │
                             ▼                    │
                    ARCHITECTURE PAYLOAD          │
                             │                    │
                             ▼                    │
                         CODE GEN                 │
                             │                    │
                             ▼                    │
                       extension.ts               │
                             │                    │
                             ▼                    │
                       HOT RELOAD                │
                             │                    │
                             ▼                    │
                    Extension Loader             │
                             │                    │
                             ▼                    │
                    Extension Runner             │
                             │                    │
          ┌──────────────────┼─────────────────┐  │
          │                  │                 │  │
          ▼                  ▼                 ▼  │
        tools             commands          hooks │
          │                  │                 │  │
          └──────────────────┼─────────────────┘  │
                             ▼                    │
                        TOOL REGISTRY             │
                             │                    │
                             ▼                    │
                     PROMPT REBUILD              │
                             │                    │
                             └────────────────────┘
```

The deepest idea is therefore:

> **The agent does not need to know its own architecture in advance. It needs a reliable way to locate the architecture, inspect the current implementation, modify a stable extension boundary, and reload the result into the same runtime.**

That is the mechanism in Pi that makes “ask the coding agent to build an extension for itself” work.

[1]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts?utm_source=chatgpt.com "pi/packages/coding-agent/src/core/system-prompt.ts at main · earendil-works/pi · GitHub"
[2]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/loader.ts?utm_source=chatgpt.com "pi/packages/coding-agent/src/core/extensions/loader.ts at main · earendil-works/pi · GitHub"
[3]: https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent.ts?utm_source=chatgpt.com "pi/packages/agent/src/agent.ts at main · earendil-works/pi · GitHub"
[4]: https://github.com/open-gsd/gsd-pi/blob/main/packages/pi-coding-agent/docs/extensions.md?utm_source=chatgpt.com "gsd-pi/packages/pi-coding-agent/docs/extensions.md at main · open-gsd/gsd-pi · GitHub"
[5]: https://github.com/antinomie-lab/pi-book/blob/main/agent/en/02-end-to-end.md?utm_source=chatgpt.com "pi-book/agent/en/02-end-to-end.md at main · antinomie-lab/pi-book · GitHub"
