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
   plugin, share a plugin, set up a model, update, check this machine (preflight), open ACRYL Code. (First version: all but "set up a
   model", which has no command yet; it is T010.) Each journey is a short list of steps
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

## Decisions (owner, 2026-11-12, on the design page: "ok, looks good for now, let's build first version this way")

- D1 (was Q1). A bare `acryl` in a terminal opens the launcher; `acryl code` opens ACRYL Code (the IDE). Without a terminal (a script, a
  pipe) a bare `acryl` keeps opening the IDE as before, so nothing that scripts it breaks.
- D2 (was Q2). The terminal face ships before the workshop of 2026-11-20; the desktop face after it.
- D3 (was Q3). The desktop launcher is the first screen of the one ACRYL desktop app, not a second app.

## Packaging (decided while building, 2026-11-12)

- The terminal launcher is bundled at pack time into the `acryl` npm package as one file, `launcher.js` (about 250 KB: the journeys,
  `acryl-ui-tui` and the workspace's patched `pi-tui`, nothing to install). It is made by `apps/acryl-launcher-tui/scripts/bundle.mjs`, called
  by `scripts/publish-npm-cli.mjs`; the source tree keeps no generated copy.
- What the launcher chose runs through the same `acryl` (`launcherCommand` in `distribution/acryl-npm-launcher/forward.js`), so a journey and
  the typed command take one path.
- The `acryl` package still depends on the 454 MB per-OS IDE runtime (`acryl-cli-<os>-<cpu>`, an optional dependency), so `npx acryl` still
  downloads it before the launcher shows. Fetching that runtime only when `acryl code` is chosen, like `acryl web`, is T009; until it lands the
  launcher is light to run but not yet light to download.

## Where the code is

- `plugins/acryl-launcher`: the journeys (data), the session (the state machine every face walks), and the Node context (the apps in a folder,
  an app's own plugins, the registry's Blends). No dependencies.
- `apps/acryl-launcher-tui`: the terminal face (`view.js`, a pi-tui component driven by keys in tests; `run.js`, the real terminal).
- `plugins/acryl-ui-tui/scheme.js`: light or dark for a terminal, the CLI's rules in one place (T008 moves the CLI onto it).

The Cordis `launcher` service of the mini-design comes with the desktop face (T004): the terminal face runs inside the light `acryl` package,
which has no Cordis host, and uses the session directly. Both faces walk the same session, so the journeys stay written once.
