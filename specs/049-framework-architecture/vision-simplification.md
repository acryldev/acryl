# The simplification vision: one kernel, everything a plugin, the app decides its composition

Recorded 2026-11-11 from the owner's request ("describe to me the whole vision of simplification ... what links were and how this all
interrelates ... keep the style of minimalism, composability, modularity of the pi project ... the best engineering principles of the
books I shared"). Sources: the v2 critique chat (`docs-acryl-project-RnD-ideas-discussions-questions/acrylblends_strategic_direction_steering/v2_Critique_of_ACRYL_and_new_Thinking_on_Architecture_...md`,
the last third), [acryl-namespace.md](./acryl-namespace.md), [app-storage.md](./app-storage.md), the ADR and the steering discussion in the same
folder, and `specs/028-harness-engine-swap/research-pi-spike.md` for how pi is built. Facts marked "measured" were checked on 2026-11-11.

## 1. The one idea

A very small kernel (Cordis: Context, Loader, lifecycle, dependency injection). Everything else is a Cordis plugin. An app is nothing but a
list of plugins (`blend.yaml` rows) plus the plugins it owns (`plugins/`) plus its data. An agent is one more set of plugins, never the
foundation. So the same framework builds an app with no AI at all, an app that an outside agent (Claude Code, Codex) drives, and an app
with an agent built in.

## 2. The layers (a dependency may only point down)

```
  products        ACRYL IDE, the Blends frame (editor), your own app
                    |  uses
  agent pack      agent loop, models, tools, memory, builder, drivers, chat panel   (optional plugins)
                    |  uses
  @acryl/blends   blend.yaml, lock, resolver, installer, create and CLI, the frame
                    |  uses
  @acryl/core     agent-free runtime: router, node server, page, AppInstance, manifest, extensions (live plugin lifecycle), save, sharing
                    |  uses
  Cordis          @deepseek-ai/cordis: Context, Loader, lifecycle, injection
```

- `@acryl/core` knows nothing about agents: no agent types, no LLM keys, no chat UI, no DSH agent package. A test enforces it (T033).
- The Blend format (`@webboxes/blends-core`: parse, validate, resolve) is a different thing from the runtime core. The v2 chat warns that the
  word "core" must not mean both. It keeps its own name until `@acryl/core` exists, then it is named for what it is (the format).
- Measured: an app made with `--bare` is already this core. 7 direct dependencies, 17 packages, 32 MB, installs in about 2 seconds. Every plugin
  in its `plugins/` imports only `@deepseek-ai/cordis` and `schemastery`. The same app with the frame and agents is about 184 packages and 823 MB.

## 3. The two modes

| | Core mode | Full mode |
| --- | --- | --- |
| What runs | the app's plugins on the core | the same, plus the frame and the agent pack |
| Who builds and extends it | an agent or a person from outside, through the door (`acryl brief`, `plugin add`, `look`, `act`, `tool call`) and the instructions the app ships (`AGENTS.md`, `docs/framework/`) | the agent inside the app (chat, builder, tools) |
| Needs | Node, nothing else (no LLM key, no internet) | a model key |
| Same | the plugins, `blend.yaml`, the storage (section 5), the sharing path | |

One Blend can offer both as profiles (`core`, and `full` extends `core`; T037). An app installed in core mode can get the agent pack later
without being reinstalled, because the agent is an installable capability and not part of the product's identity (v2 chat, section 6).

## 4. How everything connects: one chain, one unit

```
 acryl new shop        ->  an app folder: source in git (blend.yaml, plugins/, src/)
 npm run dev / desktop ->  runs it, core or full; program = node_modules or the installed app
 agent or person adds  ->  plugins/<name>/ plus a row in blend.yaml, live, no restart
 share                 ->  the plugin as one packed copy (tarball plus its checksum) to: this machine, a git host, the public registry
 pull (anywhere)       ->  the same packed copy, checked, installed as a plugin, with its row
 compose               ->  Blends: a list of such plugins; the moderator pulls many into one app (the workshop's "frankenstein")
```

The unit that moves through every step is the plugin folder and its packed copy. There is no second format for sharing, saving or pulling.

- **Storage** (`app-storage.md`, the owner's rule: one short home, `~/.acryl`, never OS app-data folders). Three parts. Program is read-only
  (`node_modules`, or the installed app). Source is the app's `blend.yaml` and `plugins/` (the project folder in dev mode,
  `~/.acryl/apps/<id>/source/` for an installed app). Data is always `~/.acryl/apps/<id>/data/`. The id lives in the app's `.acryl/app.json`.
