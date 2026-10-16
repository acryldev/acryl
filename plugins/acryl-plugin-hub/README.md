# acryl-plugin-hub

Save, share and pull plugins from inside an app (spec 044, `specs/044-extension-persistence-and-registries/lifecycle.md`). Part of every Blend's
base kit; the operations themselves are `@webboxes/plugin-hub`'s.

- **`pluginHub` service**: `saved()`, `save(folder)`, `bump(folder, 'patch'|'minor'|'major')`, `pull(source)`, `share(folder, options)`,
  `publishNpm(folder, options)`, `installed()`. The store is the app instance's (`<instance home>/plugins/store`).
- **`/plugin`** in the chat: `list | saved | save <name> | share <name> [public] [owner/repo] | share <name> npm [public] [registry URL] | pull <source> |
  version patch <name>`. npm uses the user's own npm login and `.npmrc` (scoped registries too); a private plugin needs a scope (`@owner/name`).
- **`acryl_plugins`** for the agent (`to: "npm"` or `"npm:<registry URL>"` publishes to npm): saving and versioning run directly; sharing and pulling from anywhere but the store ask the user in the
  app first (DSH's approval), and nothing proceeds without "allow once".
- **`acryl-plugin-hub/manager`**: DSH's plugin manager with the hub in front of it. It takes the place of DSH's `plugin-manager` row, so DSH's
  own "Add plugin" box installs a GitHub address as its latest release, fetched and checked by the hub; everything else is DSH's.

Requires `appInstance`. Optional: `pluginManager` (the installer), `commands`, `tools`, `approval`.
