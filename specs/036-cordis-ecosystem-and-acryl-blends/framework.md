# ACRYL Blends, the framework: builder included

Status: the first version is built on branch `036-cordis-ecosystem-and-acryl-blends` (see "What exists"). This file is the product definition the code follows.

## What it is

A framework for building applications that are agentic from day one, the way Rails or Next.js are frameworks for web applications, or bolt.diy for generated
apps. The difference is where the builder sits. Rails gives you batteries included; ACRYL Blends gives you **batteries and the builder included**: every app
ships with an agent living inside it, who builds what the user asks for, from the inside, while the app runs.

The picture: a construction company puts up the structure (walls, floors, ceiling, wiring) and leaves. The owner does not get an empty shell they have to hire
builders for. They get the house with a builder already living in it, ready to build any room they ask for.

```text
acryl new stage-sound --name "Stage Sound"      the construction company: a complete, empty app, then it leaves
cd stage-sound && bin/acryl web                   the house, with the builder inside
"add a live EQ panel with presets per song"       the owner asks; the builder builds it as a plugin, live
git commit                                        it is the owner's repository, closed source if they want
```

Anything can grow from the same empty house: a music editor, live-stage sound processing for performers, a video editor, an accounting tool, a CRM. **ACRYL, the
agentic coding IDE, is one of them**: the Blend `acryl.ide`, grown from `acryl.blank` into a development environment. It is the flagship example of the framework,
not the framework.

## Conventions (convention over configuration)

| Rails | ACRYL Blends | |
| --- | --- | --- |
| `rails new app` | `acryl new app` | creates the app from the `acryl.blank` Blueprint, as its own git repository |
| `config/application.rb` | `blend.yaml` | what the app is: name, brand, the Blueprint it grew from. A Blends manifest (`blends.acryl.dev/v1alpha1`), so the Blends tooling and the runtime read one file |
| `app/` | `extensions/` | the app's own plugins, one folder each; the builder writes them, they load at every start, they are committed |
| generators | the builder | reads its routed docs and verified examples, writes a plugin, installs it live |
| `bin/rails server` | `bin/acryl web` (`desktop`, `cli`) | starts the app on its own port, with its own data and window |
| `log/`, `tmp/` | `.dsh/` | what the runtime keeps (sessions, settings, profile); git-ignored |
| (none) | `AGENTS.md` | the conventions, for the builder inside |

## It is the user's product

- Nothing a user of the app sees says ACRYL: the name, mark, colors, font, page and window title, favicon, Dock name and the assistant's own identity line come
  from `blend.yaml`.
- The app is its own git repository from the first second; the framework makes no commit and pushes nothing.
- The license of the app is the owner's choice, closed source and commercial included. The framework and DeepSeek Harness are MIT: keep their notices with any
  copy of the framework the app distributes (a carried `runtime/`).
- An app can carry its own runtime (`acryl new --runtime <extracted acryl-web archive>`) and then starts with nothing of the framework but Node.
- Many apps run on one machine without touching each other: each app folder is its own home, with its own port, Electron user data, running claim and project
  scope (`blank-canvas-blend.md`, "Many instances").

## Self-containment: many apps on one machine

A user works on several apps at once (a music editor, a social-media content machine, a UX wireframe tool) while also running ACRYL itself. Each app is a
**bulkhead** (Release It!): nothing it does reaches another. The design, its patterns (Bulkheads, Abstract Factory over a hidden Singleton, a deep module,
the composition root, Pessimistic Offline Lock, Registry), the rules for contributors and the incident it came from are in
`docs/acryl/APP-INSTANCES-AND-BULKHEADS.md`. In short: an app's whole resource family (home, engine home, port, Electron user data, run lock, project scope) is
one `AppInstance`, chosen once at startup by one selector and passed inward; plugins read it from the `appInstance` service; a test forbids looking it up
anywhere else, and another boots two apps at once and checks they share nothing.

## Run modes: shared in development, self-contained when shipped

Decided 2026-09-27. Like Rails (gems shared on the machine, bundled for deployment) and Next.js (`next dev`, then `next build` standalone):

| Mode | What it is | Sharing |
| --- | --- | --- |
| **Attached** (develop, run in-house) | app folders run by one installed ACRYL runtime (`bin/acryl`) | the runtime on disk is shared; every app is its own process and bulkhead (Docker's model: one engine binary, many containers) |
| **Standalone** (ship a product) | `acryl package` bundles the runtime and only the plugins the app's `blend.yaml` names into its own branded Electron app or Web server | none; each product carries its own runtime, as every Electron app on the market does (VS Code, Slack, Obsidian). The saving is that a product contains only its own plugins |

**One process per app, no exceptions.** Electron cannot share one runtime between independently built apps, and a shared process would give up isolation (shared
fate on a crash, colliding row ids, one home, port and window) for a memory saving that is small next to an app's own sessions and plugin state: there is a
risk case and no efficiency case. A multi-Blend-in-one-process mode, if ever built, is its own named, opt-in feature with its own threat model (who can see
whose data, what a crash takes down, how row ids are namespaced), not something that follows from Loader rows being able to coexist.

Not the same claim: ACRYL's own multi-worktree workspace (many tabs, terminals and agents in one Desktop process) is one app working on several of its operator's
tasks under one trust boundary; there is no "which app is this" question in it.

The lightest distribution for a product that does not need a native window is the Web surface.

## The three repositories

Decided 2026-09-27 (`repositories.md`): **acryl** is the one monorepo for the engine, every lifecycle verb (new, ps, stop, rm, snapshot, apply, push, pull,
package) and the Blend format package `blends-core`: one team, one codebase. **acrylblends.github.io** is the registry and catalog only: content from many
parties on its own schedule, a real trust boundary, so it stays a separate repository gated by reviewed pull requests. **acryldev/blends** is archived once the
move lands.

## What exists

`acryl new` (CLI), the app layout above, `blend.yaml` booted by the runtime on Web, CLI and Desktop, per-app isolation, a carried runtime, `acryl.blank` and
`acryl.ide`, the builder's docs telling it to build into the app's `extensions/`, `/blend snapshot|verify|apply|ledger`, and the organizer example grown from blank.

## Next

- `acryl new` in the published CLI (today it needs a framework checkout for the launcher).
- `/blend snapshot` inside an app writes into the app folder itself, so the app repository is the Blend (one shape, not three).
- A catalog of starter Blueprints by category, served from `acrylblends.github.io`; `acryl new --from <catalog id>`.
- The first-launch notice of the harness and the terminal banner under the app's brand; the Electron window icon.
