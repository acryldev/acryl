# Pi Self-Extensions Storage Mechanism & extensions loading mechanism  how it works in pi.dev


The important finding is that **Pi does not have a separate database or registry where a newly generated extension is “stored.”** The extension is primarily a normal source artifact on disk.

The machinery is:

```text
LLM creates extension source
        ↓
writes normal .ts/.js files
        ↓
one of Pi's known extension locations
        ↓
ResourceLoader discovers the path
        ↓
Extension loader imports it with jiti
        ↓
factory receives ExtensionAPI
        ↓
factory registers tools / commands / hooks
        ↓
in-memory Extension object is created
        ↓
AgentSession incorporates it
        ↓
system prompt + tool registry change
        ↓
/reload or next startup reconstructs everything from disk
```

There is **no database representation of the extension itself**.

There are, however, **three different persistence layers**, and separating them is the key to reproducing this correctly in ACRYL:

1. **Extension source artifact** → filesystem / Git repository.
2. **Activation/configuration** → `settings.json` when the extension is explicitly installed/configured.
3. **Extension runtime state** → session JSONL through `pi.appendEntry()` if the extension chooses to persist state.

That distinction is the core of the architecture.

I inspected the current `earendil-works/pi` `main` source, especially `loader.ts`, `resource-loader.ts`, `package-manager.ts`, `config.ts`, and the extension documentation. ([GitHub][1])

---

# 1. First: what happens when the coding agent creates an extension?

Suppose the model decides:

> I need a new extension called `git-checkpoint`.

It creates:

```text
.pi/
└── extensions/
    └── git-checkpoint.ts
```

or, for a larger extension:

```text
.pi/
└── extensions/
    └── git-checkpoint/
        ├── index.ts
        ├── checkpoint.ts
        ├── state.ts
        └── package.json
```

**That filesystem artifact is the extension.**

Pi's documentation explicitly says project-local extensions live in:

```text
.pi/extensions/*.ts
.pi/extensions/*/index.ts
```

and global extensions live in:

```text
~/.pi/agent/extensions/*.ts
~/.pi/agent/extensions/*/index.ts
```

([GitHub][2])

So if the LLM simply does:

```text
write(".pi/extensions/git-checkpoint.ts", ...)
```

it has already created a persistent extension.

There is no additional:

```text
registerExtensionInDatabase(...)
```

operation required.

---

# 2. This is the most important design decision

Pi treats the filesystem as the **source of truth**.

Conceptually:

```text
                    EXTENSION

                     source
                       │
                       ▼
              .pi/extensions/
                       │
                       │ discovery
                       ▼
                ResourceLoader
                       │
                       ▼
                Extension Loader
                       │
                       ▼
                in-memory runtime
```

The in-memory object is disposable.

The source file is durable.

Therefore:

```text
restart Pi
```

does not restore an in-memory extension.

It simply:

```text
scan filesystem
    ↓
find extension source
    ↓
load source again
    ↓
recreate extension runtime
```

This is exactly the architecture you want for ACRYL.

---

# 3. There are two fundamentally different kinds of "extension storage"

You need to distinguish:

## A. Local source extensions

```text
.pi/extensions/
~/.pi/agent/extensions/
```

These are directly created/edited by the coding agent.

## B. Installed packages

```text
.pi/npm/
.pi/git/

~/.pi/agent/npm/
~/.pi/agent/git/
```

These are managed dependencies/packages.

Pi's package manager handles the second category. ([GitHub][3])

This gives you a very clean development progression:

```text
LEVEL 1

.pi/extensions/my-extension/
        ↓
local self-generated artifact


LEVEL 2

.pi/npm/...
        ↓
installed external package


LEVEL 3

Git repository / npm package
        ↓
shareable/distributable extension
```

You don't need Level 2 or Level 3 for the initial ACRYL implementation.

---

# 4. Exact auto-discovery locations

Current Pi's loader ultimately looks at:

```text
PROJECT:

<CWD>/.pi/extensions/


GLOBAL:

~/.pi/agent/extensions/
```

The actual code constructs these paths in `discoverAndLoadExtensions()`:

```text
localExtDir =
    path.join(resolvedCwd, CONFIG_DIR_NAME, "extensions")

globalExtDir =
    path.join(resolvedAgentDir, "extensions")
```

Then it calls:

```text
discoverExtensionsInDir(...)
```

for both. ([GitHub][4])

`CONFIG_DIR_NAME` defaults to `.pi`, and the agent directory defaults to:

```text
~/.pi/agent/
```

The configuration code explicitly implements `getAgentDir()` as the user's home directory + `.pi/agent`, unless overridden by the environment. ([GitHub][5])

---

# 5. Project-local is therefore the natural location for ACRYL

For ACRYL, I would directly map:

```text
ACRYL project
│
├── .acryl/
│   ├── extensions/
│   ├── skills/
│   ├── ...
│
└── source code
```

to Pi's:

```text
.pi/
├── extensions/
├── skills/
├── prompts/
└── themes/
```

Then an ACRYL coding agent can simply create:

```text
.acryl/extensions/foo.ts
```

and that is enough to make it persistent.

No database.

No extension registry.

