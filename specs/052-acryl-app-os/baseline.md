# Spec 052 T001 - what apps cost on disk today, and with the ways we already have (2026-11-24)

Step 0 of [`plan-space-reuse.md`](plan-space-reuse.md). Measurement only: no product change. Every run was in a scratch HOME on the test
hosts AION (macOS 26, Mac mini M4; its Node is x64 under Rosetta), z370n (Ubuntu) and mbpi9win (Windows 10). The apps were made from the
store with `create-acrylblends@1.7.32` (`@acryldev/blends` 1.7.32): Control Center (`acryl.control-center`), Notes
(`acrylblends.notes-desktop`) and Small CRM (`acrylblends.small-crm`), in that order. The script is kept with the evidence
(`space-proof.mjs`, results `result-<phase>.json` per host).

## The answer

The plan's bar to go on (the second and third app add under 50 MB each, everything starts) is met by **spec 049's shared Program only**:
7-12 MB per extra app on all three OSes, Electron once, every app starting with its terminal, live plugins and HMR working. pnpm's store
alone leaves 305-404 MB per app (Electron is never shared by it); the Electron override alone leaves 367-451 MB (the framework stays per
app). Bun's cache already links (Electrobun app: 7-12 MB for a second copy).

## How disk is counted

- Linux and Windows: each file once, by device + inode (the file ID on Windows), so a hard link counts once; symlinks are not counted.
  Windows' free space moved by hundreds of MB in either direction during the runs (Windows has no `sync`), so only the file-ID count is used there.
- macOS: an APFS clone shares blocks that no file tool can see, so `du` counts a clone at full size. The macOS numbers for clones are the
  free space a volume lost: a dedicated APFS disk image (sparse, 30 GB) that nothing else writes to, `sync` and 3 s before each reading.
  Without the image and the `sync` the numbers were noise (one app 956 MB, the next 39 MB); they are not used.
- "Per app" is what each app added after the one before it; the first app also carries anything shared (the Program, a store, a cache).

## The table: MB added per app (Control Center, Notes, Small CRM)

"All OK" means, for each of the three apps in that layout: `npm run desktop` started it (frame answering in 2 s on z370n, 7-9 s on AION
and Windows), its window answered the door (`acryl look`), a terminal in the app ran a typed command (`pty-check.sh`), `live-test.sh`
served a new plugin and then an edit typed through the in-app terminal without a reload, node-pty and koffi loaded in Node and in the app's
Electron (except koffi in Electron on AION, finding 5), and the app's port was free after it stopped.

