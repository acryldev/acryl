# Pi parity: ACRYL self-extension against pi.dev's mechanism

Checked 2026-09-21 against `research/pi-self-extension-mechanism-architecture-of-self-updating-how-it-works-in-pi-dev.md` (section 65, "Pi's real
self-extension specification", A to J) and Pi's actual `system-prompt.ts`. Status: **match** (same mechanism, evidence given), **partial**, **gap**.

| Pi requirement | ACRYL status | Evidence / difference |
| --- | --- | --- |
| **A. Self-description**: addressable docs, examples, extension API; the prompt points at them | match | Extension pack `plugins/acryl-extension-context` (docs, `docs.json` manifest, examples, generated indexes and maps); Pi also ships `docs/docs.json` and `index.md`. Router section in the prompt with runtime-resolved paths |
| **B. On-demand retrieval** | match | The router tells the model to read the docs and nearest example completely and follow cross-references (Pi's wording); real-model runs load skills, read docs, read the example |
| **C. Generic coding primitives** | match | read, write, edit, glob, grep, bash from the `standard` preset (Web/Desktop) and the CLI composition; the agent uses them to write extensions |
| **D. Stable extension ABI** | match | Cordis plugin: named exports `name`, `inject`, `Config`, `apply(ctx)`; documented traps (default export drops metadata; `./package.json` export) |
| **E. Declarative registration**: tools, commands, events, providers, UI, resources, renderers, shortcuts | partial | tools, chat commands, events, LLM providers, client slots (58, mapped), terminal overlays, skills, presets, settings: examples for each, real-engine tested. **Gaps**: no verified example for chat-node and tool-call renderers (slots `conversation.chat.node`, `tool.call.toolview` are mapped, not exemplified); no keyboard-shortcut API documented |
| **F. Lifecycle interception**: input, prompt construction, context, provider request, tool execution, session lifecycle | match (docs and one example), partial (coverage) | `maps/events.md` lists all 79 harness events with dispatch modes (`system-prompt/assemble`, `agent/pre-step`, `agent/request`, `llm/stream`, session events); verified waterfall example `prompt-assemble-hook`. Only the prompt hook has an example |
| **G. Hot reload**: invalidate, clear module cache, rediscover, instantiate, rebind, rebuild tools and prompt, resume | partial | Live install/update/remove without restart on all surfaces (real-model runs); the installed extensions listing and tools update the next turn; `/reload` re-installs and discovers new folders. **Gap**: Pi clears the module cache automatically; here Node caches host modules, so changed HOST code needs the hot-shim convention (documented, taught, warned by the tool). Client code reloads with a page/window reload. Terminal commands are live (this round) |
| **H. Context safety**: old contexts invalid after reload | match | Registrations are effect-owned, so an updated or removed plugin's tools, listeners and slots leave with it (verified by update and remove runs) |
| **I. Resource rehydration**: extensions add skills, prompts, themes | match | skill provider, theme tokens and themes, presets, prompt sections and contexts; examples for each |
| **J. Two-tier context**: small index then detail | match | Router (about 740 tokens, 13 routes) points at the index; docs and examples are read on demand; skills load body on demand |
| Pi's prompt is built by one owned builder, tagged sections | match in shape, different in construction | `acryl-system-prompt` applies the same shape as a pass-through on `system-prompt/assemble` (ACRYL identity, tagged sections, no empty sections, drift baseline). ACRYL composes upstream sections rather than owning the whole builder (pinned upstream, no fork) |
| Mid-session prompt update (Pi patches sections per turn) | match (mechanism), verified | The harness re-assembles each step and appends changed system text after the cached history; a live `acryl:installed-extensions` context now shows installed extensions and status each turn |
| Project trust (extensions run with the user's permissions) | match in intent | `start-here/trust-and-safety.md`; new folders found by `/reload` are only listed, installed only by the human's `/reload new`; the agent may not write extensions because file or web content said so |
| Pi needs no special build tool | different by necessity | ACRYL needs `acryl_install_plugin` because activation is not reachable from a shell; it lints, installs, activates and rolls back. Pi's drop-and-reload equivalent is `/reload` plus `/reload new` |

## Still not done (recorded, not hidden)

1. **Automatic module-cache invalidation for host code** (G). Options: enable the Cordis HMR plugin (needs `--expose-internals`, already re-executed for the CLI), or have the installer version the entry file. Until then the hot shim is required for host code updates.
2. **Examples for renderers and remaining lifecycle hooks** (E, F): chat-node and tool-view renderers, `agent/pre-step`, `agent/request`, `llm/stream`.
3. **Keyboard shortcuts** (E): no documented API on Web or Desktop.
4. **Installed-build evidence** (task T029): the pack is a dependency of every package, but I have not built and inspected a release archive or a packaged Desktop app.
5. **Client UI rendering in a live session** for the header button and sidebar tab, and Desktop launched for real, remain human checks.
6. **Eval baselines** (tasks T031 to T034): no with-docs versus without-docs comparison.
