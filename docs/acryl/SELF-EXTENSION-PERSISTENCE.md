# Self-extension: where an agent-written plugin lives, and how it persists

Status: verified on the packaged macOS app (2026-10-09, release v0.2.4, throwaway home) and on a real Windows 10 install (a recorded agent session).
Code: `plugins/acryl-extension-context/lib/install.js` (install, update, remove), `lib/stage.js` (staging), `lib/reconcile.js` (locations).
Where homes come from: [APP-INSTANCES-AND-BULKHEADS.md](APP-INSTANCES-AND-BULKHEADS.md).

## The idea in one paragraph

The agent writes a plugin as plain files into a source folder. `acryl_install_plugin` checks it, copies a versioned snapshot into the active profile
(a pnpm project under the ACRYL home), adds that snapshot as a `file:` dependency, and activates it in the running app. Everything the app needs
to start the plugin again lives in the user's home, never inside the installed application, so an app update or reinstall does not remove it.

## The four places

| What | Where | Written by | Survives |
| --- | --- | --- | --- |
| Source (the truth the agent edits) | project: `<workspace>/.acryl-extensions/<name>/` (or `<workspace>/.acryl/instances/<scope>/extensions/<name>/` for a named app instance); global: `<ACRYL home>/extensions/<name>/` | the agent's file tools | everything; project sources can be committed to git |
| Installed snapshot | `<profile>/.acryl-staged/<name>@<id>/` holding `acryl-source.json` (path of the source), the generated entry, and one `acryl-v-<hash>/` copy per version | `acryl_install_plugin` (`lib/stage.js`) | app updates, restarts |
| Profile registration | `<profile>/package.json` (`dependencies["<name>"] = "file:<absolute path of the staged folder>"`), `pnpm-lock.yaml`, `node_modules/<name>/` (a copy pnpm makes) | the bundled pnpm (`pnpm add file:...`) | app updates, restarts |
| Plugin data | `<engine home>/plugin-data/<name>/` (a plugin that keeps host files; the agent chooses this) | the plugin's own host half | everything, including clearing the browser |

`<profile>` is `<engine home>/profiles/<profile name>`: `desktop` for the Desktop app, `web` for Web (observed). The profile's own `cordis.patch.yml` is the
user's patch layer and the install does **not** write to it (verified: it was byte-identical after an install). A plugin's own Loader row comes from the
`dsh.bundle.patch` file the plugin ships (its `cordis.patch.yml`), read from the installed copy in `node_modules`.

## Per operating system

The ACRYL home is `~/.acryl` for the installed app (`defaultInstance`) and the engine home is `~/.acryl/.dsh`. The relative layout is identical everywhere;
only the home directory differs.

| | ACRYL home | Profile (Desktop) | Plugin data |
| --- | --- | --- | --- |
| macOS | `/Users/<user>/.acryl` | `/Users/<user>/.acryl/.dsh/profiles/desktop` | `/Users/<user>/.acryl/.dsh/plugin-data/<name>` |
| Windows | `C:\Users\<user>\.acryl` (observed) | `C:\Users\<user>\.acryl\.dsh\profiles\desktop` (observed) | `C:\Users\<user>\.acryl\.dsh\plugin-data\<name>` (observed) |
| Linux | `/home/<user>/.acryl` | `/home/<user>/.acryl/.dsh/profiles/desktop` | `/home/<user>/.acryl/.dsh/plugin-data/<name>` |

Separate from this, Electron keeps its own window state, caches and logs under its user-data folder (named `ACRYL`; the OS default location: macOS
`~/Library/Application Support/ACRYL`, Windows `%APPDATA%\ACRYL`, Linux `~/.config/ACRYL`). Plugins are not stored there.
The installed application (`ACRYL.app`, `C:\Program Files\ACRYL`, `/opt/ACRYL`) holds only the app itself and the read-only plugin documentation the agent reads
(`resources/app.asar.unpacked/node_modules/acryl-extension-context/docs`).

Other app kinds change the home: a development run uses `~/.acryl-dev`, a git worktree `~/.acryl-worktrees/<folder>`, an app made with `acryl new` its own
folder. The source and the profile move together with that home.

## What the install does, in order

1. **Check** (`acryl_verify_plugin`): manifest, bundle patch, exports, client bundle, declared permissions.
2. **Stage**: copy the package to `.acryl-staged/<name>@<id>/acryl-v-<content hash>/` and generate a stable entry that always imports the newest version. A new
   version is a new directory, so Node's module cache cannot return old host code.
3. **Register**: `pnpm add file:<staged folder>` in the profile.
4. **Activate** live (no restart). A failure here removes the package again and, for an update, restores the previous version.
5. **Prune** older versions and stages.

Update repeats the same steps from the same source folder. Remove deactivates, runs `pnpm remove`, and leaves the source folder in place unless the user
asks for it to be deleted.

## Live in the open window

The host half is live as soon as step 4 finishes. The browser half also mounts live in an open window: measured on the packaged Desktop app, a header
button appeared about one second after the install, with no reload. A conversation header slot exists only inside an open conversation, so nothing can
appear on the empty "new session" screen. (Page-level changes outside the app UI, such as the document title or favicon, still need one reload.)

## Limits

- **The `file:` path is absolute.** The profile's `package.json` records the full path of the staged folder. Moving or renaming the ACRYL home breaks the
  registration until the plugin is reinstalled (`/reload` or the install tool re-creates it from the source).
- **The source folder is authoritative.** If it is deleted, the installed copy keeps running but cannot be updated and is reported STALE.
- **Host code is cached by Node.** The staged entry works around this; a plugin that changes its `inject` list, a class-form `apply`, or its `name` needs an
  app restart to pick that up (a warning says so).
- **No live reload on direct edits.** Editing the profile's `cordis.patch.yml` by hand is not watched (the stock harness reloads on that). Changes made
  through `acryl_install_plugin` are live.
- **Needs the bundled pnpm.** Registration runs the package manager that ships inside the app; without it (or when it fails) nothing is installed.
- **Permissions are declared, not sandboxed.** A plugin runs with the user's permissions; the install reports what it declared (`fs.read`, `fs.write`, `ui`...).
  Cordis service isolation scopes resolution; it is not an OS sandbox.
- **Disk growth.** Each update adds a version folder until pruned; the install prunes all but the newest.

## Not verified yet

- Surviving a full quit and relaunch of the packaged app (the install state is on disk, the relaunch itself was not measured).
- Linux packaged paths (derived from the same code, not observed on a Linux install).
- The Electron user-data locations above are the Electron defaults and were not re-checked for this app on Windows and Linux.
