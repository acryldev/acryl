# T011 - the desktop shell and the instance as packages (design)

Spec 051 Phase 3. Today `acrylblends add desktop` copies `plugins/desktop-shell` and `plugins/instance` into an app; every app carries its own
copy, so a fix (tonight's updater tag prefix, T012) reaches an app only through `acrylblends upgrade`'s file-by-file merge. After T011 an
app depends on `@acryldev/desktop-shell` and `@acryldev/instance` (DS2's T017 packages, built to lib/ because Node will not strip types under
node_modules) and gets fixes through its package manager.

## 1. Capability and plugin boundary
- `@acryldev/desktop-shell` owns the Electron main process of a Blend app (window, menu, updater, brand, door shell). `@acryldev/instance` owns
  where an app keeps its data (home, storage, bundle). Both already are Cordis plugins; only their delivery changes (copy -> package).
- The CLI (`framework/packages/cli`) owns turning an app from one delivery into the other (`upgrade`), and the packer
  (`framework/scripts/pack-blank-*.mjs`) owns finding the Electron entry. Neither is a new framework.

## 2. Provides and consumes
- Unchanged services. Apps do not reach these two through cordis.yml rows: they import them by relative path - the app's own
  `src/main.ts` has `import { selectInstance } from '../plugins/instance/index.ts'`, and copied plugins (agent-panel, builder,
  desktop-web) import `'../instance/...'`, because copyPlugin rewrites package names to relative paths at copy time.
- So an app after T011 is mixed: most plugins copied as source, desktop and instance installed. Two consequences:
  (a) copyPlugin must keep imports of package-delivered plugins as package specifiers (`@acryldev/instance/storage`), not relative paths;
  (b) upgrade's migration rewrites the app's own imports of `../plugins/instance/...` and `../plugins/desktop-shell/...` to the package names,
      and the copied plugins' `../instance/...` imports likewise.
- The app's package.json gains `@acryldev/desktop-shell` and `@acryldev/instance` dependencies (exact versions from the CLI's release, like the
  frame packages' pins).

## 3. Effects and disposal
- None new at runtime. `upgrade` writes files; it plans first and refuses conflicts without `--force`, like every other upgrade step.

## 4. Configuration and composition
- Electron entry: `package.json` `main` (dev) and the packer's `manifest.main` (today hard-coded `plugins/desktop-shell/main.ts`,
  pack-blank-mac.mjs:425) resolve the entry: the app's own `plugins/desktop-shell/main.ts` when the app still carries the copy (old apps keep
  working untouched), else `require.resolve('@acryldev/desktop-shell/main')` from the app (the package's `lib/main.js`).
- check-deps.ts's "only plugins/desktop-shell imports electron" rule gains the package as an allowed importer (it is the same code).

## 5. Migration (`acrylblends upgrade`), once per app
- Planned step `desktop-package`: if the app's plugins/desktop-shell and plugins/instance match the library copy of the version it records
  (the existing `same` state for every file), remove both folders, add the two dependencies, rewrite the imports named in 2(b). Any file the
  app edited -> `conflict`, named, refused without `--force` (with `--force` the edited copy is kept and the step is skipped, not
  overwritten: an app that changed its shell keeps it).
- Idempotent: an app without the folders and with the dependencies is `same`.

## 6. Verification
- Unit: the plan for pristine / edited / already-migrated apps (three fixtures).
- Real: verify-upgrade-frame style - scaffold an app with the previous CLI layout, run `upgrade`, install, boot the desktop (door) and
  check the page is healthy; pack it (pack-blank-mac) and start the packed app with an isolated home.
- Fresh-clone root check (the gate since 2026-11-19).
- Depends on: DS2's T017 (packages with lib/), Fork3's T012 on main (updater edits move with the package).
- Outward (owner's go): publishing @acryldev/desktop-shell and @acryldev/instance to npm; until then installed apps cannot resolve them, so the
  `upgrade` step must check the packages are resolvable before removing the copies.
