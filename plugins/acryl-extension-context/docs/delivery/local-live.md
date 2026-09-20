# Deliver a plugin live: local install

Goal: the user asks for a feature, you write a plugin, it appears without a restart.

1. Write the package in a new directory (never inside the pack or the profile). Copy the closest
   example from `../examples/README.md` and change it.
2. Call the **`acryl_install_plugin`** tool with the package directory. It checks the package
   (bundle patch, `exports` including `./package.json`, a client bundle if `dsh.client` is set), runs
   `dsh plugin add file:<dir>`, live-activates it, and **removes it again if activation fails**.
3. Read the result. `ok: true` with status `active` means the host part is live. If the result has a
   `next` note (a UI plugin), tell the user to reload the page (Web) or window (Desktop).
4. On an error the result names the stage (`check`, `install`, `activate`) and the real message. Fix that
   cause and call the tool again; the tool already undid a failed install.

To change a plugin, edit the files and call the tool again (`file:` installs copy the package, so it must be
re-added). To remove one: `dsh plugin --profile <name> remove <package>`.

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
