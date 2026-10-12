

After checking the current Deno 2.9 documentation, I think conclusion is justified: Deno is currently the strongest direction to investigate for ACRYL.**

The important point is that it is not winning merely because it produces a smaller desktop binary. It combines several things that map unusually well to what you are building.

### What your overview demonstrates

The attached material compares the same application across Electron, Tauri, Electrobun, and Deno. In that test, the Deno build was about **111 MB** versus **323 MB for Electron**, with startup around **242 ms for Deno vs. 273 ms for Electron**, and memory around **98 MB vs. 128 MB**. The author also notes that these are results from a particular benchmark and that the applications are relatively small. Deno_ElectronBun_Tauri_Review

The first comparison is even more interesting: the simple Deno application was around **70 MB vs. 248 MB for Electron**, while startup was essentially the same, about **375 ms vs. 364 ms**. Deno_ElectronBun_Tauri_Review

The reason is exactly what we care about:

```text
Electron
  = Electron runtime
  + Node
  + Chromium
  + app

Deno Desktop
  = Deno runtime
  + system WebView
  + app
```

Deno's official documentation confirms that the default backend uses the OS WebView, while CEF is available as an optional Chromium backend. [Deno](https://docs.deno.com/runtime/desktop/?utm_source=chatgpt.com)

---

# The bigger reason Deno wins for ACRYL

The desktop feature is only **one component**.

What makes Deno much more compelling is:

```text
                    DENO
                      │
       ┌──────────────┼────────────────┐
       │              │                │
    Desktop        Runtime          Toolchain
       │              │                │
    WebView        TypeScript        fmt
    BrowserWindow  Node compat       lint
    Tray           npm              test
    Menus          subprocess       check
    Notifications  permissions      compile
    Bindings       workers          tasks
       │              │                │
       └──────────────┼────────────────┘
                      │
                Agent ecosystem
                      │
          ┌───────────┼───────────┐
          │           │           │
       Sandbox       celld     Claw Patrol
```

That is substantially more interesting than "another Electron alternative."

