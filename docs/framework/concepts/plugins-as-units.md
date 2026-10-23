# Plugins are the unit

Everything is a Cordis plugin: a module exporting `name`, optionally `inject` (services it needs), and `apply(ctx)`.

- **Needs.** `inject = ['router']` keeps the plugin PENDING until a router exists. PENDING is a normal state, not an error.
- **Owns.** Anything registered from `ctx` inside `apply` (routes, middleware, mounts, cells, listeners) belongs to that plugin. Raw resources (timers,
  sockets, watchers) are acquired inside one `ctx.effect(() => disposer, 'label')`.
- **Unloads whole.** When the plugin unloads, every registration it made is removed and open streams end. Nothing else is touched.
- **Replaceable.** Other plugins depend on a service name, not a package. Swapping the provider unloads and reactivates its consumers.
- **Labeled.** Give each effect a label (`'my-plugin: what this is'`). `acryl-inspect` reads the labels, so a plugin's contract is derived from the
  running system instead of being written twice.

A Loader row's `id` equals the package name. A package has: `README.md` with a usage example, `src/` exporting `name` and `apply`, `tests/`, `cordis.patch.yml`.
`node scripts/verify-framework.mjs` checks this for the framework packages.
