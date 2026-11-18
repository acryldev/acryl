# acryl-settings

ACRYL's settings service, ported as source from ACRYL (`plugins/acryl-settings`): register, get, update, replace and watch a preference namespace, backed by one YAML file in the app's ACRYL home (`.acrylblends/settings`, or the home the `appInstance` service names). It is independent of DSH's own settings design, so the frame's preferences and DSH's stay separate.

- `settings.register(namespace, schema)` declares a namespace with schemastery, `settings.get(namespace)` reads it, `update` merges a patch, `replace` writes a whole value, and `watch(namespace, listener)` hears changes (including changes another writer made to the file).
- The service is provided on the Cordis context as `settings`; the package's `cordis.patch.yml` mounts it as one row.
- Ported for the IDE port, slice 1 ([plan](../../docs/plans/ide-port.md)); provenance in [`provenance.json`](provenance.json). The original suite runs unchanged: `pnpm test` in this folder.
