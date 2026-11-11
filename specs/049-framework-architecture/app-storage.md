# 049 - Where a Blends app keeps its things (the product's storage design)

Status: design, 2026-11-05, for owner review. Supersedes the "in the person's documents" wording of tasks.md T002 (that wording was written by
AcrylImplementer; the owner never asked for Documents).

## The owner's requirement, in their words

2026-11-05: "we wanted to encapsulate it inside of app and to ensure that across macos windows and linux it behaves the same ... decision to put it in
/Documents is very stupid", and the design is to follow the engineering books in `~/.agents/rules/agent-rules-books`. `docs/framework/concepts.md` already
says "An `App` is a self-contained ACRYL application."

## What is wrong today (facts, from `plugins/desktop/product.ts` and `main.ts` on 127-blank-dmg)

1. `firstRunRoot` copies the whole bundle, including `node_modules`, into `<Documents>/<product.json appFolder>`. One shared place, chosen by the developer
   (`ACRYL Blends Blank`), not by the person, and only walked on this Mac.
2. Everything lands in that one folder with no separation: the person's source (`src`, `plugins`, `blend.yaml`, `.git`), their state (`.acryl`, `.acrylblends`:
   settings, sessions, notes), the rebuildable packages (`node_modules`) and the logs. A user who opens Documents sees engine internals; Documents is
   backed up, synced to iCloud/OneDrive and scanned, so a few hundred MB of packages are synced with the person's real files.
