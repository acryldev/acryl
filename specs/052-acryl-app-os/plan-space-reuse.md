# Spec 052 - space reuse for ACRYL apps on a computer: the plan (2026-11-24)

The owner (2026-11-24): "give me that plan if we can already implement this know-how into acryl apps ... for space re-usage".

## What WebBoxes proved (measured on z370n, 2026-11-24)

| | Before | After |
|---|---|---|
| 14 boxes + 6 published copies | 8,252 MB | 1,543 MB (81 % less) |
| one new box + its published copy | ~780 MB | 6.4 MB |
| a box's own packages after the move | ~394 MB | 0-37 MB (13 MB typical) |

How: the framework's packages for one Blends version exist once (a read-only layer), each box keeps only its own code and the
packages it adds (an overlay on top), and nothing a box does can change the shared part. Lessons that carry over: share by content and
version, keep each app's own additions separate, move existing installs one at a time with a way back, measure before and after.

## What an app costs on a computer today (measured on AION, 2026-11-23)

`~/.acryl/control-center` is 701 MB: `node_modules` 693 MB, of which Electron 309 MB and the framework ~384 MB, the same in every app.
Ten apps are ~7 GB of mostly identical files. On a computer there is no Docker overlay; the equivalent is a content-addressed store with
hard links (one file on disk, many names), which is what D1 and D2 of this spec decide.

## What we already found and built (read first; reuse, do not reinvent)

1. **Spec 049, `app-storage.md` (2026-11-11): Program, Source, Data.** The Program (Electron, the frame, the framework packages and their
   `node_modules`) is one read-only bundle, never copied; an app's `source/` holds only the person's files and the packages the person
   added; Data and cache are separate. Built for installed products in `@acryldev/desktop-shell` (`product.ts`, `programRoot` in
   `main.ts`). The seam that lets an app carry only its own packages is designed there: a sync `module.registerHooks` resolver that
   resolves framework names to the shared Program first and everything else normally (`NODE_PATH` does not work for ESM). Two pieces of
   it exist: `plugins/extensions/resolve.ts` (a staged plugin resolves framework names from the app) and `plugins/blends-frame/src/app-generation.ts`.
2. **One OS app per Blend, proof of concept (2026-11-09), scripts on main:** `framework/scripts/make-blend-app.mjs`,
   `framework/scripts/lib/blend-app.mjs` (`linkTree`), `pack-blank-engine.mjs`. A second app from one engine cost **6 MB on macOS** (APFS
   clone, `cp -c`, sealed again ad hoc), **14 MB on Windows and 31 MB on Linux for two apps** (hard-linked engine folders). Walked on all
   three OSes. `desktop-shell/brand.ts` already clones Electron with `cp -c` for the Dock name.
3. **Lesson (extensions, 2026-10):** a second copy of a framework package broke tool calls after a restart; framework packages must be one
   instance (peers), which is exactly what the shared Program gives.
4. **Spec 042 (2026-10):** the shell is not the size lever; the dependency payload is (236 MB of `node_modules` in a 471 MB app).
5. **WebBoxes D9 (today):** the same idea on a server, one read-only layer per Blends version, measured 81 % less.

So the plan below starts from 1 and 2, and uses a package store only for what an app adds on top.

## The book rules that decide this plan (owner: the five books are the backbone of every decision)

- *The Pragmatic Programmer*, DRY ("do not duplicate knowledge"): one Blends version's Program is one fact on disk, not one copy per app;
  and the design decisions already made in spec 049 are reused, not made a second time in this plan.
- *Clean Architecture*, stable core and replaceable edge, the Dependency Rule: the Program (framework, Electron) is the stable core that
  apps depend on; an app is its own policy and names the version it needs; the package manager and the disk trick (APFS clone, hard
  link, overlay) are details at the edge that can be swapped per OS without touching an app.
- *A Philosophy of Software Design*, deep modules and pulling complexity down: one "install an app" module behind one small call, used by
  every place that installs today (Control Center, `acryl new`, the store, agents); clones, links, the resolver and the fallbacks are
  hidden inside it, so no caller knows how space is shared.
- *Domain-Driven Design Distilled*, bounded context: "apps on this machine" (the Control Center and AOS) owns the Program store, the
  launchers and `reinstall`/`clean`; an app never manages shared space itself.
- *Clean Code*, one word per concept and no duplication: Program, app, store, launcher keep the meanings spec 049 and 052 gave them.
- *Release It!* (`~/.agents/rules/agent-rules-books/release-it`), bulkheads and steady state: sharing disk never shares a process (D11, one
  host per app), so one app's crash stays in that app; `acryl clean` is the steady-state cleanup, so the shared store cannot grow without
  bound.
- *Working Effectively with Legacy Code*, characterization before redesign, seams: before the install path changes, a test records what
  each install place does today (folder layout, what starts); the change goes through one seam (the install module), and
  `reinstall` keeps the old `node_modules` until the app starts.

## The plan

### Step 0 - measure what we already have, then the cheapest addition (no product change)