No generated manifest required for the simplest case.

---

# 6. The discovery rules are surprisingly simple

Pi recognizes three forms inside an extension directory.

### Form 1 — single file

```text
.pi/extensions/foo.ts
```

This gets loaded directly.

The loader considers `.ts` and `.js` extension files. ([GitHub][4])

---

### Form 2 — directory with `index.ts`

```text
.pi/extensions/foo/
    index.ts
    helper.ts
    state.ts
```

Pi loads:

```text
foo/index.ts
```

The other files are **not independently considered extensions**.

They are normal imports from `index.ts`.

The loader's `resolveExtensionEntries()` checks `index.ts` and then `index.js`. ([GitHub][4])

This is exactly what you want for larger self-generated modules.

---

# 7. Form 3 — directory with `package.json`

A more sophisticated extension can contain:

```text
.pi/extensions/foo/
    package.json
    src/
        index.ts
        helper.ts
```

with:

```json
{
  "pi": {
    "extensions": [
      "./src/index.ts"
    ]
  }
}
```

Pi reads the `pi.extensions` manifest first.

The current `resolveExtensionEntries()` logic is:

```text
directory
    │
    ├── package.json ?
    │       │
    │       └── pi.extensions ?
    │               ↓
    │          use declared entries
    │
    └── otherwise index.ts ?
             ↓
           index.js ?
```

([GitHub][4])

This is important because it prevents helper files from accidentally becoming independent extensions.

---

# 8. Pi intentionally does NOT recursively treat every `.ts` file as an extension

The auto-discovery logic is deliberately shallow.

For:

```text
extensions/
    foo.ts
    bar.ts
    baz/
        index.ts
        helper.ts
```

it discovers:

```text
foo.ts
bar.ts
baz/index.ts
```

but not:

```text
baz/helper.ts
```

as a separate extension.

The loader explicitly says there is **no recursion beyond one level** and complex packages should use a `package.json` manifest. ([GitHub][4])

This is a very good rule to copy into ACRYL.

---

# 9. Why the directory/index structure matters for self-evolution

It gives the agent two natural artifact sizes.

### Small mutation

```text
.acryl/extensions/
    foo.ts
```

### Large mutation

```text
.acryl/extensions/
    foo/
        index.ts
        domain.ts
        runtime.ts
        tests.ts
        package.json
```

The agent doesn't need to understand a special artifact database.

It just graduates an extension from:

```text
single-file
```

to:

```text
module directory
```

when complexity requires it.

---

# 10. There is also explicit extension configuration

Pi supports:

```json
{
  "extensions": [
    "/path/to/my-extension.ts"
  ]
}
```

in settings.

The current `DefaultResourceLoader` has:

```text
additionalExtensionPaths
extensionFactories
extensionsOverride
```

and settings-derived extension paths are incorporated during resource resolution. ([GitHub][6])

So there are really three ways for an extension to enter the runtime:

```text
AUTO DISCOVERY
.pi/extensions/


EXPLICIT PATH
settings.json → extensions[]


INLINE / SDK
extensionFactories[]
```

For self-generated ACRYL extensions, **auto discovery should be the primary mechanism**.

---

# 11. The actual loader does not store a list of extension paths permanently

This is another important detail.

The loader builds:

```ts
allPaths: string[]
```

during discovery.

It deduplicates them using:

```ts
Set<string>
```

and then calls:

```ts
loadExtensions(allPaths, ...)
```

The list is reconstructed every discovery cycle. ([GitHub][4])

So the filesystem is authoritative.

This means you don't need:

```text
extensions.json
```

containing:

```json
[
  "foo",
  "bar",
  "baz"
]
```

for auto-discovered extensions.

That list can be derived.

---

# 12. Exact loading pipeline

Once Pi has:

```text
.pi/extensions/foo.ts
```

the process is:

```text
path
 ↓
resolvePath()
 ↓
loadExtension()
 ↓
loadExtensionModule()
 ↓
jiti.import()
 ↓
default export
 ↓
ExtensionFactory
 ↓
initializeExtension()
 ↓
factory(api)
 ↓
registration Maps
 ↓
Extension object
```

The source shows this explicitly.

`loadExtension()` resolves the path, calls `loadExtensionModule()`, validates that the result is a function, then calls `initializeExtension()`. ([GitHub][4])

---

# 13. The source is loaded with jiti

This is significant for ACRYL.

Pi does not require the generated extension to be precompiled.

The loader creates a jiti instance and calls:

```ts
jiti.import(extensionPath, { default: true })
```

with:

```ts
moduleCache: false
```

plus appropriate module-resolution configuration. ([GitHub][4])

Therefore:

```text
generated TypeScript
       ↓
direct runtime loading
```

is possible.

For ACRYL, if you're also TypeScript/Node-based, this is a very attractive model:

```text
Agent writes .ts
       ↓
runtime loader imports .ts
```

rather than:

```text
Agent writes .ts
       ↓
compile entire application
       ↓
restart application
```

---

# 14. Pi has special module resolution for extensions

The loader has two mechanisms.

For bundled/embedded runtime:

```text
virtualModules
```

For Node/development:

```text
aliases
```

These provide the Pi runtime packages to extensions.