3. "Exists means it is theirs, never touch it" is the only upgrade rule. A new DMG therefore keeps the old state for ever (the owner's test on 2026-11-05) and
   there is no way to start clean, migrate or tell which version wrote the folder.
4. The OS decides the location (`app.getPath('documents')`) outside `AppInstance`, the one module that is meant to decide where an app keeps anything.
5. Windows and Linux have not been walked (T007), and the code path for them is the macOS one.

## The books, applied

| Book (`~/.agents/rules/agent-rules-books`) | Rule | Applied here |
| --- | --- | --- |
| Clean Architecture | Filesystems sit behind a policy-owned port; details are plugins to policy; the lightest enforceable boundary | One port, `AppStorage`, that the frame and the framework call; the per-OS directory rules live in one adapter at the edge |
| The Pragmatic Programmer | One decision, one place; orthogonality; no hidden globals | `select.ts`/`AppInstance` stays the only module that decides locations; `product.ts` stops deciding |
| A Philosophy of Software Design | Deep module, small interface | `AppStorage` offers `open(app)`, `reveal(app)`, `export(app)`, `import(file)`, `reset(app)`; callers never join a path |
| Release It! | Bulkhead; fail fast and loud | One sealed folder per app; a layout version is checked on open and a mismatch stops with a message, never a half-migrated start |
| Designing Data-Intensive Applications | Schema evolution, forward and backward compatibility | `layout.json` carries a version; migrations are small, idempotent steps run on open, with a copy made first |
| Patterns of Enterprise Application Architecture | Registry, Gateway | The list of apps in the product is a registry file; the OS path rules are a gateway |

## The design

### Five kinds of thing, each with one home

Classified by who owns it and what happens when it is deleted. They differ in rate of change and in risk, so they never share a folder.

| Kind | Owner | If deleted | Lives in |
| --- | --- | --- | --- |
| **Program** | the product (the installed app) | reinstall restores it | the bundle: Electron, the frame, the framework packages, the framework's `node_modules`. Read-only, replaced by every update, never copied out |
| **Source** | the person | their work is lost, so it is a git repository with versions | `apps/<id>/source/`: `blend.yaml`, the person's `plugins/` and `src/`, `package.json` (no framework packages: they are peers), `.git`. `node_modules/` is allowed here, gitignored, and holds only what the person added |
| **Data** | the person | their history is lost | `apps/<id>/data/`: settings, sessions and chat, notes, storages, and `logs/` (the engine writes its logs under its home, so logs are a member of the family, not a sibling folder) |
| **Derived** | the machine | rebuilt on demand | `apps/<id>/cache/`: build output and anything else rebuildable (it is inside the OS backup, as everything under the root is; a backup exclusion is a later step) |

The Program is not copied, and it is not in `source/` either: the framework plugins (`acryl-node-server`, `instance`, `desktop`, `acryl-router` and the rest), the generated host (`ide-host.mjs`, `cordis.patch.yml`) and the frame packages load from the bundle through bundle-relative rows, so an update replaces them for every app (a framework file that must stay in `source/` carries the Generated marker and is rewritten on open, as `acrylblends upgrade` does). Today's copy of the bundle is the root of the duplicated `node_modules` and of the "old state kept" problem: the framework is
resolved from the bundle at run time and the person's app carries only what is theirs. `NODE_PATH` does not work for ESM; the seam is the sync `registerHooks` resolver in `acryl-node-server/register.ts`, generalised so that framework names (`acrylblends`, `@deepseek-ai/*`, the frame packages, the vendored plugin names) resolve to the bundle FIRST for any parent, and everything else resolves normally with the bundle as the fallback. Framework-first is required: a person's dependency carrying its own copy would give two framework copies (the `matchedRoutes` 500). The bundle stays unpacked (`asar` false) and vendored `.ts` stays outside any `node_modules` path, because type stripping refuses `.ts` under `node_modules`.

### One root, the same on every OS, chosen in one place

```
<root>/                        one per installed product
  layout.json                  { "layout": 1, "writtenBy": "<product version>" }
  apps.json                    registry: id, display name, created, last opened
  apps/<id>/{source,data,cache,logs}
  electron/                    Chromium's own user data (window state, cache), as `main.ts` already sets
  trash/                       a reset app is moved here, never deleted
```

`<root>` is `~/.acryl`: one short, predictable folder in the person's home, the same on macOS, Windows (`C:\Users\<name>\.acryl`) and Linux, as DeepSeek
Harness keeps `~/.dsh`. It is deliberately not the OS's application-data folder (`Library/Application Support`, `%LOCALAPPDATA%`, `~/.local/share`): those differ
on every OS, hide the work in a place nobody types or finds, and make the guide three different explanations. (The owner's rule, 2026-11-11, repeated: "predictable
concise location like DeepSeekHarness does, so ~/.acryl". An earlier draft of this note chose the per-OS folders; that was wrong.) `ACRYL_HOME`, when it is an absolute path, moves the
root for an isolated run or a test, as it moves ACRYL's own home. It is computed by one pure function `acrylRoot(platform, env, home)` in `plugins/instance`, and
nothing else calls `app.getPath` or `homedir()`. `~/.acryl` is shared with the ACRYL IDE's own folders (`agent`, `plugins`, `control`, `workspace` and so on); the
names this layout adds (`layout.json`, `apps.json`, `apps/`, `electron/`, `trash/`) collide with none of them.

An app's id is a generated slug (`my-notes-3f2a`), never the name. The person names the app (and renames it) as a label in `apps.json`; renaming never
moves a folder, which also keeps paths short and legal on Windows (no reserved names, no trailing dots, ASCII, 40 characters at most).

### Behaving the same across macOS, Windows and Linux

- One code path, and no per-OS rule at all: `acrylRoot` is `<home>/.acryl` everywhere (only the path separator differs). Everything below it is the same layout built by the same function.
- No absolute path is ever written into a file the app owns (`blend.yaml`, `layout.json`, `apps.json`, settings, lockfiles), and no path into the bundle either: paths are relative to `<root>` or to an
  app folder, so a folder moved or restored from a backup still opens, and macOS App Translocation (a random read-only bundle path that changes between launches) cannot break an app.
- No symlinks in the tree (Windows needs privilege to make them); copies use `dereference`. Slugs are lower-case and compared case-insensitively
  (macOS and Windows are, Linux is not); reserved Windows names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) and names ending in a dot or space are refused. Git runs with `core.autocrlf=false` and `core.longpaths=true` for the app's own repository.
- A conformance test creates a root in a temp folder, runs first start, open, rename, export, import and reset, and writes the resulting tree as a
  listing; the listing must be identical on every OS. It runs on this Mac and, in T007, on mbpi9win and z370n from the built installers.

### The cases: where the program, the source and the data are (owner, 2026-11-11)

An installed app's folder (`/Applications/<App>.app`, `C:\Program Files\<App>` or `%LOCALAPPDATA%\Programs\<App>`, `/opt/<App>`) is read-only for a normal
user, so nothing a person or an agent makes can live there. The program is one place; what changes is another. **The data is always in
`~/.acryl/apps/<id>/data/`, in every case.** Only the source differs.

| Case | Program | Source (blend.yaml, plugins the agent builds) | Data (chats, settings, logs, keys) |
| --- | --- | --- | --- |
| Installed app (DMG, installer, a built Blend) | the OS install folder, read-only | `~/.acryl/apps/<id>/source/` | `~/.acryl/apps/<id>/data/` |
| Dev mode (`acryl new shop`, then `npm run desktop`) | `shop/node_modules/` | `shop/` (`blend.yaml`, `plugins/`, `src/`; git) | `~/.acryl/apps/<id>/data/` |

- The `<id>` of a dev-mode app is stored in its `blend.yaml`, never derived from the folder path, so moving or renaming `shop/` keeps its chats. (Today the
  id is a digest of the path and the data is `shop/.acrylblends/`: that is what changes, task T026.)
- Dev mode to installed: export the folder as one `.acrylblend` file and import it (slice 4).
- Windows paths are `C:\Users\<name>\.acryl\apps\<id>\...`. No per-OS rule anywhere.

### What the person sees, without touching a folder

- First start asks one thing in the app's own page: "Name your app" (a default is offered). No path, no flag.
- Settings shows the app, its name, its size, and three buttons: **Show in Finder / Explorer / Files**, **Export** (one `.acrylblend` archive: the
  source with its history and, if ticked, the data) and **Start over** (moves the app to `trash/` and makes a fresh one; confirmation inside the page).
  **Import** opens an archive as a new app. This is how work leaves the app (to Documents, to a USB stick, to another OS), by the person's choice.
- Updates replace the Program only. On open the product reads `layout.json`: equal means go; older runs the migration steps after copying the app to `trash/`
  first; newer (a downgrade) stops with a message that names the version to install.

### A portable build, later

A `portable` file beside the executable moves `<root>` next to it (Windows zip, Linux AppImage). Not part of the first slice; `acrylRoot` takes it as
a parameter so it is one more branch in one function when it is wanted.

## Terms (one meaning each)

- **Product**: the installed desktop app (the Program plus its one root).
- **App**: one Blends app a person made, with its own source, data, cache and logs. A product holds many.
- **Root**: the product's one data folder. **Layout**: the version of what is inside it.

## Verification

1. Unit: `acrylRoot` for darwin, win32 and linux (`<home>/.acryl`, the OS data-folder variables ignored, `ACRYL_HOME` honoured only as an absolute path), with spaces and non-ASCII in the home name, in the `AppInstance`
   selector tests; `tests/bulkhead.spec.ts` still passes and gains the rule "no `app.getPath('documents')` outside `select.ts`".
2. Unit: slug rules (reserved Windows names, case, length), the migration runner (idempotent, copy first, refuses a newer layout), export then import
   round trip (equal trees).
3. Real: this Mac from a fresh DMG on a fresh account, an old `~/Documents/ACRYL Blends Blank` offered once as "Import your earlier app" (never read
   silently, never deleted); then mbpi9win and z370n from the installers.
4. The 2026-11-05 failure as a test: install N, build a change, install N+1: the change and the chat remain, and Start over really starts clean.

## Git on a clean machine (open, gates T002's "no git needed")

Source is a git repository, but a clean Mac without the Command Line Tools has only a `/usr/bin/git` shim that opens an install dialog, and Windows has no git. Export uses `git bundle` (source with full history in one file, data as a second entry). The product therefore needs a bundled git binary per OS or isomorphic-git; the implementer researches both, with sizes, and recommends before slice 5.

## Slices (for the implementer; each is one commit with its own tests)

1. `acrylRoot` and the layout (`layout.json`, `apps.json`, ids, `productInstance`) beside `selectInstance` in `plugins/instance` of acrylblends (the acryl repo's `select.ts` stays as is), with the three-platform tests and a bulkhead test there (no `homedir()` or `app.getPath` outside it; `plugins/agent-panel/headless.ts` fixed in the same slice). No behaviour change yet.
2. `AppStorage` port and its adapter; `main.ts` runs the frame on `apps/<id>/source` and keeps Data, Cache and Logs where the table says; `product.ts`'s
   copy-into-Documents is deleted, not kept as a fallback.
3. The framework resolved from the bundle instead of a copied `node_modules` (the slice that shrinks the app folder; report the size before and after).
4. The frame pages: name your app, Settings (show, export, import, start over).
5. Migration runner, the earlier-app import, the update walk.
6. T007 walks on the other two OSes; tasks.md T002 reworded to this design in the same commit as slice 2.

## Open for the owner

None that block slice 1. Defaults chosen: `~/.acryl` (the owner's rule, decided), many apps per product, portable later. Say if a person should instead be able to
choose the folder (then it becomes a parameter of `AppStorage.open`, still one place).
