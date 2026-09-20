# This runtime: how ACRYL plugins are built, loaded and delivered

Read this first. It is the map; the other docs are the detail.

## The layers

- **Cordis** is the plugin framework: a `Context`, Fibers (one per mounted plugin),
  services (`ctx.provide` / `inject`), events, effects.
- **DeepSeek Harness (DSH)** supplies the agent domain as Cordis plugins: sessions,
  tools, LLM adapters, system prompt, skills. It is a pinned upstream. Never edit it.
- **ACRYL** composes DSH and adds its own plugins. There is one runtime and three
  surfaces that render it: `tui` (the `acryl` CLI), `web` and `desktop`. A feature
  is implemented once as a runtime capability; a surface only renders or drives it.

A plugin you write is a Cordis plugin that the runtime loads the same way on every
surface. Some plugin types exist only where a surface has the seam (a Web client
slot, a Desktop-main service, a TUI command); each doc says which. The full map of where things mount on each surface is
`../maps/mount-points.md`, and every plugin type with the shipped plugins of that type is `../maps/taxonomy.md`.

## The plugin file contract

A plugin module uses **named exports**:

```js
export const name = 'my-plugin'          // stable id
export const inject = ['tools']          // hard dependencies (optional)
export const Config = /* schema */       // optional, validated before apply
export function apply(ctx, config) {}    // required
```

- `inject` is a **hard** dependency. The fiber stays `PENDING` until every named
  service exists. `PENDING` is healthy, not broken. Fix it by providing the service,
  never by deleting the `inject`.
- Anything that outlives `apply()` (a timer, a listener) is acquired inside
  `ctx.effect()` and returns its disposer.
- **Do not mix a default export with named metadata.** The real Loader normalizes a
  module with `exports.default ?? exports`, so a default export next to named
  `name` or `inject` silently drops the named ones: measured, a plugin declaring
  `inject: ['nonexistent']` mounted ACTIVE instead of PENDING. Use named exports
  only, or put every field on the default value.

## The package contract

A plugin ships as an npm package. Three things are required for it to install and
go live:

1. `package.json` has `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` and
   the patch file is listed in `files`. Without the bundle declaration it installs as
   a plain dependency but is not added to the profile.
2. `cordis.patch.yml` inserts one row: `- insert: [{ id: <stable-id>, name: <package name> }]`.
3. `exports` **must include `"./package.json"`**, for example
   `"exports": { ".": "./index.js", "./package.json": "./package.json" }`. Live
   activation resolves `<package>/package.json`; a bare `"exports": "./index.js"`
   installs and mounts on the next boot but fails to go live with
   `Package subpath './package.json' is not defined by "exports"`.

## Two ways to deliver a plugin

Both start from one package that has passed verification.

- **Local, in place.** Install into the active profile and activate it live, no
  marketplace and no restart: `dsh plugin --profile <name> add file:<dir>` (about half
  a second), then `livePluginActivation.activate(<package name>)` (milliseconds).
  The install copies the package, so edit and add again. If activation fails, the
  package stays in the profile until removed with `dsh plugin --profile <name> remove
  <package>`; do that.
- **Marketplace.** Pack the package, lint it against the catalog rules
  (exact `acryl-package` keyword, valid `acryl` manifest, GitHub `repository`,
  `dsh.bundle.patch`), and publish to npm. Publishing is public and irreversible, so
  it is always a human decision in an interactive terminal; you prepare the package,
  a person publishes it.

## What to do next

1. Find the closest working example in `../examples/README.md` and read its header.
2. Read the doc it names, completely, and follow its cross-references.
3. Write the package, then follow `verify-before-done.md`.