For example, current aliases include:

```text
@earendil-works/pi-coding-agent
@earendil-works/pi-agent-core
@earendil-works/pi-tui
@earendil-works/pi-ai
typebox
```

and compatibility aliases. ([GitHub][1])

This matters when ACRYL creates an extension that imports ACRYL itself:

```ts
import type { AcrylExtensionAPI } from "@acryl/runtime";
```

The runtime must make the host API resolvable from generated extensions.

---

# 15. Extension module cache is deliberately separate from jiti's module cache

Pi has its own:

```ts
const extensionCache =
    new Map<string, ExtensionFactory>();
```

It tracks:

```text
extension path
→ factory function
```

and also tracks:

```text
extensionCacheCwd
extensionCacheGeneration
```

([GitHub][4])

This is used for selected cached loading operations.

But importantly, jiti itself is configured with:

```ts
moduleCache: false
```

So reload can obtain fresh module code.

---

# 16. `/reload` is what turns a filesystem mutation into a runtime mutation

Suppose the model does:

```text
write .pi/extensions/foo.ts
```

At that instant:

```text
DISK:
    foo.ts exists

MEMORY:
    old extension registry
```

The new extension isn't necessarily active yet.

Then:

```text
/reload
```

or:

```ts
await ctx.reload()
```

causes the resource runtime to be reconstructed.

The current docs explicitly describe `/reload` as reloading:

```text
extensions
skills
prompts
themes
context files
```

([GitHub][2])

---

# 17. Exact reload sequence

Current `DefaultResourceLoader.reload()` begins by:

```text
resetTimings("extensions")
```

and, if already loaded:

```text
clearExtensionCache()
```

Then it:

```text
reloads settings
        ↓
packageManager.resolve()
        ↓
resolveExtensionSources(...)
        ↓
resource discovery
        ↓
extension loading
        ↓
resource metadata reconstruction
```

The relevant source is `resource-loader.ts`. ([GitHub][6])

This means reload is not:

```text
"re-run the extension factory"
```

It is much more complete.

It reconstructs the resource graph.

---

# 18. The package manager participates in every reload

This is a subtle but important architecture point.

`ResourceLoader.reload()` calls:

```text
this.packageManager.resolve()
```

before constructing the final resource set. ([GitHub][6])

Therefore the final extension graph is:

```text
                       ResourceLoader
                             │
                             ▼
                      PackageManager
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
           project         global        temporary
           packages        packages       packages
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                     resolved resources
                             │
                             ▼
                      extension loader
```

This is the architecture that lets Pi eventually graduate from:

```text
local extension
```

to:

```text
installed package
```

without changing the runtime loader.

---

# 19. Project-local package storage is separate

When Pi installs a package with:

```text
pi install ... -l
```

it uses:

```text
.pi/npm/
.pi/git/
```

for project-local package storage. ([GitHub][3])

For global installation:

```text
~/.pi/agent/npm/
~/.pi/agent/git/
```

The package manager source implements:

```ts
getNpmInstallRoot("project")
    → <cwd>/.pi/npm

getNpmInstallRoot("user")
    → <agentDir>/npm
```

and:

```ts
getGitInstallRoot("project")
    → <cwd>/.pi/git

getGitInstallRoot("user")
    → <agentDir>/git
```

It then resolves individual packages beneath those roots. ([GitHub][7])

---

# 20. NPM package layout

For an npm package, the managed path is:

```text
.pi/npm/node_modules/<package-name>
```

for project scope.

Global:

```text
~/.pi/agent/npm/node_modules/<package-name>
```

The source explicitly calculates:

```ts
join(
    this.cwd,
    CONFIG_DIR_NAME,
    "npm",
    "node_modules",
    source.name
)
```

for project npm packages. ([GitHub][7])

So:

```text
.pi/npm/
├── package.json
├── node_modules/
│   ├── my-pi-extension/
│   │   ├── package.json
│   │   ├── extensions/
│   │   └── ...
│   └── ...
└── ...
```

---

# 21. Pi creates a private npm project there

This is a nice implementation detail.

`ensureNpmProject()` creates the install root if necessary and creates:

```json
{
  "name": "pi-extensions",
  "private": true
}
```

as its `package.json`. ([GitHub][7])

Then it runs the configured package manager against that directory.

So Pi doesn't contaminate the user's application `package.json`.

That's important for ACRYL.

You should likewise avoid doing:

```text
npm install extension
```

into the user's actual application dependency tree merely because the agent generated an extension.

---

# 22. Git packages are stored differently

For Git sources, Pi constructs:

```text
.pi/git/<host>/<path>
```

or globally:

```text
~/.pi/agent/git/<host>/<path>
```

The source uses:

```ts
resolveManagedPath(installRoot, source.host, source.path)
```

and explicitly prevents the resulting path from escaping the install root. ([GitHub][7])

Example conceptually:

```text
.pi/git/
└── github.com/
    └── company/
        └── my-pi-extension/
            ├── package.json
            ├── extensions/
            └── ...
```

---

# 23. The package itself then becomes just another resource source

This is elegant.

Once installed:

```text
.pi/npm/node_modules/my-extension/
```

