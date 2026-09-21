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

## /reload

The human types `/reload` in the chat. It re-installs every local plugin from its source folder (same checks and rollback as `acryl_install_plugin`) and
prints one line per plugin. Suggest it after the user edits a plugin by hand. A NEW extension folder found under `<workspace>/.acryl-extensions/` is only
listed ("NEW, not installed"): installing new folders takes `/reload new`, typed by the human, because an extension runs with the user's permissions
(see `../start-here/trust-and-safety.md`). UI changes still need a page (Web) or window (Desktop) reload.

## What you see in your context

Each turn the prompt carries a live `acryl:installed-extensions` note listing the installed local extensions, whether each is mounted, and its source
folder, so after an install, update or removal you can see the current state without calling `acryl_list_plugins`.
