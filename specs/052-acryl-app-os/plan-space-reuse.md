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

## The plan

### Step 0 - measure the cheapest way first (half a day, no product change)

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

### Step 2 - only if Step 0 shows Electron is still copied (T002-T005)

The runtime store `~/.acryl/runtimes/electron-<version>/` from D1: apps name their runtime and `acryl-desktop` starts the shared one.
This is more code (download, checksum, lock, the branded macOS clone); it is built only if pnpm's own sharing does not already give one
Electron per version.

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