Pi doesn't have to treat it as a fundamentally different kind of extension.

The package manager gives ResourceLoader:

```text
packageRoot
```

then `collectPackageResources()` examines:

```text
package.json
```

for:

```json
{
  "pi": {
    "extensions": [...],
    "skills": [...],
    "prompts": [...],
    "themes": [...]
  }
}
```

or falls back to conventional directories:

```text
extensions/
skills/
prompts/
themes/
```

([GitHub][7])

---

# 24. Therefore there are really four extension artifact states

This is the model I recommend using for ACRYL.

```text
STATE 0 — GENERATED

.acryl/extensions/foo.ts
```

↓

```text
STATE 1 — ACTIVE

foo.ts discovered
+
loaded into runtime
```

↓

```text
STATE 2 — PACKAGED

.acryl/extensions/foo/
    package.json
    index.ts
    ...
```

↓

```text
STATE 3 — DISTRIBUTED

Git / npm package
```

The important thing is:

> **Pi does not require State 2 or State 3 for State 0 → State 1.**

That is exactly why it works so well for self-extension.

---

# 25. Settings are not the source of truth for auto-discovered extensions

This deserves emphasis.

Suppose:

```text
.pi/extensions/foo.ts
```

exists.

You don't need:

```json
{
  "extensions": [
    ".pi/extensions/foo.ts"
  ]
}
```

because it is automatically discovered.

Settings are necessary when you want:

```text
an arbitrary external path
```

or:

```text
explicit package configuration/filtering
```

or similar behavior.

The resource resolver separately processes:

```text
project settings
global settings
auto-discovered resources
packages
```

and combines them into a resolved resource graph. ([GitHub][7])

---

# 26. The resolved resource graph is more sophisticated than just an array

The package manager creates:

```ts
ResolvedPaths
```

containing:

```text
extensions[]
skills[]
prompts[]
themes[]
```

Each item is:

```ts
{
    path,
    enabled,
    metadata
}
```

Metadata contains information such as:

```text
source
scope
origin
baseDir
```

([GitHub][7])

This allows Pi to reason about:

```text
project
global
package
auto-discovered
explicit
```

without losing provenance.

That is useful for ACRYL.

---

# 27. Pi has explicit precedence semantics

Current package-manager code defines a resource precedence rank.

The ordering is:

```text
0  project + explicit local
1  project + auto-discovered
2  user + explicit local
3  user + auto-discovered
4  package
```

Lower number = higher precedence. ([GitHub][7])

This matters when two resources have the same canonical path/name.

It prevents package resources from unexpectedly overriding project-local resources.

---

# 28. There is also canonical-path deduplication

After resources are collected, Pi canonicalizes paths and removes duplicates.

Conceptually:

```text
resource A
/path/foo.ts

resource B
/path/../path/foo.ts

        ↓

canonicalizePath()

        ↓

same identity

        ↓

one resource
```

This is part of `toResolvedPaths()`. ([GitHub][7])

For ACRYL I would definitely copy this.

Agents can easily create:

```text
./foo
../project/foo
/absolute/path/foo
```

and you don't want duplicate loading.

---

# 29. The extension itself has an in-memory representation

After the source module loads, Pi creates:

```text
Extension
```

with Maps for:

```text
handlers
tools
messageRenderers
entryRenderers
commands
flags
shortcuts
```

The source explicitly creates this object in `createExtension()`. ([GitHub][4])

So:

```text
foo.ts
    ↓
Extension {
    path
    resolvedPath
    sourceInfo
    handlers: Map
    tools: Map
    commands: Map
    ...
}
```

This object is **not persisted to disk**.

It is rebuilt every reload.

---

# 30. The source file is therefore the persistent artifact; the Extension object is a runtime projection

This is perhaps the most useful conceptual model:

```text
                    PERSISTENT

              extension source tree
                       │
                       │ load
                       ▼
                    RUNTIME

              Extension object
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
            tools    events   commands
```

Then on reload:

```text
Extension object
       X
     destroyed

       ↓

source tree
       ↓
new Extension object
```

This is effectively:

> **filesystem → runtime projection**

rather than:

> **database → runtime state**

---

# 31. Extension initialization itself is transactional

This is another piece I would copy into ACRYL.

During loading, Pi does:

```text
create Extension
       ↓
create ExtensionAPI
       ↓
factory(api)
       ↓
commit()
```

If the factory throws:

```text
factory(api)
       ↓
ERROR
       ↓
discard()
```

The source explicitly implements:

```ts
load.commit()
```

on success and:

```ts
load.discard()
```

on failure. ([GitHub][4])

This prevents a half-loaded extension from leaving runtime registrations behind.

---

# 32. Why this matters for an AI-generated extension

An LLM might generate:

```text
registerTool()
registerCommand()
registerShortcut()
...
throw new Error()
```

You do not want:

```text
tool registered
command registered
shortcut partially registered
extension failed
```

Pi instead has a load transaction.

Conceptually:

```text
BEGIN EXTENSION LOAD

registration
registration
registration
registration

        ↓

factory succeeds?
     /       \
   YES        NO
    ↓          ↓
 COMMIT      DISCARD
```

This is a very important ACRYL requirement.

---