| Way | z370n (Linux, hard links) | mbpi9win (Windows, hard links) | AION (macOS, APFS clones, free space) | Start, window, terminal, live plugin + HMR |
|---|---|---|---|---|
| **Today: npm, each app its own copy** | 701 / 701 / 701 (2,103) | 753 / 753 / 754 (2,260) | 743 / 737 / 737 (2,216, `du`: plain copies) | all OK on all three |
| **Spec 049 shared Program** (one framework install; each app links or clones it, `npm install` on top for its own) | Program 694, then 7.3 / 8.2 / 8.7 (718) | Program 748, then 10.8 / 12.3 / 10.4 (781) | Program 735, then 2.6 / 11.1 / 7.2 (42 for the three) | all OK on all three |
| **pnpm, one store, hoisted** (`--store-dir <home>/store`, side-effects cache on) | 692 / 315 / 305 (1,313, store 398) | 766 / 404 / 393 (1,562, store 383) | 950 / 343 / 331 (1,645) | all OK on all three |
| **npm + `ELECTRON_OVERRIDE_DIST_PATH`** (each app npm-installed, Electron = the Program's one copy) | 404 / 404 / 404 | 367 / 367 / 367 | 451 / 426 / 432 | all OK on all three |

The npm cache (`~/.npm`) adds 270-283 MB once and can be deleted.

Electrobun app (Small CRM eb, `bun install` against one Bun cache in the home): z370n 424 then **7.2 MB** for the second copy (the two
apps share the same file inode with the cache: Bun hard-links). AION: 444 then **9.7 MB** of free space for the second copy (Bun clones
from its cache on APFS: separate inodes, shared blocks). Windows: 393 then **12.4 MB** for the second copy (hard links, the same file ID as the cache). Electron itself was not part of this measure (the
Electrobun app's own runtime comes with its packed build).

## The Electron answer

**Electron 44 has no install script.** Its `index.js` downloads the binary (from Electron's own download cache) into each app's own
`node_modules/electron/dist` the first time anything asks for Electron (the first start). So:

- pnpm's side-effects cache can never hold Electron: under pnpm every app has its own 229 MB (Linux) / 247 MB (Windows) / ~300 MB (macOS)
  Electron, one inode each, `nlink` 1. That is why pnpm's second app still costs 305-404 MB.
- The shared Program shares it: z370n one Electron binary with 4 links (Program + 3 apps); Windows 3 links; macOS one clone. With the override the apps have no `dist` at all:
  Windows' three override apps all report the Program's one 246.8 MB `electron.exe` (the same file ID).
- `ELECTRON_OVERRIDE_DIST_PATH` works for our apps (Electron's own `index.js` honours it): all three apps started on the Program's Electron
  with no `dist` of their own, on z370n and AION. It needs `node_modules/electron/path.txt` (the binary's name inside `dist`), which only
  Electron's own download writes; without it the name falls back to `electron`, right on Linux only (macOS needs
  `Electron.app/Contents/MacOS/Electron`, Windows `electron.exe`). The override alone saves only Electron (~300 MB per app); the
  framework's ~400 MB stays per app.

## What broke on the way (and what it means for Step 1)

1. **npm writes into the Program through a hard link.** `npm install` rewrites `node_modules/.package-lock.json` in place; with the Program
   hard-linked into an app, the first run changed the Program's copy. With that one file copied instead of linked, every Program file was
   byte-identical by sha256 after each app's install, on z370n, AION and Windows. The real 049 resolver never puts the Program inside an
   app, so this cannot happen there; any interim that links the Program must keep it read-only.
2. **npm re-extracts everything when it does not trust its hidden lockfile.** npm trusts `node_modules/.package-lock.json` only when it is
   newer than every package folder. The Program's `electron` folder changes after the install (Electron's first use), and an APFS clone
   with `cp -p` or a Windows file copy keeps the lockfile's old time: npm then re-read the tree and re-extracted every package that Small
   CRM's own `package-lock.json` names (583 packages, 706 MB on macOS; 579 packages, 725 MB on Windows). With the app's lockfile copy
   stamped now, macOS Small CRM added 7.2 MB. Control Center and Notes ship no `package-lock.json`, so they were not hit.
3. **A macOS clone costs almost nothing by itself**, measured step by step on the quiet image for Control Center: the clone 9 MB
   (`cp -cR`) or 1 MB (`cp -cRp`), `npm install` on top 0 MB, Electron's first use 0 MB. Small CRM with `cp -cR` and with `cp -cRp`
   both cost 7xx MB until the lockfile was stamped (finding 2).
4. **npm 11.17 skips install scripts not in its `allowScripts`** (it warns for 5 packages, among them node-pty and koffi). Nothing broke
   from it: node-pty and koffi ship prebuilt binaries; both load in Node and in Electron on z370n.
5. **AION only, not the layout:** AION's Node is x64 under Rosetta, so npm installs koffi's x64 package, while Electron's own download picks
   arm64 under Rosetta; koffi does not load inside Electron there, in every layout including today's npm. The apps start, and terminal and
   live plugins work. A Mac with arm64 Node gets matching packages.
6. Test harness, not product: zsh in a home with no startup files opens its new-user menu and swallowed the terminal check's typed line
   (fixed with an empty `.zshrc` in the scratch home); `npm run desktop` leaves the frame host in its own process group, so the walk stops
   whatever listens on the app's port afterwards and checks the port is free.

## Which book rule decided each choice

- **Measure the 049 Program before any store** - *The Pragmatic Programmer*, DRY ("every piece of knowledge has one representation"): the
  framework for one Blends version is one fact, and spec 049 already decided how to share it; the measurement reuses `linkTree` and the
  `cp -c` of `make-blend-app.mjs`/`brand.ts` instead of a new mechanism.
- **The Program is read-only, checked by content hash** - *Clean Architecture*, the Dependency Rule and stable core: apps depend on the
  Program, never the other way; an app's install must not change the core it depends on (finding 1 is exactly that violation).
- **pnpm and the Electron override are details at the edge** - *Clean Architecture*, details are plugins to policy: the numbers show pnpm
  alone keeps Electron per app and the override alone keeps the framework per app; neither is the core answer, both can sit behind one
  install module.
- **One install module hides clone, link, lockfile stamp, `path.txt`** - *A Philosophy of Software Design*, deep modules and pulling
  complexity down: findings 1-3 and the `path.txt` rule are exactly the knowledge no caller (Control Center, `acryl new`, the store, an
  agent) should carry.
- **"Apps on this computer" owns the Program and the store** - *Domain-Driven Design Distilled*, bounded context: an app never manages
  shared space; the measurement kept each app's own additions (its lockfile, its sources) separate from the shared Program.
- **Program, app, store, launcher keep one meaning** - *Clean Code*, one word per concept: this file uses spec 049's Program and
  spec 052's store as defined there.

## Evidence

Each host's `result-<phase>.json` files, the desktop logs and the script are saved in the measuring session's scratch folder
(`evidence/space-{aion,z370n,win}.tgz`); the scratch homes on the three hosts were removed afterwards.
