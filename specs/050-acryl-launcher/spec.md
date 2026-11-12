# Spec 050 - The ACRYL launcher: every step offered, in the terminal and on the desktop

Status (2026-11-12): terminal face built; the app-list design (`design/control-center.html`) answered by the owner (D6-D9). The design page is [`design/launcher.html`](design/launcher.html) (reviewed with
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

## Direction: the launcher as the local app store and control center (owner, 2026-11-12, after D5)

Owner's words: "this launcher can resolve the problem of separation of the application into the fixed part in /Applications/<APP NAME>
and variable part in .acryl where it's hard to make it easy launchable with default experience as users get used to with normal
non-self-updatable apps ... with launcher ACRYL it can become kind of a local App-store for all local apps built by acryl platform and
agents, ad-hoc use cases launchpad, launcher and maintainer, operating Control Center Dashboard".

What this means for the design (recorded, not yet designed in the lavish page):

- The fixed part (`/Applications/ACRYL.app`, the `acryl` command) is one stable thing a person opens as usual. Everything that changes
  (the apps people and agents make, their plugins, their updates) lives under `~/.acryl`, and the launcher is how a person sees and opens it.
- The launcher lists every local app made with ACRYL (where it is, its Blend, whether it runs, whether an update waits), opens one with one
  key or click, and offers its upkeep: update, check, share, remove.
- It becomes the control center: which apps run, on which address, with which agents; stop and start them.
- The terminal face and the desktop face both show it (D3: the desktop's first screen). Design first in `design/launcher.html`, then T011.

## Not in this spec

The web face (WebBoxes) and signing/notarization of the desktop file (049 M11 T005) are separate; this spec only requires that the desktop
file builds and runs unsigned on each OS.

## Decisions (owner, 2026-11-12, on the design page: "ok, looks good for now, let's build first version this way")

- D1 (was Q1). A bare `acryl` in a terminal opens the launcher; `acryl code` opens ACRYL Code (the IDE). Without a terminal (a script, a
  pipe) a bare `acryl` keeps opening the IDE as before, so nothing that scripts it breaks.
- D2 (was Q2). The terminal face ships before the workshop of 2026-11-20; the desktop face after it.
- D3 (was Q3). The desktop launcher is the first screen of the one ACRYL desktop app, not a second app.
- D4 (owner, 2026-11-12, later the same day). The workshop of 2026-11-20 teaches `acryl new`, not `acrylblends`. Owner: "This should be
  acryl new - but keep in mind our latest discussion how we simplify things" (049 M12: `acryl` is the entry point, `@acryl/blends` points
  to the acrylblends package, the IDE is the Blend `acryl.code`, 049 D9).
- D5 (owner, 2026-11-12). `acryl` is the one central tool for everything (making apps, launching, servicing), TUI and tool in one
  easy-to-remember name, the way `hermes` is for its platform. Owner's go for release 0.2.7 so `npx acryl` shows the launcher.

- D6 (owner, 2026-11-12, on `design/control-center.html`). The screen is called just "ACRYL": the desktop app ACRYL, which launches
  everything ACRYL can do. On acryl.dev it is presented like the install pages of Hermes and OpenClaw
  (hermes-agent.nousresearch.com/#install, openclaw.ai/install). Not "Control Center", not "ACRYL Home".
- D7. An app an agent makes joins the list only when the agent asks to keep it. The user first chooses where it lives (default a folder in
  the home folder, `~/ACRYL`); when it becomes part of the daily flow it can be moved to `/Applications/<name>`.
- D8. "+ New app" asks where each time and suggests `~/ACRYL` (a visible folder). The hidden `~/.acryl` keeps ACRYL's own records (the list
  `apps.json`, shared plugins, runtimes, logs), not the apps. The owner wrote "~/acryl or ~/ACRYL"; `~/ACRYL` is the suggestion until they
  say otherwise.
- D9. Both faces, the terminal list and the desktop screen, are built before the workshop of 2026-11-20 (owner: "we have more than a week").
  This supersedes D2 for the desktop face.

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

## Desktop face: the Cordis mini-design (T004, written 2026-11-12, not built yet)

1. **Capability and boundary.** One new package, `plugins/acryl-launcher-desktop`, with a Host half and a client half, because the desktop needs two things the light terminal package never had: a Host that can read the list and run a command, and a client plugin that claims the first screen. The journeys, the session and the list stay in `plugins/acryl-launcher` (written once); this package only draws and runs.
2. **Provides and consumes.** Host: consumes `router` and `routerHttp` (hard `inject`), provides routes under `/api/launcher` (`GET apps`, `GET blends`, `GET plugins?app=`, `GET exists?path=`, `POST run`, `GET run/<id>` for the output so far, `POST run/<id>/stop`, `POST apps/add`). Client: consumes `slots` and `locale`, claims `desktop.main` ahead of the workspace (priority -2, the workspace uses -1) while the launcher screen is showing; "ACRYL Code" hands the slot back to the workspace. The client runs the session itself (`createSession` is pure) with a context whose lists come from those routes, so the questions and checks are the ones the terminal asks.
3. **Effects and disposal.** The one Host resource is the child process of a run, owned by one `ctx.effect()` per run, killed by its disposer (and by the stop route); output is kept in a bounded buffer. The client's slot registration and styles are each one effect.
4. **Configuration and composition.** No configuration. Loader rows `acryl-launcher-desktop` (Host) and its client, composed in `apps/acryl-desktop/cordis.patch.yml`; the row id equals the package name. The apps list is `<OS home>/.acryl/apps.json`, the same file the terminal reads, found through `osHomeDirectory` of the instance selector (the one place allowed to look at the OS home), so Desktop and the terminal always show one list.
5. **Events and durability.** None beyond the list file; a run's output is not replay-critical and is not stored.
6. **Verification.** Real Loader activation of both halves, repeated mount/reload leaving one slot registration and no child process, a run stopped by its disposer, and a Playwright run on the Electron window (scratch home) that makes the same app as the terminal face and sees an app made in the terminal in its list.

Open until built: the exact first-screen switch (a launcher/workspace toggle in the window chrome, or "ACRYL" as the first item of the left pane). Recommendation: the launcher is what the window shows until a project or ACRYL Code is opened, and a button in the left pane's header returns to it.

Dependency found 2026-11-12 while starting T004: the desktop face can draw the list and the questions, but running what a journey ends in (`acryl new`, `npm run dev`, `acryl update`) needs a Node and npm on the machine, because `acryl new` runs create-acrylblends through npm. The desktop window cannot run a journey on a machine without them until the one-file desktop brings its own runtime (T005). So the desktop screen is built in this order: T005's runtime first, then the screen (list, questions, run). Until then `acryl --gui` opens the app and the terminal screen does the work.
