# acryl-plugin-admin

Plugin administration for every ACRYL surface, as Cordis plugins. It was inside the Desktop app; it now serves Desktop
and Web from one implementation (spec 040 "Surface sharing").

- **Host plugin** (`src/index.ts`): the private same-origin routes behind Settings > Plugins.
  - `/api/acryl-plugin-admin/architecture` needs only the web server and projects the live Cordis graph.
  - `/api/acryl-plugin-admin/lifecycle[/enable|/disable|/reload]` is a dependency-gated child plugin: it mounts when a
    surface has published `ctx.acrPluginLifecycle` (Desktop and Web both do), unmounts without failing the parent when it
    goes away, and returns when it comes back.
- **Client plugin** (`src/client`): the Architecture and Lifecycle tabs, contributed to the `settings.plugins.tab` slot, with
  their own dictionaries and styles, each owned by one effect.
- **`PluginLifecycleView`** (`src/lifecycle/view.ts`): the renderer-facing projection over the shared lifecycle authority
  (client-graph membership, the composed Blend when a surface has one, "reload the page" receipts). Desktop's plugin
  controller reuses it, so there is one implementation.

Nothing here may import Electron or a Desktop-only service. Composed for both surfaces through the `plugin-admin` capability
in `acryl-harness-runtime`'s `coding-capabilities.ts`.

## Layout

```text
src/
  index.ts          Host plugin (routes, dependency-gated lifecycle child)
  http.ts           loopback same-origin and bounded-JSON helpers (same behaviour as Desktop settings and workspace routes)
  lifecycle/        contract, route, view
  architecture/     contract, inspector, route
  client/           lifecycle/ and architecture/ tabs, api adapters, locales, styles; index.ts is the Client plugin
tests/              mirrors src/
```
