# Deliver a plugin live: local install

Goal: the user asks for a feature, you write a plugin, it appears without a restart.

1. Write the package in `<the workspace you are working in>/.acryl-extensions/<plugin-name>/` (create it with your normal
   file tools; never inside the pack or the profile). Copy the closest example from `../example-plugins/README.md` and change it.
   Always pass the tool the ABSOLUTE path of that directory.
2. Call the **`acryl_install_plugin`** tool with the package directory. It checks the package
   (bundle patch, `exports` including `./package.json`, a client bundle if `dsh.client` is set), runs
   `dsh plugin add file:<dir>`, live-activates it, and **removes it again if activation fails**.
3. Read the result. `ok: true` with status `active` means the host part is live. If the result has a
   `next` note (a UI plugin), tell the user to reload the page (Web) or window (Desktop).
4. On an error the result names the stage (`check`, `install`, `activate`) and the real message. Fix that
   cause and call the tool again; the tool already undid a failed install.

## Changing, fixing, improving or removing a plugin

1. Call `acryl_list_plugins` to find the plugin and the directory it was installed from. Edit the files there.
2. Call `acryl_install_plugin` with that directory again. It detects the existing plugin, takes it down, re-installs the
   changed files and mounts a fresh instance ("action": "updated").
3. **Browser code (`client.js`)**: the new file is served after a page reload. Tell the user to reload.
4. **Host code (`index.js` and what it imports)**: updates take effect in the running process AUTOMATICALLY, like pi.dev's reload.
   Node caches modules by URL, so the installer installs a small staged copy: a generated entry wrapper that, on every
   activation, imports the newest versioned copy of your code (`acryl-v-*`), so `index.js` and every file it imports are
   evaluated fresh. The result says `"hostReload": "automatic"`. You do not write or maintain any shim; your source folder
   is never modified. Limits: a change to `inject` (or the `Config` schema) is only fully applied after an app restart (the
   wrapper logs a warning); a class-form `apply` (`export { MyService as apply }`) keeps its first version; a plugin whose
   entry is not a JavaScript ES module (`"type": "module"`) cannot be staged and the result then carries a `warning`. A plugin
   that carries its own hot shim (the legacy pattern in `lifecycle-function-hot-shim`) is installed as written. A plugin whose
   host half is empty (a UI-only plugin) has nothing to reload.
5. To delete a plugin call `acryl_remove_plugin` with its package name (UI plugins: tell the user to reload).

To improve or change UI, edit `client.js` and update as above. Never edit files inside the profile's `node_modules`
or the pack; always the source directory that `acryl_list_plugins` reports.

## Marketplace

You cannot publish. Publishing is public and irreversible, so it is always a human decision. Prepare the
package for it (`extending/packaging.md`: `acryl-package` keyword, `acryl` manifest, GitHub `repository`,
`license`) and tell the user what remains. Installing from the marketplace is the user's normal flow.

## Failure states

- `PENDING`: an `inject` names a service nothing provides. Provide it; do not delete the `inject`.
- `FAILED`: `apply()` threw. Read the real error; do not retry unchanged code.
- Installed but not live: `exports` lacks `./package.json` (the tool checks this).
- UI not visible: the page has not been reloaded, or `client.js` failed to load (check the browser console
  for the wrapper `id` and any `import`/JSX in the file).

## Where extensions live: the source folder is the truth

An extension is source code first, a running plugin second, and a package only later (this is pi.dev's model, adapted). The install list in the profile is
derived state: it can be thrown away and rebuilt from the source folders.

| Scope | Folder | Who sees it |
| --- | --- | --- |
| project | `<workspace>/.acryl-extensions/<name>/` | that project only; commit it to the project's git repository |
| global | `<ACRYL home>/extensions/<name>/` (`~/.acryl/extensions/`) | every project and every surface (Web, Desktop, CLI) running against this ACRYL home |

- Discovery is one level deep: a folder that has a `package.json` is an extension; folders inside it are just its files.
- The same folder reached by two spellings (a symlink, `../`) is one extension. If a project and a global extension share a package name, the project one
  wins and the global one is reported as SHADOWED.
- Lifecycle: write source, then `acryl_verify_plugin`, then `acryl_install_plugin` (live), then edit and re-install (update), then `git commit`, and only later publish
  (`start-here/trust-and-safety.md`: publishing is the human's decision). An update never needs the package manager when nothing changed (see below).
- Three different kinds of storage, never mixed: the extension's SOURCE (a folder, in git), its ACTIVATION (the profile's install list, derived), and its
  RUNTIME DATA (what it remembers: see `../extending/state-and-persistence.md`). Never store data in the source folder and never serialize a running plugin.
- Not done yet (recorded in the parity table, not to be assumed): a startup pass that re-syncs changed sources by itself, and an `extension.json` manifest
  with API version, permissions and a state schema. Today a change to a source folder is applied by `acryl_install_plugin` or `/reload`.

## /reload

The human types `/reload` in the chat. Source is authoritative, so it makes the installs match their source folders and prints one line per extension
with its scope:

- source unchanged: `unchanged` (nothing runs, a working plugin is not restarted); source changed: re-installed (same checks and rollback as `acryl_install_plugin`);
- source folder gone: `STALE` (not a failure); `/reload remove-stale`, typed by the human, removes it. Nothing is removed automatically;
- a NEW extension folder in either scope is only listed ("NEW, not installed"): installing it takes `/reload new`, typed by the human, because an extension runs
  with the user's permissions and a cloned repository can contain one (see `../start-here/trust-and-safety.md`);
- a global extension with the same package name as a project one is `SHADOWED` and not loaded.

UI changes still need a page (Web) or window (Desktop) reload; the command says so only when something was installed or removed.

## What you see in your context

Each turn the prompt carries a live `acryl:installed-extensions` note listing the installed local extensions, whether each is mounted, and its source
folder, so after an install, update or removal you can see the current state without calling `acryl_list_plugins`.