Deno 2.x has made **Node/npm compatibility a first-class migration target**: existing `package.json` projects can run under Deno, npm packages are supported, CommonJS and ESM are supported, and Deno explicitly supports incremental adoption. [Deno](https://docs.deno.com/runtime/migrate/?utm_source=chatgpt.com)

That is exactly the direction you want for an existing TypeScript ecosystem.

---

# And Deno Desktop is really simple

Your uploaded video illustrates the developer model accurately: you point `deno desktop` at a TypeScript entry point and Deno handles the desktop packaging. It can also detect frameworks such as Next.js, Svelte and Remix. Deno_ElectronBun_Tauri_Review

The official architecture is essentially:

```text
main.ts
   │
   ├── Deno.serve()
   │
   └── Deno.BrowserWindow
            │
            ▼
       system WebView
```

The WebView loads the local HTTP server that Deno starts for the application. [Deno](https://docs.deno.com/runtime/desktop/windows/?utm_source=chatgpt.com)

That is a very clean model for ACRYL.

---

# The IPC/bindings model is also better aligned with what we want

Deno's bindings are not just an Electron `ipcMain/ipcRenderer` clone.

You can define:

```ts
win.bind("readProject", async () => {
  ...
});
```

and call it from the WebView:

```ts
await bindings.readProject();
```

Deno documents these bindings as the mechanism for communicating between the WebView and Deno side. [Deno](https://docs.deno.com/runtime/desktop/bindings/?utm_source=chatgpt.com)

So ACRYL could look like:

```text
React UI
    │
    │ typed bindings
    ▼
Deno runtime
    │
    ├── project filesystem
    ├── git
    ├── shell / subprocess
    ├── ACP
    ├── MCP
    ├── A2A
    ├── agent runtime
    └── local services
```

That is much cleaner than carrying a lot of Electron-specific IPC architecture forever.

---

# And this is where Deno gets really interesting for agents

Deno's **permission system** gives you a useful foundation for capability-based agents.

An agent can be granted:

```text
read filesystem
write specific locations
network access
environment access
subprocess execution
FFI
```

instead of treating your entire desktop process as omnipotent. Deno's migration/runtime docs explicitly emphasize its secure-by-default permission system. [Deno](https://docs.deno.com/runtime/migrate/?utm_source=chatgpt.com)

Then you have **Deno Sandbox** for executing potentially untrusted code.

Then **celld** gives you the durable-actor model.

Then **Claw Patrol** addresses controlled access from agents into infrastructure.

That gives us a rather compelling conceptual stack:

```text
                    ACRYL
                      │
                Deno Desktop
                      │
                system WebView
                      │
              ┌───────┴────────┐
              │                │
           Deno app          Agent
              │                │
              │         ┌──────┴──────┐
              │         │             │
              │      Sandbox       Permissions
              │         │
              │     generated code
              │
              ├─────────────┐
              │             │
            celld       Claw Patrol
              │             │
       durable agents    protected
       / project state   infrastructure
```

That is much closer to an **agentic operating environment** than an Electron replacement.

---

# But there is one caveat I would keep front-and-center

The uploaded comparison itself reaches essentially the same conclusion: Deno is already useful, but **Deno Desktop is still experimental** and not yet as feature-rich as mature frameworks. The second benchmark also encountered actual desktop issues/crashes, including behavior around hidden windows. Deno_ElectronBun_Tauri_Review Deno_ElectronBun_Tauri_Review

Deno's own 2.9 announcement likewise explicitly labels `deno desktop` **experimental**. [Deno](https://deno.com/blog/v2.9?utm_source=chatgpt.com)

So I'd separate:

```text
Deno runtime/ecosystem
        ↓
       🟢 very serious

Deno Desktop
        ↓
       🟡 young/experimental
```

That's a much better situation than:

```text
Gelectron
        ↓
almost entire platform is young
```

---

# For ACRYL, I would now investigate this architecture

```text
                       ACRYL
                         │
              ┌──────────┴──────────┐
              │                     │
         Desktop UI             Agent Runtime
              │                     │
         Deno Desktop               Deno
              │                     │
         system WebView       ┌──────┼────────┐
                              │      │        │
                           npm/JSR  ACP     MCP/A2A
                              │
                         subprocesses
                              │
                         permissions
                              │
                         Deno Sandbox
                              │
                            celld
                              │
                         infrastructure
                         via controls
```

And there is an especially important architectural possibility here:

### **Do not migrate ACRYL from Electron directly to Deno Desktop.**

Instead:

```text
ACRYL
  │
  ├── UI
  │
  ├── Core
  │
  ├── Agent runtime
  │
  ├── Cordis
  │
  └── Desktop adapter
        ├── Electron
        └── Deno Desktop
```

Then Deno Desktop becomes a **new shell/runtime target**, not a rewrite of ACRYL.

That means you can start experimenting immediately without putting the existing Electron application at risk.

And yes: **after the additional evidence, I would put Deno ahead of Electrobun for the particular ACRYL direction you're describing**, because the surrounding runtime, Node compatibility, built-in tooling, security model, and emerging agent infrastructure all reinforce the desktop story rather than being unrelated features.



Yes. **Deno is much more interesting for ACRYL than I initially framed it**, because `deno desktop` is not an external Electron-like package bolted onto Deno. It is becoming part of the Deno runtime/toolchain itself, and the surrounding ecosystem contains several pieces that map unusually well to agentic development.

## 1. How `deno desktop` is actually structured

It is **not an npm library such as `@deno/desktop`**.

Starting with **Deno 2.9**, `deno desktop` is a **built-in Deno CLI command**, and `Deno.BrowserWindow` / desktop APIs are part of Deno's runtime API surface. Deno's runtime source even initializes the desktop extension (`ops::desktop::deno_desktop::init()`). [Deno](https://docs.deno.com/runtime/desktop/?utm_source=chatgpt.com)

So conceptually:

```text
                         DENO 2.9+
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
     deno run            deno compile        deno desktop
        │                    │                    │
        │                    │              desktop runtime
        │                    │                    │
        └────────────────────┴────────────────────┘
                             │
                        Deno runtime
                    V8 + Node compatibility
                    permissions + tooling
                    TS + npm + JSR
                             │
                      Deno.BrowserWindow
                             │
                           Laufey
                             │
              ┌──────────────┼──────────────┐
              │              │              │
           WebView           CEF          Raw/winit
           system        Chromium       no web engine
```

### The critical distinction

The **desktop API is part of Deno**.

The **rendering backend is not simply embedded into the Deno executable**.

Deno downloads/version-pins a separate backend called **Laufey**, and `deno desktop` packages the appropriate backend with the application. The default backend is **system WebView**; CEF is an optional Chromium backend. [Deno](https://docs.deno.com/runtime/desktop/backends/?utm_source=chatgpt.com)

And Laufey itself is a serious separate project:

- CEF backend
- system WebView backend
- Winit/raw backend
- C ABI separating backend from runtime
- currently about **170 commits / 43 stars / 16 forks**. [GitHub](https://github.com/littledivy/laufey?utm_source=chatgpt.com)

This is worth understanding because the architecture is:

```text
Deno runtime
      │
      │ C ABI
      ▼
   Laufey
      │
      ├── WebKit/WKWebView
      ├── WebView2
      ├── WebKitGTK
      └── CEF
```

That is much cleaner than a one-off desktop wrapper.

---

# 2. Is `deno desktop` part of the default Deno runtime?

**Yes, at the implementation level.**

But don't interpret that as:

> every ordinary `deno run` process now contains an active desktop windowing subsystem.

The desktop functionality is compiled into the Deno runtime and exposed through the desktop execution path. The `Deno.BrowserWindow` API is a runtime API, while `deno desktop` is the command that builds/runs the specialized desktop application. Deno's source initializes `ops::desktop` alongside its other core runtime extensions. [GitHub](https://github.com/denoland/deno/blob/main/runtime/web_worker.rs?utm_source=chatgpt.com)

So this is closer to:

```text
Node:
   node + Electron package
         ↓

Deno:
   deno
    ├── runtime
    ├── compiler
    ├── package manager
    ├── Node compat
    ├── permissions
    ├── desktop
    └── ...
```

rather than:

```text
npm install @deno/desktop
```

That's a meaningful architectural advantage.

---

# 3. What actually gets shipped?

With the default:

```json
{
  "desktop": {
    "backend": "webview"
  }
}
```

you are essentially shipping:

```text
ACRYL application
      +
Deno runtime
      +
Laufey WebView backend
      +
your web assets/code
```

The **browser engine itself comes from the operating system**:

```text
macOS     → WKWebView
Windows   → WebView2
Linux     → WebKitGTK
```

So you don't carry a Chromium copy.

Deno also offers:

```text
backend: "cef"
```

where you intentionally ship Chromium/CEF, and:

```text
backend: "raw"
```

where there is no browser engine and the native window can be driven with WebGPU. [Deno](https://docs.deno.com/runtime/desktop/backends/?utm_source=chatgpt.com)

That three-backend design is unusually useful:

```text
              Deno Desktop
                    │
       ┌────────────┼─────────────┐
       │            │             │
    WebView         CEF          Raw
   lightweight    Chromium      native/GPU
```

---

# 4. The most impressive part for Electron migration

Deno isn't just saying "we support JavaScript."

It has made **Node migration a first-class objective**.

Deno 2.9 can:

- read existing `package.json`
- read npm/pnpm/yarn/Bun lockfiles
- create `node_modules`
- preserve resolved versions
- execute existing package scripts
- provide a `node` shim for tools that literally spawn `node`
- support Node built-ins
- support Node-API native addons. [Deno](https://deno.com/blog/v2.9?utm_source=chatgpt.com)

The official documentation currently says:

> Most Node.js code runs in Deno without modification.

and documents support for `node:` modules, npm packages, Node globals and Node-API addons. [Deno](https://docs.deno.com/runtime/fundamentals/node/?utm_source=chatgpt.com)

That is a **much stronger compatibility story than Gelectron**.

Obviously, Electron APIs are another matter. Deno doesn't reproduce Electron wholesale. Instead, it gives you `Deno.BrowserWindow` + bindings.

---

# 5. Electron IPC → Deno Desktop bindings

This is surprisingly elegant.

Electron:

```ts
// main
ipcMain.handle("readSettings", async () => {
  ...
});

// renderer
const value = await ipcRenderer.invoke("readSettings");
```

Deno:

```ts
const win = new Deno.BrowserWindow();

win.bind("readSettings", async () => {
  ...
});
```

Renderer:

```ts
const value = await bindings.readSettings();
```

Deno explicitly documents this as the migration pattern. `contextBridge.exposeInMainWorld()` is unnecessary because `bindings` is exposed by the desktop runtime. [Deno](https://docs.deno.com/runtime/desktop/bindings/?utm_source=chatgpt.com)

And the bindings are **typed**, using a shared TypeScript declaration.

That's potentially very nice for ACRYL:

```text
ACRYL UI
   │
   │ typed bindings
   ▼
Deno runtime
   │
   ├── filesystem
   ├── subprocesses
   ├── Git
   ├── agent orchestration
   ├── ACP
   ├── MCP
   └── native integrations
```

---

# 6. Another clever choice: the UI is just a local web application

Deno Desktop uses:

```ts
Deno.serve(...)
```

and the WebView navigates to a local loopback server. Deno chooses an unused local port and exposes it internally via `DENO_SERVE_ADDRESS`. [Deno](https://docs.deno.com/runtime/desktop/serving/?utm_source=chatgpt.com)

So:

```text
Deno process
   │
 Deno.serve()
   │
127.0.0.1:<generated-port>
   │
   ▼
WebView
```

This means the desktop application is very close to the normal Deno web application model.

And `deno desktop` can automatically recognize:

- Next.js
- Astro
- Fresh
- Remix
- Nuxt
- SvelteKit
- SolidStart
- TanStack Start
- Vite SSR

and more. [Deno](https://deno.com/blog/v2.9?utm_source=chatgpt.com)

That's quite different from Electron's world where you build the desktop shell around the web application.

---

# 7. Deno gives ACRYL a very useful security model

This is one of the biggest reasons I'd look seriously at Deno for an **agentic-first** platform.

Deno has explicit permissions:

```text
--allow-read
--allow-write
--allow-net
--allow-env
--allow-run
--allow-ffi
--allow-sys
...
```

and subprocess execution requires explicit permission. [Deno](https://docs.deno.com/runtime/reference/permissions/?utm_source=chatgpt.com)

That can map naturally to an agent capability model:

```text
Agent
  │
  ├── filesystem → allow-read / allow-write
  ├── network    → allow-net
  ├── shell      → allow-run
  ├── native     → allow-ffi
  └── secrets    → controlled env access
```

Electron generally doesn't give you this kind of runtime capability system.

For ACRYL, that's potentially much more important than the desktop UI itself.

---

# 8. Deno Sandbox is VERY relevant to ACRYL

This was another thing I would put high on your list.

Deno introduced **Deno Sandbox specifically for running untrusted code**, including **LLM-generated code**. Deno's own announcement describes the problem as agents/users generating code that can immediately execute and access credentials/network resources. [Deno](https://deno.com/blog/introducing-deno-sandbox?utm_source=chatgpt.com)

It uses **Linux microVMs** and gives you programmatic sandbox creation from TypeScript:

```ts
import { Sandbox } from "@deno/sandbox";

await using sandbox = await Sandbox.create();
```

Current documented limits include up to **4 GB memory**, **2 vCPU**, **10 GB ephemeral disk**, configurable lifetime up to 30 minutes, with 5 concurrent sandboxes/org during the prerelease phase. [Deno](https://docs.deno.com/sandbox/?utm_source=chatgpt.com)

For ACRYL:

```text
                    ACRYL
                      │
             Coding / Planning Agent
                      │
                      ▼
               Deno Sandbox
                      │
       ┌──────────────┼──────────────┐
       │              │              │
      code           tests          tools
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                  result
```

That is directly aligned with an **AI software factory**.

---

# 9. And then there is `celld`

This one is even more interesting conceptually.

`celld` is:

> **self-hosted, distributed Durable Objects**

It is an open-source daemon from the Deno organization that runs the **Cloudflare Workers programming model on your own machines**. It includes:

```text
Workers
Durable Objects
KV
Queues
D1
R2
Workflows
Cron Triggers
Static assets
```

and more. [GitHub](https://github.com/denoland/celld/blob/main/README.md?utm_source=chatgpt.com)

The key abstraction is:

```text
Cell = named server + private SQLite DB
```

A cell can:

- serve HTTP
- maintain WebSockets
- hold persistent state
- run alarms
- make outbound connections

and cells are intended to represent things such as:

> a user, document, chat room, **or AI agent**. [GitHub](https://github.com/denoland/celld/blob/main/docs/README.md?utm_source=chatgpt.com)

That last use case is extraordinarily relevant to ACRYL.

---

# 10. celld architecture

Think:

```text
                 CELLD FLEET

       Node A                       Node B
    ┌─────────────┐             ┌─────────────┐
    │    celld    │             │    celld    │
    │             │             │             │
    │ Agent A     │             │ Agent C     │
    │ SQLite      │             │ SQLite      │
    │             │             │             │
    │ Agent B     │             │ Agent D     │
    │ SQLite      │             │ SQLite      │
    └──────┬──────┘             └──────┬──────┘
           │                           │
           └────────────┬──────────────┘
                        │
                  S3 / GCS / Azure
                  durable state
```

Nodes share a bucket.

Ownership of a cell moves between nodes.

The bucket stores:

- deployments
- state
- ownership information

and the cell can be recovered on another node. The design specifically avoids requiring a separate consensus or serving-control-plane service. [GitHub](https://github.com/denoland/celld/blob/main/README.md?utm_source=chatgpt.com)

That's a pretty interesting actor model for agents.

---

# 11. I can see a very natural ACRYL mapping

Instead of thinking:

```text
ACRYL
  └── agent
```

think:

```text
ACRYL
  │
  ├── Project Cell
  │
  ├── Planner Cell
  │
  ├── Coder Cell
  │
  ├── Reviewer Cell
  │
  ├── Build Cell
  │
  ├── Test Cell
  │
  └── Deployment Cell
```

Each cell has:

```text
identity
state
SQLite
HTTP
WebSocket
alarms
```

So an agent becomes closer to a **durable actor** than a stateless LLM call.

For example:

```text
                Project #482
                     │
              ┌──────┼──────┐
              │      │      │
           Planner  Coder  Reviewer
             Cell    Cell    Cell
               │       │       │
             state   state    state
               │       │       │
             SQLite  SQLite   SQLite
```

That is an excellent conceptual fit for multi-agent systems.

### But important caveat

`celld` is **not simply "Deno Server."**

It implements the **Cloudflare Workers/Durable Objects model**, and your code has to fit that model. It is also explicitly **alpha software** and currently carries security limitations for hostile multi-tenancy. [GitHub](https://github.com/denoland/celld/security?utm_source=chatgpt.com)

So:

```text
Deno Desktop → desktop runtime
celld        → distributed stateful actor runtime
```

They solve different problems.

---

# 12. Another Deno project that is almost tailor-made for ACRYL: Claw Patrol

This is worth putting on the architecture board.

Deno created **Claw Patrol**, an open-source firewall for AI agents. It sits **between an agent and production systems** and can inspect protocols such as:

```text
HTTP
Postgres / SQL
Kubernetes
ClickHouse
```

and apply HCL policies such as:

```text
deny destructive SQL
require human approval
block access to secrets
```

It can run as:

```text
agent
  ↓
clawpatrol run
  ↓
gateway
  ↓
production
```

and it can keep actual credentials away from the agent process. [GitHub](https://github.com/denoland/clawpatrol?utm_source=chatgpt.com)

This is highly relevant to an ACRYL architecture where agents can eventually operate:

```text
GitHub
AWS
GCP
Kubernetes
databases
servers
CI/CD
```

You can think of:

```text
ACP / MCP / A2A
       ↓
    Agent
       ↓
 Claw Patrol
       ↓
  privileged systems
```

rather than giving the agent unrestricted access.

Claw Patrol is also alpha, so again: **interesting building block, not yet something I'd blindly put in the critical path.** [Deno](https://deno.com/blog/clawpatrol?utm_source=chatgpt.com)

---

# 13. Deno's ecosystem is starting to look like a complete agent platform

This is the part I find most relevant to ACRYL.

```text
                    ACRYL
                      │
       ┌──────────────┼────────────────┐
       │              │                │
   DESKTOP          AGENTS          BACKEND
       │              │                │
       ▼              ▼                ▼
Deno Desktop      Deno runtime       celld
       │              │                │
system WebView   permissions        Durable
       │              │              Objects
       │              │                │
       │         Deno Sandbox          │
       │              │                │
       │         untrusted code        │
       │              │                │
       └──────────────┼────────────────┘
                      │
                 Claw Patrol
                      │
                external systems
```

And underneath all of that:

```text
Deno
├── TypeScript
├── npm
├── Node compatibility
├── JSR
├── compiler
├── formatter
├── linter
├── test runner
├── tasks
├── workspaces
├── permissions
├── subprocesses
├── FFI
├── Web Workers
└── desktop
```

Deno's homepage currently describes these tooling components as built into the runtime/toolchain rather than requiring the typical Node collection of separate tools. [Deno](https://deno.com/?utm_source=chatgpt.com)

---

# 14. JSR is also relevant to Cordis

This deserves attention because of your **Cordis plugin** architecture.

JSR is not merely another package registry.

It's designed specifically for JavaScript/TypeScript and works across:

```text
Deno
Node
Bun
browsers
```

while retaining npm compatibility. [JSR](https://jsr.io/docs/introduction?utm_source=chatgpt.com)

It also provides **publish provenance through GitHub Actions using SLSA/Sigstore**. [JSR](https://jsr.io/docs/trust?utm_source=chatgpt.com)

And Deno can consume JSR natively:

```ts
import { something } from "jsr:@acryl/plugin";
```

while Node/npm tooling can consume the same package through JSR's npm compatibility registry. [JSR](https://jsr.io/docs/npm-compatibility?utm_source=chatgpt.com)

That suggests an interesting future for Cordis:

```text
                 Cordis Registry
                       │
                 JSR packages
                       │
          ┌────────────┼────────────┐
          │            │            │
        Deno          Node         Bun
          │            │            │
       ACRYL         legacy       other
```

You could potentially make **Cordis plugins portable across the runtimes**, rather than defining the plugin ecosystem around npm alone.

---

# 15. One important warning about Deno Desktop

I would **not migrate ACRYL to Deno Desktop tomorrow**.

The desktop subsystem is explicitly marked **experimental in Deno 2.9**, and the GitHub issue tracker shows real problems in the first months of its existence:

- Windows WebView startup failures
- Linux glibc/libstdc++ compatibility issues
- non-ASCII Windows paths breaking bundled apps
- WebView DevTools limitations
- missing page-load/init-script facilities. [GitHub](https://github.com/denoland/deno/issues/36515?utm_source=chatgpt.com)

That's normal for a subsystem introduced in 2.9.

But the critical difference from Gelectron is:

```text
Gelectron
    ↓
tiny project
    ↓
compatibility layer is the project

Deno Desktop
    ↓
experimental subsystem
    ↓
inside a large, established runtime
    ↓
backed by Deno + Laufey
```

That is a completely different risk profile.

---

# 16. My revised view of the options for ACRYL

After looking deeper at Deno, I would frame the landscape like this:

### Electron

```text
excellent compatibility
excellent Chromium consistency
heavy
```

### Tauri

```text
excellent mature native shell
system WebView
Rust boundary
Node sidecar possible
```

### Electrobun

```text
TypeScript/Bun-oriented
system WebView
native desktop primitives
very interesting for new architecture
```

### Deno Desktop

```text
TypeScript/Deno-oriented
system WebView
Node compatibility
desktop APIs built into Deno
framework integration
permissions
compiler
toolchain
Sandbox ecosystem
```

And **Deno has the most interesting surrounding ecosystem for an agentic platform**:

```text
Desktop
   +
Sandbox
   +
celld
   +
Claw Patrol
   +
JSR
   +
Node compatibility
   +
permissions
   +
compiler
   +
TypeScript
```

That combination is much more strategically relevant to **ACRYL** than simply finding an Electron replacement.

---

## One especially important discovery: **Laufey itself**

I would put this project into your ACRYL research list:

**Deno Desktop → Laufey**

because Laufey is the **native WebView abstraction underneath Deno Desktop**, with an explicit backend/runtime split and a C ABI. It isn't tied to Deno conceptually. [GitHub](https://github.com/littledivy/laufey?utm_source=chatgpt.com)

That opens a potentially powerful ACRYL architecture:

```text
                 ACRYL Desktop
                       │
                   Laufey/WEP
                       │
          ┌────────────┼─────────────┐
          │            │             │
       WebView         CEF          Raw
          │
    ┌─────┴──────┐
    │            │
   Deno       Electron?
    │
  Bun/TS
```

In other words, **don't only study Deno Desktop. Study the Deno ↔ Laufey boundary.**

That may be the reusable substrate that matters for ACRYL, while Deno itself could become the **agent/runtime/tooling layer**.

And **celld + Sandbox + Claw Patrol** are probably the three Deno projects I'd investigate next for the actual ACRYL agent architecture—not merely the desktop UI.