# 33. There is also a runtime lifecycle transaction

Pi's extension runtime starts with stubs:

```text
sendMessage → notInitialized
sendUserMessage → notInitialized
appendEntry → notInitialized
...
```

These deliberately throw if called too early.

`bindCore()` later replaces these with actual implementations.

([GitHub][1])

So loading happens in two conceptual phases:

```text
PHASE 1
extension construction
    ↓
registrations


PHASE 2
runtime binding
    ↓
real host capabilities
```

That prevents an extension factory from accidentally executing session-dependent actions before the host is fully wired.

---

# 34. This is particularly relevant to ACRYL self-generation

Your generated extension should not be able to assume:

```text
runtime is fully initialized
```

inside its module top-level/factory.

Instead:

```text
factory:
    register capabilities

session_start:
    initialize runtime resources

agent_start:
    perform runtime behavior
```

That gives you deterministic initialization ordering.

---

# 35. What happens to extension state across reload?

This is where many people misunderstand Pi.

Suppose:

```ts
let counter = 0;
```

inside:

```text
foo.ts
```

Then:

```text
counter++
```

works while that extension instance is alive.

But on reload:

```text
new module
new factory
new closure
counter = 0
```

The closure state is gone.

Pi does **not** persist arbitrary JavaScript heap state.

---

# 36. If an extension wants persistent state, it explicitly stores it

Pi provides:

```ts
pi.appendEntry("my-state", {
    count: 42
});
```

The documentation explicitly says this persists extension state and does **not** participate directly in LLM context. On `session_start`, the extension can inspect session entries and reconstruct its state. ([GitHub][2])

So:

```text
extension source
    → filesystem

extension runtime state
    → memory

persistent extension state
    → session JSONL
```

These are three different things.

---

# 37. This is extremely important for ACRYL

You should have exactly this separation:

```text
                 ACRYL EXTENSION

          ┌────────────────────────┐
          │ source artifact        │
          │                        │
          │ .acryl/extensions/foo/ │
          └───────────┬────────────┘
                      │
                      ▼
               runtime instance
                      │
                      ▼
               in-memory state
                      │
              optional persistence
                      ▼
             extension state store
```

Do **not** serialize the whole JavaScript object.

Do not try to persist:

```text
Map
function
closure
class instance
```

Persist only explicit state.

---

# 38. Now the exact lifecycle of a newly generated extension

Here is the complete sequence I would give directly to an ACRYL coding agent.

---

## PHASE 1 — Agent decides it needs a capability

Example:

```text
User:
"Add automatic Git checkpointing."
```

Agent identifies:

```text
required capability
    ↓
extension candidate
```

---

## PHASE 2 — Agent reads ACRYL architecture

Because your system prompt already points to:

```text
architecture
source
examples
contracts
```

the agent reads:

```text
extension API
extension examples
runtime lifecycle
tests
```

---

## PHASE 3 — Agent creates source artifact

For small extension:

```text
.acryl/extensions/git-checkpoint.ts
```

For larger extension:

```text
.acryl/extensions/git-checkpoint/
    index.ts
    git.ts
    state.ts
    package.json
```

---

## PHASE 4 — Agent validates it

Run:

```text
typecheck
tests
lint
```

or the ACRYL equivalent.

---

## PHASE 5 — Agent asks runtime to reload

```text
ctx.reload()
```

or:

```text
/acryl reload
```

or an internal runtime command.

---

## PHASE 6 — Old runtime shuts down

```text
session_shutdown
```

Extensions release:

```text
timers
watchers
sockets
child processes
event listeners
```

---

## PHASE 7 — Extension cache is invalidated

```text
old factory cache
        ↓
clear
```

---

## PHASE 8 — Resource discovery runs

```text
.acryl/extensions/
```

is scanned.

---

## PHASE 9 — Extension identity is resolved

For:

```text
.acryl/extensions/git-checkpoint/
```

loader checks:

```text
package.json
    ↓
.acryl/extensions
```

then:

```text
index.ts
```

then:

```text
index.js
```

---

## PHASE 10 — Module is imported

```text
jiti.import(...)
```

or ACRYL equivalent.

---

## PHASE 11 — Factory executes

```ts
export default function (acryl) {
    acryl.registerTool(...)
    acryl.on(...)
}
```

---

## PHASE 12 — Registration transaction commits

```text
Extension {
    tools
    handlers
    commands
    ...
}
```

becomes active.

---

## PHASE 13 — Runtime binds host capabilities

```text
acryl.sendMessage
acryl.session
acryl.ui
acryl.tools
...
```

become operational.

---

## PHASE 14 — `session_start`

Extension initializes persistent runtime state.

For example:

```text
read extension-state entries
restore checkpoint metadata
start watcher
```

---

## PHASE 15 — Tool registry refresh

New tools become available.

---

## PHASE 16 — System prompt refresh

New tool descriptions/guidelines are incorporated.

---

## PHASE 17 — Next LLM turn

The agent now sees:

```text
new capability
```

and can call it.

---

# 39. The key point: the extension does not need to be copied somewhere else

Suppose the LLM creates:

```text
.acryl/extensions/foo.ts
```

You should **not** immediately copy it into:

```text
~/.acryl/packages/foo/
```

or:

```text
node_modules/
```

or:

```text
database/extensions/
```

unless it is being packaged/distributed.

The natural lifecycle is:

```text
project source
       ↓
runtime
       ↓
test
       ↓
iterate
       ↓
commit
       ↓
optionally package
```

This fits your ACRYL model much better than treating every generated extension as an installed package.

---

# 40. Git is therefore the natural second persistence layer

For ACRYL:

```text
.acryl/extensions/foo/
```

should be normal Git-tracked source.

Then:

```text
git add .acryl/extensions/foo
git commit
```

makes it part of the project.

Now the extension has:

```text
durability
versioning
rollback
diff
code review
branching
```

without needing any extension-specific persistence system.

This is another reason I would **not** build a database-backed extension registry initially.

---

# 41. This gives ACRYL a very strong self-evolution loop

```text
             ┌────────────────────────┐
             │                        │
             │     ACRYL RUNTIME      │
             │                        │
             └───────────┬────────────┘
                         │
                         ▼
                 system prompt
                         │
                         ▼
                     LLM agent
                         │
                         │ writes
                         ▼
               .acryl/extensions/
                         │
                         │ reload
                         ▼
                extension loader
                         │
                         ▼
                extension runtime
                         │
                         ▼
               new agent capability
                         │
                         └───────────────┐
                                         │
                                         ▼
                                      next turn
```

The **filesystem is the evolutionary genome**.

The runtime is the phenotype.

That is a useful conceptual model for ACRYL.

---

# 42. I would actually make ACRYL's structure slightly richer than Pi

Pi's:

```text
.pi/extensions/
```

is excellent for a coding agent.

For ACRYL, I would use:

```text
.acryl/
│
├── extensions/
│   ├── <extension-id>/
│   │   ├── extension.json
│   │   ├── index.ts
│   │   ├── ...
│   │   └── tests/
│   │
│   └── ...
│
├── skills/
├── prompts/
├── architecture/
├── state/
└── settings.json
```

The important difference I would introduce is:

```text
extension.json
```

even for local extensions.

---

# 43. Why I would add an explicit ACRYL manifest

Pi can infer:

```text
foo/index.ts
```

but ACRYL is specifically intended to be **self-evolving**.

You therefore want metadata about:

```text
extension ID
version
API version
capabilities
dependencies
activation conditions
state schema
permissions
source
tests
```

For example:

```json
{
  "id": "git-checkpoint",
  "version": "0.1.0",
  "apiVersion": "7",
  "entry": "./index.ts",
  "capabilities": [
    "tool:git_checkpoint",
    "event:tool_call"
  ],
  "permissions": [
    "filesystem.read",
    "filesystem.write",
    "process.git"
  ],
  "state": {
    "schema": "./state.schema.json"
  }
}
```

Then:

```text
index.ts
```

is still the executable artifact.

The manifest becomes the **identity and lifecycle metadata**.

---

# 44. This becomes especially useful when the agent evolves itself

Suppose ACRYL generates:

```text
extension v1
```

Then later:

```text
extension v2
```

The manifest can explicitly say:

```json
{
  "id": "git-checkpoint",
  "version": "2.0.0",
  "apiVersion": "8",
  "replaces": "1.x"
}
```

Then the runtime can perform:

```text
validate
 ↓
migration
 ↓
shutdown v1
 ↓
load v2
 ↓
restore state
```

Pi does not need this because its extension model is simpler.

For ACRYL's self-evolution goal, I think it is worth adding.

---

# 45. But don't overbuild the first version

For your **first local implementation**, I would copy Pi's machinery almost literally:

```text
.acryl/extensions/
```

Discovery:

```text
*.ts
*/index.ts
*/package.json → acryl.extensions
```

Loading:

```text
jiti
```

Runtime:

```text
ExtensionAPI
ExtensionRunner
Extension object
```

Reload:

```text
shutdown
clear cache
rediscover
load
bind
rebuild tools
rebuild prompt
```

State:

```text
explicit state store
```

Version control:

```text
Git
```

That's enough.

---

# 46. The one thing I would NOT copy from Pi blindly

Pi's package manager is significantly more complex than what you need initially.

It supports:

```text
npm
Git
HTTPS
SSH
local
temporary
global
project
package filters
autoload
updates
dependency installation
package telemetry
trust
legacy package paths
```

The `DefaultPackageManager` is now a fairly large subsystem. ([GitHub][7])

You don't need this for:

```text
agent creates extension
```

You only need it when:

```text
agent wants to share extension
```

or:

```text
agent wants external dependency
```

---

# 47. So I would implement ACRYL in two layers

## Layer A — Self-evolving local extensions

```text
.acryl/extensions/
```

No package manager.

The agent writes there.

Runtime discovers it.

Git tracks it.

Reload activates it.

---

## Layer B — Distribution

Later:

```text
.acryl/extensions/foo/
    extension.json
    package.json
    index.ts
```

Then:

```text
Git repository
```

or:

```text
npm package
```

becomes the distribution format.

This mirrors Pi's architecture without prematurely importing its entire package manager.

---

# 48. The complete ACRYL filesystem model I recommend