First the spec 049 way: apps made against one shared Program (one framework install per Blends version, read-only), each app holding only
its own packages, framework names resolved to the Program first by the `registerHooks` resolver generalised from
`plugins/extensions/resolve.ts`; and for real OS apps, `make-blend-app.mjs` (APFS clone / hard-linked engine). Then, for the packages an
app adds on top, the package manager's own shared store:

The repository already uses pnpm with one store. pnpm installs every package file once into its store and hard-links it into each
project, and keeps the result of an install script (Electron's binary download is one) in the store too ("side effects cache"), so a
second project gets Electron as hard links as well. If that holds for our apps, D1 (shared runtime) and D2 (shared packages) are mostly
one change: apps install with pnpm against `~/.acryl/store`, in the `hoisted` layout so the folder looks like npm's to every tool.

Measure on AION, mbpi9win and z370n, in a scratch home (`T001`): Control Center plus two store apps, made today with npm, then the same
three with pnpm (`--store-dir <home>/store`, `node-linker=hoisted`):
- disk counted once per file (hard links counted once): the number that matters;
- each app starts, its window opens, the terminal works, HMR and live plugins work (`live-test.sh`);
- Electron: is `node_modules/electron/dist` a hard link of the store, or a fresh copy per app?

Acceptance to go on: the second and third app add under 50 MB each, everything starts.

### Step 1 - make it the way apps are installed (T006, T008)

> **As built (2026-11-24, after Step 0):** [`baseline.md`](baseline.md) showed pnpm's store alone leaves 305-404 MB per app (Electron is never
> shared by it), so the shared store of this step is spec 049's Program, not pnpm: `<home>/program/blends-<version>/node_modules`, one per
> Blends version, made from the first app installed on it and put into each next app as an APFS clone (macOS) or hard links (Linux, Windows),
> `npm install` on top. The one install is `installApp` in `plugins/launcher/app-install.js` (`app-install-cli.mjs` as a command), run by
> `acryl --gui`/`acryl ade` (`distribution/acryl-npm-launcher/managed.js`) and Control Center (`plugins/launcher-desktop/src/service.ts`).
> The bullets below are the plan as written before Step 0.

- One install command for every place that installs an app today (Control Center's "+ New app" and Start, `acryl new`, `acryl --gui`
  and `acryl ade`'s copies, the store's Make, an agent's install): today each runs `npm install`
  (`distribution/acryl-npm-launcher/managed.js`, `plugins/launcher-desktop/src/service.ts`). It becomes pnpm against the shared store,
  through the `AppInstance` family for the store's path. pnpm comes with the tools Control Center already fetches (`prepareTools`), so
  Node 25 without Corepack works.
- The store lives in `~/.acryl/store` (owner rule: one home). If an app folder is on another disk, hard links cannot cross: pnpm copies,
  and the Control Center says so in one sentence.
- `acryl apps reinstall` moves an existing app onto the store, one at a time, keeping the old `node_modules` until the app starts (the
  WebBoxes way: backup, move, check, put back on failure). `acryl clean` removes store entries no app uses, after saying what and how much.
- The Control Center shows the disk each app adds and what the shared store holds (the Activity numbers of AOS, from real files).

### Step 2 - only if Step 0 shows Electron is still copied: reuse what exists, build nothing new

Owner (2026-11-24): "re-use, don't invent the wheel again". No runtime store of our own (the earlier T003-T005 idea). In order:
- pnpm's side-effects cache already keeps Electron's downloaded binary in the store; if Step 0 shows a copy anyway, set the store's
  `package-import-method` to hard links or clones (pnpm settings), nothing else.
- Electron's own `ELECTRON_OVERRIDE_DIST_PATH` makes an app use an Electron that is already on the computer, and Electron's own download
  cache (`~/Library/Caches/electron` and its Windows and Linux equivalents) already keeps one download per version.
- Electrobun apps: Bun's own install cache (global, linked into each project) is measured in Step 0 the same way.

### Step 3 - the rest of what WebBoxes learned

- Idle apps sleep: AOS already stops an app after N idle minutes and wakes it on open (D11, measured 2.4-7.5 s). The Control Center gets
  the same setting.
- A disk warning: under a set free space, Control Center says so before an install, never deletes anything.
- Many installs at once (an agent making several apps) run a few at a time, the rest wait with "N ahead".

## Order and what is shown at each step

| Step | Result shown | Machines |
|---|---|---|
| 0 | a table: npm vs pnpm store, MB per app, start OK | AION, mbpi9win, z370n |
| 1 | second app under 50 MB; `reinstall` and `clean` walked; Control Center shows the numbers | the same three |
| 2 | only if needed: an app with no Electron of its own opens its window | the same three |
| 3 | sleep setting, disk warning, install queue in Control Center | AION first |

Installers (DMG, exe, deb) stay self-contained (D3): this is about apps made and run on the person's own computer.

## Risks

- An app that depends on a package it did not declare: the hoisted layout keeps npm's behaviour, so it works as today.
- A package whose install script writes per project (native modules): pnpm keys its cache by Node version and platform; measured in Step 0.
- Antivirus or backup tools that count hard-linked files twice show bigger numbers than the disk really uses; the Control Center's own
  number counts each file once.
