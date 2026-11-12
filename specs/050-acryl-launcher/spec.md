# Spec 050 - The ACRYL launcher: every step offered, in the terminal and on the desktop

Status (2026-11-12): design, for the owner's review. The design page is [`design/launcher.html`](design/launcher.html) (reviewed with
lavish-axi). Nothing is built yet. Tasks: [`tasks.md`](tasks.md).

## The owner's words (2026-11-12)

"2 additional simplification tools: acryl TUI mode where user interactively just is offered step by step interaction to choose what to do
instead of memorizing commands, using our already used in acryl CLI tui UI-tui libs that we use, to re-use them for Acryl TUI launcher that
makes all setup simple and step by step, like openclaw does it or hermes cli does it. Let's do same. Also we need to specify in 050 another
mode for launcher - a desktop app, also like in Hermes APP gui, that just shows same as in TUI whole process what to do, what to setup,
launch, create, install, pull, etc. as in TUI. Easy to setup, where our users just download this binary exe/deb/DMG and nothing more and
from single binary just install and use acryl as they need, or they run single npm command to invoke TUI mode and quickly create project
without memorizing commands or going to docs."

## Why

The talk at the Sentry office (2026-11-11) "looked complicated to the audience". Every path today starts with a command a person must
know: `npm create acrylblends@latest`, `npx acrylblends init`, `npm run dev`, `npm run desktop`, `npm run acryl -- plugin pull
github:<owner>/<repo>@<version>@sha256:<digest>`, `npx acrylblends upgrade`. 049 M13 shortens them (`acryl new my-app`); this spec removes
the need to know them at all.

## What

**One launcher, two faces, one list of things to do.**

1. **The things to do (journeys)** are data, written once: create an app, open or run an app, install a Blend from the registry, pull a
   plugin, share a plugin, set up a model, update, check this machine (preflight), open ACRYL Code. Each journey is a short list of steps
   (choose, type, confirm, run, done). Its last step always shows the one command that does the same thing, so a person learns the
   commands by using the launcher and never has to look them up.
2. **The terminal face** draws the journeys with the components the ACRYL CLI already uses: `@earendil-works/pi-tui` and `acryl-ui-tui`
   (Card, SelectField, RadioGroup, Input, SecretField, Progress, Alert). It opens with one command: `npx acryl`.
3. **The desktop face** draws the same journeys with `@acryl/ui`, which has the same component contract as `acryl-ui-tui`
   (`plugins/acryl-ui/contracts/components.json`, surfaces web, desktop and tui). It ships as one file per OS (DMG, EXE, DEB) that carries
   its own Node (Electron's): no Node, npm or terminal needed to create, install and run an app.
4. **Nothing new underneath.** Every step runs what exists: `create-acrylblends` / `acryl new`, the app's door (`plugin pull`, `plugin
   publish`), `acrylblends upgrade`, `acrylblends preflight`, the registry. The launcher is a guide over the commands, not a second
   implementation of them.

## What we take from OpenClaw and Hermes (checked 2026-11-12, docs only, not run)

- OpenClaw `openclaw onboard`: a quick start with few questions by default and a manual path for everything; run again, it offers keep,
  review or reset instead of overwriting; `--non-interactive` for scripts.
- Hermes: `hermes setup` walks through choosing a model provider; the Hermes desktop app shares the CLI's config, keys and sessions.
- Ours: the quick path is the default (Enter, Enter, Enter gives a running app in the frame); running it again finds the apps already made
  (they are in `~/.acryl/apps/`) and offers to open them; the terminal and the desktop read and write the same state, so an app made in one is
  listed in the other.

## Boundaries (the five books)

- Clean Architecture (the dependency rule): the journeys and their state are a runtime service (`launcher`), the two faces only draw it.
  Neither face holds a step, a rule or a command line. A third face (web, WebBoxes) is a third renderer, nothing else.
- APOSD (deep modules): one small interface for every face: `journeys()`, `start(id)`, `answer(step, value)`, `events` (progress, output,
  done with the equivalent command). The complexity (spawning, npm, registry, keys) stays behind it.
- DDD Distilled (ubiquitous language): the words on screen are the product's words: app, Blend, plugin, model, registry. Never "profile",
  "row" or "fiber".
- Pragmatic Programmer (DRY, orthogonality): one journey definition, two renderers; the command shown at the end comes from the same data
  that runs the step, so it cannot drift.
- Clean Code: each journey is a small named function of steps with a test that runs it without a terminal or a window.

## Cordis mini-design

1. **Capability and boundary**: `acryl-launcher` is a Cordis plugin that provides the `launcher` service (journeys, sessions, events). It
   is replaceable and can be switched off; the faces are consumers.
2. **Provides and consumes**: provides `launcher`; consumes `appInstance` (where apps live, `~/.acryl`), and runs existing commands as
   subprocesses; optional `ctx.get('registry')` for the Blend and plugin lists (offline: the journeys still work with a typed source).
3. **Effects and disposal**: each running step owns one subprocess inside one `ctx.effect()`; cancelling a journey or unloading the plugin
   kills it (the tree on Windows) and resolves the session as cancelled.
4. **Configuration and composition**: row id `acryl-launcher` (the package name); config: the registry source and the default starter.
5. **Events and durability**: progress and output are plain events; the only durable fact is the list of apps, which already lives in
   `~/.acryl/apps/<id>`; the launcher keeps no second list.
6. **Verification**: each journey runs headless against a scratch `ACRYL_HOME`; the TUI is driven by key presses in a pseudo-terminal; the
   desktop face by Playwright on the Electron window; both make the same app, file for file.

## Not in this spec

The web face (WebBoxes) and signing/notarization of the desktop file (049 M11 T005) are separate; this spec only requires that the desktop
file builds and runs unsigned on each OS.

## Open questions (on the design page, with controls)

- Q1. What `acryl` with no arguments opens in a terminal: the launcher (and `acryl code` the IDE's terminal client), or the IDE as today
  (and `acryl start` the launcher)?
- Q2. Before the workshop of 2026-11-20: the terminal face only, both, or neither?
- Q3. The desktop launcher: a new small app, or the first screen of the existing ACRYL Desktop app?
