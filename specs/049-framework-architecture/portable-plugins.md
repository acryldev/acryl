# 049 - Portable apps and plugins: what the steering discussion gets right, what the code says, and the plan

Status: proposal, 2026-11-06, for owner review. Source of the direction: the owner's discussion
`docs-acryl-project-RnD-ideas-discussions-questions/acrylblends_strategic_direction_steering/` (an outside chat model's
ADR and mockup, checked here against the code). Companion of `app-storage.md` (where an app lives on one machine).

## The owner's goal, in their words

An app is a self-contained, sealed, portable, distributable container with its own file system inside, viewable in the built-in file browser,
the same on macOS, Windows and Linux; every capability is a Cordis plugin; a plugin written on Windows must be usable on macOS after a pull
from the registry ("B: self contained sealed with own FS inside and viewable by user in built in File editor / fileBrowser").
And: apply the engineering books, Clean Architecture first.

## What the discussion's ADR claims, checked against the code (acrylblends main afe6b6cf)

| Claim | Code | Verdict |
| --- | --- | --- |
| `stage.ts` copies a plugin to `<home>/extensions-staged/<name>/<stamp>-<hash>/`, atomic rename | true (`plugins/extensions/stage.ts`) | holds |
| `lock.ts` digests folders under `plugins/`, `src/plugins/`, `extensions/` | true (`plugins/manifest/lock.ts`, `localModules`) | holds |
| Identity is already a content digest | `digestFolder` in blends-core: sha256 over sorted relative paths (with `/`) and bytes | holds, with a gap below |
| "Same digest on every OS" | measured: file mode is ignored (good), but the same plugin with CRLF line endings digests differently (`f4ce...` LF against `c946...` CRLF) | **gap**: Git for Windows defaults to autocrlf, so a plugin cloned on Windows can fail its own lock on macOS |
| Promote the stage store to the primary source of truth (Phase 1) | `stage` exists because Node caches an ES module by URL: a copy at a new path is the only way to re-evaluate edited code. It is a loader mechanism, not storage | **reject**: every edit would become a new directory, the agent and the person edit a working tree, and git diffs, chat cwd and the file browser all need one stable path |
| `live/` of symlinks into `store/` | Windows needs privilege for symlinks | **reject** (app-storage.md already bans symlinks) |
| Home as the container root (Phase 2) | done by app-storage.md slices 1-4: `apps/<id>/{source,data,cache}`, one root per product, layout version | already built |
| `pack` / `unpack`, git as export (Phase 3) | done: `.acrylblend` git bundle export/import (slice 4) | already built; keeps git inside `source` as the person's version history, not required to run |
| Store outside asar, one `home` (Phase 4) | done: asar false, root in the OS per-user data folder, framework from the bundle | already built |

So three of the four phases exist; the real remaining work is the cross-OS identity of a plugin, which the discussion names as the hard problem and
does not solve.

## Clean Architecture applied (`agent-rules-books/clean-architecture`)

The rules that decide the shape: business rules pure and I/O free; file systems, clocks and external services behind boundaries; frameworks and
the database are details; dependencies point inward; organise by use case.

| Layer | In this problem | Today | Change |
| --- | --- | --- | --- |
| Policy (pure) | what makes two plugin folders "the same" and what makes a folder portable | `digestFolder` mixes the formula with `readdirSync`/`readFileSync` in one function | split: pure `digestFiles(files)` and pure `portabilityIssues(files)` over plain `{path, bytes}`; the disk walk becomes an adapter |
| Use case | install, update, remove a plugin as one transaction (check, import, start, self-check, restore previous) | `plugins/extensions/index.ts`, 875 lines, calls `stage`/`cpSync`/`rmSync` directly | depends on a `PluginStore` port it owns; `stage.ts` becomes the folder adapter that keeps the new-URL trick |
| Interface adapters | registry client, git save/export, the file browser projection | `save`, `manifest`, frame Files body | unchanged; they call the use case and the policy, never the other way |
| Details | Node `fs`, ESM URL caching, git, Electron | spread through `extensions` | stay at the edge, replaceable (a future store or shell changes an adapter, not the transaction) |

Rule applied to the discussion's plan: it put the store layout (a detail) into the place that owns the install transaction (a use case), so
policy would depend on directory shapes. Here the transaction owns the port and the directory shape is the adapter's business.

## The plan (each step one commit with its tests, in this order)

1. **Pure policy in blends-core.** `digestFiles(files)` (the exact current formula, so no lock changes) and `portabilityIssues(files)`:
   reserved Windows names (CON, PRN, AUX, NUL, COM1-9, LPT1-9, also with an extension), names ending in dot or space, characters Windows refuses,
   two paths equal ignoring case, a path over 200 characters, symlinks, CR in a text file. `digestFolder` = disk adapter + `digestFiles`.
   Tests need no disk and run all rules on one machine.
2. **Pin the line endings where plugins are born.** `.gitattributes` (`* text=auto eol=lf`) in every scaffold, in every registry entry written by
   `make-entry`, and in the app repository the product creates (it already sets `core.autocrlf=false`). `make-entry` and `registry-index --check`
   fail an entry with a portability issue. No digest format change. (Alternative: normalise text in the digest and bump the lock to formatVersion 4;
   not chosen because it hides a real byte difference and rewrites every existing lock.)
3. **`PluginStore` port owned by `extensions`.** `put(name, files) -> version`, `open(name, version) -> loadable path`, `list`, `discard`. The folder
   adapter is today's `stage`/`prune` unchanged in behaviour (the existing extensions tests are the characterisation tests). The transaction stops
   importing `node:fs` for plugin content.
4. **Verify before activate.** Installing from a registry entry computes the digest and the portability issues from the fetched files, compares with
   the entry and the lock, and refuses with a named reason, on any OS, before the existing check/import/start steps.
5. **Prove the owner's scenario for real.** On mbpi9win (Windows) make a plugin, push it to a registry on the test org, pull it on this Mac
   and on z370n: the three digests are equal and the plugin runs. Folded into T007 of `tasks.md`; the same fixture plugins (reserved name, CRLF,
   case pair, long path) go through step 1's tests on all three OSes in CI.

## Kept from the discussion

Sealed unit with its own tree and a file browser view (already the frame's Files body over `apps/<id>/source`), content identity of plugins,
transactional evolution with restore-previous, pack/unpack, desktop store outside the asar, and "git is not needed to run".

## Dropped from the discussion

Digest-named directories as the source of truth, `live/` symlinks, a separate `view/` projection tree, moving `blend.yaml` and the lock into the
home, and treating `stage.ts` as storage.

## Open for the owner

1. Git inside `source` as the person's version history (kept, bundled, hidden behind a history port) against git only as an export format. The
   discussion says export; app-storage.md keeps it inside because "Build/Preview versions" in the frame need history. Recommendation: keep inside.
2. Line endings: pin and refuse (step 2, recommended) or normalise in the digest.