```text
project/
│
├── .acryl/
│   │
│   ├── extensions/
│   │   │
│   │   ├── git-checkpoint/
│   │   │   ├── extension.json
│   │   │   ├── index.ts
│   │   │   ├── git.ts
│   │   │   ├── state.ts
│   │   │   └── tests/
│   │   │
│   │   ├── code-review/
│   │   │   ├── extension.json
│   │   │   └── index.ts
│   │   │
│   │   └── foo.ts
│   │
│   ├── skills/
│   ├── prompts/
│   ├── architecture/
│   ├── state/
│   └── settings.json
│
├── src/
├── package.json
└── .git/
```

And the runtime:

```text
.acryl/extensions/
        │
        ▼
ExtensionDiscovery
        │
        ▼
ResolvedExtension[]
        │
        ▼
ExtensionLoader
        │
        ▼
jiti
        │
        ▼
ExtensionFactory
        │
        ▼
ExtensionInstance
        │
        ▼
ExtensionRunner
        │
        ├── tools
        ├── commands
        ├── hooks
        ├── context
        ├── provider
        └── UI
```

---

# 49. The most important lifecycle invariant

I would write this explicitly into the ACRYL architecture specification:

> **The extension filesystem is authoritative. The runtime registry is ephemeral and reconstructible.**

Therefore:

```text
runtime registry ≠ source of truth
```

Instead:

```text
extension source
      =
source of truth
```

The registry is:

```text
derived state
```

This makes:

```text
restart
reload
rollback
Git checkout
branch switching
```

all straightforward.

---

# 50. Another important invariant

The runtime must be able to completely reconstruct itself from:

```text
project files
+
global files
+
configuration
+
installed packages
+
session state
```

without requiring the previous JavaScript process.

In formal terms:

```text
RuntimeState(t)
=
F(
  ExtensionSources,
  PackageSources,
  Configuration,
  PersistentExtensionState
)
```

not:

```text
RuntimeState(t)
=
F(
  RuntimeState(t-1)
)
```

This is exactly what makes the system restartable.

---

# 51. Reload should therefore be destructive/reconstructive

I would implement:

```text
reload()
```

as:

```text
1. stop current agent turn
2. emit extension shutdown
3. invalidate old extension contexts
4. unsubscribe old event handlers
5. destroy extension runner
6. clear module cache
7. reread settings
8. resolve packages/resources
9. scan extension directories
10. import extension modules
11. execute factories
12. commit registrations
13. bind runtime
14. restore persistent extension state
15. rebuild tool registry
16. rebuild system prompt
17. emit session_start
18. continue with new runtime
```

That is much safer than attempting to mutate the existing registry in place.

Pi's current reload/resource machinery follows essentially this reconstructive approach. ([GitHub][6])

---

# 52. Pi's stale-context mechanism is especially worth copying

After reload, old extension contexts are marked stale.

The runtime has:

```ts
assertActive()
```

and `invalidate()`.

After invalidation, captured contexts throw rather than operating on the new runtime. ([GitHub][4])

This prevents:

```text
old extension closure
       ↓
old ctx
       ↓
new runtime
       ↓
corruption
```

For ACRYL, I consider this mandatory.

---

# 53. The actual self-extension lifecycle is therefore

```text
CREATE
   │
   ▼
WRITE SOURCE
   │
   ▼
VALIDATE
   │
   ▼
DISCOVER
   │
   ▼
LOAD
   │
   ▼
INITIALIZE
   │
   ▼
COMMIT
   │
   ▼
BIND
   │
   ▼
ACTIVATE
   │
   ▼
USE
   │
   ▼
MODIFY SOURCE
   │
   ▼
RELOAD
   │
   ▼
SHUTDOWN OLD
   │
   ▼
INVALIDATE OLD
   │
   ▼
LOAD NEW
   │
   ▼
ACTIVATE NEW
```

That's the machinery you were looking for.

---

# 54. And now the key answer to your original question

You said:

> "what is the mechanism of the storage of newly created extensions?"

The precise answer is:

### For a locally generated extension:

**It is simply stored as ordinary source code in the project `.pi/extensions/` directory.**

No extension database.

No serialized runtime object.

No special artifact store.

No mandatory registration file.

Pi discovers it from the filesystem on startup/reload. ([GitHub][4])

### For a global generated extension:

```text
~/.pi/agent/extensions/
```

### For an installed npm extension:

```text
.pi/npm/node_modules/<package>
```

or globally:

```text
~/.pi/agent/npm/node_modules/<package>
```

### For an installed Git extension:

```text
.pi/git/<host>/<repo>
```

or globally:

```text
~/.pi/agent/git/<host>/<repo>
```

([GitHub][7])

### For persistent extension state:

Not inside the extension source.

It is stored through the session persistence mechanism using `appendEntry()` and restored during lifecycle events. ([GitHub][2])

---

# 55. So for ACRYL I would implement exactly this first

```text
.acryl/
└── extensions/
    ├── foo.ts
    ├── bar/
    │   └── index.ts
    └── baz/
        ├── extension.json
        ├── index.ts
        └── ...
```

Then implement these components:

