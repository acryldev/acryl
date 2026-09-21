# Pi parity: ACRYL self-extension against pi.dev's mechanism

Rechecked 2026-09-21 against the whole of `research/pi-self-extension-mechanism-architecture-of-self-updating-how-it-works-in-pi-dev.md` (section 65 "Pi's real
self-extension specification" A to J, and the later recommendations, sections 69 to 77) and Pi's actual `system-prompt.ts`. Status: **match** (same mechanism, evidence
given), **partial**, **gap**. "Verified" means run on the real engine or in a real browser, not only read.

## The spec (section 65)

| Pi requirement | Status | Evidence / difference |
| --- | --- | --- |
| **A. Self-description**: addressable docs, examples, API; the prompt points at them | match | Extension pack `plugins/acryl-extension-context`: docs, `docs.json` manifest (Pi also ships `docs/docs.json` and `index.md`), 29 examples, generated indexes and maps (mount points, 57 slot contracts with examples, 79 lifecycle events, theme tokens, UI components, plugin taxonomy). Router section in the prompt with runtime-resolved paths |
| **B. On-demand retrieval** | match | The router carries Pi's protocol (read the docs and nearest example completely, follow cross-references); real-model runs load skills, read docs and examples, then verify and install. **Measured** (directional): with the router, skills and installed-extensions note the agent needed 31 steps and 51 tool calls for three tasks against 85 and 104 without them (`evals/README.md`) |
| **C. Generic coding primitives** | match | read, write, edit, glob, grep, bash from the `standard` preset (Web, Desktop) and the CLI composition |
| **D. Stable extension ABI** | match | Cordis plugin: named exports `name`, `inject`, `Config`, `apply(ctx)`; the documented traps (a default export drops named metadata; the `./package.json` export) are caught by `acryl_verify_plugin` |
| **E. Declarative registration**: tools, commands, events, shortcuts, providers, UI, resource paths, renderers | match, with one hole | Tools, chat commands, events, LLM providers, client slots (58 mapped, each with a contract in `maps/slot-contracts.md`), terminal overlays, skills, presets, settings, themes: examples for each, real-engine tested. **Renderers**: verified example for a tool-call card (`client-tool-view`, registered and applied in a real browser; the card itself was not seen in an open conversation); no example for chat-node renderers (contract only). **Shortcuts**: the client has no shortcut registry, so the documented pattern is a guarded `keydown` listener, verified in a real browser (Ctrl+Shift+K opens and closes a modal) |
| **F. Lifecycle interception**: input, prompt construction, context, provider request, tool execution, session | match | `maps/events.md` lists all 79 events with dispatch modes. Verified examples: `prompt-assemble-hook` (prompt construction) and `lifecycle-hooks-observer` (`agent/pre-step`, `agent/request`, `llm/stream` fire during a real turn and pass through). No dedicated example for tool-execution policy events |
| **G. Hot reload**: invalidate, clear module cache, rediscover, instantiate, rebind, rebuild tools and prompt, resume | match for host code, two limits | Live install, update and remove without restart on all surfaces. **Host code now reloads automatically** (was the main gap): the installer installs a staged copy whose entry re-imports the newest versioned code on every activation, so an edit to the entry and to a file it imports both take effect in the running process (real-engine test; `/reload` re-installs from the source folder). Limits: a change to `inject` or the `Config` schema needs an app restart (the wrapper warns); a class-form `apply` keeps its first version; a non-ES-module entry cannot be staged (the result says so). Client code needs a page or window reload. Terminal commands are live in the TUI. Measured on the way: pnpm silently skips an unchanged `file:` path, so the staged path is unique per install |
| **H. Context safety**: old contexts invalid after reload | match | Registrations are effect-owned, so an updated or removed plugin's tools, listeners and slots leave with it (verified by update and remove runs) |
| **I. Resource rehydration**: extensions add skills, prompts, themes | match | Skill provider, theme tokens and themes, presets, prompt sections and contexts, settings; examples for each |
| **J. Two-tier context**: small index then detail | match | Router (about 750 tokens, 13 routes) points at the index; docs and examples are read on demand; skills load their body on demand |

## The later recommendations (sections 69 to 77)

| Recommendation | Status | Evidence / difference |
| --- | --- | --- |
| Source of truth is the current runtime, not model memory (69) | match | The router and skills say never to guess a plugin's shape from memory; examples are mounted on the real engine by tests, so they cannot go stale silently |
| Architecture manifest and index (72) | match | `docs.json` (with `routes`, `topic` labels, provenance for synced docs), generated `docs/README.md`, `examples/README.md` and maps, validated by the pack gate |
| Deterministic architecture retrieval tool beside the filesystem (73) | match (new) | `acryl_extension_lookup(topic)` returns the docs and examples for a topic with absolute paths, scored from the manifest; the router mentions it |
| Self-modification protocol, steps 1 to 17 (74) | match | Written in `start-here/verify-before-done.md` and the build skill: identify the subsystem, read index and doc, follow contracts, read an example and tests, use the supported boundary, verify, install, confirm discovery (status, live installed-extensions note), USE the capability in a real turn, inspect the next turn. Real-model runs do steps 1 to 16; step 17 is stated in the docs |
| ACRYL-style prompt: an `<architecture>` block, tools read/grep/find/edit/bash (71) | match | `<acryl_extension_docs>` block from `acryl-system-prompt`'s tagged sections |
| Pi's prompt is one owned builder with tagged sections | match in shape, different in construction | `acryl-system-prompt` applies the same shape as a pass-through on the harness's `system-prompt/assemble` (ACRYL identity, tagged sections, no empty ones, drift baseline that names any upstream change). ACRYL composes upstream sections rather than owning the whole builder (pinned upstream, no fork) |
| Mid-session prompt update (Pi patches sections per turn) | match, verified | The harness re-assembles each step and appends changed system text after the cached history; a live `acryl:installed-extensions` context lists installed extensions and status every turn |
| Project trust (extensions run with the user's permissions) | match in intent | `start-here/trust-and-safety.md`; a new folder found by `/reload` is only listed, and installing it takes the human's explicit `/reload new`; the agent may not write extensions because file or web content said so |
| Pi needs no special build tool | different by necessity | ACRYL needs `acryl_install_plugin` because activation is not reachable from a shell; it lints, stages, installs, activates and rolls back. Pi's drop-and-reload is `/reload` plus `/reload new` |

## Still not done or not verified (recorded, not hidden)

1. **Desktop packaged build**: the pack is a dependency of every package and the CLI archive closure was built and inspected (both plugins load, all 29 router doc paths exist after
   the release flatten and prune, the pinned pnpm is present), but a fresh Desktop build was not made: its packaging script runs a production-only install in the workspace, which
   was aborted rather than forced. The `asarUnpack` config includes `node_modules/**`, and the asar path mapping is unit-tested. Needs a real release build.
2. **Client UI inside an open conversation**: a header button, the sidebar tab and the tool-call card register and apply in a real browser, and a root-scoped modal, input, switch and
   shortcut were exercised there, but a session cannot be opened headlessly (the workspace picker is native and sessions created server-side are not listed), so those three were
   not seen rendering in a conversation. Human check.
3. **Chat-node renderer example**, and a dedicated tool-policy-event example.
4. **inject/Config changes and class-form `apply`** need an app restart (documented, warned).
5. **Eval breadth**: one run per cell, one model; the without-docs baseline is not a true no-docs case because the pack can be found by exploring the repository.