- **Registries**: plugins (cordisplugins.github.io: a public GitHub repository with the `cordis-plugin` topic and a release), Blends (the
  workshop registry, a pull-request flow), starters. npm carries only code under `@acryl/*`, never the registry (acryl-namespace D4).
- **Names**: `acryl` is the one command and forwards to the parts (`acryl new`, `plugin`, `blends`, `update`); `@acryl/core`, `@acryl/blends`,
  `@acryl/code`, `@acryl/blend-*`, `@acryl/plugin-*` are the parts (M13).

## 5. Decisions

- **2026-11-11, owner: `@acryl/core` is a dependency, not source copied into each app.** Today the core is vendored into every app
  (`plugins/acryl-router` alone is about 195 files) so that an agent can read it. As a dependency the app keeps only its own plugins, an update
  is one version change (`acryl update`), and the agent still reads the core from `node_modules`, so the package must ship its docs and types
  (`@acryl/core/docs`) and the app's `AGENTS.md` must point there. No code moves before the workshop (D8); the boundary test comes first.
- **Recommendation, not yet decided: the door is its own small package (`@acryl/door`) and stays in the blank app's rows, outside the kernel.**
  Core mode ("an agent drives the app from outside") needs it, and the v2 chat asks to keep agent-facing parts out of the minimal core.
  Both hold if the door is a plugin of its own that depends on the core and the core does not know it.

## 6. How this stays organized and does not grow into a mass

Each question below is one of the five books' rules turned into a check for a new thing. A change that cannot answer them does not go in.

- **Clean Architecture, the Dependency Rule.** Which layer is it in, and does it depend only downward? Frameworks, the database and the web are
  details at the edge, behind a service (`appInstance`, the db port). The core never imports the agent pack: the T033 test reads imports, dynamic
  imports and the packaged closure.
- **A Philosophy of Software Design, deep modules.** Does it hide a lot behind a small interface? `acrylRoot` and `home.ts` are the model: one
  function decides where an app's data lives, and eight places ask it. `acryl new shop` is the same idea for people: the long flag list is hidden
  behind one line. A module that only forwards work is shallow: the `acryl` launcher stays a name-to-part table and gets no logic.
- **Domain-Driven Design Distilled, bounded contexts and one language.** Which context does the word belong to: Blend format, runtime core, agent
  pack, registry, frame? One word per thing: "plugin" (never "extension" or "package"); "core" means the runtime only. The `@webboxes/blends-core`
  against `@acryl/core` clash is exactly what this rule exists for.
- **The Pragmatic Programmer, orthogonality, DRY and tracer bullets.** Does changing it force edits elsewhere (agent against core, storage
  against program, program against data)? Is the knowledge written once? Is there a thin end-to-end path that runs before more layers are
  added? The workshop cycle (create, add a plugin, share, pull, compose) is that tracer bullet, and it is proven before anything is built around it.
- **Clean Code, local reasoning and explicit intent.** Can a reader understand it without jumping across the repo? No flag piles, no hidden
  defaults, names that say what the thing is.
- **pi's shape (from our spike notes, `research-pi-spike.md`).** pi is a monorepo of small lockstep-versioned packages in layers: the LLM API
  (`pi-ai`), the raw agent loop that depends only on it (`pi-agent-core`), the harness that composes them (`pi-coding-agent`, with an SDK export), and
  rendering only in `pi-tui`; provider implementations are tree-shakeable subpath exports. One job per package, dependencies only downward, a
  thin composing top. That is the shape to keep here: kernel, core, blends, agent pack, products.

Mechanical guards, so that this is not a matter of taste: the T033 boundary test, `tests/bulkhead.spec.ts` (nobody else reads the home or the
environment), the `scripts/lib/bulkhead.test.mjs` allow-list in the framework repo, and a size budget for the core (measured 32 MB, 17 packages).
A new top-level concept has to replace or merge with an existing one.

## 7. Where it stands (2026-11-11)

Done: the agent-free core exists as the `--bare` app (measured above); the door answers in it; the storage is one home with three parts; the
short commands (`acryl new`, `plugin`, `blends`, `update`) forward to the existing parts; View source and a Share chooser exist on the Plugins card.
Not done: the `@acryl/core` package and the T033 test, the `profiles` field (T037), the core docs shipped inside the package, the installed-app
wiring (`~/.acryl/apps/<id>/source/`), the Registry tab, naming and publishing under `@acryl/*` (each publish needs the owner's explicit go).