```text
ExtensionDiscovery
ExtensionResolver
ExtensionLoader
ExtensionRuntime
ExtensionRunner
ExtensionRegistry
ExtensionLifecycle
ExtensionStateStore
```

with this dependency graph:

```text
ExtensionDiscovery
       ↓
ExtensionResolver
       ↓
ExtensionLoader
       ↓
ExtensionFactory
       ↓
ExtensionRegistry
       ↓
ExtensionRunner
       ↓
AgentSession
```

And separately:

```text
Extension
     │
     └── PersistentState
              ↓
        StateStore / Session
```

---

# 56. Source map for implementing this in ACRYL

These are the Pi files I would give your coding agent as the **primary implementation references**:

### 1. Extension loader — most important

[Pi loader.ts — extension discovery, loading, cache, initialization, commit/discard](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/loader.ts?utm_source=chatgpt.com)

Especially:

```text
createExtensionRuntime()
createExtensionAPI()
loadExtensionModule()
createExtension()
initializeExtension()
loadExtension()
resolveExtensionEntries()
discoverExtensionsInDir()
discoverAndLoadExtensions()
```

The current source explicitly implements all of these. ([GitHub][1])

### 2. Resource loader

[Pi resource-loader.ts — resource graph and reload machinery](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts?utm_source=chatgpt.com)

Especially:

```text
DefaultResourceLoader
reload()
loadProjectTrustExtensions()
resolve package resources
extensionPaths
extensionsResult
```

([GitHub][6])

### 3. Package manager

[Pi package-manager.ts — npm/Git package storage and resolution](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/package-manager.ts?utm_source=chatgpt.com)

Especially:

```text
DefaultPackageManager
resolve()
resolvePackageSources()
installNpm()
installGit()
getNpmInstallRoot()
getGitInstallRoot()
getNpmInstallPath()
getGitInstallPath()
collectPackageResources()
```

### 4. Configuration paths

[Pi config.ts — agent/project/package directory resolution](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/config.ts?utm_source=chatgpt.com)

Especially:

```text
getAgentDir()
getPackageDir()
CONFIG_DIR_NAME
```

The current implementation defaults the agent directory to `~/.pi/agent/` and the project config directory to `.pi`. ([GitHub][5])

### 5. Extension API

[Pi extensions documentation — lifecycle and extension contract](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md?utm_source=chatgpt.com)

### 6. Package model

[Pi packages documentation — how local/global packages become extension resources](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md?utm_source=chatgpt.com)

---

# 57. Recommended ACRYL implementation roadmap

I would **not** implement the full Pi package manager yet.

Implement this first:

```text
PHASE 1 — Local self-extension

.acryl/extensions/
        ↓
discovery
        ↓
TS loader
        ↓
ExtensionAPI
        ↓
ExtensionRunner
        ↓
runtime registration
        ↓
reload
```

Then:

```text
PHASE 2 — Persistent extension state

ExtensionStateStore
        ↓
JSON / SQLite / session entries
```

Then:

```text
PHASE 3 — Extension manifests

extension.json
        ↓
API version
permissions
dependencies
state schema
version
```

Then:

```text
PHASE 4 — Git packaging

.acryl/extensions/foo
        ↓
Git repo
        ↓
install/clone
        ↓
managed extension
```

Then:

```text
PHASE 5 — npm/package distribution

package.json
+
acryl manifest
        ↓
npm
```

That gives ACRYL the same fundamental evolutionary path as Pi:

```text
LOCAL GENERATED CODE
        ↓
LIVE EXTENSION
        ↓
GIT-TRACKED EXTENSION
        ↓
PACKAGE
        ↓
DISTRIBUTABLE ECOSYSTEM
```

while keeping the **first self-evolution loop extremely simple**.

The most important architectural rule to carry into ACRYL is:

> **An extension is source code first, a runtime object second, and a package only later. The runtime must be able to destroy and completely reconstruct the extension from its source artifact.**

That is the part of Pi's machinery that closes the self-extension loop.

[1]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/loader.ts?utm_source=chatgpt.com "pi/packages/coding-agent/src/core/extensions/loader.ts at main · earendil-works/pi · GitHub"
[2]: https://github.com/fivewillow/badlogic-pi-mono/blob/main/packages/coding-agent/docs/extensions.md?utm_source=chatgpt.com "badlogic-pi-mono/packages/coding-agent/docs/extensions.md at main · fivewillow/badlogic-pi-mono · GitHub"
[3]: https://github.com/mudrii/pi-mono-docs/blob/main/04-pi-coding-agent.md?utm_source=chatgpt.com "pi-mono-docs/04-pi-coding-agent.md at main · mudrii/pi-mono-docs · GitHub"
[4]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/loader.ts "pi/packages/coding-agent/src/core/extensions/loader.ts at main · earendil-works/pi · GitHub"
[5]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/config.ts "pi/packages/coding-agent/src/config.ts at main · earendil-works/pi · GitHub"
[6]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts "pi/packages/coding-agent/src/core/resource-loader.ts at main · earendil-works/pi · GitHub"
[7]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/package-manager-cli.ts "pi/packages/coding-agent/src/package-manager-cli.ts at main · earendil-works/pi · GitHub"
